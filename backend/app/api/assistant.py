"""Controlled XiaoAn teaching and evidence API."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.session import get_db
from app.models.assistant_entities import (
    AssistantFeedback,
    AssistantMessage,
    AssistantRemediationPlan,
    AssistantSession,
)
from app.schemas.assistant import (
    AssistantAnswer,
    AssistantChatRequest,
    AssistantChatResponse,
    AssistantDiagnoseRequest,
    AssistantDiagnosisResponse,
    AssistantFeedbackRequest,
    AssistantFeedbackResponse,
    AssistantRemediationRequest,
    AssistantRemediationResponse,
    AssistantSourceDetail,
    AssistantTutorial,
    AssistantTutorialSummary,
)
from app.services.xiaoan.answer_service import answer_question, source_content
from app.services.xiaoan.evidence_service import diagnosis
from app.services.xiaoan.remediation_service import remediation_plan
from app.services.xiaoan.tutorials import tutorial_by_id, tutorial_list

router = APIRouter(prefix="/assistant", tags=["xiaoan"])


def principal_name(request: Request) -> str:
    principal = getattr(request.state, "principal", None)
    return getattr(principal, "subject", None) or "anonymous"


def require_enabled() -> None:
    if not get_settings().xiaoan_enabled:
        raise HTTPException(status_code=503, detail="小安当前未启用")


def get_or_create_session(request: Request, db: Session, payload: AssistantChatRequest) -> AssistantSession:
    principal = principal_name(request)
    if payload.session_id:
        session = db.get(AssistantSession, payload.session_id)
        if session and session.principal == principal:
            session.page = payload.context.page
            session.context = payload.context.model_dump()
            return session
    session = AssistantSession(principal=principal, page=payload.context.page, context=payload.context.model_dump())
    db.add(session)
    db.flush()
    return session


@router.post("/chat", response_model=AssistantChatResponse)
def chat(payload: AssistantChatRequest, request: Request, db: Session = Depends(get_db)):
    require_enabled()
    session = get_or_create_session(request, db, payload)
    user_message = AssistantMessage(session_id=session.id, role="user", content=payload.message, structured={}, sources=[])
    db.add(user_message)
    db.flush()
    result = answer_question(db, question=payload.message, context=payload.context.model_dump(), principal=session.principal)
    answer = AssistantAnswer.model_validate(result)
    assistant_message = AssistantMessage(
        session_id=session.id, role="assistant", content=answer.conclusion,
        structured=answer.model_dump(), sources=answer.model_dump().get("sources", []),
    )
    db.add(assistant_message)
    db.commit()
    db.refresh(assistant_message)
    return AssistantChatResponse(
        message_id=assistant_message.id, session_id=session.id, answer=answer,
        created_at=datetime.now(timezone.utc),
    )


@router.get("/tutorials", response_model=list[AssistantTutorialSummary])
def tutorials():
    require_enabled()
    return tutorial_list()


@router.get("/tutorials/{tutorial_id}", response_model=AssistantTutorial)
def tutorial(tutorial_id: str):
    require_enabled()
    item = tutorial_by_id(tutorial_id)
    if item is None:
        raise HTTPException(status_code=404, detail="教学流程不存在")
    return item


@router.post("/diagnose", response_model=AssistantDiagnosisResponse)
def diagnose(payload: AssistantDiagnoseRequest, db: Session = Depends(get_db)):
    require_enabled()
    result = diagnosis(db, run_id=payload.run_id, finding_id=payload.finding_id, case_id=payload.case_id)
    return AssistantDiagnosisResponse.model_validate(result)


@router.post("/remediation", response_model=AssistantRemediationResponse)
def remediation(payload: AssistantRemediationRequest, db: Session = Depends(get_db)):
    require_enabled()
    plan = remediation_plan(db, finding_id=payload.finding_id, run_id=payload.run_id, case_id=payload.case_id, question=payload.question or "")
    row = AssistantRemediationPlan(
        finding_id=payload.finding_id, run_id=payload.run_id, plan=plan, confidence=0.8, status="draft",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return AssistantRemediationResponse(plan_id=row.id, **plan)


@router.post("/feedback", response_model=AssistantFeedbackResponse)
def feedback(payload: AssistantFeedbackRequest, db: Session = Depends(get_db)):
    require_enabled()
    message = db.get(AssistantMessage, payload.message_id)
    if message is None:
        raise HTTPException(status_code=404, detail="小安回答不存在")
    row = AssistantFeedback(message_id=payload.message_id, rating=payload.rating, comment=payload.comment)
    db.add(row)
    db.commit()
    db.refresh(row)
    return AssistantFeedbackResponse(id=row.id)


@router.get("/sources/{source_id}", response_model=AssistantSourceDetail)
def source(source_id: str, db: Session = Depends(get_db)):
    require_enabled()
    result = source_content(db, source_id)
    if result is None:
        raise HTTPException(status_code=404, detail="引用来源不存在")
    return result
