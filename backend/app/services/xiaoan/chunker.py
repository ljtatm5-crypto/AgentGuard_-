"""Heading-aware semantic chunking for XiaoAn knowledge documents."""
from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
import math
import re


@dataclass(frozen=True)
class KnowledgeChunk:
    chunk_id: str
    document_id: str
    title: str
    heading: str
    content: str
    source_path: str
    route: str
    tags: list[str]
    access_level: str
    content_hash: str
    token_count: int
    chunk_order: int


def _split_long(text: str, limit: int = 1600) -> list[str]:
    if len(text) <= limit:
        return [text]
    paragraphs = [item.strip() for item in re.split(r"\n\s*\n", text) if item.strip()]
    parts: list[str] = []
    current = ""
    for paragraph in paragraphs:
        if current and len(current) + len(paragraph) + 2 > limit:
            parts.append(current.strip())
            current = ""
        current = f"{current}\n\n{paragraph}".strip()
    if current:
        parts.append(current)
    return parts or [text[:limit]]


def chunk_document(document: dict) -> list[KnowledgeChunk]:
    markdown = str(document.get("content", ""))
    title_match = re.search(r"(?m)^#\s+(.+)$", markdown)
    title = document.get("title") or (title_match.group(1).strip() if title_match else document["document_id"])
    sections = re.split(r"(?m)^##\s+", markdown)
    blocks: list[tuple[str, str]] = []
    intro = sections[0]
    if intro.strip() and "## " not in intro:
        intro = re.sub(r"(?m)^#\s+.+$", "", intro).strip()
    if intro.strip():
        blocks.append(("概览", intro.strip()))
    for section in sections[1:]:
        lines = section.splitlines()
        heading = lines[0].strip() if lines else "说明"
        body = "\n".join(lines[1:]).strip()
        if body:
            blocks.append((heading, body))
    chunks: list[KnowledgeChunk] = []
    order = 0
    for heading, body in blocks:
        for part_index, part in enumerate(_split_long(body)):
            order += 1
            suffix = f"-{part_index + 1}" if part_index else ""
            chunk_key = f"{document['document_id']}-{order:03d}{suffix}"
            digest = sha256(part.encode("utf-8")).hexdigest()
            chunks.append(KnowledgeChunk(
                chunk_id=chunk_key,
                document_id=document["document_id"],
                title=title,
                heading=heading,
                content=part,
                source_path=document["source_path"],
                route=document.get("route", "/overview"),
                tags=list(document.get("tags", [])),
                access_level=document.get("access_level", "public"),
                content_hash=digest,
                token_count=max(1, math.ceil(len(part) / 2.5)),
                chunk_order=order,
            ))
    return chunks
