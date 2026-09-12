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

    assert "expires_in" in original_tokens
    assert original_tokens["expires_in"] == settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60

    refresh_r = client.post(
        f"{settings.API_V1_STR}/login/refresh-token",
        json={"refresh_token": original_tokens["refresh_token"]},
    )
    new_tokens = refresh_r.json()

    assert refresh_r.status_code == 200
    assert "access_token" in new_tokens
    assert "refresh_token" in new_tokens
    assert "expires_in" in new_tokens
    # New tokens must be different from the originals
    assert new_tokens["access_token"] != original_tokens["access_token"]
    assert new_tokens["refresh_token"] != original_tokens["refresh_token"]

    # The old refresh token must be marked as used in the DB
    from app.core.security import hash_token
    old_hash = hash_token(original_tokens["refresh_token"])
    old_db_token = db.scalar(
        select(RefreshToken).where(RefreshToken.token_hash == old_hash)
    )
    assert old_db_token is not None
    assert old_db_token.used_at is not None
    assert old_db_token.replaced_by is not None

    # Verify the new token works for subsequent rotation
    subsequent_r = client.post(
        f"{settings.API_V1_STR}/auth/refresh",
        json={"refresh_token": new_tokens["refresh_token"]},
    )
    assert subsequent_r.status_code == 200
    assert subsequent_r.json()["access_token"]


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

    # Legitimate rotation — original token is now marked used
    rotate_r = client.post(
        f"{settings.API_V1_STR}/login/refresh-token",
        json={"refresh_token": original_refresh},
    )
    assert rotate_r.status_code == 200
    legitimate_new_token = rotate_r.json()["refresh_token"]

    # Attacker replays the original (already-used) refresh token
    reuse_r = client.post(
        f"{settings.API_V1_STR}/login/refresh-token",
        json={"refresh_token": original_refresh},
    )
    assert reuse_r.status_code == 401
    assert "already used" in reuse_r.json()["detail"].lower()

    # The entire family must now be revoked: subsequent use of legitimate_new_token must also fail
    subsequent_r = client.post(
        f"{settings.API_V1_STR}/login/refresh-token",
        json={"refresh_token": legitimate_new_token},
    )
    assert subsequent_r.status_code == 401


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

    from app.core.security import hash_token
    token_hash = hash_token(refresh_token_str)
    db_token = db.scalar(
        select(RefreshToken).where(RefreshToken.token_hash == token_hash)
    )
    assert db_token is not None
    assert db_token.is_revoked is True
    assert db_token.revoked_at is not None

    # A subsequent refresh attempt with the logged-out token should fail
    retry_r = client.post(
        f"{settings.API_V1_STR}/login/refresh-token",
        json={"refresh_token": refresh_token_str},
    )
    assert retry_r.status_code == 401


def test_cookie_based_refresh_rotation(client: TestClient) -> None:
    """Refresh token can be passed via HttpOnly cookie."""
    login_data = {
        "username": settings.FIRST_SUPERUSER,
        "password": settings.FIRST_SUPERUSER_PASSWORD,
    }
    login_r = client.post(f"{settings.API_V1_STR}/login/access-token", data=login_data)
    assert login_r.status_code == 200
    assert settings.REFRESH_TOKEN_COOKIE_NAME in login_r.cookies

    # Call refresh without body payload — cookie is sent automatically by TestClient
    refresh_r = client.post(f"{settings.API_V1_STR}/login/refresh-token")
    assert refresh_r.status_code == 200
    assert "access_token" in refresh_r.json()
    assert settings.REFRESH_TOKEN_COOKIE_NAME in refresh_r.cookies


def test_logout_all_sessions(client: TestClient, superuser_token_headers: dict[str, str]) -> None:
    """Logout-all revokes all refresh token sessions for the authenticated user."""
    # Authenticate and obtain two sessions
    login_data = {
        "username": settings.FIRST_SUPERUSER,
        "password": settings.FIRST_SUPERUSER_PASSWORD,
    }
    s1 = client.post(f"{settings.API_V1_STR}/login/access-token", data=login_data).json()
    s2 = client.post(f"{settings.API_V1_STR}/login/access-token", data=login_data).json()

    # Call logout-all
    r = client.post(f"{settings.API_V1_STR}/auth/logout-all", headers=superuser_token_headers)
    assert r.status_code == 200

    # Both sessions should be revoked
    r1 = client.post(f"{settings.API_V1_STR}/login/refresh-token", json={"refresh_token": s1["refresh_token"]})
    assert r1.status_code == 401

    r2 = client.post(f"{settings.API_V1_STR}/login/refresh-token", json={"refresh_token": s2["refresh_token"]})
    assert r2.status_code == 401


def test_inactive_user_cannot_refresh(client: TestClient, db: Session) -> None:
    """An inactive user must be rejected when attempting to refresh."""
    email = random_email()
    password = random_lower_string()
    user_in = UserCreate(email=email, password=password)
    user = create_user(session=db, user_create=user_in)

    login_r = client.post(
        f"{settings.API_V1_STR}/login/access-token",
        data={"username": email, "password": password},
    )
    tokens = login_r.json()

    # Deactivate the user
    user.is_active = False
    db.add(user)
    db.commit()

    refresh_r = client.post(
        f"{settings.API_V1_STR}/login/refresh-token",
        json={"refresh_token": tokens["refresh_token"]},
    )
    assert refresh_r.status_code == 401


def test_concurrent_refresh_requests(client: TestClient) -> None:
    """
    Simultaneous refresh requests for the same token should allow only one
    successful rotation.
    """
    import concurrent.futures

    login_data = {
        "username": settings.FIRST_SUPERUSER,
        "password": settings.FIRST_SUPERUSER_PASSWORD,
    }
    login_r = client.post(f"{settings.API_V1_STR}/login/access-token", data=login_data)
    token = login_r.json()["refresh_token"]

    def attempt_refresh():
        try:
            return client.post(
                f"{settings.API_V1_STR}/login/refresh-token",
                json={"refresh_token": token},
            )
        except Exception:
            class MockResponse:
                status_code = 401
            return MockResponse()

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        futures = [executor.submit(attempt_refresh) for _ in range(4)]
        results = [f.result() for f in futures]

    status_codes = [r.status_code for r in results]
    # At most one request can succeed (200), remaining must be 401
    assert status_codes.count(200) == 1
    assert status_codes.count(401) == 3


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
