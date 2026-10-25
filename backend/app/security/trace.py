"""执行轨迹记录器：只记录「可观察事件」，不宣称读取模型隐藏思维过程。

每个事件都带 run_id 与 seq，保证单条用例的轨迹可完整还原、可被
TestRun.trace_refs 和攻击链节点回指。
"""
from __future__ import annotations

import time
from contextlib import contextmanager
from typing import Any, Iterator

from .models import EventType, TraceEvent, new_id, redact
from .store import Store


class TraceRecorder:
    def __init__(self, run_id: str, store: Store | None = None):
        self.run_id = run_id
        self.store = store
        self.events: list[TraceEvent] = []
        self._seq = 0

    def add(
        self,
        type: str | EventType,
        *,
        tool: str = "",
        params: dict | None = None,
        output: Any = "",
        error: str = "",
        latency_ms: int = 0,
        metadata: dict | None = None,
    ) -> TraceEvent:
        self._seq += 1
        ev = TraceEvent(
            id=new_id("evt"),
            run_id=self.run_id,
            type=str(type),
            tool=tool,
            params=_shrink(params or {}),
            output=redact(str(output), 600) if output else "",
            error=redact(str(error), 300) if error else "",
            latency_ms=int(latency_ms),
            seq=self._seq,
            metadata=_shrink(metadata or {}),
        )
        self.events.append(ev)
        if self.store is not None:
            self.store.put("TraceEvent", ev)
        return ev

    @contextmanager
    def timed(self, type: str | EventType, *, tool: str = "", params: dict | None = None) -> Iterator[dict]:
        """计时上下文：进入记 tool_call，退出记 tool_result 并回填耗时。"""
        started = time.perf_counter()
        call_ev = self.add(type, tool=tool, params=params or {})
        box: dict = {"call": call_ev, "ok": True, "output": "", "error": ""}
        try:
            yield box
        except Exception as exc:  # noqa: BLE001 - 轨迹必须记录任何异常
            elapsed = int((time.perf_counter() - started) * 1000)
            box["ok"] = False
            box["error"] = str(exc)
            err_ev = self.add(EventType.ERROR, tool=tool, error=str(exc), latency_ms=elapsed)
            box["error_event"] = err_ev
            raise
        finally:
            elapsed = int((time.perf_counter() - started) * 1000)
            if box["ok"]:
                self.add(EventType.TOOL_RESULT, tool=tool, output=box.get("output", ""), latency_ms=elapsed)

    def by_type(self, type: str) -> list[TraceEvent]:
        return [e for e in self.events if e.type == str(type)]

    def first(self, type: str) -> TraceEvent | None:
        for e in self.events:
            if e.type == str(type):
                return e
        return None

    def ids(self) -> list[str]:
        return [e.id for e in self.events]

    def to_list(self) -> list[dict]:
        return [e.to_dict() for e in self.events]


def _shrink(params: dict) -> dict:
    """参数摘要：长值截断，避免把整段知识库内容写进轨迹。"""
    out = {}
    for k, v in params.items():
        if str(k).lower().replace("-", "_") in {
            "authorization", "cookie", "set_cookie", "token", "access_token",
            "refresh_token", "api_key", "apikey", "password", "secret",
        }:
            out[k] = "[REDACTED]"
            continue
        if v is None:
            out[k] = None
        elif isinstance(v, (int, float, bool)):
            out[k] = v
        elif isinstance(v, (list, tuple)):
            out[k] = [_shrink(x) if isinstance(x, dict) else redact(str(x), 80) for x in v][:8]
        elif isinstance(v, dict):
            out[k] = _shrink(dict(list(v.items())[:8]))
        else:
            out[k] = redact(str(v), 120)
    return out
