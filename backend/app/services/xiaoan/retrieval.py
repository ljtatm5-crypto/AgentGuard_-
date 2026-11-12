"""Hybrid BM25 + vector retrieval with reciprocal-rank fusion."""
from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from hashlib import sha256
import json
from math import log
from pathlib import Path
import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.assistant_entities import AssistantChunk
from app.services.xiaoan.embedding_provider import cosine, embed_text

_TERM_RE = re.compile(r"[a-z0-9_]+|[㐀-鿿]+", re.IGNORECASE)
_HEADING_RE = re.compile(r"^(#{1,6})\s+(.+?)\s*$")
_FENCE_RE = re.compile(r"^\s*(```|~~~)")


@dataclass(frozen=True)
class Passage:
    id: str
    document: str
    title: str
    heading: str
    text: str
    route: str
    content_hash: str


def tokens(text: str) -> list[str]:
    """Latin words and overlapping Han-character bigrams for Chinese search."""
    output: list[str] = []
    for value in _TERM_RE.findall((text or "").lower()):
        if '㐀' <= value[0] <= '鿿':
            output.extend(value[index:index + 2] for index in range(len(value) - 1))
            if len(value) == 1:
                output.append(value)
        else:
            output.append(value)
    return output


def _blocks(markdown: str) -> list[tuple[str, str]]:
    """Respect Markdown headings and fenced code blocks."""
    heading_stack: list[str] = []
    text_lines: list[str] = []
    fence: str | None = None
    result: list[tuple[str, str]] = []

    def flush() -> None:
        value = '\n'.join(text_lines).strip()
        if value:
            result.append((' / '.join(heading_stack), value))
        text_lines.clear()

    for line in markdown.splitlines():
        fence_match = _FENCE_RE.match(line)
        if fence_match:
            marker = fence_match.group(1)
            if fence is None:
                fence = marker[:3]
            elif fence == marker[:3]:
                fence = None
            text_lines.append(line)
            continue
        heading = _HEADING_RE.match(line) if fence is None else None
        if heading:
            flush()
            level = len(heading.group(1))
            heading_stack = heading_stack[:level - 1]
            heading_stack.append(heading.group(2).strip())
        else:
            text_lines.append(line)
    flush()
    return result


def _split_paragraphs(text: str) -> list[str]:
    """Split on blank lines, never inside fenced code."""
    result: list[str] = []
    buffer: list[str] = []
    fence: str | None = None
    for line in text.splitlines():
        marker = _FENCE_RE.match(line)
        if marker:
            selected = marker.group(1)[:3]
            fence = selected if fence is None else (None if fence == selected else fence)
        if not line.strip() and fence is None:
            if buffer:
                result.append('\n'.join(buffer).strip())
                buffer.clear()
        else:
            buffer.append(line)
    if buffer:
        result.append('\n'.join(buffer).strip())
    return result


def _split_oversize(paragraph: str, max_tokens: int) -> list[str]:
    if len(tokens(paragraph)) <= max_tokens or paragraph.lstrip().startswith(('```', '~~~')):
        return [paragraph]
    sentences = [part.strip() for part in re.split(r'(?<=[。！？.!?])\s*', paragraph) if part.strip()]
    result: list[str] = []
    current = ''
    for sentence in sentences:
        if current and len(tokens(current + sentence)) > max_tokens:
            result.append(current)
            current = sentence
        else:
            current += sentence
    if current:
        result.append(current)
    return result


def markdown_passages(*, document: str, title: str, markdown: str, route: str,
                      max_tokens: int = 550, overlap_tokens: int = 70) -> list[Passage]:
    """Heading-aware chunks with paragraph overlap and fenced-code integrity."""
    if max_tokens < 64 or not 0 <= overlap_tokens < max_tokens:
        raise ValueError('invalid chunking parameters')
    chunks: list[Passage] = []
    for heading, body in _blocks(markdown):
        paragraphs = [part for paragraph in _split_paragraphs(body)
                      for part in _split_oversize(paragraph, max_tokens)]
        current: list[str] = []
        count = 0

        def append_current() -> None:
            if not current:
                return
            content = '\n\n'.join(current)
            digest = sha256((document + '\n' + heading + '\n' + content).encode()).hexdigest()
            chunks.append(Passage(id=digest[:24], document=document, title=title,
                                  heading=heading, text=content, route=route,
                                  content_hash=digest))

        for paragraph in paragraphs:
            paragraph_count = len(tokens(paragraph))
            if current and count + paragraph_count > max_tokens:
                append_current()
                kept: list[str] = []
                carried = 0
                for previous in reversed(current):
                    previous_count = len(tokens(previous))
                    if carried + previous_count > overlap_tokens or carried + previous_count + paragraph_count > max_tokens:
                        break
                    kept.insert(0, previous)
                    carried += previous_count
                current, count = kept, carried
            current.append(paragraph)
            count += paragraph_count
        append_current()
    return chunks


def load_curated_passages(repo_root: Path, manifest: str = 'docs/xiaoan/sources.json') -> list[Passage]:
    """Only explicitly listed public Markdown, guarded against path traversal."""
    root = repo_root.resolve()
    catalog = (root / manifest).resolve()
    if not catalog.is_relative_to(root):
        raise ValueError('manifest escapes repository root')
    documents = json.loads(catalog.read_text(encoding='utf-8'))
    if not isinstance(documents, list):
        raise ValueError('manifest must contain a list')
    passages: list[Passage] = []
    for item in documents:
        if item.get('access_level') != 'public':
            continue
        path = (root / str(item['path'])).resolve()
        if not path.is_relative_to(root) or path.suffix.lower() != '.md' or not path.is_file():
            raise ValueError(f'invalid document source: {item["path"]}')
        passages.extend(markdown_passages(document=str(path.relative_to(root)).replace('\\', '/'),
                                          title=str(item['title']), markdown=path.read_text(encoding='utf-8'),
                                          route=str(item['route'])))
    return passages


class KeywordRetriever:
    """Auditable BM25 baseline used as the lexical arm of hybrid retrieval."""
    def __init__(self, passages: list[Passage]):
        self.passages = passages
        self.vectors = [Counter(tokens(f'{p.title} {p.heading} {p.text}')) for p in passages]
        self.lengths = [sum(vector.values()) for vector in self.vectors]
        self.avg_length = sum(self.lengths) / len(self.lengths) if self.lengths else 1
        self.document_frequency = Counter(term for vector in self.vectors for term in vector)

    def search(self, query: str, *, top_k: int = 5) -> list[tuple[Passage, float]]:
        if not 1 <= top_k <= 20:
            raise ValueError('top_k must be between 1 and 20')
        terms = set(tokens(query[:500]))
        if not terms:
            return []
        count = len(self.passages)
        ranked: list[tuple[Passage, float]] = []
        for passage, vector, length in zip(self.passages, self.vectors, self.lengths):
            score = 0.0
            for term in terms:
                frequency = vector.get(term, 0)
                if not frequency:
                    continue
                document_frequency = self.document_frequency[term]
                idf = log(1 + (count - document_frequency + 0.5) / (document_frequency + 0.5))
                score += idf * frequency * 2.2 / (frequency + 1.2 * (0.25 + 0.75 * length / self.avg_length))
            if score > 0:
                ranked.append((passage, round(score, 6)))
        return sorted(ranked, key=lambda item: (-item[1], item[0].id))[:top_k]


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
    by_id = {chunk.chunk_id: chunk for chunk in chunks}
    passages = [
        Passage(id=chunk.chunk_id, document=chunk.document_id, title=chunk.title,
                heading=chunk.heading, text=f"{chunk.content}\n{' '.join(chunk.tags or [])}",
                route=chunk.route, content_hash=chunk.content_hash)
        for chunk in chunks
    ]
    keyword_rows = [(by_id[passage.id], score) for passage, score in KeywordRetriever(passages).search(query, top_k=12)]
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
