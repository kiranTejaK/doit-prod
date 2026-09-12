"""secure_refresh_token_rotation

Revision ID: e4c5b6a7d8e9
Revises: a1b2c3d4e5f6
Create Date: 2026-09-12 16:15:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e4c5b6a7d8e9"
down_revision: Union[str, None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add new columns for rotation, token hashing, and audit tracking
    op.add_column(
        "refreshtoken",
        sa.Column("token_hash", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "refreshtoken",
        sa.Column("issued_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.add_column(
        "refreshtoken",
        sa.Column("used_at", sa.DateTime(), nullable=True),
    )
    op.add_column(
        "refreshtoken",
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
    )
    op.add_column(
        "refreshtoken",
        sa.Column("replaced_by", sa.Uuid(), nullable=True),
    )
    op.add_column(
        "refreshtoken",
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )

    # 2. Add foreign key for token replacement pointer
    op.create_foreign_key(
        "fk_refreshtoken_replaced_by",
        "refreshtoken",
        "refreshtoken",
        ["replaced_by"],
        ["id"],
        ondelete="SET NULL",
    )

    # 3. Add lookup indexes
    op.create_index(
        op.f("ix_refreshtoken_token_hash"), "refreshtoken", ["token_hash"], unique=True
    )
    op.create_index(
        op.f("ix_refreshtoken_expires_at"), "refreshtoken", ["expires_at"], unique=False
    )
    op.create_index(
        op.f("ix_refreshtoken_user_id"), "refreshtoken", ["user_id"], unique=False
    )

    # 4. Make legacy plaintext token column nullable
    op.alter_column(
        "refreshtoken", "token", existing_type=sa.String(), nullable=True
    )


def downgrade() -> None:
    op.alter_column(
        "refreshtoken", "token", existing_type=sa.String(), nullable=False
    )
    op.drop_index(op.f("ix_refreshtoken_user_id"), table_name="refreshtoken")
    op.drop_index(op.f("ix_refreshtoken_expires_at"), table_name="refreshtoken")
    op.drop_index(op.f("ix_refreshtoken_token_hash"), table_name="refreshtoken")
    op.drop_constraint("fk_refreshtoken_replaced_by", "refreshtoken", type_="foreignkey")
    op.drop_column("refreshtoken", "updated_at")
    op.drop_column("refreshtoken", "replaced_by")
    op.drop_column("refreshtoken", "revoked_at")
    op.drop_column("refreshtoken", "used_at")
    op.drop_column("refreshtoken", "issued_at")
    op.drop_column("refreshtoken", "token_hash")
