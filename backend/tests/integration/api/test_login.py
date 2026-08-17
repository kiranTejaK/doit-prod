from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import verify_password
from app.crud import create_user
from app.models import RefreshToken
from app.schemas import UserCreate
from app.utils import generate_password_reset_token
from tests.utils.user import user_authentication_headers
from tests.utils.utils import random_email, random_lower_string


def test_get_access_token(client: TestClient) -> None:
    login_data = {
        "username": settings.FIRST_SUPERUSER,
        "password": settings.FIRST_SUPERUSER_PASSWORD,
    }
    r = client.post(f"{settings.API_V1_STR}/login/access-token", data=login_data)
    tokens = r.json()
    assert r.status_code == 200
    assert "access_token" in tokens
    assert tokens["access_token"]


def test_login_returns_refresh_token(client: TestClient) -> None:
    """Login should return both an access_token and a refresh_token."""
    login_data = {
        "username": settings.FIRST_SUPERUSER,
        "password": settings.FIRST_SUPERUSER_PASSWORD,
    }
    r = client.post(f"{settings.API_V1_STR}/login/access-token", data=login_data)
    tokens = r.json()
    assert r.status_code == 200
    assert "access_token" in tokens
    assert "refresh_token" in tokens
    assert tokens["refresh_token"]


def test_refresh_token_rotates_tokens(client: TestClient, db: Session) -> None:
    """A valid refresh token should return a new access token and a new refresh token."""
    login_data = {
        "username": settings.FIRST_SUPERUSER,
        "password": settings.FIRST_SUPERUSER_PASSWORD,
    }
    login_r = client.post(f"{settings.API_V1_STR}/login/access-token", data=login_data)
    original_tokens = login_r.json()

    refresh_r = client.post(
        f"{settings.API_V1_STR}/login/refresh-token",
        json={"refresh_token": original_tokens["refresh_token"]},
    )
    new_tokens = refresh_r.json()

    assert refresh_r.status_code == 200
    assert "access_token" in new_tokens
    assert "refresh_token" in new_tokens
    # New tokens must be different from the originals
    assert new_tokens["access_token"] != original_tokens["access_token"]
    assert new_tokens["refresh_token"] != original_tokens["refresh_token"]

    # The old refresh token must be marked as revoked in the DB
    old_db_token = db.scalar(
        select(RefreshToken).where(
            RefreshToken.token == original_tokens["refresh_token"]
        )
    )
    assert old_db_token is not None
    assert old_db_token.is_revoked is True


def test_refresh_token_reuse_revokes_family(client: TestClient) -> None:
    """
    Reusing an already-rotated refresh token (theft simulation) should revoke
    all tokens in that family and return 401.
    """
    login_data = {
        "username": settings.FIRST_SUPERUSER,
        "password": settings.FIRST_SUPERUSER_PASSWORD,
    }
    login_r = client.post(f"{settings.API_V1_STR}/login/access-token", data=login_data)
    original_tokens = login_r.json()
    original_refresh = original_tokens["refresh_token"]

    # Legitimate rotation — original token is now revoked
    client.post(
        f"{settings.API_V1_STR}/login/refresh-token",
        json={"refresh_token": original_refresh},
    )

    # Attacker replays the original (now-revoked) refresh token
    reuse_r = client.post(
        f"{settings.API_V1_STR}/login/refresh-token",
        json={"refresh_token": original_refresh},
    )
    assert reuse_r.status_code == 401
    assert "revoked" in reuse_r.json()["detail"].lower()


def test_refresh_token_invalid_token_returns_401(client: TestClient) -> None:
    """A garbage refresh token string should return 401."""
    r = client.post(
        f"{settings.API_V1_STR}/login/refresh-token",
        json={"refresh_token": "not.a.valid.token"},
    )
    assert r.status_code == 401


def test_logout_revokes_refresh_token(client: TestClient, db: Session) -> None:
    """Logout should mark the refresh token as revoked in the database."""
    login_data = {
        "username": settings.FIRST_SUPERUSER,
        "password": settings.FIRST_SUPERUSER_PASSWORD,
    }
    login_r = client.post(f"{settings.API_V1_STR}/login/access-token", data=login_data)
    tokens = login_r.json()
    refresh_token_str = tokens["refresh_token"]

    logout_r = client.post(
        f"{settings.API_V1_STR}/login/logout",
        json={"refresh_token": refresh_token_str},
    )
    assert logout_r.status_code == 200

    db_token = db.scalar(
        select(RefreshToken).where(RefreshToken.token == refresh_token_str)
    )
    assert db_token is not None
    assert db_token.is_revoked is True

    # A subsequent refresh attempt with the logged-out token should fail
    retry_r = client.post(
        f"{settings.API_V1_STR}/login/refresh-token",
        json={"refresh_token": refresh_token_str},
    )
    assert retry_r.status_code == 401


def test_get_access_token_incorrect_password(client: TestClient) -> None:
    login_data = {
        "username": settings.FIRST_SUPERUSER,
        "password": "incorrect",
    }
    r = client.post(f"{settings.API_V1_STR}/login/access-token", data=login_data)
    assert r.status_code == 400


def test_use_access_token(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    r = client.post(
        f"{settings.API_V1_STR}/login/test-token",
        headers=superuser_token_headers,
    )
    result = r.json()
    assert r.status_code == 200
    assert "email" in result


def test_recovery_password(
    client: TestClient, normal_user_token_headers: dict[str, str]
) -> None:
    with (
        patch("app.core.config.settings.SMTP_HOST", "smtp.example.com"),
        patch("app.core.config.settings.SMTP_USER", "admin@example.com"),
    ):
        email = "test@example.com"
        r = client.post(
            f"{settings.API_V1_STR}/password-recovery/{email}",
            headers=normal_user_token_headers,
        )
        assert r.status_code == 200
        assert r.json() == {"message": "Password recovery email sent"}


def test_recovery_password_user_not_exits(
    client: TestClient, normal_user_token_headers: dict[str, str]
) -> None:
    email = "jVgQr@example.com"
    r = client.post(
        f"{settings.API_V1_STR}/password-recovery/{email}",
        headers=normal_user_token_headers,
    )
    assert r.status_code == 404


def test_reset_password(client: TestClient, db: Session) -> None:
    email = random_email()
    password = random_lower_string()
    new_password = random_lower_string()

    user_create = UserCreate(
        email=email,
        full_name="Test User",
        password=password,
        is_active=True,
        is_superuser=False,
    )
    user = create_user(session=db, user_create=user_create)
    token = generate_password_reset_token(email=email)
    headers = user_authentication_headers(client=client, email=email, password=password)
    data = {"new_password": new_password, "token": token}

    r = client.post(
        f"{settings.API_V1_STR}/reset-password/",
        headers=headers,
        json=data,
    )

    assert r.status_code == 200
    assert r.json() == {"message": "Password updated successfully"}

    db.refresh(user)
    assert verify_password(new_password, user.hashed_password)


def test_reset_password_invalid_token(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    data = {"new_password": "changethis", "token": "invalid"}
    r = client.post(
        f"{settings.API_V1_STR}/reset-password/",
        headers=superuser_token_headers,
        json=data,
    )
    response = r.json()

    assert "detail" in response
    assert r.status_code == 400
    assert response["detail"] == "Invalid token"
