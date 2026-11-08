import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.security.access import SlidingWindowRateLimiter, WriteAccessMiddleware, audit_logger


def make_client(*, token: str = "operator-secret", allow_anonymous: bool = False, limit: int = 30, audit_log_enabled: bool = False) -> TestClient:
    settings = Settings(
        environment="test",
        allow_anonymous_writes=allow_anonymous,
        write_token=token,
        write_rate_limit_per_minute=limit,
        max_request_bytes=32,
        audit_log_enabled=audit_log_enabled,
    )
    app = FastAPI()
    app.add_middleware(
        WriteAccessMiddleware,
        settings_provider=lambda: settings,
        rate_limiter=SlidingWindowRateLimiter(),
    )

    @app.get("/read")
    def read():
        return {"ok": True}

    @app.post("/write")
    async def write(request: Request):
        await request.body()
        return {"ok": True}

    return TestClient(app)


def test_public_read_does_not_require_token():
    response = make_client().get("/read")
    assert response.status_code == 200


def test_write_requires_token():
    response = make_client().post("/write", json={})
    assert response.status_code == 401
    assert response.json()["error_code"] == "write_auth_required"


def test_write_rejects_invalid_token():
    response = make_client().post("/write", json={}, headers={"Authorization": "Bearer wrong"})
    assert response.status_code == 403
    assert response.json()["error_code"] == "write_auth_invalid"


def test_write_accepts_valid_token():
    response = make_client().post(
        "/write", json={}, headers={"Authorization": "Bearer operator-secret"}
    )
    assert response.status_code == 200
    assert response.headers["x-request-id"]


def test_explicit_anonymous_mode_for_local_tests():
    response = make_client(allow_anonymous=True).post("/write", json={})
    assert response.status_code == 200


def test_rate_limit_is_enforced():
    client = make_client(limit=1)
    headers = {"Authorization": "Bearer operator-secret"}
    assert client.post("/write", json={}, headers=headers).status_code == 200
    response = client.post("/write", json={}, headers=headers)
    assert response.status_code == 429
    assert response.headers["retry-after"]


def test_request_size_is_limited():
    response = make_client().post(
        "/write",
        content=b"x" * 40,
        headers={"Authorization": "Bearer operator-secret", "Content-Type": "application/json"},
    )
    assert response.status_code == 413


def test_cors_headers_cover_authentication_failures():
    settings = Settings(
        environment="test",
        allow_anonymous_writes=False,
        write_token="operator-secret",
        audit_log_enabled=False,
    )
    app = FastAPI()
    app.add_middleware(WriteAccessMiddleware, settings_provider=lambda: settings)
    app.add_middleware(CORSMiddleware, allow_origins=["https://demo.example"], allow_methods=["*"], allow_headers=["*"])

    @app.post("/write")
    def write():
        return {"ok": True}

    response = TestClient(app).post("/write", headers={"Origin": "https://demo.example"})
    assert response.status_code == 401
    assert response.headers["access-control-allow-origin"] == "https://demo.example"


def test_streamed_request_size_is_limited():
    def oversized_stream():
        yield b"x" * 20
        yield b"x" * 20

    response = make_client().post(
        "/write",
        content=oversized_stream(),
        headers={"Authorization": "Bearer operator-secret", "Content-Type": "application/octet-stream"},
    )
    assert response.status_code == 413
    assert response.json()["error_code"] == "request_too_large"


def test_streamed_body_is_replayed_to_endpoint():
    def small_stream():
        yield b'{"a":'
        yield b'1}'

    response = make_client().post(
        "/write",
        content=small_stream(),
        headers={"Authorization": "Bearer operator-secret", "Content-Type": "application/json"},
    )
    assert response.status_code == 200


def test_audit_logger_is_info_enabled():
    assert audit_logger.level == logging.INFO
    assert audit_logger.propagate is False
    assert audit_logger.handlers


def test_audit_record_is_emitted_for_valid_write(monkeypatch):
    records = []
    monkeypatch.setattr(audit_logger, "info", lambda message: records.append(message))
    response = make_client(audit_log_enabled=True).post(
        "/write",
        json={},
        headers={"Authorization": "Bearer operator-secret"},
    )
    assert response.status_code == 200
    assert any('"event": "http_write"' in record for record in records)
