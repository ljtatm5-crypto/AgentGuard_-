"""授权记录 API（队员B / P0）。

让「谁能连哪个靶场」变成可登记、可查询、可撤销的服务端事实，
而不是调用方在 Agent 配置里随手填的一个字符串。

    POST /api/authorizations                登记授权
    GET  /api/authorizations                列出授权（?active_only=true）
    GET  /api/authorizations/{reference}    按编号查询
    POST /api/authorizations/{reference}/revoke  撤销
    POST /api/authorizations/check          干跑校验（给前端/联调用）
"""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.services.authorization import (AuthorizationError, check_authorization,
                                        create_authorization, get_by_reference,
                                        list_authorizations, normalize_host,
                                        revoke_authorization, to_view)

router = APIRouter(prefix="/authorizations", tags=["authorizations"])


class AuthorizationCreate(BaseModel):
    reference: str = Field(..., description="授权编号，对应书面材料的编号")
    owner: str = Field(..., description="授权人")
    purpose: str = Field(..., description="用途")
    target_scope: str = Field(..., description="self_hosted_dify 或 authorized_external")
    host: str = Field(..., description="目标主机，与 endpoint 一致")
    port: int = Field(..., ge=1, le=65535)
    agent_id: str | None = None
    evidence: str = ""
    valid_days: int | None = 30
    expires_at: datetime | None = None


class RevokeRequest(BaseModel):
    reason: str = ""


class CheckRequest(BaseModel):
    reference: str | None = None
    host: str
    port: int
    target_scope: str | None = None
    agent_id: str | None = None


@router.post("")
def create(payload: AuthorizationCreate, db: Session = Depends(get_db)):
    try:
        record = create_authorization(
            db, reference=payload.reference, owner=payload.owner, purpose=payload.purpose,
            target_scope=payload.target_scope, host=payload.host, port=payload.port,
            agent_id=payload.agent_id, evidence=payload.evidence,
            valid_days=payload.valid_days, expires_at=payload.expires_at,
        )
    except AuthorizationError as exc:
        raise HTTPException(400, str(exc)) from exc
    return to_view(record)


@router.get("")
def list_all(active_only: bool = False, db: Session = Depends(get_db)):
    return {"items": [to_view(row) for row in list_authorizations(db, active_only=active_only)]}


@router.post("/check")
def check(payload: CheckRequest, db: Session = Depends(get_db)):
    """干跑：不建连，只回答「这个编号配这个目标能不能过门禁」。"""
    result = check_authorization(
        db, reference=payload.reference, host=normalize_host(payload.host),
        port=payload.port, target_scope=payload.target_scope, agent_id=payload.agent_id,
    )
    return result.to_dict()


@router.get("/{reference}")
def get_one(reference: str, db: Session = Depends(get_db)):
    record = get_by_reference(db, reference)
    if record is None:
        raise HTTPException(404, f"未找到授权编号 {reference}")
    return to_view(record)


@router.post("/{reference}/revoke")
def revoke(reference: str, payload: RevokeRequest, db: Session = Depends(get_db)):
    try:
        record = revoke_authorization(db, reference, payload.reason)
    except AuthorizationError as exc:
        raise HTTPException(404, str(exc)) from exc
    return to_view(record)
