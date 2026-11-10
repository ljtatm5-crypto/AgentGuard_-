"""Shared adapter contract and trace helpers.

No adapter may invent an event.  An event is emitted only when the platform
response contains observable evidence for it; otherwise the result declares
the capability as unavailable or partial.
"""
from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from typing import Any

from app.security.models import new_id, now_iso, redact


class AdapterProtocolError(ValueError):
    """The remote response was reachable but did not satisfy the adapter contract."""


@dataclass(frozen=True)
class AdapterCapabilities:
    adapter: str
    question_answer: bool
    multi_turn: bool
    rag_events: str
    tool_events: str
    workflow_events: str
    long_term_memory: str
    notes: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class AdapterResult:
    answer: str
    events: list[dict] = field(default_factory=list)
    session_reference: str | None = None
    usage: dict[str, Any] = field(default_factory=dict)
    evidence_level: str = "unavailable"
    observable_capabilities: dict[str, Any] = field(default_factory=dict)
    raw: dict[str, Any] = field(default_factory=dict)
    risk_triggered: bool = False


_SECRET_KEYS = {
    "authorization", "api_key", "apikey", "token", "secret", "password",
    "cookie", "credential", "key",
}


def sanitize_payload(value: Any, *, depth: int = 0) -> Any:
    """Return a JSON-safe evidence copy with common credential fields redacted."""
    if depth >= 8:
        return "[TRUNCATED_DEPTH]"
    if isinstance(value, dict):
        result: dict[str, Any] = {}
        for raw_key, raw_value in value.items():
            key = str(raw_key)
            if key.lower() in _SECRET_KEYS:
                result[key] = "[REDACTED]"
            else:
                result[key] = sanitize_payload(raw_value, depth=depth + 1)
        return result
    if isinstance(value, list):
        return [sanitize_payload(item, depth=depth + 1) for item in value[:50]]
    if isinstance(value, str):
        return redact(value, limit=4000)
    if isinstance(value, (int, float, bool)) or value is None:
        return value
    return redact(str(value), limit=4000)


def json_preview(value: Any, limit: int = 4000) -> str:
    try:
        return redact(json.dumps(value, ensure_ascii=False, sort_keys=True), limit=limit)
    except (TypeError, ValueError):
        return redact(str(value), limit=limit)


def make_trace_event(
    *,
    event_type: str,
    run_id: str,
    params: dict[str, Any] | None = None,
    output: str | None = None,
    error: str | None = None,
    tool: str | None = None,
    duration_ms: int = 0,
    event_id: str | None = None,
) -> dict[str, Any]:
    """Create a raw trace event accepted by ``security_bridge`` and persistence."""
    return {
        "id": event_id or new_id("evt"),
        "run_id": run_id,
        "type": event_type,
        "timestamp": now_iso(),
        "tool": tool or "",
        "params": sanitize_payload(params or {}),
        "output": redact(output, limit=4000) if output else "",
        "error": redact(error, limit=1000) if error else "",
        # Raw security events use the TraceEvent dataclass field name.
        # normalize_events() maps this to the public ``duration_ms`` contract.
        "latency_ms": int(duration_ms or 0),
    }


def normalize_events(raw_events: list[dict]) -> list[dict]:
    """Map raw trace event names to the public trace-event contract."""
    mapping = {"user_input": "input", "policy_decision": "policy", "tool_call": "tool"}
    normalized: list[dict] = []
    for event in raw_events:
        event_type = str(event.get("type") or "unknown")
        normalized.append({
            "id": event.get("id") or new_id("evt"),
            "type": mapping.get(event_type, event_type),
            "tool": event.get("tool") or None,
            "params": event.get("params") or {},
            "output": event.get("output") or None,
            "error": event.get("error") or None,
            "duration_ms": int(event.get("duration_ms") or event.get("latency_ms") or 0),
        })
    return normalized


def evidence_level(raw_events: list[dict]) -> str:
    types = {str(event.get("type")) for event in raw_events}
    if types & {"retrieval", "tool", "tool_call", "policy", "memory_read", "memory_write"}:
        return "observable"
    return "partial" if "response" in types else "unavailable"


def capability_summary(
    *,
    adapter: str,
    raw_events: list[dict],
    multi_turn: bool,
) -> dict[str, Any]:
    types = {str(event.get("type")) for event in raw_events}
    has_rag = "retrieval" in types
    has_tool = bool(types & {"tool", "tool_call"})
    return {
        "adapter": adapter,
        "question_answer": "response" in types,
        "multi_turn": multi_turn,
        "rag_events": "observable" if has_rag else "unavailable",
        "tool_events": "observable" if has_tool else "unavailable",
        "workflow_events": "unavailable",
        "long_term_memory": "unavailable",
        "notes": "仅声明本次响应中实际可观测到的事件，不推断平台内部思维过程。",
    }