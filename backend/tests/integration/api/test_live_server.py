import httpx

from app.core.config import settings


def test_live_server_login_and_me(
    live_client: httpx.Client, superuser_token_headers: dict[str, str]
) -> None:
    """
    Tests live HTTP network requests over a real TCP socket against a background Uvicorn server.
    Bypasses FastAPI TestClient completely.
    """
    # 1. Test health check endpoint over live socket
    response = live_client.get(f"{settings.API_V1_STR}/utils/health-check")
    assert response.status_code == 200
    assert response.json() is True

    # 2. Test authenticated endpoint over live socket
    response = live_client.get(
        f"{settings.API_V1_STR}/users/me",
        headers=superuser_token_headers
    )
    assert response.status_code == 200
    user_data = response.json()
    assert user_data["email"] == settings.FIRST_SUPERUSER
    assert user_data["is_superuser"] is True
