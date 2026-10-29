"""DNS 固定与重绑定防护的验收测试（P1）。

既可用 pytest 运行，也可在没有第三方依赖的环境里直接执行：

    python backend/tests/test_netguard.py
"""
from __future__ import annotations

import json
import socket
import sys
import threading
import traceback
import json
from types import SimpleNamespace
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from app.security.netguard import (DnsRebindingError, PinnedTarget, pinned_request,
                                   resolve_pinned, verify_unchanged)
from app.security.scope import ScopeGuard, ScopeViolation


class _Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):  # noqa: D401 - 静默
        return

    def do_POST(self):  # noqa: N802
        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length)
        payload = json.dumps({
            "answer": "pong",
            "echo": body.decode("utf-8", "replace"),
            "host": self.headers.get("Host", ""),
            "path": self.path,
        }).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)


def _server():
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, httpd.server_address[1]


# --------------------------------------------------------------------------
def test_pin_loopback_target():
    pin = resolve_pinned("http://127.0.0.1:8000/v1/chat-messages")
    assert pin.host == "127.0.0.1"
    assert pin.port == 8000
    assert pin.ip == "127.0.0.1"
    assert pin.host_header == "127.0.0.1:8000"
    verify_unchanged(pin)


def test_pin_rejects_public_target():
    try:
        resolve_pinned("https://www.example.com/v1/chat-messages")
    except ScopeViolation:
        return
    raise AssertionError("公网目标未被拒绝")


def test_pin_rejects_public_ip_literal():
    try:
        resolve_pinned("http://8.8.8.8/")
    except ScopeViolation:
        return
    raise AssertionError("公网 IP 未被拒绝")


def test_pinned_request_reaches_pinned_ip():
    httpd, port = _server()
    try:
        pin = resolve_pinned(f"http://127.0.0.1:{port}/v1/chat-messages")
        status, payload = pinned_request(
            pin, body=json.dumps({"query": "ping"}).encode(),
            headers={"Content-Type": "application/json"})
        data = json.loads(payload)
        assert status == 200
        assert data["answer"] == "pong"
        assert data["path"] == "/v1/chat-messages"
        assert data["host"] == f"127.0.0.1:{port}"
    finally:
        httpd.shutdown()


def test_rebinding_is_detected(monkeypatch_free=None):
    """解析结果在连接前后发生变化时必须判为越界。"""
    pin = PinnedTarget(host="campus.internal", port=8080, scheme="http",
                       ip="192.168.1.10", family=socket.AF_INET,
                       all_ips=("192.168.1.10",), path="/")
    original = socket.getaddrinfo

    def rebind(*args, **kwargs):
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("192.168.1.99", 8080))]

    socket.getaddrinfo = rebind
    try:
        try:
            verify_unchanged(pin)
        except DnsRebindingError as exc:
            assert "192.168.1.99" in str(exc)
            return
        raise AssertionError("未检测到解析结果变化")
    finally:
        socket.getaddrinfo = original


def test_rebinding_to_public_is_detected():
    pin = PinnedTarget(host="campus.internal", port=8080, scheme="http",
                       ip="192.168.1.10", family=socket.AF_INET,
                       all_ips=("192.168.1.10",), path="/")
    original = socket.getaddrinfo

    def rebind(*args, **kwargs):
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 8080))]

    socket.getaddrinfo = rebind
    try:
        try:
            verify_unchanged(pin)
        except DnsRebindingError as exc:
            assert "重绑定" in str(exc) or "非私网" in str(exc)
            return
        raise AssertionError("解析到公网未被拒绝")
    finally:
        socket.getaddrinfo = original


def test_private_host_is_resolved_and_pinned():
    """私网主机应正常固定；用 hosts 之外的确定性方式验证：直接给 IP。"""
    pin = resolve_pinned("http://192.168.1.10:8080/v1")
    assert pin.ip == "192.168.1.10"
    assert pin.all_ips == ("192.168.1.10",)


def test_ipv6_host_header_is_bracketed():
    from app.security.netguard import PinnedTarget

    default_port = PinnedTarget(
        host="::1", port=8080, scheme="http", ip="::1", family=socket.AF_INET6,
        all_ips=("::1",),
    )
    explicit_port = PinnedTarget(
        host="::1", port=8081, scheme="http", ip="::1", family=socket.AF_INET6,
        all_ips=("::1",),
    )
    assert default_port.host_header == "[::1]:8080"
    assert explicit_port.host_header == "[::1]:8081"


def test_dify_adapter_uses_pinned_request(monkeypatch):
    """Dify and OpenAI-compatible calls must share the fixed-IP transport."""
    from app.services import agent_adapter
    from app.security.netguard import PinnedTarget

    pin = PinnedTarget(
        host="192.168.1.10", port=8080, scheme="http", ip="192.168.1.10",
        family=socket.AF_INET, all_ips=("192.168.1.10",), path="/v1/chat-messages",
    )
    agent = SimpleNamespace(
        id="agent-test", version="v2.0", adapter="dify",
        endpoint="http://192.168.1.10:8080/v1/chat-messages",
        model="dify-self-hosted",
        permissions={
            "__target_scope__": "self_hosted_dify",
            "__authorization_confirmed__": "true",
            "__authorization_reference__": "AUTH-TEST",
            "__credential_env__": "TEST_DIFY_KEY",
        },
    )
    calls = []

    monkeypatch.setenv("TEST_DIFY_KEY", "test-secret")
    monkeypatch.setattr(agent_adapter, "resolve_pinned", lambda *_args, **_kwargs: pin)
    monkeypatch.setattr(agent_adapter, "verify_unchanged", lambda value: calls.append(("verify", value.ip)))
    monkeypatch.setattr(
        agent_adapter,
        "get_runtime",
        lambda: SimpleNamespace(guard=SimpleNamespace(assert_allowed=lambda _endpoint: None)),
    )
    monkeypatch.setattr(
        "app.core.target_scope.validate_target_scope",
        lambda **_kwargs: SimpleNamespace(allowed=True),
    )

    def fake_pinned_request(_pin, *, method, headers, body, timeout=30.0):
        calls.append(("request", _pin.ip, method, json.loads(body.decode("utf-8"))))
        assert headers["Authorization"] == "Bearer test-secret"
        return 200, json.dumps({
            "answer": "受控回答",
            "conversation_id": "conversation-1",
            "metadata": {"retrieved_resources": [{"id": "doc-1"}]},
        }, ensure_ascii=False).encode("utf-8")

    monkeypatch.setattr(agent_adapter, "pinned_request", fake_pinned_request)

    result = agent_adapter.invoke_agent(agent, "测试问题", "normal", session_id="session-1")
    assert result.answer == "受控回答"
    assert calls[0][0] == "request"
    assert calls[0][1] == "192.168.1.10"
    assert calls[0][2] == "POST"
    assert calls[1][0] == "verify"


def main() -> int:
    tests = [(name, fn) for name, fn in sorted(globals().items())
             if name.startswith("test_") and callable(fn)]
    failed = 0
    for name, fn in tests:
        try:
            fn()
            print(f"  PASS  {name}")
        except Exception as exc:  # noqa: BLE001
            failed += 1
            print(f"  FAIL  {name}: {exc}")
            traceback.print_exc()
    print(f"\n{len(tests) - failed}/{len(tests)} 通过")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
