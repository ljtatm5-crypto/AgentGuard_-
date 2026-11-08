"""initial AgentGuard schema

Revision ID: 0001_initial
Revises:
Create Date: 2026-11-08
"""
from alembic import op

from app.db.session import Base
from app.models import entities  # noqa: F401

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    Base.metadata.create_all(bind=op.get_bind(), checkfirst=True)


def downgrade() -> None:
    Base.metadata.drop_all(bind=op.get_bind(), checkfirst=True)
