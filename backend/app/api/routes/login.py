from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import HTMLResponse
from fastapi.security import OAuth2PasswordRequestForm

from app import crud
from app.api.deps import CurrentUser, SessionDep, get_current_active_superuser
from app.core.config import settings
from app.core.security import get_password_hash
from app.schemas import (
    Message,
    NewPassword,
    RefreshTokenRequest,
    Token,
    UserPublic,
    VerifyEmail,
)
from app.services import token_service
from app.utils import (
    generate_password_reset_token,
    generate_reset_password_email,
    send_email,
    verify_password_reset_token,
    verify_verification_token,
)

router = APIRouter(tags=["login"])


def _set_refresh_cookie(response: Response, refresh_token: str) -> None:
    """Set HttpOnly, secure (in prod), SameSite refresh token cookie."""
    response.set_cookie(
        key=settings.REFRESH_TOKEN_COOKIE_NAME,
        value=refresh_token,
        httponly=True,
        secure=settings.REFRESH_TOKEN_COOKIE_SECURE or (settings.ENVIRONMENT != "local"),
        samesite=settings.REFRESH_TOKEN_COOKIE_SAMESITE,
        path="/",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
    )


def _clear_refresh_cookie(response: Response) -> None:
    """Clear the refresh token cookie upon logout or invalidation."""
    response.delete_cookie(
        key=settings.REFRESH_TOKEN_COOKIE_NAME,
        path="/",
    )


@router.post("/login/access-token", response_model=Token)
def login_access_token(
    session: SessionDep,
    response: Response,
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
) -> Token:
    """
    OAuth2 compatible token login. Returns a short-lived access token,
    a rotating refresh token, and sets an HttpOnly cookie.
    """
    user = crud.authenticate(
        session=session, email=form_data.username, password=form_data.password
    )
    if not user:
        raise HTTPException(status_code=400, detail="Incorrect email or password")
    elif not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")

    access_token, refresh_token, expires_in = token_service.issue_token_pair(
        session=session, user=user
    )
    _set_refresh_cookie(response=response, refresh_token=refresh_token)

    return Token(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        expires_in=expires_in,
    )


@router.post("/login/refresh-token", response_model=Token)
@router.post("/auth/refresh", response_model=Token)
def refresh_access_token(
    session: SessionDep,
    request: Request,
    response: Response,
    body: RefreshTokenRequest | None = None,
) -> Token:
    """
    Rotate refresh tokens. Issues a new access token + replacement refresh token.

    Security: implements token family reuse detection. If an already-rotated
    or revoked refresh token is presented, the entire token family is invalidated
    immediately (preventing attacker replay attacks).
    """
    raw_token = (
        (body.refresh_token if body and body.refresh_token else None)
        or request.cookies.get(settings.REFRESH_TOKEN_COOKIE_NAME)
    )
    if not raw_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token missing",
        )

    access_token, new_refresh_token, expires_in = token_service.rotate_refresh_token(
        session=session, raw_token=raw_token
    )

    _set_refresh_cookie(response=response, refresh_token=new_refresh_token)

    return Token(
        access_token=access_token,
        refresh_token=new_refresh_token,
        token_type="bearer",
        expires_in=expires_in,
    )


@router.post("/login/logout", response_model=Message)
@router.post("/auth/logout", response_model=Message)
def logout(
    session: SessionDep,
    request: Request,
    response: Response,
    body: RefreshTokenRequest | None = None,
) -> Message:
    """
    Revoke a refresh token and its session family on logout.
    Clears the refresh token cookie.
    """
    raw_token = (
        (body.refresh_token if body and body.refresh_token else None)
        or request.cookies.get(settings.REFRESH_TOKEN_COOKIE_NAME)
    )
    if raw_token:
        token_service.revoke_refresh_token(session=session, raw_token=raw_token)

    _clear_refresh_cookie(response=response)
    return Message(message="Logged out successfully")


@router.post("/auth/logout-all", response_model=Message)
def logout_all(
    session: SessionDep,
    response: Response,
    current_user: CurrentUser,
) -> Message:
    """
    Revoke all active refresh token families for the current user across all devices.
    """
    token_service.revoke_all_user_tokens(session=session, user_id=current_user.id)
    _clear_refresh_cookie(response=response)
    return Message(message="All sessions logged out successfully")


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
