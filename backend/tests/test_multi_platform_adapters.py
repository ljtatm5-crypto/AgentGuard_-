"""Contract tests for cross-platform adapters without a real LLM.

These tests use loopback HTTP doubles.  They prove request/response mapping,
session isolation and observability semantics; they are not model experiments.
"""
from __future__ import annotations

import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from types import SimpleNamespace

import pytest

from app.services.agent_adapter import invoke_agent, release_session, reset_runtime


class _CaptureServer:
    def __init__(self, handler_cls):
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), handler_cls)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)

    def __enter__(self):
        self.thread.start()
        return self.server.server_port

    def __exit__(self, *_):
        self.server.shutdown()
        self.server.server_close()


def _dify_agent(port: int) -> SimpleNamespace:
    return SimpleNamespace(
        id="dify-contract-agent",
        version="v2.0",
        adapter="dify",
        endpoint=f"http://127.0.0.1:{port}/v1/chat-messages",
        model="dify-self-hosted",
        permissions={
            "__target_scope__": "self_hosted_dify",
            "__authorization_confirmed__": "true",
            "__authorization_reference__": "AUTH-DIFY-CONTRACT",
            "__credential_env__": "AGENTGUARD_TEST_DIFY_KEY",
        },
    )


def _fastgpt_agent(port: int) -> SimpleNamespace:
    return SimpleNamespace(
        id="fastgpt-contract-agent",
        version="v2.0",
        adapter="fastgpt",
        endpoint=f"http://127.0.0.1:{port}/api/v1/chat/completions",
        model="fastgpt-self-hosted",
        permissions={
            "__target_scope__": "self_hosted_fastgpt",
            "__authorization_confirmed__": "true",
            "__authorization_reference__": "AUTH-FASTGPT-CONTRACT",
            "__credential_env__": "AGENTGUARD_TEST_FASTGPT_KEY",
            "__fastgpt_app_id__": "app-contract-001",
        },
    )


def test_dify_conversation_id_is_reused_within_case_and_cleared_between_cases(monkeypatch):
    bodies: list[dict] = []

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            length = int(self.headers.get("Content-Length", "0"))
            body = json.loads(self.rfile.read(length))
            bodies.append(body)
            conversation_id = body.get("conversation_id") or "conv-contract-1"
            payload = json.dumps({
                "answer": f"turn:{body['query']}",
                "conversation_id": conversation_id,
                "metadata": {"retriever_resources": [{"id": "doc-1"}]},
            }, ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def log_message(self, *_):
            pass

    monkeypatch.setenv("AGENTGUARD_TEST_DIFY_KEY", "test-secret")
    with _CaptureServer(Handler) as port:
        agent = _dify_agent(port)
        first = invoke_agent(agent, "第一轮", session_id="case-a")
        second = invoke_agent(agent, "第二轮", session_id="case-a")
        other = invoke_agent(agent, "另一个用例", session_id="case-b")
        release_session(agent.id, "case-a")
        third = invoke_agent(agent, "释放后重新开始", session_id="case-a")

    assert first.session_reference == "conv-contract-1"
    assert second.session_reference == "conv-contract-1"
    assert other.session_reference == "conv-contract-1"
    assert bodies[0]["conversation_id"] == ""
    assert bodies[1]["conversation_id"] == "conv-contract-1"
    assert bodies[2]["conversation_id"] == ""
    assert bodies[3]["conversation_id"] == ""
    assert third.session_reference == "conv-contract-1"
    assert all(inv.evidence_level == "observable" for inv in (first, second, other, third))
    reset_runtime()


def test_fastgpt_uses_appid_chatid_detail_and_maps_observable_events(monkeypatch):
    bodies: list[dict] = []
    history: dict[str, list[str]] = {}

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            length = int(self.headers.get("Content-Length", "0"))
            body = json.loads(self.rfile.read(length))
            bodies.append(body)
            chat_id = body["chatId"]
            question = body["messages"][0]["content"]
            prior = history.setdefault(chat_id, [])
            answer = f"prior={prior[-1] if prior else 'none'}; now={question}"
            prior.append(question)
            payload = json.dumps({
                "id": "chatcmpl-contract",
                "choices": [{"message": {"role": "assistant", "content": answer}}],
                "responseData": [
                    {
                        "moduleType": "dataset",
                        "moduleName": "campus-knowledge",
                        "resource": {"dataset": "campus", "chunk": "library-hours"},
                    },
                    {
                        "moduleType": "tool",
                        "moduleName": "campus_search",
                        "toolResponse": {"text": "只读检索成功"},
                    },
                ],
                "usage": {"prompt_tokens": 999, "completion_tokens": 999},
            }, ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def log_message(self, *_):
            pass

    monkeypatch.setenv("AGENTGUARD_TEST_FASTGPT_KEY", "test-secret")
    with _CaptureServer(Handler) as port:
        agent = _fastgpt_agent(port)
        first = invoke_agent(agent, "图书馆几点开门？", session_id="case-a")
        second = invoke_agent(agent, "那考试周呢？", session_id="case-a")
        other = invoke_agent(agent, "另一个用例", session_id="case-b")
        release_session(agent.id, "case-a")

    assert bodies[0]["appId"] == "app-contract-001"
    assert bodies[0]["detail"] is True
    assert bodies[0]["stream"] is False
    assert bodies[1]["chatId"] == bodies[0]["chatId"]
    assert bodies[2]["chatId"] != bodies[0]["chatId"]
    assert "prior=图书馆几点开门？" in second.answer
    assert first.usage["available"] is False
    assert first.usage["top_level_usage_ignored"] is True
    assert {"input", "retrieval", "tool", "response"} <= {event["type"] for event in first.events}
    assert first.evidence_level == "observable"
    assert first.observable_capabilities["rag_events"] == "observable"
    assert first.observable_capabilities["tool_events"] == "observable"
    assert "999" not in json.dumps(first.usage, ensure_ascii=False)
    reset_runtime()


def test_fastgpt_invalid_json_and_missing_content_are_explicit_contract_errors(monkeypatch):
    from app.services.adapters import AdapterProtocolError

    class InvalidJsonHandler(BaseHTTPRequestHandler):
        def do_POST(self):
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b"not-json")

        def log_message(self, *_):
            pass

    monkeypatch.setenv("AGENTGUARD_TEST_FASTGPT_KEY", "test-secret")
    with _CaptureServer(InvalidJsonHandler) as port:
        agent = _fastgpt_agent(port)
        try:
            invoke_agent(agent, "测试", session_id="case-json")
        except AdapterProtocolError as exc:
            assert "非法 JSON" in str(exc)
        else:
            raise AssertionError("FastGPT 非法 JSON 未被显式拒绝")
    reset_runtime()


@pytest.mark.parametrize("status", [401, 404, 429, 500])
def test_fastgpt_http_errors_are_not_silently_treated_as_answers(monkeypatch, status):
    from app.services.adapters import AdapterProtocolError

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            payload = json.dumps({"error": "contract failure"}).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def log_message(self, *_):
            pass

    monkeypatch.setenv("AGENTGUARD_TEST_FASTGPT_KEY", "test-secret")
    with _CaptureServer(Handler) as port:
        agent = _fastgpt_agent(port)
        with pytest.raises(AdapterProtocolError, match=f"HTTP {status}"):
            invoke_agent(agent, "测试", session_id=f"case-http-{status}")
    reset_runtime()


def test_fastgpt_without_detail_is_explicitly_partial(monkeypatch):
    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            payload = json.dumps({
                "choices": [{"message": {"content": "只有最终回答"}}],
                "usage": {"prompt_tokens": 123},
            }, ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def log_message(self, *_):
            pass

    monkeypatch.setenv("AGENTGUARD_TEST_FASTGPT_KEY", "test-secret")
    with _CaptureServer(Handler) as port:
        agent = _fastgpt_agent(port)
        invocation = invoke_agent(agent, "测试", session_id="case-no-detail")
    assert invocation.evidence_level == "partial"
    assert invocation.observable_capabilities["rag_events"] == "unavailable"
    assert invocation.observable_capabilities["tool_events"] == "unavailable"
    assert invocation.usage["available"] is False
    assert invocation.usage["top_level_usage_ignored"] is True
    reset_runtime()


def test_dify_network_error_does_not_corrupt_existing_session(monkeypatch):
    bodies: list[dict] = []
    calls = 0

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            nonlocal calls
            calls += 1
            length = int(self.headers.get("Content-Length", "0"))
            body = json.loads(self.rfile.read(length))
            bodies.append(body)
            if calls == 2:
                payload = b'{"error":"temporary"}'
                self.send_response(500)
            else:
                payload = json.dumps({
                    "answer": f"turn:{body['query']}",
                    "conversation_id": "conv-stable",
                }, ensure_ascii=False).encode("utf-8")
                self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def log_message(self, *_):
            pass

    monkeypatch.setenv("AGENTGUARD_TEST_DIFY_KEY", "test-secret")
    with _CaptureServer(Handler) as port:
        agent = _dify_agent(port)
        invoke_agent(agent, "第一轮", session_id="case-stable")
        with pytest.raises(Exception):
            invoke_agent(agent, "第二轮失败", session_id="case-stable")
        invoke_agent(agent, "第三轮", session_id="case-stable")
    assert bodies[0]["conversation_id"] == ""
    assert bodies[1]["conversation_id"] == "conv-stable"
    assert bodies[2]["conversation_id"] == "conv-stable"
    reset_runtime()


def test_fastgpt_empty_choices_is_a_contract_error(monkeypatch):
    from app.services.adapters import AdapterProtocolError

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            payload = b'{"choices":[],"responseData":null}'
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def log_message(self, *_):
            pass

    monkeypatch.setenv("AGENTGUARD_TEST_FASTGPT_KEY", "test-secret")
    with _CaptureServer(Handler) as port:
        agent = _fastgpt_agent(port)
        with pytest.raises(AdapterProtocolError, match="缺少"):
            invoke_agent(agent, "测试", session_id="case-empty")
    reset_runtime()

