"""Optional embedding provider with a deterministic offline fallback."""
from __future__ import annotations

from hashlib import blake2b
import math
import os
import re
from typing import Iterable

import httpx

from app.core.config import get_settings
from app.core.target_scope import validate_target_scope


_TOKEN_RE = re.compile(r"[A-Za-z0-9_./:-]+|[\u4e00-\u9fff]{1,4}")


def tokenize(text: str) -> list[str]:
    lowered = (text or "").lower()
    raw = _TOKEN_RE.findall(lowered)
    tokens: list[str] = []
    for item in raw:
        tokens.append(item)
        if re.fullmatch(r"[\u4e00-\u9fff]{2,}", item):
            tokens.extend(item[index:index + 2] for index in range(len(item) - 1))
    return tokens


def normalize_vector(values: Iterable[float]) -> list[float]:
    numbers = [float(value) for value in values]
    norm = math.sqrt(sum(value * value for value in numbers))
    if not norm:
        return [0.0] * len(numbers)
    return [round(value / norm, 8) for value in numbers]


def local_hash_embedding(text: str, dimensions: int | None = None) -> list[float]:
    dim = max(32, int(dimensions or get_settings().xiaoan_embedding_dimensions))
    vector = [0.0] * dim
    for token in tokenize(text):
        digest = blake2b(token.encode("utf-8"), digest_size=8).digest()
        index = int.from_bytes(digest[:4], "big") % dim
        sign = 1.0 if digest[4] & 1 else -1.0
        vector[index] += sign
    return normalize_vector(vector)


def embed_text(text: str) -> tuple[list[float], str]:
    settings = get_settings()
    if not settings.xiaoan_embedding_url or not settings.xiaoan_embedding_model:
        return local_hash_embedding(text), "local_hash"
    api_key = os.getenv(settings.xiaoan_embedding_api_key_env, "") if settings.xiaoan_embedding_api_key_env else ""
    if not api_key:
        return local_hash_embedding(text), "local_hash"
    try:
        validate_target_scope(
            endpoint=settings.xiaoan_embedding_url,
            adapter="openai_compat",
            target_scope="self_hosted_dify",
            authorization_confirmed=True,
            authorization_reference="XIAOAN-EMBEDDING",
            allowed_hosts=settings.allowed_target_host_list,
        )
        with httpx.Client(timeout=settings.remote_request_timeout_seconds, follow_redirects=False, trust_env=False) as client:
            response = client.post(
                settings.xiaoan_embedding_url,
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={"model": settings.xiaoan_embedding_model, "input": text},
            )
            response.raise_for_status()
        payload = response.json()
        data = payload.get("data")
        vector = data[0].get("embedding") if isinstance(data, list) and data else None
        if not isinstance(vector, list) or not vector:
            raise ValueError("embedding response missing vector")
        return normalize_vector(vector), "remote"
    except Exception:
        # Retrieval remains available in local mode; the index label explicitly
        # distinguishes this fallback from a real model embedding.
        return local_hash_embedding(text), "local_hash"


def cosine(left: list[float], right: list[float]) -> float:
    if not left or not right:
        return 0.0
    return float(sum(a * b for a, b in zip(left, right)))
