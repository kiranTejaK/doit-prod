from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.core.config import settings

settings.ENVIRONMENT = "local"
from app.core.db import init_db  # noqa: E402
from app.main import app  # noqa: E402
from tests.utils.user import authentication_token_from_email  # noqa: E402
from tests.utils.utils import get_superuser_token_headers  # noqa: E402

engine = create_engine("sqlite:///./test.db", connect_args={"check_same_thread": False})


@pytest.fixture(autouse=True, scope="session")
def mock_redis_in_tests():
    from unittest.mock import MagicMock, patch
    mock_redis = MagicMock()
    mock_redis.scan_iter.return_value = []
    mock_redis.get.return_value = None
    mock_redis.set.return_value = True
    mock_redis.delete.return_value = 1
    mock_redis.setex.return_value = True

    with patch("app.core.redis_client.redis_client_sync", mock_redis), \
         patch("app.core.redis_client.cache_get", return_value=None), \
         patch("app.core.redis_client.cache_set", return_value=None), \
         patch("app.core.redis_client.clear_cache", return_value=None):
        yield mock_redis



@pytest.fixture(scope="session")
def db_engine():
    from app.models import Base
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        init_db(session)
    yield engine


@pytest.fixture(scope="function")
def db(db_engine) -> Generator[Session, None, None]:
    connection = db_engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection)

    yield session

    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture(scope="function")
def client(db: Session) -> Generator[TestClient, None, None]:
    from app.api.deps import get_db
    app.dependency_overrides[get_db] = lambda: db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture(scope="function")
def superuser_token_headers(client: TestClient) -> dict[str, str]:
    return get_superuser_token_headers(client)


@pytest.fixture(scope="function")
def normal_user_token_headers(client: TestClient, db: Session) -> dict[str, str]:
    return authentication_token_from_email(
        client=client, email=settings.EMAIL_TEST_USER, db=db
    )



@pytest.fixture(scope="session")
def live_server_url(db_engine) -> Generator[str, None, None]:
    """Starts a live Uvicorn background server on a free port to test real TCP socket requests."""
    import socket
    import threading
    import time

    import httpx
    import uvicorn

    from app.api.deps import get_db

    def get_test_db():
        with Session(db_engine) as session:
            yield session

    app.dependency_overrides[get_db] = get_test_db

    # Find an open port
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]

    config = uvicorn.Config(app=app, host="127.0.0.1", port=port, log_level="warning")
    server = uvicorn.Server(config)

    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()

    url = f"http://127.0.0.1:{port}"

    # Poll server health until ready
    start_time = time.time()
    while time.time() - start_time < 10:
        try:
            r = httpx.get(f"{url}{settings.API_V1_STR}/utils/health-check/", follow_redirects=True)
            if r.status_code in (200, 404):
                break
        except httpx.ConnectError:
            time.sleep(0.05)

    yield url

    server.should_exit = True
    thread.join(timeout=5)
    app.dependency_overrides.clear()


@pytest.fixture(scope="module")
def live_client(live_server_url: str) -> "Generator[httpx.Client, None, None]":  # noqa: F821
    """Real HTTP client (httpx) making live network requests over local TCP socket."""
    import httpx
    with httpx.Client(base_url=live_server_url, follow_redirects=True, timeout=30.0) as client:
        yield client


