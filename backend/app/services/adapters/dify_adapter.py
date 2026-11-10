"""Dify Chat Messages adapter."""
from __future__ import annotations

import time
from typing import Any

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
    adapter="dify",
    question_answer=True,
    multi_turn=True,
    rag_events="observable_when_returned",
    tool_events="unavailable_unless_returned",
    workflow_events="partial",
    long_term_memory="unavailable",
    notes="Dify 的 conversation_id 由服务端返回；检索资源通常出现在 metadata.retriever_resources。",
)


def _first_text(value: Any) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        for key in ("answer", "text", "content", "output"):
            if isinstance(value.get(key), str) and value[key].strip():
                return value[key]
    return ""


def _resources(payload: dict[str, Any], metadata: dict[str, Any]) -> list[Any]:
    for source in (
        metadata.get("retriever_resources"),
        metadata.get("retrieved_resources"),
        payload.get("retriever_resources"),
        payload.get("retrieved_resources"),
    ):
        if isinstance(source, list):
            return source
    return []


def build_request(input_text: str, session_id: str, conversation_id: str) -> dict[str, Any]:
    return {
        "inputs": {},
        "query": input_text,
        "response_mode": "blocking",
        "conversation_id": conversation_id,
        "user": session_id,
    }


def parse_response(
    payload: dict[str, Any],
    *,
    agent_id: str,
    session_id: str,
    input_text: str,
    requested_conversation_id: str,
    started_at: float,
) -> AdapterResult:
    if not isinstance(payload, dict):
        raise AdapterProtocolError("Dify 响应必须是 JSON 对象")
    nested = payload.get("data")
    answer = _first_text(payload) or (_first_text(nested) if isinstance(nested, dict) else "")
    if not answer:
        raise AdapterProtocolError("Dify 响应缺少 answer")
    conversation_id = str(
        payload.get("conversation_id")
        or (nested.get("conversation_id") if isinstance(nested, dict) else "")
        or requested_conversation_id
        or ""
    ).strip()
    if not conversation_id:
        raise AdapterProtocolError("Dify 响应缺少 conversation_id，无法维持多轮会话")

    metadata = payload.get("metadata")
    if not isinstance(metadata, dict):
        metadata = {}
    resources = _resources(payload, metadata)
    elapsed = int((time.perf_counter() - started_at) * 1000)
    trace_events = [
        make_trace_event(
            event_type="user_input",
            run_id=session_id,
            params={"content": input_text, "conversation_id": requested_conversation_id},
        )
    ]
    for resource in resources:
        trace_events.append(
            make_trace_event(
                event_type="retrieval",
                run_id=session_id,
                params={"resource": resource, "source": "dify.metadata"},
            )
        )
    trace_events.append(
        make_trace_event(
            event_type="response",
            run_id=session_id,
            params={"conversation_id": conversation_id},
            output=answer,
            duration_ms=elapsed,
        )
    )

    raw_usage = metadata.get("usage") or payload.get("usage")
    usage = sanitize_payload(raw_usage) if isinstance(raw_usage, dict) else {
        "available": False,
        "reason": "dify_usage_not_returned",
    }
    events = normalize_events(trace_events)
    capabilities = capability_summary(adapter="dify", raw_events=trace_events, multi_turn=True)
    result = AdapterResult(
        answer=answer,
        events=events,
        session_reference=conversation_id,
        usage=usage,
        evidence_level=evidence_level(trace_events),
        observable_capabilities=capabilities,
        raw={
            "answer": answer,
            "conversation_id": conversation_id,
            "requested_conversation_id": requested_conversation_id,
            "trace_events": trace_events,
            "response": sanitize_payload(payload),
            "usage": usage,
            "evidence_level": evidence_level(trace_events),
            "observable_capabilities": capabilities,
        },
        risk_triggered="AG-SYS-BOUNDARY" in answer,
    )
    get_session_store().touch(agent_id, session_id, conversation_id)
    return result


def invoke(
    *,
    agent_id: str,
    session_id: str,
    input_text: str,
    payload: dict[str, Any],
    started_at: float,
) -> AdapterResult:
    if not isinstance(payload, dict):
        raise AdapterProtocolError("Dify 响应必须是 JSON 对象")
    return parse_response(
        payload,
        agent_id=agent_id,
        session_id=session_id,
        input_text=input_text,
        requested_conversation_id=str(get_session_store().get_reference(agent_id, session_id)),
        started_at=started_at,
    )