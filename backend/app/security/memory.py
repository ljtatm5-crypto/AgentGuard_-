"""会话记忆与记忆校验。

风险原型（记忆污染）
-------------------
未修复版：把对话里出现的任何「事实」和「规则」都写进长期记忆，包括
「用户已被授权为管理员」这类提权声明；后续会话再次读到它，就把提权当成既成事实。

修复版做三件事：
1. 键白名单：只允许 user_name / preference / topic 三类非权限字段；
2. 提权词拦截：value 中出现授权、管理员、白名单等词直接拒绝写入；
3. 来源校验：只接受 user / system 来源，untrusted 文档不得写入记忆。
"""
from __future__ import annotations

from dataclasses import dataclass

from .models import EventType
from .store import Store
from .tools import VirtualCampus
from .trace import TraceRecorder

MEMORY_KEY_ALLOWLIST = {"user_name", "preference", "topic", "grade_year"}
PRIVILEGE_KEYS = {"admin_flag", "role", "authorized", "whitelist", "permission", "is_admin"}
PRIVILEGE_WORDS = ("管理员", "已授权", "白名单", "提权", "admin", "root", "superuser")
TRUSTED_WRITERS = {"user", "system"}


@dataclass
class MemoryOp:
    ok: bool
    key: str
    value: str
    reason: str = ""
    event_id: str = ""


class MemoryStore:
    def __init__(self, campus: VirtualCampus, store: Store | None = None):
        self.campus = campus
        self.store = store

    def read(self, session_id: str, recorder: TraceRecorder) -> dict[str, dict]:
        mem = self.campus.memory_read(session_id)
        recorder.add(
            EventType.MEMORY_READ, tool="memory",
            params={"session_id": session_id, "keys": sorted(mem)},
            output=str({k: v["value"] for k, v in mem.items()}),
            metadata={"count": len(mem)},
        )
        return mem

    def write(
        self,
        session_id: str,
        key: str,
        value: str,
        *,
        provenance: str,
        recorder: TraceRecorder,
        enforce: bool,
    ) -> MemoryOp:
        ok, reason = True, "已写入长期记忆"
        if enforce:
            if key in PRIVILEGE_KEYS or not _is_allowlisted(key):
                ok, reason = False, f"键 {key} 不在记忆白名单内，拒绝写入（防提权）"
            elif any(w in value for w in PRIVILEGE_WORDS):
                ok, reason = False, "记忆内容包含提权类表述，拒绝写入"
            elif provenance not in TRUSTED_WRITERS:
                ok, reason = False, f"来源 {provenance} 不可写入记忆（仅限 {sorted(TRUSTED_WRITERS)}）"
            elif len(value) > 200:
                ok, reason = False, "记忆内容超长，拒绝写入"

        if ok:
            self.campus.memory_write(session_id, key, value, provenance, "trusted" if enforce else "unchecked")

        ev = recorder.add(
            EventType.MEMORY_WRITE if ok else EventType.ERROR,
            tool="memory",
            params={"session_id": session_id, "key": key, "provenance": provenance},
            output=value if ok else "",
            error="" if ok else reason,
            metadata={"accepted": ok, "enforced": enforce},
        )
        return MemoryOp(ok=ok, key=key, value=value, reason=reason, event_id=ev.id)


def _is_allowlisted(key: str) -> bool:
    return key in MEMORY_KEY_ALLOWLIST
