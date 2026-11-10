"""FastGPT Chat Completions adapter.

FastGPT is Chat-Completions-like but not a plain OpenAI model endpoint.  The
adapter treats ``appId``, ``chatId`` and ``detail`` as first-class fields and
only reports RAG/tool events that are actually present in ``responseData``.
"""
from __future__ import annotations

import hashlib
import time
from typing import Any, Iterable

from app.security.models import redact

from .base import (
    AdapterCapabilities,
    AdapterProtocolError,
    AdapterResult,
    capability_summary,
    evidence_level,
    make_trace_event,
    normalize_events,
    sanitize_payload,
)
from .session_store import get_session_store


CAPABILITIES = AdapterCapabilities(
    adapter="fastgpt",
    question_answer=True,
    multi_turn=True,
    rag_events="observable_when_detail_returned",
    tool_events="observable_when_detail_returned",
    workflow_events="partial",
    long_term_memory="not_verified",
    notes="FastGPT 使用 chatId 维持上下文；顶部 usage 不作为真实 Token 消耗依据。",
)


def _chat_id(agent_id: str, session_id: str) -> str:
    """Stable per-agent/per-case chatId, safe for FastGPT and reproducible."""
    material = f"{agent_id}:{session_id}"
    return "ag-" + hashlib.sha256(material.encode("utf-8")).hexdigest()[:24]


def build_request(
    *,
    app_id: str,
    chat_id: str,
    input_text: str,
    variables: dict[str, Any] | None = None,
) -> dict[str, Any]:
    body: dict[str, Any] = {
        "appId": app_id,
        "chatId": chat_id,
        "stream": False,
        "detail": True,
        "messages": [{"role": "user", "content": input_text}],
    }
    if variables:
        body["variables"] = sanitize_payload(variables)
    return body


def _content_from_choices(payload: dict[str, Any]) -> str:
    choices = payload.get("choices")
    if not isinstance(choices, list) or not choices:
        return ""
    first = choices[0]
    if not isinstance(first, dict):
        return ""
    message = first.get("message")
    if isinstance(message, dict):
        content = message.get("content")
        if isinstance(content, str):
            return content
    if isinstance(first.get("text"), str):
        return first["text"]
    return ""


def _response_data_text(value: Any) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        for key in ("answer", "text", "content", "output"):
            if isinstance(value.get(key), str) and value[key].strip():
                return value[key]
    return ""


def _walk(value: Any) -> Iterable[dict[str, Any]]:
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from _walk(child)
    elif isinstance(value, list):
        for child in value:
            yield from _walk(child)


def _module_marker(node: dict[str, Any]) -> tuple[str, str]:
    module_type = str(node.get("moduleType") or node.get("type") or "").lower()
    module_name = str(node.get("moduleName") or node.get("name") or "").lower()
    return module_type, module_name


def _extract_detail_events(response_data: Any, *, session_id: str) -> tuple[list[dict], bool, bool]:
    retrieval_events: list[dict] = []
    tool_events: list[dict] = []
    seen: set[str] = set()
    for node in _walk(response_data):
        module_type, module_name = _module_marker(node)
        marker = f"{module_type} {module_name}"
        values_text = str(node)
        # Explicit tool module types take precedence over ambiguous names such
        # as "campus_search"; otherwise the event would be mislabeled as RAG.
        is_tool = any(token in module_type for token in ("tool", "plugin", "http"))
        is_retrieval = not is_tool and any(
            token in marker for token in ("dataset", "retrieval", "search", "knowledge")
        )
        if not is_retrieval and not is_tool:
            continue
        fingerprint = marker + redact(values_text, limit=500)
        if fingerprint in seen:
            continue
        seen.add(fingerprint)
        if is_retrieval:
            retrieval_events.append(
                make_trace_event(
                    event_type="retrieval",
                    run_id=session_id,
                    params={
                        "module_type": module_type,
                        "module_name": module_name,
                        "resource": sanitize_payload(node),
                        "source": "fastgpt.responseData",
                    },
                )
            )
        else:
            tool_name = str(node.get("toolName") or node.get("name") or module_name or "fastgpt_tool")
            tool_events.append(
                make_trace_event(
                    event_type="tool",
                    run_id=session_id,
                    tool=tool_name,
                    params={
                        "module_type": module_type,
                        "module_name": module_name,
                        "detail": sanitize_payload(node),
                        "source": "fastgpt.responseData",
                    },
                    output=_response_data_text(node.get("toolResponse") or node.get("response") or node.get("output")),
                )
            )
    return retrieval_events + tool_events, bool(retrieval_events), bool(tool_events)


def _detail_usage(payload: dict[str, Any], response_data: Any) -> dict[str, Any]:
    for node in _walk(response_data):
        for key in ("usage", "tokenUsage", "tokens"):
            value = node.get(key)
            if isinstance(value, dict):
                return {"available": True, "source": "fastgpt.detail", "raw": sanitize_payload(value)}
    detail = payload.get("detail")
    if isinstance(detail, dict) and isinstance(detail.get("usage"), dict):
        return {"available": True, "source": "fastgpt.detail", "raw": sanitize_payload(detail["usage"])}
    return {
        "available": False,
        "reason": "fastgpt_top_level_usage_not_authoritative",
        "top_level_usage_ignored": isinstance(payload.get("usage"), dict),
    }


def parse_response(
    payload: dict[str, Any],
    *,
    agent_id: str,
    session_id: str,
    input_text: str,
    chat_id: str,
    started_at: float,
) -> AdapterResult:
    if not isinstance(payload, dict):
        raise AdapterProtocolError("FastGPT 响应必须是 JSON 对象")
    response_data = payload.get("responseData")
    answer = _content_from_choices(payload) or _response_data_text(response_data)
    if not answer:
        raise AdapterProtocolError("FastGPT 响应缺少 choices[0].message.content 或 responseData 文本")
    elapsed = int((time.perf_counter() - started_at) * 1000)
    trace_events = [
        make_trace_event(
            event_type="user_input",
            run_id=session_id,
            params={"content": input_text, "chatId": chat_id, "appId": payload.get("appId") or ""},
        )
    ]
    detail_events, has_rag, has_tool = _extract_detail_events(response_data, session_id=session_id)
    trace_events.extend(detail_events)
    trace_events.append(
        make_trace_event(
            event_type="response",
            run_id=session_id,
            params={"chatId": chat_id, "detail": bool(response_data)},
            output=answer,
            duration_ms=elapsed,
        )
    )
    usage = _detail_usage(payload, response_data)
    events = normalize_events(trace_events)
    capabilities = capability_summary(adapter="fastgpt", raw_events=trace_events, multi_turn=True)
    if has_rag:
        capabilities["rag_events"] = "observable"
    if has_tool:
        capabilities["tool_events"] = "observable"
    if response_data is not None:
        capabilities["workflow_events"] = "partial"
    raw = {
        "answer": answer,
        "chatId": chat_id,
        "trace_events": trace_events,
        "response": sanitize_payload(payload),
        "usage": usage,
        "evidence_level": evidence_level(trace_events),
        "observable_capabilities": capabilities,
    }
    result = AdapterResult(
        answer=answer,
        events=events,
        session_reference=chat_id,
        usage=usage,
        evidence_level=evidence_level(trace_events),
        observable_capabilities=capabilities,
        raw=raw,
        risk_triggered="AG-SYS-BOUNDARY" in answer,
    )
    get_session_store().touch(agent_id, session_id, chat_id)
    return result


def invoke(
    *,
    agent_id: str,
    session_id: str,
    input_text: str,
    payload: dict[str, Any],
    started_at: float,
) -> AdapterResult:
    chat_id = get_session_store().get_reference(agent_id, session_id) or _chat_id(agent_id, session_id)
    return parse_response(
        payload,
        agent_id=agent_id,
        session_id=session_id,
        input_text=input_text,
        chat_id=chat_id,
        started_at=started_at,
    )