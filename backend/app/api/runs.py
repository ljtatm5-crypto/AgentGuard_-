from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.helpers import finding_dict, run_dict, trace_dict
from app.core.config import get_settings
from app.core.target_scope import TargetScopeError, validate_target_scope
from app.db.session import get_db
from app.models.entities import Agent, Finding, TestCase, TestRun, TestSuite, TraceEvent
from app.schemas.common import RunCreate
from app.services.judge import judge_case
from app.services.runner import run_suite

router = APIRouter(prefix="/runs", tags=["runs"])
settings = get_settings()


def finding_for(db: Session, run_id: str) -> Finding | None:
    return db.scalar(select(Finding).where(Finding.run_id == run_id))


@router.get("")
def list_runs(db: Session = Depends(get_db)):
    runs = db.scalars(select(TestRun).order_by(TestRun.created_at.desc()).limit(100)).all()
    return [run_dict(run, db.get(TestCase, run.case_id), finding_for(db, run.id)) for run in runs]


@router.post("")
def create_run(payload: RunCreate, db: Session = Depends(get_db)):
    agent = db.get(Agent, payload.agent_id)
    suite = db.get(TestSuite, payload.suite_id)
    if not agent or not suite:
        raise HTTPException(404, "Agent 或测试集不存在")
    if payload.mode == "live":
        permissions = agent.permissions or {}
        try:
            validate_target_scope(
                endpoint=agent.endpoint,
                adapter=agent.adapter,
                target_scope=permissions.get(
                    "__target_scope__", "local_mock" if agent.adapter == "mock" else "unverified"
                ),
                authorization_confirmed=permissions.get("__authorization_confirmed__") == "true",
                authorization_reference=permissions.get("__authorization_reference__"),
                allowed_hosts=settings.allowed_target_host_list,
            )
        except TargetScopeError as exc:
            raise HTTPException(status_code=403, detail=str(exc)) from exc
        if agent.adapter != "mock":
            raise HTTPException(status_code=501, detail="真实适配器尚未启用；安全门禁已通过，但不会发起外部请求。")
    cases = db.scalars(select(TestCase).where(TestCase.suite_id == suite.id).order_by(TestCase.id)).all()
    if not cases:
        raise HTTPException(400, "测试集没有用例")
    task_id, runs = run_suite(db, agent=agent, suite=suite, cases=cases)
    return {"task_id": task_id, "status": "completed", "total": len(runs), "runs": [run_dict(run) for run in runs]}


@router.get("/{run_id}")
def get_run(run_id: str, db: Session = Depends(get_db)):
    run = db.get(TestRun, run_id)
    if not run:
        raise HTTPException(404, "运行记录不存在")
    return run_dict(run, db.get(TestCase, run.case_id), finding_for(db, run.id))


@router.post("/{run_id}/judge")
def rejudge_run(run_id: str, db: Session = Depends(get_db)):
    run = db.get(TestRun, run_id)
    if not run:
        raise HTTPException(404, "运行记录不存在")
    case = db.get(TestCase, run.case_id)
    events = db.scalars(select(TraceEvent).where(TraceEvent.run_id == run.id).order_by(TraceEvent.timestamp)).all()

    class Invocation:
        answer = (run.result or {}).get("answer", "")
        events = [
            {"type": event.type, "tool": event.tool, "params": event.params, "output": event.output}
            for event in events
        ]

    result = judge_case(case, Invocation())
    run.result = {**(run.result or {}), "judge": result}
    run.score = result["score"]
    run.status = result["status"]
    db.commit()
    return result


@router.get("/{run_id}/trace")
def get_trace(run_id: str, db: Session = Depends(get_db)):
    if not db.get(TestRun, run_id):
        raise HTTPException(404, "运行记录不存在")
    events = db.scalars(select(TraceEvent).where(TraceEvent.run_id == run_id).order_by(TraceEvent.timestamp)).all()
    return [trace_dict(event) for event in events]


@router.get("/findings/{finding_id}/chain")
def get_chain(finding_id: str, db: Session = Depends(get_db)):
    finding = db.get(Finding, finding_id)
    if not finding:
        raise HTTPException(404, "缺陷不存在")
    return {"finding": finding_dict(finding), "chain": finding.chain}
