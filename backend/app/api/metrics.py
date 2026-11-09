from fastapi import APIRouter, Depends, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.entities import Finding, TestRun
from app.security.access import is_operator_request
from app.services.desktop_contract import SEED_AGENT_IDS, metrics_view

router = APIRouter(prefix="/metrics", tags=["metrics"])


@router.get("")
def get_metrics(request: Request, db: Session = Depends(get_db)):
    """Legacy aggregate endpoint, scoped to public demo assets for anonymous callers."""
    agent_ids = None if is_operator_request(request) else set(SEED_AGENT_IDS.values())
    run_filter = TestRun.agent_id.in_(agent_ids) if agent_ids is not None else None

    run_count_query = select(func.count(TestRun.id))
    passed_query = select(func.count(TestRun.id)).where(TestRun.status == "passed")
    latency_query = select(func.avg(TestRun.latency))
    if run_filter is not None:
        run_count_query = run_count_query.where(run_filter)
        passed_query = passed_query.where(run_filter)
        latency_query = latency_query.where(run_filter)

    total = db.scalar(run_count_query) or 0
    passed = db.scalar(passed_query) or 0
    avg_latency = db.scalar(latency_query) or 0

    findings_query = select(func.count(Finding.id))
    if agent_ids is not None:
        demo_run_ids = select(TestRun.id).where(TestRun.agent_id.in_(agent_ids))
        findings_query = findings_query.where(Finding.run_id.in_(demo_run_ids))
    findings = db.scalar(findings_query) or 0

    formal = metrics_view(db, agent_ids=agent_ids)
    return {
        "total_runs": total,
        "passed_runs": passed,
        "pass_rate": round(passed / total * 100, 1) if total else 0,
        "finding_count": findings,
        "risk_detection_rate": formal["risk_detection_rate"],
        "risk_metric_status": formal["risk_metric_status"],
        "risk_confusion_matrix": formal["risk_confusion_matrix"],
        "avg_latency_ms": round(float(avg_latency), 1),
        "regression": {
            "before": formal["attack_success_rate_before"],
            "after": formal["attack_success_rate_after"],
            "status": "已审核确定性基线" if formal["risk_metric_status"] == "READY" else "暂无正式评价",
        },
    }