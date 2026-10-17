from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class AgentCreate(BaseModel):
    name: str = "校园智能助手"
    endpoint: str = "local://campus-assistant"
    adapter: Literal["mock", "dify", "openai"] = "mock"
    model: str = "local-rule-model"
    version: str = "v0.1-demo"
    knowledge: list[str] = Field(default_factory=lambda: ["课程与考试", "校园通知", "图书馆规则"])
    tools: list[str] = Field(default_factory=lambda: ["campus_search", "protected_write"])
    permissions: dict[str, str] = Field(
        default_factory=lambda: {"campus_search": "allow", "protected_write": "review"}
    )
    target_scope: Literal["local_mock", "self_hosted_dify", "authorized_external"] = "local_mock"
    authorization_confirmed: bool = False
    authorization_reference: str | None = None


class AgentOut(AgentCreate):
    id: str
    status: str
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class TestSuiteGenerate(BaseModel):
    agent_id: str | None = None
    name: str = "校园助手 P0 综合验证集"
    types: list[str] = Field(
        default_factory=lambda: ["功能", "RAG", "注入", "工具权限", "多轮记忆", "异常"]
    )


class TestCaseOut(BaseModel):
    id: str
    suite_id: str
    name: str
    type: str
    input: str
    steps: list[Any]
    expected: str
    forbidden: list[str]
    judge: dict[str, Any]
    risk_tag: str
    source: str
    model_config = ConfigDict(from_attributes=True)


class TestSuiteOut(BaseModel):
    id: str
    name: str
    type: str
    version: str
    case_ids: list[str]
    status: str
    created_at: datetime
    cases: list[TestCaseOut] = []
    model_config = ConfigDict(from_attributes=True)


class RunCreate(BaseModel):
    agent_id: str
    suite_id: str
    mode: Literal["demo", "live"] = "demo"


class JudgeOut(BaseModel):
    status: str
    conclusion: str
    reason: str
    score: float
    confidence: float
    source: str
    evidence: list[str]


class InvokeRequest(BaseModel):
    input: str
    session_id: str | None = None


class TraceOut(BaseModel):
    id: str
    run_id: str
    type: str
    timestamp: datetime
    tool: str | None
    params: dict[str, Any]
    output: str | None
    error: str | None
    duration_ms: int | None
    model_config = ConfigDict(from_attributes=True)
