"""add XiaoAn assistant knowledge, sessions and remediation plans

Revision ID: 0003_xiaoan_assistant
Revises: 0002_case_ground_truth
Create Date: 2026-11-12
"""
from alembic import op
import sqlalchemy as sa

revision = "0003_xiaoan_assistant"
down_revision = "0002_case_ground_truth"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 0001 intentionally uses metadata.create_all for the initial schema. On a
    # brand-new database that snapshot also includes newly imported models, so
    # avoid re-creating assistant tables when this migration runs afterwards.
    if "assistant_documents" in sa.inspect(op.get_bind()).get_table_names():
        return
    op.create_table(
        "assistant_documents",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("document_id", sa.String(100), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("source_path", sa.String(500), nullable=False),
        sa.Column("source_version", sa.String(80), nullable=False, server_default=""),
        sa.Column("route", sa.String(200), nullable=False, server_default="/overview"),
        sa.Column("access_level", sa.String(30), nullable=False, server_default="public"),
        sa.Column("tags", sa.JSON(), nullable=False),
        sa.Column("content_hash", sa.String(64), nullable=False),
        sa.Column("status", sa.String(30), nullable=False, server_default="indexed"),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint("document_id", name="uq_assistant_documents_document_id"),
    )
    op.create_index("ix_assistant_documents_document_id", "assistant_documents", ["document_id"])
    op.create_table(
        "assistant_chunks",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("chunk_id", sa.String(140), nullable=False),
        sa.Column("document_id", sa.String(100), sa.ForeignKey("assistant_documents.document_id"), nullable=False),
        sa.Column("parent_chunk_id", sa.String(140), nullable=True),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("heading", sa.String(240), nullable=False, server_default=""),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("source_path", sa.String(500), nullable=False),
        sa.Column("source_version", sa.String(80), nullable=False, server_default=""),
        sa.Column("route", sa.String(200), nullable=False, server_default="/overview"),
        sa.Column("access_level", sa.String(30), nullable=False, server_default="public"),
        sa.Column("tags", sa.JSON(), nullable=False),
        sa.Column("content_hash", sa.String(64), nullable=False),
        sa.Column("embedding", sa.JSON(), nullable=False),
        sa.Column("embedding_provider", sa.String(60), nullable=False, server_default="local_hash"),
        sa.Column("token_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("chunk_order", sa.Integer(), nullable=False, server_default="0"),
        sa.UniqueConstraint("chunk_id", name="uq_assistant_chunks_chunk_id"),
    )
    op.create_index("ix_assistant_chunks_chunk_id", "assistant_chunks", ["chunk_id"])
    op.create_index("ix_assistant_chunks_document_id", "assistant_chunks", ["document_id"])
    op.create_index("ix_assistant_chunks_parent_chunk_id", "assistant_chunks", ["parent_chunk_id"])
    op.create_table(
        "assistant_sessions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("principal", sa.String(200), nullable=False),
        sa.Column("page", sa.String(200), nullable=False, server_default="/overview"),
        sa.Column("context", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_assistant_sessions_principal", "assistant_sessions", ["principal"])
    op.create_table(
        "assistant_messages",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("session_id", sa.String(36), sa.ForeignKey("assistant_sessions.id"), nullable=False),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("structured", sa.JSON(), nullable=False),
        sa.Column("sources", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_assistant_messages_session_id", "assistant_messages", ["session_id"])
    op.create_table(
        "assistant_feedback",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("message_id", sa.String(36), sa.ForeignKey("assistant_messages.id"), nullable=False),
        sa.Column("rating", sa.Integer(), nullable=False),
        sa.Column("comment", sa.Text(), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_assistant_feedback_message_id", "assistant_feedback", ["message_id"])
    op.create_table(
        "assistant_remediation_plans",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("finding_id", sa.String(36), nullable=True),
        sa.Column("run_id", sa.String(36), nullable=True),
        sa.Column("plan", sa.JSON(), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=False, server_default="0.5"),
        sa.Column("status", sa.String(30), nullable=False, server_default="draft"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_assistant_remediation_plans_finding_id", "assistant_remediation_plans", ["finding_id"])
    op.create_index("ix_assistant_remediation_plans_run_id", "assistant_remediation_plans", ["run_id"])


def downgrade() -> None:
    if "assistant_documents" not in sa.inspect(op.get_bind()).get_table_names():
        return
    op.drop_table("assistant_remediation_plans")
    op.drop_table("assistant_feedback")
    op.drop_table("assistant_messages")
    op.drop_table("assistant_sessions")
    op.drop_table("assistant_chunks")
    op.drop_table("assistant_documents")
