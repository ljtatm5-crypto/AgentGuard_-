"""轻量持久化层：SQLite + JSON 文档存储（纯标准库）。

为什么不用 SQLAlchemy：比赛版要求「干净环境按 README 启动、不依赖个人路径或密钥」。
sqlite3 是标准库，天然满足；表结构用 kind/id/json 的文档式存储，
既保留六类对象的完整字段，又避免为 6 张表写 6 套 ORM 映射。
后续如需升级 PostgreSQL，只需替换本文件，接口不变。
"""
from __future__ import annotations

import json
import os
import sqlite3
import threading
from pathlib import Path
from typing import Any, Iterable

from .models import now_iso

DEFAULT_DB = Path(__file__).resolve().parent.parent / "data" / "agentguard.db"

_SCHEMA = """
CREATE TABLE IF NOT EXISTS objects (
    kind       TEXT NOT NULL,
    id         TEXT NOT NULL,
    json       TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (kind, id)
);
CREATE INDEX IF NOT EXISTS idx_objects_kind ON objects(kind);
CREATE INDEX IF NOT EXISTS idx_objects_created ON objects(created_at);
CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"""


class Store:
    """线程安全的文档存储。所有对象自带 id，按 kind 分组。"""

    def __init__(self, path: str | os.PathLike | None = None):
        self.path = Path(path) if path else Path(os.environ.get("AGENTGUARD_DB", DEFAULT_DB))
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._conn = sqlite3.connect(str(self.path), check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        with self._lock:
            self._conn.executescript(_SCHEMA)
            self._conn.commit()

    # -- 基础 CRUD -------------------------------------------------------
    def put(self, kind: str, obj: Any) -> str:
        payload = obj.to_dict() if hasattr(obj, "to_dict") else dict(obj)
        oid = payload.get("id")
        if not oid:
            raise ValueError(f"{kind} 缺少 id，拒绝落库")
        with self._lock:
            self._conn.execute(
                "INSERT INTO objects(kind,id,json,created_at) VALUES(?,?,?,?) "
                "ON CONFLICT(kind,id) DO UPDATE SET json=excluded.json",
                (kind, oid, json.dumps(payload, ensure_ascii=False), payload.get("created_at") or now_iso()),
            )
            self._conn.commit()
        return oid

    def put_many(self, kind: str, objs: Iterable[Any]) -> list[str]:
        return [self.put(kind, o) for o in objs]

    def get(self, kind: str, oid: str) -> dict | None:
        with self._lock:
            row = self._conn.execute(
                "SELECT json FROM objects WHERE kind=? AND id=?", (kind, oid)
            ).fetchone()
        return json.loads(row["json"]) if row else None

    def list(self, kind: str, limit: int = 500, **filters) -> list[dict]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT json FROM objects WHERE kind=? ORDER BY created_at ASC", (kind,)
            ).fetchall()
        items = [json.loads(r["json"]) for r in rows]
        for key, value in filters.items():
            if value is None:
                continue
            items = [i for i in items if str(i.get(key)) == str(value)]
        return items[:limit] if limit else items

    def count(self, kind: str, **filters) -> int:
        return len(self.list(kind, limit=0, **filters))

    def delete(self, kind: str, oid: str) -> bool:
        """仅用于测试夹具清理。业务上禁止删除 Finding（证据必须保留）。"""
        with self._lock:
            cur = self._conn.execute("DELETE FROM objects WHERE kind=? AND id=?", (kind, oid))
            self._conn.commit()
        return cur.rowcount > 0

    def clear_kind(self, kind: str) -> int:
        with self._lock:
            cur = self._conn.execute("DELETE FROM objects WHERE kind=?", (kind,))
            self._conn.commit()
        return cur.rowcount

    # -- meta ------------------------------------------------------------
    def set_meta(self, key: str, value: Any) -> None:
        with self._lock:
            self._conn.execute(
                "INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                (key, json.dumps(value, ensure_ascii=False)),
            )
            self._conn.commit()

    def get_meta(self, key: str, default: Any = None) -> Any:
        with self._lock:
            row = self._conn.execute("SELECT value FROM meta WHERE key=?", (key,)).fetchone()
        return json.loads(row["value"]) if row else default

    def stats(self) -> dict:
        with self._lock:
            rows = self._conn.execute(
                "SELECT kind, COUNT(*) c FROM objects GROUP BY kind ORDER BY kind"
            ).fetchall()
        return {r["kind"]: r["c"] for r in rows}

    def close(self) -> None:
        with self._lock:
            self._conn.close()


_shared: Store | None = None


def get_store(path: str | os.PathLike | None = None) -> Store:
    """进程内共享单例；传入 path 时返回独立实例（测试隔离用）。"""
    global _shared
    if path is not None:
        return Store(path)
    if _shared is None:
        _shared = Store()
    return _shared
