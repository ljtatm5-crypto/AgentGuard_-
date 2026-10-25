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
