from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.helpers import finding_dict
from app.db.session import get_db
from app.models.entities import Finding

router = APIRouter(prefix="/findings", tags=["findings"])


@router.get("")
def list_findings(db: Session = Depends(get_db)):
    findings = db.scalars(select(Finding).order_by(Finding.created_at.desc()).limit(100)).all()
    return [finding_dict(item) for item in findings]


@router.get("/{finding_id}/chain")
def get_chain(finding_id: str, db: Session = Depends(get_db)):
    finding = db.get(Finding, finding_id)
    if not finding:
        raise HTTPException(404, "缺陷不存在")
    return {"finding": finding_dict(finding), "chain": finding.chain}
