from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.helpers import agent_dict
from app.core.config import get_settings
from app.core.target_scope import TargetScopeError, validate_target_scope
from app.db.session import get_db
from app.models.entities import Agent
from app.schemas.common import AgentCreate, InvokeRequest
from app.services.mock_agent import invoke_mock

router = APIRouter(prefix="/agents", tags=["agents"])
settings = get_settings()


def assert_agent_scope(payload: AgentCreate, db: Session | None = None,
                       agent_id: str | None = None) -> None:
    try:
        validate_target_scope(
            endpoint=payload.endpoint,
            adapter=payload.adapter,
            target_scope=payload.target_scope,
            authorization_confirmed=payload.authorization_confirmed,
            authorization_reference=payload.authorization_reference,
            allowed_hosts=settings.allowed_target_host_list,
            db=db,
            agent_id=agent_id,
        )
    except TargetScopeError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("")
def list_agents(db: Session = Depends(get_db)):
    return [agent_dict(item) for item in db.scalars(select(Agent).order_by(Agent.created_at)).all()]


@router.get("/{agent_id}")
def get_agent(agent_id: str, db: Session = Depends(get_db)):
    agent = db.get(Agent, agent_id)
    if not agent:
        raise HTTPException(404, "Agent 不存在")
    return agent_dict(agent)


@router.post("/validate")
def validate_agent(payload: AgentCreate, db: Session = Depends(get_db)):
    # 传入 db：非 mock 适配器必须能查到真实的服务端授权记录。
    assert_agent_scope(payload, db=db)
    data = payload.model_dump(
        exclude={"target_scope", "authorization_confirmed", "authorization_reference"}
    )
    data["permissions"] = {
        **data["permissions"],
        "__target_scope__": payload.target_scope,
        "__authorization_confirmed__": str(payload.authorization_confirmed).lower(),
        "__authorization_reference__": payload.authorization_reference or "",
    }
    agent = Agent(**data, status="validated")
    db.add(agent)
    db.commit()
    db.refresh(agent)
    return {"valid": True, "message": "配置校验通过", "agent": agent_dict(agent)}


@router.post("/{agent_id}/invoke")
def invoke_agent(agent_id: str, payload: InvokeRequest, db: Session = Depends(get_db)):
    agent = db.get(Agent, agent_id)
    if not agent:
        raise HTTPException(404, "Agent 不存在")
    if agent.adapter != "mock":
        permissions = agent.permissions or {}
        try:
            validate_target_scope(
                endpoint=agent.endpoint,
                adapter=agent.adapter,
                target_scope=permissions.get("__target_scope__", "unverified"),
                authorization_confirmed=permissions.get("__authorization_confirmed__") == "true",
                authorization_reference=permissions.get("__authorization_reference__"),
                allowed_hosts=settings.allowed_target_host_list,
                db=db,
                agent_id=agent.id,
            )
        except TargetScopeError as exc:
            raise HTTPException(status_code=403, detail=str(exc)) from exc
        raise HTTPException(status_code=501, detail="真实 Agent 适配器尚未启用；当前版本不会发起外部请求。")
    invocation = invoke_mock(payload.input)
    return {
        "agent_id": agent.id,
        "answer": invocation.answer,
        "latency": invocation.latency,
        "events": invocation.events,
    }
