from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import security
from app.core.config import settings
from app.models import RefreshToken, User
from app.services import token_service


def test_hash_token():
    raw = "test_raw_token_string_12345"
    h1 = security.hash_token(raw)
    h2 = security.hash_token(raw)
    assert h1 == h2
    assert len(h1) == 64  # SHA-256 hex string length
    assert h1 != raw


def test_generate_refresh_token():
    t1 = security.generate_refresh_token()
    t2 = security.generate_refresh_token()
    assert t1 != t2
    assert len(t1) > 40


def test_issue_token_pair(db: Session):
    user = db.scalar(select(User).where(User.email == settings.FIRST_SUPERUSER))
    assert user is not None

    access_token, refresh_token, expires_in = token_service.issue_token_pair(
        session=db, user=user
    )
    assert access_token
    assert refresh_token
    assert expires_in == settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60

    # Ensure token_hash is saved in DB, raw token is NOT saved
    token_hash = security.hash_token(refresh_token)
    db_token = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == token_hash))
    assert db_token is not None
    assert db_token.user_id == user.id
    assert db_token.used_at is None
    assert db_token.revoked_at is None
    assert db_token.token != refresh_token


def test_rotate_refresh_token_lifecycle(db: Session):
    user = db.scalar(select(User).where(User.email == settings.FIRST_SUPERUSER))
    assert user is not None

    # Step 1: Issue initial token
    _access1, rt1, _exp1 = token_service.issue_token_pair(session=db, user=user)
    rt1_hash = security.hash_token(rt1)

    # Step 2: Rotate RT1 -> RT2
    access2, rt2, exp2 = token_service.rotate_refresh_token(session=db, raw_token=rt1)
    assert rt2 != rt1
    assert access2
    assert exp2 > 0

    # Verify RT1 is marked used and linked to RT2
    db_rt1 = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == rt1_hash))
    assert db_rt1 is not None
    assert db_rt1.used_at is not None
    assert db_rt1.replaced_by is not None

    rt2_hash = security.hash_token(rt2)
    db_rt2 = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == rt2_hash))
    assert db_rt2 is not None
    assert db_rt1.replaced_by == db_rt2.id
    assert db_rt2.family_id == db_rt1.family_id
    assert db_rt2.used_at is None

    # Step 3: Rotate RT2 -> RT3
    access3, rt3, _exp3 = token_service.rotate_refresh_token(session=db, raw_token=rt2)
    assert rt3 != rt2
    assert access3


def test_rotate_refresh_token_reuse_detection_revokes_family(db: Session):
    """Replaying an already used refresh token must revoke the whole family."""
    user = db.scalar(select(User).where(User.email == settings.FIRST_SUPERUSER))
    assert user is not None

    # Issue RT1
    _, rt1, _ = token_service.issue_token_pair(session=db, user=user)

    # Legitimate user rotates RT1 -> RT2
    _, rt2, _ = token_service.rotate_refresh_token(session=db, raw_token=rt1)

    # Attacker replays used RT1
    with pytest.raises(HTTPException) as exc_info:
        token_service.rotate_refresh_token(session=db, raw_token=rt1)
    assert exc_info.value.status_code == 401
    assert "already used" in exc_info.value.detail.lower()

    # Now legitimate RT2 must also be revoked (family-wide invalidation)
    with pytest.raises(HTTPException) as exc_info2:
        token_service.rotate_refresh_token(session=db, raw_token=rt2)
    assert exc_info2.value.status_code == 401


def test_rotate_expired_refresh_token(db: Session):
    user = db.scalar(select(User).where(User.email == settings.FIRST_SUPERUSER))
    assert user is not None

    _, rt, _ = token_service.issue_token_pair(session=db, user=user)
    rt_hash = security.hash_token(rt)
    db_token = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == rt_hash))
    assert db_token is not None

    # Manually backdate expiration
    db_token.expires_at = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=1)
    db.add(db_token)
    db.flush()

    with pytest.raises(HTTPException) as exc_info:
        token_service.rotate_refresh_token(session=db, raw_token=rt)
    assert exc_info.value.status_code == 401
    assert "expired" in exc_info.value.detail.lower()


def test_revoke_refresh_token(db: Session):
    user = db.scalar(select(User).where(User.email == settings.FIRST_SUPERUSER))
    assert user is not None

    _, rt, _ = token_service.issue_token_pair(session=db, user=user)
    assert token_service.revoke_refresh_token(session=db, raw_token=rt) is True

    # Subsequent rotation must fail
    with pytest.raises(HTTPException) as exc_info:
        token_service.rotate_refresh_token(session=db, raw_token=rt)
    assert exc_info.value.status_code == 401


def test_revoke_all_user_tokens(db: Session):
    user = db.scalar(select(User).where(User.email == settings.FIRST_SUPERUSER))
    assert user is not None

    # Issue 2 tokens from 2 different sessions/families
    _, rt_session1, _ = token_service.issue_token_pair(session=db, user=user)
    _, rt_session2, _ = token_service.issue_token_pair(session=db, user=user)

    count = token_service.revoke_all_user_tokens(session=db, user_id=user.id)
    assert count >= 2

    # Both sessions should be revoked
    with pytest.raises(HTTPException):
        token_service.rotate_refresh_token(session=db, raw_token=rt_session1)

    with pytest.raises(HTTPException):
        token_service.rotate_refresh_token(session=db, raw_token=rt_session2)
