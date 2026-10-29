from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def new_id() -> str:
    return str(uuid4())


class Agent(Base):
    __tablename__ = "agents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(120))
    version: Mapped[str] = mapped_column(String(40), default="v0.1-demo")
    adapter: Mapped[str] = mapped_column(String(30), default="mock")
    endpoint: Mapped[str] = mapped_column(String(500), default="local://campus-assistant")
    model: Mapped[str] = mapped_column(String(120), default="local-rule-model")
    knowledge: Mapped[list] = mapped_column(JSON, default=list)
    tools: Mapped[list] = mapped_column(JSON, default=list)
    permissions: Mapped[dict] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(30), default="validated")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class TestSuite(Base):
    __tablename__ = "test_suites"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(160))
    type: Mapped[str] = mapped_column(String(40), default="mixed")
    version: Mapped[str] = mapped_column(String(40), default="v1")
    case_ids: Mapped[list] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(30), default="ready")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class TestCase(Base):
    __tablename__ = "test_cases"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    suite_id: Mapped[str] = mapped_column(ForeignKey("test_suites.id"), index=True)
    name: Mapped[str] = mapped_column(String(160))
    type: Mapped[str] = mapped_column(String(40))
    input: Mapped[str] = mapped_column(Text)
    steps: Mapped[list] = mapped_column(JSON, default=list)
    expected: Mapped[str] = mapped_column(Text)
    forbidden: Mapped[list] = mapped_column(JSON, default=list)
    judge: Mapped[dict] = mapped_column(JSON, default=dict)
    risk_tag: Mapped[str] = mapped_column(String(60), default="normal")
    source: Mapped[str] = mapped_column(String(40), default="seed")


class TestRun(Base):
    __tablename__ = "test_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    task_id: Mapped[str] = mapped_column(String(36), index=True)
    agent_id: Mapped[str] = mapped_column(ForeignKey("agents.id"), index=True)
    suite_id: Mapped[str] = mapped_column(ForeignKey("test_suites.id"), index=True)
    case_id: Mapped[str] = mapped_column(ForeignKey("test_cases.id"), index=True)
    agent_version: Mapped[str] = mapped_column(String(40))
    status: Mapped[str] = mapped_column(String(30), default="pending")
    result: Mapped[dict] = mapped_column(JSON, default=dict)
    score: Mapped[float | None] = mapped_column(Float, nullable=True)
    latency: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class TraceEvent(Base):
    __tablename__ = "trace_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    run_id: Mapped[str] = mapped_column(ForeignKey("test_runs.id"), index=True)
    type: Mapped[str] = mapped_column(String(40))
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    tool: Mapped[str | None] = mapped_column(String(100), nullable=True)
    params: Mapped[dict] = mapped_column(JSON, default=dict)
    output: Mapped[str | None] = mapped_column(Text, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)


class Finding(Base):
    __tablename__ = "findings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    run_id: Mapped[str] = mapped_column(ForeignKey("test_runs.id"), index=True)
    severity: Mapped[str] = mapped_column(String(20))
    title: Mapped[str] = mapped_column(String(200))
    evidence: Mapped[list] = mapped_column(JSON, default=list)
    impact: Mapped[str] = mapped_column(Text)
    recommendation: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(30), default="open")
    chain: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class AuthorizationRecord(Base):
    """服务端授权记录：授权人、目标、用途、证据、时间与授权编号逐条落库。

    这条记录是「能不能连这个远程靶场」的唯一凭据。
    调用方在 Agent 配置里自报的 authorization_reference 只有在这里能查到，
    才被认可；查不到、已过期、已撤销或目标不匹配，一律拒绝建连。
    """

    __tablename__ = "authorization_records"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    reference: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    owner: Mapped[str] = mapped_column(String(120))
    purpose: Mapped[str] = mapped_column(Text)
    target_scope: Mapped[str] = mapped_column(String(40))
    host: Mapped[str] = mapped_column(String(255), index=True)
    port: Mapped[int] = mapped_column(Integer)
    agent_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    evidence: Mapped[str] = mapped_column(Text, default="")
    effective_from: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoke_reason: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
