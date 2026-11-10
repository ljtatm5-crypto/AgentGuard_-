"""Write-path access control, request limits and audit logging.

The public deployment exposes read-only demonstration data. Every mutating
HTTP request must present the operator token unless anonymous writes were
explicitly enabled for a local/test environment. CORS is not used as
authentication.
"""
from __future__ import annotations

from collections import defaultdict, deque
from dataclasses import dataclass
from hashlib import sha256
import hmac
import json
import logging
import re
import threading
import time
from typing import Callable
from uuid import uuid4

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.config import Settings, get_settings


WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
PRIVATE_READ_PATTERNS = (
    re.compile(r"^/api/authorizations(?:/.*)?$"),
    re.compile(r"^/api/(?:agents|test-suites|runs|findings)(?:/.*)?$"),
    re.compile(r"^/api/v2/agents/[^/]+$"),
    re.compile(r"^/api/v2/test-suites/[^/]+/cases$"),
    re.compile(r"^/api/v2/runs/[^/]+(?:/trace)?$"),
    re.compile(r"^/api/v2/findings/[^/]+/chain$"),
)
audit_logger = logging.getLogger("agentguard.audit")


def configure_audit_logger() -> logging.Logger:
    """Emit structured audit records even when the app runs under uvicorn."""
    if not audit_logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter("%(message)s"))
        audit_logger.addHandler(handler)
    audit_logger.setLevel(logging.INFO)
    audit_logger.propagate = False
    return audit_logger


configure_audit_logger()


@dataclass(frozen=True)
class Principal:
    subject: str
    role: str


class SlidingWindowRateLimiter:
    """Per-process limiter; Vercel may run multiple isolated instances."""

    def __init__(self) -> None:
        self._events: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def allow(self, key: str, limit: int, window_seconds: int = 60) -> tuple[bool, int]:
        now = time.monotonic()
        cutoff = now - window_seconds
        with self._lock:
            bucket = self._events[key]
            while bucket and bucket[0] <= cutoff:
                bucket.popleft()
            if len(bucket) >= limit:
                retry_after = max(1, int(window_seconds - (now - bucket[0])))
                return False, retry_after
            bucket.append(now)
            return True, 0


def _error(status: int, code: str, message: str, headers: dict[str, str] | None = None) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content={"error_code": code, "message": message},
        headers=headers,
    )


def _bearer_token(request: Request) -> str:
    value = request.headers.get("authorization", "")
    if value.lower().startswith("bearer "):
        return value[7:].strip()
    return request.headers.get("x-agentguard-key", "").strip()


async def _read_limited_body(request: Request, max_request_bytes: int) -> bool:
    """Consume the request body with a hard byte limit and replay it downstream."""
    total = 0
    chunks: list[bytes] = []
    async for chunk in request.stream():
        total += len(chunk)
        if total > max_request_bytes:
            return False
        chunks.append(chunk)
    # BaseHTTPMiddleware replays this cached body into the endpoint request.
    setattr(request, "_body", b"".join(chunks))
    return True


def is_private_read(method: str, path: str) -> bool:
    return method.upper() in {"GET", "HEAD"} and any(pattern.match(path) for pattern in PRIVATE_READ_PATTERNS)


def is_operator_request(request: Request) -> bool:
    return getattr(request.state, "principal", None) is not None


def _principal(request: Request, settings: Settings) -> Principal | None:
    # Competition/demo deployments may explicitly open the workspace so judges
    # can run tests without distributing an operator credential. Keep this
    # behind an environment flag; the secure default remains deny-by-default.
    if settings.allow_anonymous_writes:
        client = request.client.host if request.client else "unknown"
        return Principal(subject=f"anonymous-demo:{client}", role="operator")

    supplied = _bearer_token(request)
    expected = settings.write_token.strip()
    if not supplied or not expected or not hmac.compare_digest(supplied, expected):
        return None
    fingerprint = sha256(supplied.encode("utf-8")).hexdigest()[:12]
    return Principal(subject=f"operator:{fingerprint}", role="operator")


class WriteAccessMiddleware(BaseHTTPMiddleware):
    def __init__(
        self,
        app,
        *,
        settings_provider: Callable[[], Settings] = get_settings,
        rate_limiter: SlidingWindowRateLimiter | None = None,
    ) -> None:
        super().__init__(app)
        self.settings_provider = settings_provider
        self.rate_limiter = rate_limiter or SlidingWindowRateLimiter()

    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("x-request-id") or str(uuid4())
        request.state.request_id = request_id

        settings = self.settings_provider()
        principal = _principal(request, settings)
        if principal is not None:
            request.state.principal = principal

        if request.method not in WRITE_METHODS:
            if is_private_read(request.method, request.url.path) and principal is None:
                supplied = _bearer_token(request)
                if not settings.write_token.strip() and not settings.allow_anonymous_writes:
                    response = _error(
                        503,
                        "read_access_not_configured",
                        "私有读取接口尚未配置操作员令牌",
                        {"X-Request-ID": request_id},
                    )
                else:
                    response = _error(
                        401 if not supplied else 403,
                        "read_auth_required" if not supplied else "read_auth_invalid",
                        "该接口包含原始证据或私有配置，需要操作员令牌",
                        {"X-Request-ID": request_id},
                    )
                self._audit(request_id, request, None, response.status_code, "read_denied")
                return response
            response = await call_next(request)
            response.headers["X-Request-ID"] = request_id
            return response

        content_length = request.headers.get("content-length")
        if content_length:
            try:
                if int(content_length) > settings.max_request_bytes:
                    return _error(413, "request_too_large", "请求体超过允许大小", {"X-Request-ID": request_id})
            except ValueError:
                return _error(400, "invalid_content_length", "Content-Length 非法", {"X-Request-ID": request_id})

        if principal is None:
            supplied = _bearer_token(request)
            if not settings.write_token.strip() and not settings.allow_anonymous_writes:
                response = _error(
                    503,
                    "write_access_not_configured",
                    "写接口尚未配置操作员令牌，当前为只读模式",
                    {"X-Request-ID": request_id},
                )
            else:
                response = _error(
                    401 if not supplied else 403,
                    "write_auth_required" if not supplied else "write_auth_invalid",
                    "写操作需要有效的操作员令牌",
                    {"X-Request-ID": request_id},
                )
            self._audit(request_id, request, None, response.status_code, "denied")
            return response

        allowed, retry_after = self.rate_limiter.allow(
            principal.subject, settings.write_rate_limit_per_minute
        )
        if not allowed:
            response = _error(
                429,
                "write_rate_limited",
                "写操作过于频繁，请稍后重试",
                {"Retry-After": str(retry_after), "X-Request-ID": request_id},
            )
            self._audit(request_id, request, principal, 429, "rate_limited")
            return response

        if not await _read_limited_body(request, settings.max_request_bytes):
            response = _error(
                413,
                "request_too_large",
                "请求体超过允许大小",
                {"X-Request-ID": request_id},
            )
            self._audit(request_id, request, principal, 413, "rejected")
            return response

        started = time.perf_counter()
        response = await call_next(request)
        elapsed_ms = round((time.perf_counter() - started) * 1000, 2)
        response.headers["X-Request-ID"] = request_id
        self._audit(request_id, request, principal, response.status_code, "completed", elapsed_ms)
        return response

    def _audit(
        self,
        request_id: str,
        request: Request,
        principal: Principal | None,
        status: int | None,
        outcome: str,
        elapsed_ms: float | None = None,
    ) -> None:
        if not self.settings_provider().audit_log_enabled:
            return
        audit_logger.info(json.dumps({
            "event": "http_write" if request.method in WRITE_METHODS else "http_read",
            "request_id": request_id,
            "method": request.method,
            "path": request.url.path,
            "status": status,
            "outcome": outcome,
            "actor": principal.subject if principal else "anonymous",
            "role": principal.role if principal else None,
            "client": request.client.host if request.client else None,
            "elapsed_ms": elapsed_ms,
        }, ensure_ascii=False))
