"""Idempotent loader that keeps XiaoAn knowledge and chunks in sync."""
from __future__ import annotations

from collections import defaultdict
from hashlib import sha256
from pathlib import Path

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.assistant_entities import AssistantChunk, AssistantDocument
from app.services.xiaoan.chunker import chunk_document
from app.services.xiaoan.embedding_provider import embed_text
from app.services.xiaoan.knowledge import KNOWLEDGE_DOCUMENTS, KNOWLEDGE_VERSION
from app.services.xiaoan.retrieval import load_curated_passages, tokens


def ensure_assistant_schema(db: Session) -> None:
    """Create only XiaoAn additive tables when an old deployment skipped 0003."""
    from app.models.assistant_entities import (
        AssistantChunk, AssistantDocument, AssistantFeedback, AssistantMessage,
        AssistantRemediationPlan, AssistantSession,
    )

    AssistantDocument.metadata.create_all(
        bind=db.get_bind(),
        tables=[
            AssistantDocument.__table__, AssistantChunk.__table__, AssistantSession.__table__,
            AssistantMessage.__table__, AssistantFeedback.__table__, AssistantRemediationPlan.__table__,
        ],
        checkfirst=True,
    )


def _curated_root() -> Path:
    repo_root = Path(__file__).resolve().parents[4]
    if (repo_root / "docs/xiaoan/sources.json").is_file():
        return repo_root
    return Path(__file__).resolve().parent / "curated"


def ensure_xiaoan_knowledge(db: Session) -> dict:
    version = get_settings().xiaoan_knowledge_version or KNOWLEDGE_VERSION
    indexed = 0
    updated = 0
    chunk_count = 0
    for document in KNOWLEDGE_DOCUMENTS:
        source_path = str(document.get("source_path", ""))
        if document.get("access_level") != "public" or not source_path.startswith("docs/xiaoan/"):
            continue
        content_hash = sha256(str(document["content"]).encode("utf-8")).hexdigest()
        row = db.scalar(select(AssistantDocument).where(AssistantDocument.document_id == document["document_id"]))
        if row is None:
            row = AssistantDocument(
                document_id=document["document_id"], title=document["title"],
                source_path=document["source_path"], source_version=version,
                route=document.get("route", "/overview"), access_level=document.get("access_level", "public"),
                tags=list(document.get("tags", [])), content_hash=content_hash, status="indexed",
            )
            db.add(row)
        elif row.content_hash != content_hash or row.source_version != version:
            row.title = document["title"]
            row.source_path = document["source_path"]
            row.source_version = version
            row.route = document.get("route", "/overview")
            row.access_level = document.get("access_level", "public")
            row.tags = list(document.get("tags", []))
            row.content_hash = content_hash
            row.status = "indexed"
            updated += 1
        else:
            indexed += 1
            chunk_count += len(db.scalars(select(AssistantChunk).where(AssistantChunk.document_id == document["document_id"])).all())
            continue
        db.flush()
        db.execute(delete(AssistantChunk).where(AssistantChunk.document_id == document["document_id"]))
        for chunk in chunk_document(document):
            embedding, provider = embed_text(f"{chunk.title}\n{chunk.heading}\n{chunk.content}")
            db.add(AssistantChunk(
                chunk_id=chunk.chunk_id, document_id=chunk.document_id, parent_chunk_id=chunk.chunk_id,
                title=chunk.title, heading=chunk.heading, content=chunk.content,
                source_path=chunk.source_path, source_version=version, route=chunk.route,
                access_level=chunk.access_level, tags=chunk.tags, content_hash=chunk.content_hash,
                embedding=embedding, embedding_provider=provider, token_count=chunk.token_count,
                chunk_order=chunk.chunk_order,
            ))
            chunk_count += 1
    curated = load_curated_passages(_curated_root())
    grouped = defaultdict(list)
    for passage in curated:
        grouped[passage.document].append(passage)
    for source_path, passages in grouped.items():
        document_id = "curated-" + sha256(source_path.encode("utf-8")).hexdigest()[:16]
        content_hash = sha256("\n".join(passage.content_hash for passage in passages).encode("utf-8")).hexdigest()
        row = db.scalar(select(AssistantDocument).where(AssistantDocument.document_id == document_id))
        if row is None:
            row = AssistantDocument(
                document_id=document_id, title=passages[0].title, source_path=source_path,
                source_version=version, route=passages[0].route, access_level="public",
                tags=["curated", "public"], content_hash=content_hash, status="indexed",
            )
            db.add(row)
        elif row.content_hash != content_hash or row.source_version != version:
            row.title = passages[0].title
            row.source_path = source_path
            row.source_version = version
            row.route = passages[0].route
            row.access_level = "public"
            row.tags = ["curated", "public"]
            row.content_hash = content_hash
            row.status = "indexed"
            updated += 1
        else:
            indexed += 1
            chunk_count += len(db.scalars(select(AssistantChunk).where(AssistantChunk.document_id == document_id)).all())
            continue
        db.flush()
        db.execute(delete(AssistantChunk).where(AssistantChunk.document_id == document_id))
        for passage in passages:
            embedding, provider = embed_text(f"{passage.title}\n{passage.heading}\n{passage.text}")
            db.add(AssistantChunk(
                chunk_id=f"{document_id}-{passage.id}", document_id=document_id, parent_chunk_id=passage.id,
                title=passage.title, heading=passage.heading, content=passage.text,
                source_path=passage.document, source_version=version, route=passage.route,
                access_level="public", tags=["curated", "public"], content_hash=passage.content_hash,
                embedding=embedding, embedding_provider=provider, token_count=len(tokens(passage.text)),
            ))
            chunk_count += 1
    db.commit()
    return {
        "version": version,
        "documents": len(KNOWLEDGE_DOCUMENTS) + len(grouped),
        "chunks": chunk_count,
        "updated": updated,
        "unchanged": indexed,
    }
