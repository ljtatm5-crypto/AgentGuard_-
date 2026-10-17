from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.helpers import suite_dict
from app.db.session import get_db
from app.models.entities import Agent, TestCase, TestSuite
from app.schemas.common import TestSuiteGenerate
from app.services.seed import CASES

router = APIRouter(prefix="/test-suites", tags=["test-suites"])


def suite_cases(db: Session, suite_id: str) -> list[TestCase]:
    return db.scalars(select(TestCase).where(TestCase.suite_id == suite_id)).all()


@router.get("")
def list_suites(db: Session = Depends(get_db)):
    suites = db.scalars(select(TestSuite).order_by(TestSuite.created_at.desc())).all()
    return [suite_dict(suite, suite_cases(db, suite.id)) for suite in suites]


@router.get("/{suite_id}")
def get_suite(suite_id: str, db: Session = Depends(get_db)):
    suite = db.get(TestSuite, suite_id)
    if not suite:
        raise HTTPException(404, "测试集不存在")
    return suite_dict(suite, suite_cases(db, suite.id))


@router.post("/generate")
def generate_suite(payload: TestSuiteGenerate, db: Session = Depends(get_db)):
    if payload.agent_id and not db.get(Agent, payload.agent_id):
        raise HTTPException(404, "Agent 不存在")
    suite = TestSuite(name=payload.name, type="mixed", version="v1", case_ids=[])
    db.add(suite)
    db.flush()
    selected = [item for item in CASES if item["type"] in payload.types] or CASES
    for item in selected:
        case = TestCase(
            suite_id=suite.id,
            steps=[],
            judge={
                "rule_first": True,
                "ruleset_version": "p0-2026.10",
                "llm_role": "supplement_only",
            },
            source="generated",
            **item,
        )
        db.add(case)
        db.flush()
        suite.case_ids = [*suite.case_ids, case.id]
    db.commit()
    return suite_dict(suite, suite_cases(db, suite.id))
