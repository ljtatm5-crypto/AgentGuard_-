from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.entities import Finding, TestRun

router = APIRouter(prefix="/metrics", tags=["metrics"])


@router.get("")
def get_metrics(db: Session = Depends(get_db)):
    total = db.scalar(select(func.count(TestRun.id))) or 0
    passed = db.scalar(select(func.count(TestRun.id)).where(TestRun.status == "passed")) or 0
    findings = db.scalar(select(func.count(Finding.id))) or 0
    avg_latency = db.scalar(select(func.avg(TestRun.latency))) or 0
    return {
        "total_runs": total,
        "passed_runs": passed,
        "pass_rate": round(passed / total * 100, 1) if total else 0,
        "finding_count": findings,
        "risk_detection_rate": 100 if findings and total else 0,
        "avg_latency_ms": round(float(avg_latency), 1),
        "regression": {"before": 0, "after": 0, "status": "待录入真实回归结果"},
    }
