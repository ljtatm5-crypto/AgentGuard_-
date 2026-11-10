"""In-process remote session references.

Each test case already receives a unique ``session_id`` in the runner.  Remote
platforms need a second, platform-specific identifier (Dify conversation_id or
FastGPT chatId).  Keeping it here makes the multi-turn behavior explicit and
lets ``release_session`` clear it after the case finishes.
"""
from __future__ import annotations

import threading
from collections import OrderedDict
from dataclasses import dataclass, field
from datetime import datetime, timezone


@dataclass
class SessionState:
    reference: str
    turn_count: int = 0
    updated_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class RemoteSessionStore:
    def __init__(self, max_entries: int = 2048):
        self._max_entries = max_entries
        self._items: OrderedDict[tuple[str, str], SessionState] = OrderedDict()
        self._lock = threading.RLock()

    @staticmethod
    def _key(agent_id: str, session_id: str) -> tuple[str, str]:
        return str(agent_id), str(session_id)

    def get_reference(self, agent_id: str, session_id: str) -> str:
        with self._lock:
            state = self._items.get(self._key(agent_id, session_id))
            return state.reference if state else ""

    def touch(self, agent_id: str, session_id: str, reference: str) -> None:
        key = self._key(agent_id, session_id)
        with self._lock:
            state = self._items.get(key)
            if state is None:
                state = SessionState(reference=reference)
                self._items[key] = state
            else:
                state.reference = reference
                state.turn_count += 1
                state.updated_at = datetime.now(timezone.utc).isoformat()
                self._items.move_to_end(key)
            while len(self._items) > self._max_entries:
                self._items.popitem(last=False)

    def exists(self, agent_id: str, session_id: str) -> bool:
        with self._lock:
            return self._key(agent_id, session_id) in self._items

    def snapshot(self, agent_id: str, session_id: str) -> dict:
        with self._lock:
            state = self._items.get(self._key(agent_id, session_id))
            return {
                "reference": state.reference if state else "",
                "turn_count": state.turn_count if state else 0,
                "updated_at": state.updated_at if state else "",
            }

    def close(self, agent_id: str, session_id: str) -> None:
        with self._lock:
            self._items.pop(self._key(agent_id, session_id), None)

    def clear(self) -> None:
        with self._lock:
            self._items.clear()


_SESSION_STORE = RemoteSessionStore()


def get_session_store() -> RemoteSessionStore:
    return _SESSION_STORE


def clear_session_store() -> None:
    _SESSION_STORE.clear()