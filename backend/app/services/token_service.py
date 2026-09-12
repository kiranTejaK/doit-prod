import uuid
from datetime import datetime, timedelta, timezone

import structlog
from fastapi import HTTPException, status
from sqlalchemy import or_, select, update
from sqlalchemy.orm import Session

from app.core import security
from app.core.config import settings
from app.models import RefreshToken, User

logger = structlog.get_logger(__name__)


def _utc_now_naive() -> datetime:
    """Return timezone-naive UTC datetime for SQLite / PostgreSQL compatibility."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def issue_token_pair(
    session: Session,
    user: User,
    family_id: str | None = None,
) -> tuple[str, str, int]:
    """
    Issue a new short-lived access token and a long-lived rotating refresh token.
    If family_id is provided, the refresh token belongs to that existing family.
    Otherwise, a new family is created (fresh login).

    Returns:
        (access_token, raw_refresh_token, expires_in_seconds)
    """
    if family_id is None:
        family_id = str(uuid.uuid4())

    now = _utc_now_naive()
    expires_in_seconds = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60

    # 1. Generate short-lived stateless JWT access token
    access_token = security.create_access_token(
        subject=str(user.id),
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )

    # 2. Generate cryptographically random opaque refresh token
    raw_refresh_token = security.generate_refresh_token()
    token_hash = security.hash_token(raw_refresh_token)

    refresh_expires_at = (
        datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    ).replace(tzinfo=None)

    # 3. Persist only the token hash in the database
    db_refresh = RefreshToken(
        user_id=user.id,
        token_hash=token_hash,
        family_id=family_id,
        issued_at=now,
        expires_at=refresh_expires_at,
        created_at=now,
    )
    session.add(db_refresh)
    session.flush()

    logger.info("token_pair_issued", user_id=str(user.id), family_id=family_id)
    return access_token, raw_refresh_token, expires_in_seconds


def rotate_refresh_token(
    session: Session,
    raw_token: str,
) -> tuple[str, str, int]:
    """
    Atomically validate and rotate a refresh token.
    Enforces:
    - Opaque token verification via SHA-256 hash lookup.
    - Concurrency row-level locking.
    - Single-use validation.
    - Token family reuse / replay detection (invalidates whole family on reuse).
    - Expiration check.
    - User active status check.

    Returns:
        (new_access_token, new_raw_refresh_token, expires_in_seconds)
    """
    lookup_hash = security.hash_token(raw_token)

    # 1. Acquire row with row-level lock (with_for_update) to prevent race conditions
    query = (
        select(RefreshToken)
        .where(
            or_(
                RefreshToken.token_hash == lookup_hash,
                RefreshToken.token == raw_token,
            )
        )
        .with_for_update()
    )
    db_token = session.scalar(query)

    if db_token is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )

    now = _utc_now_naive()

    # 2. Reuse / Replay Detection:
    # If the token has already been rotated (used_at is set) or revoked,
    # someone is replaying an old credential (potential token theft).
    if db_token.used_at is not None or db_token.revoked_at is not None or db_token.is_revoked:
        logger.warning(
            "security_alert_refresh_token_reuse_detected",
            family_id=db_token.family_id,
            user_id=str(db_token.user_id),
            used_at=str(db_token.used_at),
            revoked_at=str(db_token.revoked_at),
        )
        # Immediately invalidate all tokens in this family
        revoke_family(session=session, family_id=db_token.family_id)
        session.flush()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token already used. Possible token theft detected; all sessions in this family have been revoked.",
        )

    # 3. Check expiration
    if db_token.expires_at < now:
        db_token.revoked_at = now
        db_token.is_revoked = True
        db_token.updated_at = now
        session.add(db_token)
        session.flush()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token has expired",
        )

    # 4. Check user state
    user = session.get(User, db_token.user_id)
    if not user or not user.is_active:
        db_token.revoked_at = now
        db_token.is_revoked = True
        session.add(db_token)
        session.flush()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )

    # 5. Mark the existing token as USED (rotation)
    db_token.used_at = now
    db_token.updated_at = now

    # 6. Issue replacement credentials in the same token family
    expires_in_seconds = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    new_access_token = security.create_access_token(
        subject=str(user.id),
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    new_raw_refresh = security.generate_refresh_token()
    new_hash = security.hash_token(new_raw_refresh)
    new_expires_at = (
        datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    ).replace(tzinfo=None)

    new_db_token = RefreshToken(
        user_id=user.id,
        token_hash=new_hash,
        family_id=db_token.family_id,
        issued_at=now,
        expires_at=new_expires_at,
        created_at=now,
    )
    session.add(new_db_token)
    session.flush()

    # Link the old token to its replacement
    db_token.replaced_by = new_db_token.id
    session.add(db_token)
    session.flush()

    logger.info(
        "refresh_token_rotated",
        user_id=str(user.id),
        family_id=db_token.family_id,
    )
    return new_access_token, new_raw_refresh, expires_in_seconds


def revoke_refresh_token(
    session: Session,
    raw_token: str,
) -> bool:
    """
    Revoke a refresh token and its session family on logout.
    """
    lookup_hash = security.hash_token(raw_token)
    db_token = session.scalar(
        select(RefreshToken).where(
            or_(
                RefreshToken.token_hash == lookup_hash,
                RefreshToken.token == raw_token,
            )
        )
    )
    if not db_token:
        return False

    revoke_family(session=session, family_id=db_token.family_id)
    return True


def revoke_family(
    session: Session,
    family_id: str,
) -> int:
    """
    Revoke all active tokens belonging to a family.
    """
    now = _utc_now_naive()
    result = session.execute(
        update(RefreshToken)
        .where(
            RefreshToken.family_id == family_id,
            RefreshToken.revoked_at.is_(None),
        )
        .values(
            revoked_at=now,
            is_revoked=True,
            updated_at=now,
        )
    )
    session.flush()
    return int(result.rowcount)


def revoke_all_user_tokens(
    session: Session,
    user_id: uuid.UUID,
) -> int:
    """
    Revoke all refresh tokens for a user across all families/devices.
    """
    now = _utc_now_naive()
    result = session.execute(
        update(RefreshToken)
        .where(
            RefreshToken.user_id == user_id,
            RefreshToken.revoked_at.is_(None),
        )
        .values(
            revoked_at=now,
            is_revoked=True,
            updated_at=now,
        )
    )
    session.flush()
    logger.info("all_user_tokens_revoked", user_id=str(user_id), count=result.rowcount)
    return int(result.rowcount)
