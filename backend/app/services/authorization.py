"""授权记录服务（队员B / P0）。

为什么需要它
------------
之前的门禁只检查调用方自报的两项：`authorization_confirmed=true` 和
一个非空字符串 `authorization_reference`。这等于"自己说自己有授权"，
别人随手填一个编号就能过。

本模块把授权变成**服务端可查的事实**：
    * 每条记录绑定 目标主机 + 端口 + 作用域 + 可选的 Agent；
    * 有生效时间、到期时间、撤销时间与撤销原因；
    * 门禁拿 (host, port, agent_id) 去查，查不到/过期/撤销/不匹配 → 拒绝建连；
    * 每次成功校验都能回指到具体授权编号，证据可追溯。

对应《队员B 分工与完善报告》P0：
    「授权人、目标、用途、证据、时间和授权编号可查询。」
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.entities import AuthorizationRecord

REFERENCE_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{3,79}$")
TARGET_SCOPES = {"self_hosted_dify", "authorized_external"}
DEFAULT_VALID_DAYS = 30


class AuthorizationError(ValueError):
    """授权记录本身的创建或使用错误，需要可读信息。"""


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


@dataclass(frozen=True)
class AuthorizationCheck:
    """一次授权校验的结果，供门禁与审计复用。"""

    ok: bool
    reference: str
    reason: str
    record_id: str | None = None

    def to_dict(self) -> dict:
        return {"ok": self.ok, "reference": self.reference, "reason": self.reason,
                "record_id": self.record_id}


def normalize_host(host: str) -> str:
    return (host or "").strip().lower().rstrip(".")


def create_authorization(
    db: Session,
    *,
    reference: str,
    owner: str,
    purpose: str,
    target_scope: str,
    host: str,
    port: int,
    agent_id: str | None = None,
    evidence: str = "",
    valid_days: int | None = DEFAULT_VALID_DAYS,
    expires_at: datetime | None = None,
) -> AuthorizationRecord:
    """登记一条授权。同一编号只能登记一次，重复即报错（便于对上书面材料）。"""
    reference = (reference or "").strip()
    if not REFERENCE_PATTERN.match(reference):
        raise AuthorizationError("授权编号格式不合法：4-80 位，仅字母数字和 . _ : -")
    host = normalize_host(host)
    if not host:
        raise AuthorizationError("授权记录必须指明目标主机")
    if not (0 < int(port) < 65536):
        raise AuthorizationError("授权记录必须指明有效端口")
    if target_scope not in TARGET_SCOPES:
        raise AuthorizationError(f"授权作用域只能是 {sorted(TARGET_SCOPES)}")
    if not (owner or "").strip():
        raise AuthorizationError("授权记录必须写明授权人")
    if not (purpose or "").strip():
        raise AuthorizationError("授权记录必须写明用途")

    existing = db.scalar(select(AuthorizationRecord).where(AuthorizationRecord.reference == reference))
    if existing is not None:
        raise AuthorizationError(f"授权编号 {reference} 已存在，请勿重复登记")

    now = _utcnow()
    if expires_at is None and valid_days:
        expires_at = now + timedelta(days=int(valid_days))

    record = AuthorizationRecord(
        reference=reference, owner=owner.strip(), purpose=purpose.strip(),
        target_scope=target_scope, host=host, port=int(port),
        agent_id=(agent_id or None), evidence=(evidence or "").strip(),
        effective_from=now, expires_at=_as_utc(expires_at), created_at=now,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def get_by_reference(db: Session, reference: str) -> AuthorizationRecord | None:
    return db.scalar(select(AuthorizationRecord)
                     .where(AuthorizationRecord.reference == (reference or "").strip()))


def list_authorizations(db: Session, *, active_only: bool = False) -> list[AuthorizationRecord]:
    rows = list(db.scalars(select(AuthorizationRecord)
                           .order_by(AuthorizationRecord.created_at.desc())).all())
    return [row for row in rows if is_active(row)] if active_only else rows


def is_active(record: AuthorizationRecord, at: datetime | None = None) -> bool:
    at = _as_utc(at) or _utcnow()
    if record.revoked_at is not None:
        return False
    if _as_utc(record.effective_from) and at < _as_utc(record.effective_from):
        return False
    expires = _as_utc(record.expires_at)
    return not (expires is not None and at > expires)


def check_authorization(
    db: Session,
    *,
    reference: str | None,
    host: str,
    port: int,
    target_scope: str | None = None,
    agent_id: str | None = None,
    at: datetime | None = None,
) -> AuthorizationCheck:
    """门禁用：编号能否对上一条仍然有效、且目标完全匹配的服务端记录。"""
    reference = (reference or "").strip()
    if not reference:
        return AuthorizationCheck(False, "", "调用方未提供授权编号")
    record = get_by_reference(db, reference)
    if record is None:
        return AuthorizationCheck(False, reference, f"服务端不存在授权编号 {reference}")
    if record.revoked_at is not None:
        return AuthorizationCheck(False, reference,
                                  f"授权 {reference} 已于 {record.revoked_at.isoformat()} 撤销")
    if not is_active(record, at):
        return AuthorizationCheck(False, reference, f"授权 {reference} 已过期或尚未生效")
    if normalize_host(record.host) != normalize_host(host):
        return AuthorizationCheck(False, reference,
                                  f"授权 {reference} 的目标主机是 {record.host}，与请求的 {host} 不一致")
    if int(record.port) != int(port):
        return AuthorizationCheck(False, reference,
                                  f"授权 {reference} 的端口是 {record.port}，与请求的 {port} 不一致")
    if target_scope and record.target_scope != target_scope:
        return AuthorizationCheck(False, reference,
                                  f"授权 {reference} 的作用域是 {record.target_scope}，与声明的 {target_scope} 不一致")
    if record.agent_id and agent_id and record.agent_id != agent_id:
        return AuthorizationCheck(False, reference,
                                  f"授权 {reference} 绑定的是 Agent {record.agent_id}，与当前 Agent 不一致")
    return AuthorizationCheck(True, reference, "授权记录有效且目标匹配", record.id)


def revoke_authorization(db: Session, reference: str, reason: str = "") -> AuthorizationRecord:
    record = get_by_reference(db, reference)
    if record is None:
        raise AuthorizationError(f"未找到授权编号 {reference}")
    if record.revoked_at is None:
        record.revoked_at = _utcnow()
        record.revoke_reason = (reason or "").strip()
        db.commit()
        db.refresh(record)
    return record


def to_view(record: AuthorizationRecord) -> dict[str, Any]:
    """给 API / 前端 / 报告用的字段：授权人、目标、用途、证据、时间、编号。"""
    return {
        "id": record.id,
        "reference": record.reference,
        "owner": record.owner,
        "purpose": record.purpose,
        "target_scope": record.target_scope,
        "host": record.host,
        "port": record.port,
        "agent_id": record.agent_id,
        "evidence": record.evidence,
        "effective_from": record.effective_from.isoformat() if record.effective_from else None,
        "expires_at": record.expires_at.isoformat() if record.expires_at else None,
        "revoked_at": record.revoked_at.isoformat() if record.revoked_at else None,
        "revoke_reason": record.revoke_reason,
        "created_at": record.created_at.isoformat() if record.created_at else None,
        "active": is_active(record),
    }


__all__ = [
    "AuthorizationCheck", "AuthorizationError", "REFERENCE_PATTERN", "TARGET_SCOPES",
    "check_authorization", "create_authorization", "get_by_reference", "is_active",
    "list_authorizations", "normalize_host", "revoke_authorization", "to_view",
]
