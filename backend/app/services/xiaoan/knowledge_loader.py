"""Idempotent loader that keeps XiaoAn knowledge and chunks in sync."""
from __future__ import annotations

from hashlib import sha256

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.assistant_entities import AssistantChunk, AssistantDocument
from app.services.xiaoan.chunker import chunk_document
from app.services.xiaoan.embedding_provider import embed_text
from app.services.xiaoan.knowledge import KNOWLEDGE_DOCUMENTS, KNOWLEDGE_VERSION


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
    db.commit()
    return {"version": version, "documents": len(KNOWLEDGE_DOCUMENTS), "chunks": chunk_count, "updated": updated, "unchanged": indexed}
