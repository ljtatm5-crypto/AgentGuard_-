"""Persistence for XiaoAn teaching, retrieval and evidence sessions."""
from datetime import datetime

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base
from app.models.entities import new_id, now_utc


class AssistantDocument(Base):
    __tablename__ = "assistant_documents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    document_id: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(200))
    source_path: Mapped[str] = mapped_column(String(500))
    source_version: Mapped[str] = mapped_column(String(80), default="")
    route: Mapped[str] = mapped_column(String(200), default="/overview")
    access_level: Mapped[str] = mapped_column(String(30), default="public")
    tags: Mapped[list] = mapped_column(JSON, default=list)
    content_hash: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(30), default="indexed")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)


class AssistantChunk(Base):
    __tablename__ = "assistant_chunks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    chunk_id: Mapped[str] = mapped_column(String(140), unique=True, index=True)
    document_id: Mapped[str] = mapped_column(ForeignKey("assistant_documents.document_id"), index=True)
    parent_chunk_id: Mapped[str | None] = mapped_column(String(140), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(200))
    heading: Mapped[str] = mapped_column(String(240), default="")
    content: Mapped[str] = mapped_column(Text)
    source_path: Mapped[str] = mapped_column(String(500))
    source_version: Mapped[str] = mapped_column(String(80), default="")
    route: Mapped[str] = mapped_column(String(200), default="/overview")
    access_level: Mapped[str] = mapped_column(String(30), default="public")
    tags: Mapped[list] = mapped_column(JSON, default=list)
    content_hash: Mapped[str] = mapped_column(String(64))
    embedding: Mapped[list] = mapped_column(JSON, default=list)
    embedding_provider: Mapped[str] = mapped_column(String(60), default="local_hash")
    token_count: Mapped[int] = mapped_column(Integer, default=0)
    chunk_order: Mapped[int] = mapped_column(Integer, default=0)


class AssistantSession(Base):
    __tablename__ = "assistant_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    principal: Mapped[str] = mapped_column(String(200), index=True)
    page: Mapped[str] = mapped_column(String(200), default="/overview")
    context: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)


class AssistantMessage(Base):
    __tablename__ = "assistant_messages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    session_id: Mapped[str] = mapped_column(ForeignKey("assistant_sessions.id"), index=True)
    role: Mapped[str] = mapped_column(String(20))
    content: Mapped[str] = mapped_column(Text)
    structured: Mapped[dict] = mapped_column(JSON, default=dict)
    sources: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class AssistantFeedback(Base):
    __tablename__ = "assistant_feedback"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    message_id: Mapped[str] = mapped_column(ForeignKey("assistant_messages.id"), index=True)
    rating: Mapped[int] = mapped_column(Integer)
    comment: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class AssistantRemediationPlan(Base):
    __tablename__ = "assistant_remediation_plans"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    finding_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    run_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    plan: Mapped[dict] = mapped_column(JSON, default=dict)
    confidence: Mapped[float] = mapped_column(Float, default=0.5)
    status: Mapped[str] = mapped_column(String(30), default="draft")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
