"""add_refresh_token_model

Revision ID: a1b2c3d4e5f6
Revises: 1a31ce608336
Create Date: 2026-08-17 16:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "1a31ce608336"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "refreshtoken",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("token", sa.String(), nullable=False),
        sa.Column("family_id", sa.String(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("is_revoked", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_refreshtoken_token"), "refreshtoken", ["token"], unique=True)
    op.create_index(op.f("ix_refreshtoken_family_id"), "refreshtoken", ["family_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_refreshtoken_family_id"), table_name="refreshtoken")
    op.drop_index(op.f("ix_refreshtoken_token"), table_name="refreshtoken")
    op.drop_table("refreshtoken")
