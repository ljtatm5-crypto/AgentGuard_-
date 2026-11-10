"""Generic OpenAI-compatible adapter.

This is intentionally conservative: the endpoint may be stateless, so the
adapter reports ``multi_turn=False`` unless a platform-specific adapter exists
(Dify or FastGPT).
"""
from __future__ import annotations

import time
from typing import Any

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


CAPABILITIES = AdapterCapabilities(
    adapter="openai_compat",
    question_answer=True,
    multi_turn=False,
    rag_events="unavailable",
    tool_events="unavailable",
    workflow_events="unavailable",
    long_term_memory="unavailable",
    notes="通用 Chat Completions 仅能保证输入与最终响应可观测。",
)


def build_request(model: str, input_text: str) -> dict[str, Any]:
    return {
        "model": model or "gpt-4o-mini",
        "messages": [{"role": "user", "content": input_text}],
        "temperature": 0,
    }


def parse_response(
    payload: dict[str, Any],
    *,
    adapter: str,
    session_id: str,
    input_text: str,
    started_at: float,
) -> AdapterResult:
    if not isinstance(payload, dict):
        raise AdapterProtocolError("OpenAI 兼容响应必须是 JSON 对象")
    choices = payload.get("choices")
    answer = ""
    if isinstance(choices, list) and choices:
        first = choices[0] if isinstance(choices[0], dict) else {}
        message = first.get("message") if isinstance(first.get("message"), dict) else {}
        answer = message.get("content") if isinstance(message.get("content"), str) else ""
    if not answer:
        raise AdapterProtocolError("OpenAI 兼容响应缺少 choices[0].message.content")
    elapsed = int((time.perf_counter() - started_at) * 1000)
    trace_events = [
        make_trace_event(event_type="user_input", run_id=session_id, params={"content": input_text}),
        make_trace_event(
            event_type="response", run_id=session_id, params={"source": "openai_compat"},
            output=answer, duration_ms=elapsed,
        ),
    ]
    usage = sanitize_payload(payload.get("usage")) if isinstance(payload.get("usage"), dict) else {
        "available": False, "reason": "usage_not_returned",
    }
    capabilities = capability_summary(adapter=adapter, raw_events=trace_events, multi_turn=False)
    return AdapterResult(
        answer=answer,
        events=normalize_events(trace_events),
        session_reference=None,
        usage=usage,
        evidence_level=evidence_level(trace_events),
        observable_capabilities=capabilities,
        raw={
            "answer": answer,
            "trace_events": trace_events,
            "response": sanitize_payload(payload),
            "usage": usage,
            "evidence_level": evidence_level(trace_events),
            "observable_capabilities": capabilities,
        },
        risk_triggered="AG-SYS-BOUNDARY" in answer,
    )