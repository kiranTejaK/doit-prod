import uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated, Any

import jwt
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.security import OAuth2PasswordRequestForm
from jwt.exceptions import InvalidTokenError
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import crud
from app.api.deps import CurrentUser, SessionDep, get_current_active_superuser
from app.core import security
from app.core.config import settings
from app.core.security import get_password_hash
from app.models import RefreshToken, User
from app.schemas import (
    Message,
    NewPassword,
    RefreshTokenRequest,
    Token,
    TokenPayload,
    UserPublic,
    VerifyEmail,
)
from app.utils import (
    generate_password_reset_token,
    generate_reset_password_email,
    send_email,
    verify_password_reset_token,
    verify_verification_token,
)

router = APIRouter(tags=["login"])


def _issue_token_pair(session: Session, user: User, family_id: str | None = None) -> Token:
    """
    Issue a new short-lived access token and a rotating refresh token.
    If family_id is provided, the refresh token belongs to that existing family.
    Otherwise a new family is created (fresh login).
    """
    if family_id is None:
        family_id = str(uuid.uuid4())

    access_token = security.create_access_token(
        subject=str(user.id),
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    refresh_expires = timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    refresh_token_str = security.create_refresh_token(
        subject=str(user.id),
        expires_delta=refresh_expires,
        family_id=family_id,
    )

    db_refresh = RefreshToken(
        token=refresh_token_str,
        family_id=family_id,
        # Store timezone-naive UTC datetime — SQLite requires naive datetimes;
        # PostgreSQL (production) accepts both. The value is always UTC.
        expires_at=(datetime.now(timezone.utc) + refresh_expires).replace(tzinfo=None),
        user_id=user.id,
    )
    session.add(db_refresh)
    # flush() writes the row to the current transaction without committing.
    # The caller's request lifecycle (or the test's transaction fixture) handles the commit.
    session.flush()

    return Token(access_token=access_token, refresh_token=refresh_token_str)


@router.post("/login/access-token")
def login_access_token(
    session: SessionDep, form_data: Annotated[OAuth2PasswordRequestForm, Depends()]
) -> Token:
    """
    OAuth2 compatible token login. Returns a short-lived access token and a
    rotating refresh token.
    """
    user = crud.authenticate(
        session=session, email=form_data.username, password=form_data.password
    )
    if not user:
        raise HTTPException(status_code=400, detail="Incorrect email or password")
    elif not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")

    return _issue_token_pair(session=session, user=user)


@router.post("/login/refresh-token")
def refresh_access_token(session: SessionDep, body: RefreshTokenRequest) -> Token:
    """
    Rotate refresh tokens. Issues a new access token + refresh token pair.

    Security: implements token family reuse detection. If an already-revoked
    refresh token is presented, the entire token family is invalidated immediately
    (this signals the original token was stolen and replayed).
    """
    # 1. Decode the JWT to extract claims
    try:
        payload = jwt.decode(
            body.refresh_token, settings.SECRET_KEY, algorithms=[security.ALGORITHM]
        )
        token_data = TokenPayload(**payload)
    except (InvalidTokenError, ValidationError):
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    if token_data.type != "refresh":
        raise HTTPException(status_code=401, detail="Invalid token type")

    # 2. Look up the token record in the database
    db_token = session.scalar(
        select(RefreshToken).where(RefreshToken.token == body.refresh_token)
    )

    if db_token is None:
        # Token not found — may have been cleaned up already
        raise HTTPException(status_code=401, detail="Refresh token not found")

    # 3. Reuse detection: if this token is already revoked, revoke the whole family
    if db_token.is_revoked:
        # Revoke all tokens in the same family — signals a stolen token was replayed
        family_tokens = session.scalars(
            select(RefreshToken).where(
                RefreshToken.family_id == db_token.family_id,
                RefreshToken.is_revoked.is_(False),
            )
        ).all()
        for t in family_tokens:
            t.is_revoked = True
        session.flush()
        raise HTTPException(
            status_code=401,
            detail="Refresh token already used. Possible token theft — all sessions in this family have been revoked.",
        )

    # 4. Check token expiry
    if db_token.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        db_token.is_revoked = True
        session.flush()
        raise HTTPException(status_code=401, detail="Refresh token has expired")

    # 5. Load and validate the user
    try:
        user_id = uuid.UUID(token_data.sub)
    except (ValueError, TypeError):
        raise HTTPException(status_code=401, detail="Invalid token subject")

    user = session.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")

    # 6. Revoke the current refresh token (single-use)
    db_token.is_revoked = True
    session.add(db_token)
    session.flush()

    # 7. Issue a new token pair in the same family (rotation)
    return _issue_token_pair(session=session, user=user, family_id=db_token.family_id)


@router.post("/login/logout")
def logout(session: SessionDep, body: RefreshTokenRequest) -> Message:
    """
    Revoke a refresh token on logout. The access token is short-lived and will
    expire naturally; server-side revocation of the refresh token is sufficient.
    """
    db_token = session.scalar(
        select(RefreshToken).where(RefreshToken.token == body.refresh_token)
    )
    if db_token and not db_token.is_revoked:
        db_token.is_revoked = True
        session.flush()
    return Message(message="Logged out successfully")


@router.post("/login/test-token", response_model=UserPublic)
def test_token(current_user: CurrentUser) -> Any:
    """
    Test access token
    """
    return current_user


@router.post("/login/verify-email")
def verify_email(session: SessionDep, body: VerifyEmail) -> Message:
    """
    Verify email address
    """
    email = verify_verification_token(token=body.token)
    if not email:
        raise HTTPException(status_code=400, detail="Invalid token")
    user = crud.get_user_by_email(session=session, email=email)
    if not user:
        raise HTTPException(
            status_code=404,
            detail="The user with this email does not exist in the system.",
        )
    if user.is_active:
        return Message(message="Email already verified")

    user.is_active = True
    session.add(user)
    session.commit()
    return Message(message="Email verified successfully")


@router.post("/password-recovery/{email}")
def recover_password(email: str, session: SessionDep) -> Message:
    """
    Password Recovery
    """
    user = crud.get_user_by_email(session=session, email=email)

    if not user:
        raise HTTPException(
            status_code=404,
            detail="The user with this email does not exist in the system.",
        )
    password_reset_token = generate_password_reset_token(email=email)
    email_data = generate_reset_password_email(
        email_to=user.email, email=email, token=password_reset_token
    )
    send_email(
        email_to=user.email,
        subject=email_data.subject,
        html_content=email_data.html_content,
    )
    return Message(message="Password recovery email sent")


@router.post("/reset-password/")
def reset_password(session: SessionDep, body: NewPassword) -> Message:
    """
    Reset password
    """
    email = verify_password_reset_token(token=body.token)
    if not email:
        raise HTTPException(status_code=400, detail="Invalid token")
    user = crud.get_user_by_email(session=session, email=email)
    if not user:
        raise HTTPException(
            status_code=404,
            detail="The user with this email does not exist in the system.",
        )
    elif not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    hashed_password = get_password_hash(password=body.new_password)
    user.hashed_password = hashed_password
    session.add(user)
    session.commit()
    return Message(message="Password updated successfully")


@router.post(
    "/password-recovery-html-content/{email}",
    dependencies=[Depends(get_current_active_superuser)],
    response_class=HTMLResponse,
)
def recover_password_html_content(email: str, session: SessionDep) -> Any:
    """
    HTML Content for Password Recovery
    """
    user = crud.get_user_by_email(session=session, email=email)

    if not user:
        raise HTTPException(
            status_code=404,
            detail="The user with this username does not exist in the system.",
        )
    password_reset_token = generate_password_reset_token(email=email)
    email_data = generate_reset_password_email(
        email_to=user.email, email=email, token=password_reset_token
    )

    return HTMLResponse(
        content=email_data.html_content, headers={"subject:": email_data.subject}
    )
