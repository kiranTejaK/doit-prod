# Comprehensive Guide to the `doit-prod` Testing Suite

This guide provides an in-depth breakdown of every component, file, fixture, utility, and test pattern present in the backend testing suite of `doit-prod`.

---

## 1. High-Level Architecture & Tech Stack

The backend testing suite is located in [`backend/tests/`](file:///c:/Users/kiran/Desktop/doit-prod/backend/tests) and is powered by:

* **[pytest](https://docs.pytest.org/)**: The core test runner and framework.
* **[FastAPI TestClient](https://fastapi.tiangolo.com/tutorial/testing/)** (via `httpx`/`starlette`): Simulates HTTP REST requests against the application without starting an external web server.
* **SQLAlchemy & SQLModel**: Database ORM used by both the application and the test fixtures.
* **SQLite (`sqlite:///./test.db`)**: In-memory/file-based database engine used during test execution.
* **`coverage.py`**: Measures code execution coverage during test runs.

### Test Status Summary
- **Total Test Cases**: **85 Passed / 0 Failed** (100% Pass Rate).
- **Execution Speed**: High-performance (~40s complete run time with Redis socket mocking).

---

## 2. Directory & File Structure

```text
backend/tests/
├── conftest.py                      # Global pytest configuration, fixtures & Redis mocking
├── unit/                            # Pure unit tests (isolated logic & mocked dependencies)
│   ├── app/                         # App core utility tests
│   │   ├── test_email.py            # Email template rendering & SMTP mocking
│   │   ├── test_models.py           # Model instantiations & field checks
│   │   ├── test_security.py         # Password hashing & verification
│   │   └── test_utils.py            # Token generation & validation
│   └── crud/                        # Isolated CRUD operation tests
│       └── test_user.py             # User CRUD unit tests with MagicMock
├── integration/                     # Integration tests (FastAPI endpoints + DB)
│   ├── api/                         # API Endpoint integration tests
│   │   ├── test_items.py            # Items API CRUD & permission checks
│   │   ├── test_login.py            # Auth, login, password recovery API
│   │   ├── test_private.py          # Debug/private route access checks
│   │   ├── test_projects.py         # Project management API endpoints
│   │   ├── test_tasks.py            # Task lifecycle API endpoints
│   │   └── test_users.py            # User management & superuser API endpoints
│   └── crud/                        # Real DB CRUD integration tests
│       └── test_user.py             # User CRUD operations with real DB session
├── scripts/                         # Infrastructure & startup script tests
│   ├── test_backend_pre_start.py    # DB connection check verification
│   └── test_test_pre_start.py       # Test setup pre-start check verification
└── utils/                           # Test data generators & helper utilities
    ├── item.py                      # Random item generator helpers
    ├── user.py                      # Test user & auth token helper functions
    └── utils.py                     # Random string & header helpers
```

---

## 3. Global Fixtures & Setup ([`backend/tests/conftest.py`](file:///c:/Users/kiran/Desktop/doit-prod/backend/tests/conftest.py))

`conftest.py` is the root configuration file automatically discovered by `pytest`. It defines shared fixtures used across all unit and integration tests.

```python
# conftest.py key highlights

# 1. Force ENVIRONMENT to "local" before importing app modules
settings.ENVIRONMENT = "local"

# 2. Redis Mocking Fixture (Prevents network timeouts in tests)
@pytest.fixture(autouse=True, scope="session")
def mock_redis_in_tests():
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

# 3. Session-Scoped Database Fixture
@pytest.fixture(scope="session")
def db() -> Generator[Session, None, None]:
    from app.models import Base
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        init_db(session) # Seeds initial superuser & test data
        yield session
        # Teardown: deletes items & users after session
        statement = delete(Item)
        session.execute(statement)
        statement = delete(User)
        session.execute(statement)
        session.commit()

# 4. Module-Scoped FastAPI TestClient Fixture
@pytest.fixture(scope="module")
def client(db) -> Generator[TestClient, None, None]:
    from app.api.deps import get_db
    app.dependency_overrides[get_db] = lambda: db # Inject test DB into FastAPI routes
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()

# 5. Auth Token Fixtures
@pytest.fixture(scope="module")
def superuser_token_headers(client: TestClient) -> dict[str, str]:
    return get_superuser_token_headers(client)

@pytest.fixture(scope="module")
def normal_user_token_headers(client: TestClient, db: Session) -> dict[str, str]:
    return authentication_token_from_email(client=client, email=settings.EMAIL_TEST_USER, db=db)
```

---

## 4. Deep Dive into Test Modules

### A. Unit Tests (`tests/unit/`)

Unit tests test functions in isolation without touching a real database or network.

1. **[`test_email.py`](file:///c:/Users/kiran/Desktop/doit-prod/backend/tests/unit/app/test_email.py)**:
   - `test_render_email_template()`: Renders HTML Jinja2 templates (`test_email.html`) and asserts string output.
   - `test_generate_test_email()` & `test_generate_reset_password_email()`: Verifies email payload generation.
   - `test_send_email()`: Uses `@patch("smtplib.SMTP")` to mock the SMTP server and verify that `send_message` is called with correct headers (`To`, `Subject`).

2. **[`test_security.py`](file:///c:/Users/kiran/Desktop/doit-prod/backend/tests/unit/app/test_security.py)**:
   - `test_get_password_hash()` & `test_verify_password()`: Verifies bcrypt hashing algorithms work properly and reject invalid passwords.

3. **[`test_utils.py`](file:///c:/Users/kiran/Desktop/doit-prod/backend/tests/unit/app/test_utils.py)**:
   - `test_generate_password_reset_token()` & `test_verify_password_reset_token()`: Checks JWT token encoding/decoding logic for password recovery.

4. **[`test_user.py`](file:///c:/Users/kiran/Desktop/doit-prod/backend/tests/unit/crud/test_user.py)**:
   - Tests CRUD methods (`create_user`, `get_user_by_email`, `authenticate`, `update_user`) by passing a `MagicMock(spec=Session)` to ensure DB sessions are called correctly without connecting to a database.

---

### B. Integration API Tests (`tests/integration/api/`)

Integration tests send real HTTP requests to the FastAPI app using `TestClient`.

1. **[`test_login.py`](file:///c:/Users/kiran/Desktop/doit-prod/backend/tests/integration/api/test_login.py)**:
   - `test_get_access_token()`: POSTs form data to `/api/v1/login/access-token` and expects a valid OAuth2 JWT bearer token.
   - `test_use_access_token()`: Tests `/api/v1/login/test-token` with valid headers.
   - `test_recovery()`: Tests password recovery email request endpoint.

2. **[`test_users.py`](file:///c:/Users/kiran/Desktop/doit-prod/backend/tests/integration/api/test_users.py)**:
   - `test_get_users_superuser_me()`: Verifies GET `/api/v1/users/me` returns superuser details.
   - `test_create_user_new_email()`: Verifies superuser user creation.
   - `test_update_user_me()`: Verifies self-service user profile updates.

3. **[`test_items.py`](file:///c:/Users/kiran/Desktop/doit-prod/backend/tests/integration/api/test_items.py)**:
   - Verifies item CRUD endpoints (`POST /items/`, `GET /items/{id}`, `PUT /items/{id}`, `DELETE /items/{id}`).
   - `test_read_item_not_enough_permissions()`: Validates role-based access control (RBAC) when a normal user tries to access another user's item (expects `400 Bad Request`).

4. **[`test_projects.py`](file:///c:/Users/kiran/Desktop/doit-prod/backend/tests/integration/api/test_projects.py)** & **[`test_tasks.py`](file:///c:/Users/kiran/Desktop/doit-prod/backend/tests/integration/api/test_tasks.py)**:
   - Tests workspace creation, project creation, and task CRUD workflows.

---

### C. Helper Utilities (`tests/utils/`)

- **[`user.py`](file:///c:/Users/kiran/Desktop/doit-prod/backend/tests/utils/user.py)**: Provides `user_authentication_headers()`, `create_random_user()`, and `authentication_token_from_email()` to automate token generation during tests.
- **[`item.py`](file:///c:/Users/kiran/Desktop/doit-prod/backend/tests/utils/item.py)**: Provides `create_random_item(db)` to populate test items.
- **[`utils.py`](file:///c:/Users/kiran/Desktop/doit-prod/backend/tests/utils/utils.py)**: Generates random lowercase strings and email addresses (`random_email()`).

---

## 5. Execution Commands & How to Run

All test commands should be executed from the `backend/` directory using the project virtual environment `.venv`:

### Run All Tests
```bash
.venv\Scripts\python.exe -m pytest tests/
```

### Run Unit Tests Only
```bash
.venv\Scripts\python.exe -m pytest tests/unit
```

### Run Integration Tests Only
```bash
.venv\Scripts\python.exe -m pytest tests/integration
```

### Run a Specific Test File
```bash
.venv\Scripts\python.exe -m pytest tests/integration/api/test_login.py
```

### Run Tests with Line-by-Line Code Coverage
```bash
.venv\Scripts\python.exe -m coverage run -m pytest tests/
.venv\Scripts\python.exe -m coverage report
.venv\Scripts\python.exe -m coverage html
```
*(Open `backend/htmlcov/index.html` in a browser to inspect line-by-line coverage visuals).*
