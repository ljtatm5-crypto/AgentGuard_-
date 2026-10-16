from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.helpers import agent_dict
from app.db.session import get_db
from app.models.entities import Agent
from app.schemas.common import AgentCreate, InvokeRequest
from app.services.mock_agent import invoke_mock

router = APIRouter(prefix="/agents", tags=["agents"])


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
    agent = Agent(**payload.model_dump(), status="validated")
    db.add(agent)
    db.commit()
    db.refresh(agent)
    return {"valid": True, "message": "配置校验通过", "agent": agent_dict(agent)}


@router.post("/{agent_id}/invoke")
def invoke_agent(agent_id: str, payload: InvokeRequest, db: Session = Depends(get_db)):
    agent = db.get(Agent, agent_id)
    if not agent:
        raise HTTPException(404, "Agent 不存在")
    invocation = invoke_mock(payload.input)
    return {
        "agent_id": agent.id,
        "answer": invocation.answer,
        "latency": invocation.latency,
        "events": invocation.events,
    }
