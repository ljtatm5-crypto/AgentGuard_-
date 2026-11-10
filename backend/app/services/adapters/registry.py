"""Adapter registry and guarded HTTP transport."""
from __future__ import annotations

import json
import time
from typing import Any

from app.core.config import get_settings
from app.security.netguard import PinnedTarget, pinned_request, verify_unchanged
from app.security.models import redact

from . import dify_adapter, fastgpt_adapter, openai_adapter
from .base import AdapterCapabilities, AdapterProtocolError, AdapterResult, json_preview
from .session_store import get_session_store

_ADAPTERS = {
    "dify": dify_adapter,
    "fastgpt": fastgpt_adapter,
    "openai": openai_adapter,
    "openai_compat": openai_adapter,
}

_CAMPUS_CAPABILITIES = AdapterCapabilities(
    adapter="campus",
    question_answer=True,
    multi_turn=True,
    rag_events="simulated",
    tool_events="simulated",
    workflow_events="partial",
    long_term_memory="simulated",
    notes="确定性本地沙盒；检索、工具和策略轨迹由模拟器产生。",
)
_MOCK_CAPABILITIES = AdapterCapabilities(
    adapter="mock",
    question_answer=True,
    multi_turn=False,
    rag_events="simulated",
    tool_events="simulated",
    workflow_events="unavailable",
    long_term_memory="unavailable",
    notes="旧 Mock 适配器，仅用于接口联调。",
)

_CAPABILITIES = {
    "campus": _CAMPUS_CAPABILITIES,
    "local": _CAMPUS_CAPABILITIES,
    "mock": _MOCK_CAPABILITIES,
    "dify": dify_adapter.CAPABILITIES,
    "fastgpt": fastgpt_adapter.CAPABILITIES,
    "openai": openai_adapter.CAPABILITIES,
    "openai_compat": openai_adapter.CAPABILITIES,
}


def get_adapter_capabilities(adapter: str) -> AdapterCapabilities:
    return _CAPABILITIES.get(str(adapter).lower(), openai_adapter.CAPABILITIES)


def _post_json(pin: PinnedTarget, *, api_key: str, body: dict[str, Any], timeout: float, request_fn=pinned_request, verify_fn=verify_unchanged) -> tuple[int, dict[str, Any]]:
    status, raw_body = request_fn(
        pin,
        method="POST",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        body=json.dumps(body, ensure_ascii=False).encode("utf-8"),
        timeout=timeout,
    )
    try:
        verify_fn(pin)
    except Exception:
        raise
    try:
        payload = json.loads(raw_body.decode("utf-8", errors="replace"))
    except json.JSONDecodeError as exc:
        raise AdapterProtocolError(f"被测 Agent 返回非法 JSON（HTTP {status}）") from exc
    return status, payload


def invoke_remote(
    *,
    adapter: str,
    agent_id: str,
    session_id: str,
    input_text: str,
    pin: PinnedTarget,
    api_key: str,
    permissions: dict[str, Any],
    model: str = "",
    timeout: float | None = None,
    request_fn=pinned_request,
    verify_fn=verify_unchanged,
) -> AdapterResult:
    adapter = str(adapter).lower()
    if adapter not in _ADAPTERS:
        raise ValueError(f"未知 adapter: {adapter}")
    started_at = time.perf_counter()
    settings = get_settings()
    store = get_session_store()
    if adapter == "dify":
        conversation_id = store.get_reference(agent_id, session_id)
        body = dify_adapter.build_request(input_text, session_id, conversation_id)
    elif adapter == "fastgpt":
        app_id = str(permissions.get("__fastgpt_app_id__", "") or "").strip()
        if not app_id:
            raise AdapterProtocolError("FastGPT 缺少服务端 appId 配置")
        chat_id = store.get_reference(agent_id, session_id) or fastgpt_adapter._chat_id(agent_id, session_id)
        body = fastgpt_adapter.build_request(app_id=app_id, chat_id=chat_id, input_text=input_text)
    else:
        body = openai_adapter.build_request(model, input_text)

    status, payload = _post_json(
        pin,
        api_key=api_key,
        body=body,
        timeout=timeout if timeout is not None else settings.remote_request_timeout_seconds,
        request_fn=request_fn,
        verify_fn=verify_fn,
    )
    if status >= 400:
        raise AdapterProtocolError(
            f"{adapter} 返回 HTTP {status}: {json_preview(payload, limit=500)}"
        )
    if adapter == "dify":
        return dify_adapter.invoke(
            agent_id=agent_id, session_id=session_id, input_text=input_text,
            payload=payload, started_at=started_at,
        )
    if adapter == "fastgpt":
        return fastgpt_adapter.invoke(
            agent_id=agent_id, session_id=session_id, input_text=input_text,
            payload=payload, started_at=started_at,
        )
    return openai_adapter.parse_response(
        payload, adapter=adapter, session_id=session_id,
        input_text=input_text, started_at=started_at,
    )


def release_remote_session(agent_id: str, session_id: str) -> None:
    get_session_store().close(agent_id, session_id)