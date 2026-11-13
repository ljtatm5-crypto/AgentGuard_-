"""Shared fixed-IP JSON transport for self-hosted model and embedding calls."""
from __future__ import annotations

import json
from typing import Any

from app.security.models import redact
from app.security.netguard import pinned_request, resolve_pinned, verify_unchanged


class SecureHttpError(RuntimeError):
    pass


def pinned_json_request(
    url: str,
    *,
    payload: dict[str, Any],
    headers: dict[str, str] | None = None,
    timeout: float = 30.0,
    method: str = "POST",
) -> dict[str, Any]:
    """Call an authorized internal JSON endpoint through the pinned transport.

    Resolution happens once before connect, the TCP target is the pinned IP, and
    the hostname is re-resolved after the response to detect DNS rebinding.
    Redirects are never followed by ``pinned_request``.
    """
    pin = resolve_pinned(url)
    send_headers = {"Content-Type": "application/json", **(headers or {})}
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    try:
        status, raw = pinned_request(
            pin,
            method=method,
            headers=send_headers,
            body=body,
            timeout=timeout,
        )
    finally:
        verify_unchanged(pin)
    try:
        decoded = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise SecureHttpError(
            f"内部服务返回了非 JSON 响应（HTTP {status}）：{redact(raw.decode('utf-8', errors='replace'), 200)}"
        ) from exc
    if not 200 <= status < 300:
        raise SecureHttpError(
            f"内部服务请求失败（HTTP {status}）：{redact(json.dumps(decoded, ensure_ascii=False), 500)}"
        )
    if not isinstance(decoded, dict):
        raise SecureHttpError("内部服务 JSON 顶层必须为对象")
    return decoded


__all__ = ["SecureHttpError", "pinned_json_request"]