"""Pydantic contracts for XiaoAn assistant endpoints."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class AssistantContext(BaseModel):
    page: str = "/overview"
    agent_id: str | None = None
    run_id: str | None = None
    case_id: str | None = None
    finding_id: str | None = None
    event_ids: list[str] = Field(default_factory=list)


class AssistantChatRequest(BaseModel):
    session_id: str | None = None
    message: str = Field(min_length=1, max_length=4000)
    context: AssistantContext = Field(default_factory=AssistantContext)


class AssistantStep(BaseModel):
    title: str
    detail: str
    route: str | None = None
    action_label: str | None = None


class AssistantSource(BaseModel):
    id: str
    document_id: str | None = None
    title: str
    heading: str
    source_path: str
    route: str
    excerpt: str
    score: float = 0
    access_level: str = "public"
    tags: list[str] = Field(default_factory=list)
    embedding_provider: str | None = None


class AssistantEvidenceCard(BaseModel):
    type: str
    label: str
    detail: str
    event_ids: list[str] = Field(default_factory=list)
    status: Literal["observed", "inferred", "unavailable"] = "observed"
    tool: str | None = None
    policy_decision: str | None = None
    timestamp: str | None = None


class AssistantAnswer(BaseModel):
    conclusion: str
    steps: list[AssistantStep] = Field(default_factory=list)
    evidence: list[AssistantEvidenceCard] = Field(default_factory=list)
    sources: list[AssistantSource] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    suggested_questions: list[str] = Field(default_factory=list)
    mode: Literal["local_grounded", "llm_grounded", "mock_grounded"] = "local_grounded"
    model_used: str | None = None
    confidence: float = 0.5


class AssistantChatResponse(BaseModel):
    message_id: str
    session_id: str
    answer: AssistantAnswer
    created_at: datetime


class AssistantDiagnoseRequest(BaseModel):
    run_id: str | None = None
    case_id: str | None = None
    finding_id: str | None = None
    question: str | None = None


class AssistantDiagnosisResponse(BaseModel):
    conclusion: str
    summary: str
    status: Literal["observed", "inferred", "unavailable"]
    evidence: list[AssistantEvidenceCard] = Field(default_factory=list)
    observed: list[str] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    finding: dict[str, Any] | None = None
    run: dict[str, Any] | None = None
    case: dict[str, Any] | None = None
    judge: dict[str, Any] | None = None
    risk_tag: str | None = None


class AssistantRemediationRequest(BaseModel):
    finding_id: str | None = None
    run_id: str | None = None
    case_id: str | None = None
    question: str | None = None


class AssistantRemediationResponse(BaseModel):
    plan_id: str
    risk_tag: str
    problem: str
    observed: list[str] = Field(default_factory=list)
    causes: list[str] = Field(default_factory=list)
    impact: list[str] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)
    steps: list[str] = Field(default_factory=list)
    side_effects: list[str] = Field(default_factory=list)
    regression_plan: list[str] = Field(default_factory=list)
    evidence: list[AssistantEvidenceCard] = Field(default_factory=list)
    sources: list[AssistantSource] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    requires_human_confirmation: bool = True


class AssistantFeedbackRequest(BaseModel):
    message_id: str
    rating: Literal[-1, 1]
    comment: str = Field(default="", max_length=1000)


class AssistantFeedbackResponse(BaseModel):
    id: str
    accepted: bool = True


class AssistantTutorialStep(BaseModel):
    title: str
    detail: str
    route: str
    action_label: str


class AssistantTutorialSummary(BaseModel):
    id: str
    title: str
    description: str
    page: str
    step_count: int


class AssistantTutorial(BaseModel):
    id: str
    title: str
    description: str
    page: str
    steps: list[AssistantTutorialStep]


class AssistantSourceDetail(AssistantSource):
    content: str
    source_version: str
