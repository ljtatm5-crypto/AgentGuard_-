"""Hybrid keyword + vector retrieval with reciprocal-rank fusion."""
from __future__ import annotations

from collections import Counter
import math
import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.assistant_entities import AssistantChunk
from app.services.xiaoan.embedding_provider import cosine, embed_text, tokenize


def _keyword_score(query: str, tokens: list[str], chunk: AssistantChunk) -> float:
    text = f"{chunk.title}\n{chunk.heading}\n{chunk.content}\n{' '.join(chunk.tags or [])}"
    hay_tokens = tokenize(text)
    counts = Counter(hay_tokens)
    if not tokens:
        return 0.0
    score = 0.0
    for token in set(tokens):
        if token in counts:
            score += 1.0 + math.log(1 + counts[token])
    if query and query.lower() in text.lower():
        score += 3.0
    if any(token in chunk.heading.lower() for token in tokens):
        score += 1.5
    if any(token in " ".join(chunk.tags or []).lower() for token in tokens):
        score += 1.0
    return score


def _source_view(chunk: AssistantChunk, score: float) -> dict:
    excerpt = re.sub(r"\s+", " ", chunk.content).strip()
    return {
        "id": chunk.chunk_id,
        "document_id": chunk.document_id,
        "title": chunk.title,
        "heading": chunk.heading,
        "source_path": chunk.source_path,
        "route": chunk.route,
        "excerpt": excerpt[:900],
        "score": round(score, 6),
        "access_level": chunk.access_level,
        "tags": list(chunk.tags or []),
        "embedding_provider": chunk.embedding_provider,
    }


def hybrid_search(db: Session, query: str, route: str = "", limit: int = 5) -> list[dict]:
    chunks = list(db.scalars(select(AssistantChunk).where(AssistantChunk.access_level == "public")).all())
    if not chunks:
        return []
    tokens = tokenize(query)
    keyword_rows = sorted(
        ((chunk, _keyword_score(query, tokens, chunk)) for chunk in chunks),
        key=lambda item: item[1], reverse=True,
    )[:12]
    query_embedding, _ = embed_text(query)
    vector_rows = sorted(
        ((chunk, cosine(query_embedding, list(chunk.embedding or []))) for chunk in chunks),
        key=lambda item: item[1], reverse=True,
    )[:12]

    fused: dict[str, dict] = {}
    for ranked, weight in ((keyword_rows, 1.0), (vector_rows, .85)):
        for rank, (chunk, raw_score) in enumerate(ranked, start=1):
            if raw_score <= 0:
                continue
            item = fused.setdefault(chunk.chunk_id, {"chunk": chunk, "rrf": 0.0, "raw": 0.0})
            item["rrf"] += weight / (60 + rank)
            item["raw"] = max(item["raw"], raw_score)
    for item in fused.values():
        chunk = item["chunk"]
        if route and chunk.route == route:
            item["rrf"] += 0.025
        elif route and route.startswith("/runs") and chunk.route == "/runs":
            item["rrf"] += 0.02
    ordered = sorted(fused.values(), key=lambda item: (item["rrf"], item["raw"]), reverse=True)[:limit]
    return [_source_view(item["chunk"], item["rrf"]) for item in ordered]


def source_by_id(db: Session, chunk_id: str) -> dict | None:
    chunk = db.scalar(select(AssistantChunk).where(AssistantChunk.chunk_id == chunk_id))
    if chunk is None or chunk.access_level != "public":
        return None
    result = _source_view(chunk, 0.0)
    result["content"] = chunk.content
    result["source_version"] = chunk.source_version
    return result
