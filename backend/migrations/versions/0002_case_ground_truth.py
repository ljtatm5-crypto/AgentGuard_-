"""add reviewed case ground truth

Revision ID: 0002_case_ground_truth
Revises: 0001_initial
Create Date: 2026-11-09
"""
from alembic import op
import sqlalchemy as sa

revision = "0002_case_ground_truth"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("test_cases")}
    if "ground_truth" not in columns:
        op.add_column(
            "test_cases",
            sa.Column("ground_truth", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        )


def downgrade() -> None:
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("test_cases")}
    if "ground_truth" in columns:
        op.drop_column("test_cases", "ground_truth")
