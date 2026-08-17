# Production-Grade Pytest Learning Guide: `doit-prod`

A comprehensive, hands-on study guide to the testing architecture, design patterns, fixtures, mocking strategies, and FastAPI/SQLAlchemy integration testing techniques used in the `doit-prod` backend codebase.

---

## 1. Test Suite Discovery & Overview

An exhaustive analysis of the `doit-prod` backend test suite reveals a modern, multi-tiered testing setup designed for FastAPI, SQLAlchemy 2.0, and Pydantic v2.

### 1.1 Directory Structure & File Map

```text
backend/
├── pyproject.toml                     # Pytest, Ruff, Mypy & Coverage configuration
├── alembic.ini                        # Database migration configuration
├── app/                               # Core application code
│   ├── api/deps.py                    # FastAPI dependency injection (get_db, get_current_user)
│   ├── backend_pre_start.py           # DB connectivity wait script
│   ├── tests_pre_start.py             # Test readiness script
│   ├── core/
│   │   ├── config.py                  # Settings & environment loading
│   │   ├── redis_client.py            # Redis sync/async connection management
│   │   └── security.py                # Password hashing & JWT logic
│   └── models.py                      # SQLModel / SQLAlchemy ORM data models
└── tests/                             # Root test directory
    ├── conftest.py                    # Global fixtures, DB session setup & Redis mocking
    ├── README.md                      # Quick reference & testing overview
    ├── unit/                          # Tier 1: Pure Unit Tests (In-Memory, Mocks)
    │   ├── app/
    │   │   ├── test_email.py          # Email payload generation & SMTP mock tests
    │   │   ├── test_models.py         # Pydantic schema validation & constraint tests
    │   │   ├── test_security.py       # Bcrypt hashing & JWT access token tests
    │   │   └── test_utils.py          # Password reset & verification token tests
    │   └── crud/
    │       └── test_user.py           # User CRUD logic tested with Session MagicMocks
    ├── integration/                   # Tier 2 & Tier 3: Integration & Live Socket Tests
    │   ├── api/
    │   │   ├── test_items.py          # Items REST API CRUD & permission checks
    │   │   ├── test_live_server.py    # Uvicorn background server over real TCP sockets
    │   │   ├── test_login.py          # OAuth2 password flow, JWT login & recovery
    │   │   ├── test_private.py        # Internal debug endpoints
    │   │   ├── test_projects.py       # Workspace & Project CRUD workflows
    │   │   ├── test_tasks.py          # Task lifecycle & assignment tests
    │   │   └── test_users.py          # User management & superuser privilege tests
    │   └── crud/
    │       └── test_user.py           # Real database CRUD queries via SQLite
    ├── scripts/                       # Startup infrastructure tests
    │   ├── test_backend_pre_start.py  # DB readiness retry loop verification
    │   └── test_test_pre_start.py     # Test DB readiness verification
    └── utils/                         # Test Data Generators & Helpers
        ├── item.py                    # Random item database factory
        ├── user.py                    # Random user factory & auth header generators
        └── utils.py                   # Random string & token header generators
```

### 1.2 Inventory of Test Categories

* **Unit Tests (11 test methods)**: Isolated functions tested without network or database access (`unit/app/`, `unit/crud/`).
* **Integration API Tests (65+ test methods)**: HTTP REST endpoints tested in-process via FastAPI `TestClient` (`integration/api/`).
* **Database CRUD Integration Tests (8 test methods)**: Real SQL queries executed against an SQLite test database (`integration/crud/`).
* **Live Socket Tests (2 test methods)**: Real TCP socket requests made via `httpx.Client` to a background Uvicorn server running in a separate thread (`test_live_server.py`).
* **Infrastructure & Script Tests (2 test methods)**: Pre-start database ping scripts tested using `MagicMock` (`scripts/`).

---

## 2. Testing Architecture

The `doit-prod` repository uses a multi-tier testing pyramid balancing execution speed with production realism.

```text
                                Pytest Test Runner
                                        |
                 +----------------------+----------------------+
                 |                                             |
            Unit Tests                                 Integration Tests
        (In-Memory / Fast)                             (Database & REST API)
                 |                                             |
   +-------------+-------------+             +-----------------+-----------------+
   |             |             |             |                                   |
Security     Pydantic     Mock CRUD   ASGI TestClient                   httpx Live Client
Logic         Schemas       Logic     (In-Process REST)               (Real TCP Sockets)
   |             |             |             |                                   |
 No DB         No DB      MagicMock     FastAPI App                      Background Uvicorn
                                             |                                   |
                                   +---------+---------+                         |
                                   |                   |                         |
                               SQLite DB           Mock Redis                    |
                           (Savepoint Rollback) (Autouse Patch)                  |
                                   ^                                             |
                                   +---------------------------------------------+
```

### 2.1 Architectural Invariants & Key Decisions

1. **In-Process ASGI Execution (`TestClient`)**: Most API tests run in-process using FastAPI's `TestClient` (built on Starlette and `httpx`). Requests execute directly against the ASGI route handler without opening physical OS TCP sockets or incurring network latency.
2. **Real TCP Socket Verification (`live_client`)**: To guarantee that CORS headers, Uvicorn server middleware, dynamic port bindings, and real socket timeouts function in production, a dedicated live server test spins up Uvicorn in a background thread.
3. **Transaction Rollback Database Isolation**: Instead of dropping and recreating tables (`Base.metadata.create_all`) for every test function—which causes heavy disk I/O—the project creates the schema once per test session and uses SQLAlchemy transaction savepoints/rollbacks for function-scoped test isolation.
4. **Automatic External Service Interception**: Network calls to Redis are globally intercepted using an `autouse=True` session-level fixture in `conftest.py`. This ensures no unit or integration test accidentally attempts a network connection to `redis:6379`.
5. **FastAPI Dependency Injection Overrides**: Database connections are swapped dynamically at runtime using `app.dependency_overrides[get_db] = lambda: db`, allowing the application code to remain untouched while running against an isolated test database session.

---

## 3. Fixtures and `conftest.py` Deep Dive

The [`backend/tests/conftest.py`](file:///c:/Users/kiran/Desktop/doit-prod/backend/tests/conftest.py) file is the foundation of the test suite. Pytest automatically discovers this file and makes its fixtures available to all test modules without requiring explicit imports.

### 3.1 Fixture Summary Matrix

| Fixture Name | Scope | Autouse | Primary Purpose | Key Pytest Feature |
| :--- | :--- | :--- | :--- | :--- |
| `mock_redis_in_tests` | `session` | `True` | Intercepts Redis calls globally to avoid network timeouts | `autouse=True`, `unittest.mock.patch` |
| `db_engine` | `session` | `False` | Initializes SQLite schema and seeds superuser data | `scope="session"`, `Base.metadata.create_all` |
| `db` | `function` | `False` | Yields isolated DB session wrapped in a transaction rollback | `scope="function"`, `transaction.rollback()` |
| `client` | `function` | `False` | Provides `TestClient` configured with database dependency override | `app.dependency_overrides`, `TestClient` |
| `superuser_token_headers` | `function` | `False` | Provides OAuth2 `Bearer` token headers for an Admin user | Fixture dependency on `client` |
| `normal_user_token_headers` | `function` | `False` | Provides OAuth2 `Bearer` token headers for a Normal user | Fixture dependencies on `client` & `db` |
| `live_server_url` | `session` | `False` | Starts background Uvicorn server on free OS port | `threading.Thread`, `socket.bind(("127.0.0.1", 0))` |
| `live_client` | `module` | `False` | Provides real `httpx.Client` targeting live Uvicorn socket | `httpx.Client(base_url=live_server_url)` |

---

### 3.2 Detailed Fixture Mechanics

#### 1. Autouse Global Redis Mock (`mock_redis_in_tests`)

```python
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
```

* **Scope**: `session` (Runs once before any test executes).
* **Autouse**: `True` (Automatically injected into every test without explicit argument declaration).
* **Lifecycle**:
  1. Instantiates a `MagicMock` with standard return values for common Redis operations (`get`, `set`, `delete`, `setex`).
  2. Enters context managers patching `app.core.redis_client.redis_client_sync` and helper functions.
  3. Yields `mock_redis` to the test session.
  4. Restores original modules after the entire test suite finishes.
* **Why it matters**: Prevents flaky test failures and timeouts caused by missing external Redis instances in CI/CD environments.

---

#### 2. Session Database Engine Fixture (`db_engine`)

```python
engine = create_engine("sqlite:///./test.db", connect_args={"check_same_thread": False})

@pytest.fixture(scope="session")
def db_engine():
    from app.models import Base
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        init_db(session)
    yield engine
```

* **Scope**: `session`.
* **Lifecycle**:
  1. Executes `Base.metadata.create_all(engine)` to create all database tables in the SQLite test database (`./test.db`).
  2. Opens a temporary `Session(engine)` and calls `init_db(session)` to seed required baseline data (e.g. initial superuser `settings.FIRST_SUPERUSER`).
  3. Yields the SQLAlchemy `engine` instance.
* **Engineering Note**: `connect_args={"check_same_thread": False}` allows multi-threaded access, which is necessary when Uvicorn runs in a background thread during live server tests.

---

#### 3. Transaction Rollback Database Fixture (`db`)

```python
@pytest.fixture(scope="function")
def db(db_engine) -> Generator[Session, None, None]:
    connection = db_engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection)

    yield session

    session.close()
    transaction.rollback()
    connection.close()
```

* **Scope**: `function` (Runs for every individual test).
* **Lifecycle**:
  1. Acquires a raw connection from `db_engine`.
  2. Starts an outer transaction (`connection.begin()`).
  3. Binds a new SQLAlchemy `Session` to that exact connection.
  4. Yields the active `session` to the test function.
  5. **Teardown**: Closes the session and rolls back the outer transaction (`transaction.rollback()`), discarding all inserts, updates, and deletes performed by the test.
* **Why it matters**: This guarantees **100% test isolation** without the performance penalty of recreating tables on every test run.

---

#### 4. TestClient with Dependency Override (`client`)

```python
@pytest.fixture(scope="function")
def client(db: Session) -> Generator[TestClient, None, None]:
    from app.api.deps import get_db
    app.dependency_overrides[get_db] = lambda: db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
```

* **Scope**: `function`.
* **Dependencies**: Depends on the `db` fixture.
* **Lifecycle**:
  1. Intercepts FastAPI's `get_db` dependency using `app.dependency_overrides[get_db] = lambda: db`.
  2. Enters Starlette's `TestClient(app)` context manager, triggering app startup events if present.
  3. Yields the HTTP client `c` to the test.
  4. **Teardown**: Clears all dependency overrides via `app.dependency_overrides.clear()`.
* **Why it matters**: Ensures every HTTP request made by `TestClient` uses the function-scoped, transaction-isolated database session.

---

#### 5. Background Uvicorn Live Server Fixture (`live_server_url`)

```python
@pytest.fixture(scope="session")
def live_server_url(db_engine) -> Generator[str, None, None]:
    import socket, threading, time, httpx, uvicorn
    from app.api.deps import get_db

    def get_test_db():
        with Session(db_engine) as session:
            yield session

    app.dependency_overrides[get_db] = get_test_db

    # Find an open OS port dynamically
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
```

* **Scope**: `session`.
* **Lifecycle**:
  1. Uses OS socket binding `s.bind(("127.0.0.1", 0))` to find an unused ephemeral TCP port.
  2. Configures Uvicorn and starts it inside a daemon thread (`threading.Thread`).
  3. Polls the `/health-check/` endpoint via `httpx` until the server responds (preventing race conditions where tests run before Uvicorn finishes binding).
  4. Yields the base URL (`http://127.0.0.1:<port>`).
  5. **Teardown**: Signals Uvicorn to exit (`server.should_exit = True`), joins the thread, and cleans up overrides.

---

## 4. Unit Testing Patterns

Unit tests test individual functions or classes in isolation without touching real databases or external services.

### Pattern 1: Pure Security & Encryption Testing

* **File**: [`backend/tests/unit/app/test_security.py`](file:///c:/Users/kiran/Desktop/doit-prod/backend/tests/unit/app/test_security.py)

```python
def test_get_password_hash():
    password = "testpassword"
    hashed_password = security.get_password_hash(password)
    assert hashed_password != password
    assert security.verify_password(password, hashed_password)

def test_verify_password():
    password = "testpassword"
    hashed_password = security.get_password_hash(password)
    assert security.verify_password(password, hashed_password) is True
    assert security.verify_password("wrongpassword", hashed_password) is False
```

* **What is tested**: Bcrypt password hashing (`get_password_hash`) and verification (`verify_password`).
* **What is NOT tested**: Database persistence, HTTP requests, user model creation.
* **Isolated Dependencies**: None needed; pure algorithmic computation.
* **Assertions**: Verifies hash non-equality and boolean verification outcomes for valid and invalid passwords.

---

### Pattern 2: Pydantic Schema Validation & Exception Testing

* **File**: [`backend/tests/unit/app/test_models.py`](file:///c:/Users/kiran/Desktop/doit-prod/backend/tests/unit/app/test_models.py)

```python
import pytest
from pydantic import ValidationError
from app.schemas import UserCreate

def test_user_create_valid():
    user_in = UserCreate(email="test@example.com", password="testpassword")
    assert user_in.email == "test@example.com"
    assert user_in.password == "testpassword"

def test_user_create_invalid_email():
    with pytest.raises(ValidationError):
        UserCreate(email="invalid-email", password="testpassword")

def test_user_create_short_password():
    with pytest.raises(ValidationError):
        UserCreate(email="test@example.com", password="short")
```

* **What is tested**: Data validation rules on `UserCreate` Pydantic schema (email format validation, password min-length rules).
* **Key Pytest Feature**: `pytest.raises(ValidationError)` catches expected Pydantic exceptions.
* **Why it matters**: Ensures invalid client input is rejected at the schema boundary before hitting database or service layers.

---

### Pattern 3: JWT Token Generation & Claims Verification

* **File**: [`backend/tests/unit/app/test_utils.py`](file:///c:/Users/kiran/Desktop/doit-prod/backend/tests/unit/app/test_utils.py)

```python
import jwt
from app import utils
from app.core import security
from app.core.config import settings

def test_generate_password_reset_token():
    email = "test@example.com"
    token = utils.generate_password_reset_token(email)
    assert isinstance(token, str)

    decoded_token = jwt.decode(
        token, settings.SECRET_KEY, algorithms=[security.ALGORITHM]
    )
    assert decoded_token["sub"] == email

def test_verify_verification_token_wrong_type():
    email = "test@example.com"
    token = utils.generate_password_reset_token(email) # Wrong type
    assert utils.verify_verification_token(token) is None
```

* **What is tested**: PyJWT encoding, expiration timestamps, token type claims (`"verification"` vs `"reset_password"`), and decoding invalid/mismatched tokens.
* **Behavior Verified**: Prevents privilege escalation where a user attempts to use a password reset token for account verification.

---

### Pattern 4: SMTP Mocking for Email Dispatch

* **File**: [`backend/tests/unit/app/test_email.py`](file:///c:/Users/kiran/Desktop/doit-prod/backend/tests/unit/app/test_email.py)

```python
from unittest.mock import patch
from app import utils

@patch("smtplib.SMTP")
def test_send_email(mock_smtp):
    instance = mock_smtp.return_value.__enter__.return_value

    utils.send_email(
        email_to="test@example.com",
        subject="Test Subject",
        html_content="<h1>Test</h1>"
    )

    assert mock_smtp.called
    assert instance.send_message.called
    args, kwargs = instance.send_message.call_args
    msg = args[0]
    assert msg["To"] == "test@example.com"
    assert msg["Subject"] == "Test Subject"
```

* **What is tested**: The `send_email` utility function building MIME messages and context manager handling for `smtplib.SMTP`.
* **What is isolated**: Physical network connections to SMTP servers.
* **How the mock works**: `mock_smtp.return_value.__enter__.return_value` mocks the context-managed instance (`with smtplib.SMTP(...) as server:`), allowing inspection of `send_message.call_args`.

---

### Pattern 5: CRUD Unit Testing with `MagicMock(spec=Session)`

* **File**: [`backend/tests/unit/crud/test_user.py`](file:///c:/Users/kiran/Desktop/doit-prod/backend/tests/unit/crud/test_user.py)

```python
from unittest.mock import MagicMock
from sqlalchemy.orm import Session
from app import crud
from app.models import User
from app.schemas import UserCreate

def test_create_user():
    mock_session = MagicMock(spec=Session)
    user_in = UserCreate(email="test@example.com", password="testpassword")

    user = crud.create_user(session=mock_session, user_create=user_in)

    assert user.email == "test@example.com"
    assert mock_session.add.called
    assert mock_session.commit.called
    assert mock_session.refresh.called
```

* **What is tested**: Business logic inside `crud.create_user` (password hashing, field assignment, calling ORM methods).
* **What is isolated**: The database engine. No SQL statement is generated or executed.
* **Why use `spec=Session`**: Ensures `MagicMock` only allows attributes and methods that actually exist on SQLAlchemy's `Session` class, preventing invalid mock method calls from passing silently.

---

## 5. FastAPI & REST API Testing Strategy

Integration tests in `backend/tests/integration/api/` exercise full HTTP request-response lifecycles against FastAPI endpoints.

### 5.1 The REST Request Execution Flow

```text
Pytest Test Function
       │
       ▼
TestClient.post("/api/v1/items/", json=data, headers=headers)
       │
       ▼
FastAPI Routing & OpenAPI Resolution
       │
       ▼
Dependency Injection Resolution
  ├── get_db (Overridden -> Yields test DB Session from fixture)
  └── get_current_user (Parses Bearer Token -> Decodes JWT -> Queries DB)
       │
       ▼
Pydantic Request Validation (ItemCreate Schema)
       │
       ▼
Route Handler Execution (app/api/routes/items.py)
       │
       ▼
CRUD Layer Execution (crud.create_item)
       │
       ▼
SQLAlchemy ORM -> SQLite Database Engine
       │
       ▼
Response Pydantic Serialization (ItemPublic Schema)
       │
       ▼
Test Assertions (assert response.status_code == 200)
```

---

### 5.2 Representative API Test Examples

#### Example 1: Authenticated CRUD Endpoint (`POST /items/`)

* **File**: [`backend/tests/integration/api/test_items.py`](file:///c:/Users/kiran/Desktop/doit-prod/backend/tests/integration/api/test_items.py)

```python
def test_create_item(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    data = {"title": "Foo", "description": "Fighters"}
    response = client.post(
        f"{settings.API_V1_STR}/items/",
        headers=superuser_token_headers,
        json=data,
    )
    assert response.status_code == 200
    content = response.json()
    assert content["title"] == data["title"]
    assert content["description"] == data["description"]
    assert "id" in content
    assert "owner_id" in content
```

* **Line-by-Line Breakdown**:
  * Line 1-2: Injects `client` (`TestClient` with DB override) and `superuser_token_headers` (`{"Authorization": "Bearer <jwt>"}`).
  * Line 3: Constructs the request body JSON dictionary.
  * Line 4-8: Sends an HTTP POST request to `/api/v1/items/`.
  * Line 9: Asserts HTTP 200 OK status code.
  * Line 10-14: Parses the JSON response body and asserts that returning fields match inputs and generated UUID identifiers exist.

---

#### Example 2: Role-Based Access Control / Permission Error (`GET /items/{id}`)

* **File**: [`backend/tests/integration/api/test_items.py`](file:///c:/Users/kiran/Desktop/doit-prod/backend/tests/integration/api/test_items.py)

```python
def test_read_item_not_enough_permissions(
    client: TestClient, normal_user_token_headers: dict[str, str], db: Session
) -> None:
    item = create_random_item(db)
    response = client.get(
        f"{settings.API_V1_STR}/items/{item.id}",
        headers=normal_user_token_headers,
    )
    assert response.status_code == 400
    content = response.json()
    assert content["detail"] == "Not enough permissions"
```

* **Testing Goal**: Verifies that a normal user cannot access an item owned by another user (created via `create_random_item(db)`).
* **Behavior Verified**: Validates that HTTP 400 with message `"Not enough permissions"` is returned when an authorization check fails inside the route handler.

---

#### Example 3: Live Socket Request via Uvicorn (`test_live_server.py`)

* **File**: [`backend/tests/integration/api/test_live_server.py`](file:///c:/Users/kiran/Desktop/doit-prod/backend/tests/integration/api/test_live_server.py)

```python
import httpx
from app.core.config import settings

def test_live_server_login_and_me(
    live_client: httpx.Client, superuser_token_headers: dict[str, str]
) -> None:
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
```

* **Testing Goal**: Exercises true TCP networking, socket connection establishment, HTTP response parsing, and background Uvicorn thread handling.

---

## 6. Database Testing Strategy (SQLAlchemy 2.0 & SQLite)

The database strategy in `doit-prod` combines SQLAlchemy 2.0 ORM patterns with an SQLite file/in-memory database engine for fast, reproducible testing.

### 6.1 Production vs. Test Database Engine Trade-offs

In production, `doit-prod` uses **PostgreSQL** (via `psycopg3`). In testing, pytest runs against **SQLite** (`sqlite:///./test.db`).

```text
+------------------------------------+------------------------------------+
| SQLite Test Database               | Production PostgreSQL Database     |
+------------------------------------+------------------------------------+
| Zero setup overhead (no Docker req)| Requires PostgreSQL server daemon  |
| Extremely fast execution (< 1ms DB)| Slower startup and network latency |
| Single-file / in-memory DB         | Robust concurrency & lock modes    |
| Standard SQL type support          | Native JSONB, ARRAY, UUID types    |
+------------------------------------+------------------------------------+
```

#### Engineering Rationale
* **What SQLite Safely Covers**: Standard CRUD operations, foreign key cascades, unique constraints, index creation, transactions, and basic string/integer/boolean SQL types.
* **What Requires Real PostgreSQL Testing**: Dialect-specific PostgreSQL features (e.g. `JSONB` path queries, `FULL OUTER JOIN`, `ILIKE` regex matching, advisory locks, sequence generators).
* **Production Parity Solution**: For 100% dialect parity, developers can configure **Testcontainers** (`testcontainers-python`) to spin up an ephemeral PostgreSQL Docker container in `conftest.py`.

---

### 6.2 Modern SQLAlchemy 2.0 Query Syntax in Tests

All database queries in `doit-prod` tests strictly use **SQLAlchemy 2.0 `select()` syntax** rather than legacy 1.x `session.query()`.

```python
# ✅ SQLAlchemy 2.0 Preferred Pattern (Used in test_users.py)
from sqlalchemy import select
from app.models import User

user_query = select(User).where(User.email == email)
user_db = db.execute(user_query).scalars().first()
```

---

### 6.3 Real Database CRUD Integration Example

* **File**: [`backend/tests/integration/crud/test_user.py`](file:///c:/Users/kiran/Desktop/doit-prod/backend/tests/integration/crud/test_user.py)

```python
def test_authenticate_user(db: Session) -> None:
    email = random_email()
    password = random_lower_string()
    user_in = UserCreate(email=email, password=password)
    user = crud.create_user(session=db, user_create=user_in)

    authenticated_user = crud.authenticate(session=db, email=email, password=password)

    assert authenticated_user
    assert user.email == authenticated_user.email
```

* **Execution Walkthrough**:
  1. Generates unique random credentials using utility functions (`random_email()`).
  2. Calls `crud.create_user` with the active `db` session (executing an `INSERT INTO user ...` in SQLite).
  3. Executes `crud.authenticate`, which generates a `SELECT` statement and checks `verify_password()`.
  4. Asserts that authentication returns the matching ORM user instance.
  5. Upon test completion, `db` fixture teardown executes `transaction.rollback()`, reverting the inserted user row.

---

## 7. Mocking Strategy & Mechanics

`doit-prod` uses `unittest.mock` (`MagicMock`, `patch`, `patch.object`) to isolate dependencies.

### 7.1 Key Rule: "Mock Where the Dependency is Used"

A common mistake in Python testing is patching a target where it is defined rather than where it is imported. `doit-prod` strictly adheres to patching where imported:

```python
# ✅ CORRECT: Patching where it is imported and consumed in app/api/routes/users.py
@patch("app.utils.send_email")
def test_create_user(mock_send_email):
    ...

# ❌ INCORRECT: Patching original definition in app/utils.py (Will NOT intercept import in route module)
@patch("app.utils.send_email") # if route imported `from app.utils import send_email`
```

---

### 7.2 Inline Context Manager Patching (`test_login.py`)

* **File**: [`backend/tests/integration/api/test_login.py`](file:///c:/Users/kiran/Desktop/doit-prod/backend/tests/integration/api/test_login.py)

```python
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
```

* **Why patch settings inline?**: The password recovery endpoint checks `if settings.SMTP_HOST:` to determine whether email sending is enabled. Patching these attributes inline enables the email dispatch branch without setting environment variables globally.

---

### 7.3 Mock Object Verification Techniques

```python
# 1. Verify call count
assert mock_smtp.called
assert mock_session.add.called

# 2. Verify exact call arguments
args, kwargs = instance.send_message.call_args
msg = args[0]
assert msg["To"] == "test@example.com"
assert msg["Subject"] == "Test Subject"

# 3. Setting return values on nested mocks
mock_session.execute.return_value.scalars.return_value.first.return_value = mock_user
```

---

## 8. External Services & Infrastructure Isolation

| Service | Real vs. Mocked | Isolation Technique | Implementation File |
| :--- | :--- | :--- | :--- |
| **Redis Cache** | **Mocked** | Session Autouse Patch | `tests/conftest.py` (`mock_redis_in_tests`) |
| **SMTP Server** | **Mocked** | `unittest.mock.patch("smtplib.SMTP")` | `tests/unit/app/test_email.py` |
| **SQL Database** | **Real (SQLite)** | Transaction Savepoint Rollback | `tests/conftest.py` (`db` fixture) |
| **Web Server** | **Emulated & Real** | `TestClient` (In-process) & Uvicorn (Thread) | `tests/conftest.py` (`client`, `live_client`) |

---

## 9. Authentication & Authorization Testing

Authentication testing in `doit-prod` covers OAuth2 password bearer tokens, JWT creation, and role-based permissions (Superuser vs Normal User).

### 9.1 Helper Generators for Tokens & Headers

* **File**: [`backend/tests/utils/user.py`](file:///c:/Users/kiran/Desktop/doit-prod/backend/tests/utils/user.py)

```python
def user_authentication_headers(
    *, client: TestClient, email: str, password: str
) -> dict[str, str]:
    data = {"username": email, "password": password}
    r = client.post(f"{settings.API_V1_STR}/login/access-token", data=data)
    response = r.json()
    auth_token = response["access_token"]
    return {"Authorization": f"Bearer {auth_token}"}
```

---

### 9.2 Superuser Security Invariant Enforcement

* **File**: [`backend/tests/integration/api/test_users.py`](file:///c:/Users/kiran/Desktop/doit-prod/backend/tests/integration/api/test_users.py)

```python
def test_delete_user_me_as_superuser(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    r = client.delete(
        f"{settings.API_V1_STR}/users/me",
        headers=superuser_token_headers,
    )
    assert r.status_code == 403
    response = r.json()
    assert response["detail"] == "Super users are not allowed to delete themselves"
```

* **Security Logic Verified**: Superusers are forbidden from self-deletion to prevent accidental lockouts of administrative access.

---

## 10. Error, Exception & Edge-Case Testing

The test suite systematically covers edge cases, validation failures, and authorization violations.

```text
+-----------------------+-------------+--------------------------------------------------------+
| Error Category        | Status Code | Code Base Assertion Example                            |
+-----------------------+-------------+--------------------------------------------------------+
| Invalid Credentials   | 400 Bad Req | test_get_access_token_incorrect_password               |
| Unauthorized Access   | 401 Unauth  | client.get("/users/me") without Bearer header          |
| Permission Denied     | 403 Forbid  | test_get_existing_user_permissions_error               |
| Resource Not Found    | 404 Not Fnd | test_read_item_not_found (uuid.uuid4())                |
| Email Duplicate       | 409 Conflict| test_update_user_me_email_exists                       |
| Schema Validation Error| 422 Unproc  | Pydantic missing required body fields                  |
+-----------------------+-------------+--------------------------------------------------------+
```

---

## 11. Test Data, Utilities & Factories

Instead of hardcoding static JSON payloads in test files, `doit-prod` uses utility generators and factory helpers in `tests/utils/`.

### 1. Random Generators ([`tests/utils/utils.py`](file:///c:/Users/kiran/Desktop/doit-prod/backend/tests/utils/utils.py))

```python
def random_lower_string() -> str:
    return "".join(random.choices(string.ascii_lowercase, k=32))

def random_email() -> str:
    return f"{random_lower_string()}@{random_lower_string()}.com"
```

### 2. Item Entity Factory ([`tests/utils/item.py`](file:///c:/Users/kiran/Desktop/doit-prod/backend/tests/utils/item.py))

```python
def create_random_item(db: Session) -> Item:
    user = create_random_user(db)
    owner_id = user.id
    title = random_lower_string()
    description = random_lower_string()
    item_in = ItemCreate(title=title, description=description)
    return crud.create_item(session=db, item_in=item_in, owner_id=owner_id)
```

* **Why factories are critical**: Calling `create_random_item(db)` ensures each test gets a clean, uniquely named item with its own dedicated user owner in database integration tests.

---

## 12. Test Isolation, State Management & Cleanup

Test pollution occurs when Test A modifies database rows, environment settings, or global state that causes Test B to fail unpredictably.

### 12.1 Isolation Mechanisms in `doit-prod`

1. **Database Rollbacks**: Function-scoped `db` fixture wraps queries in an uncommitted transaction and executes `transaction.rollback()` on teardown.
2. **Dependency Override Cleanup**: `client` fixture calls `app.dependency_overrides.clear()` in a `finally` block to prevent override leaking across test modules.
3. **Randomized Data Identifiers**: `random_email()` generates unique strings (`a9x8z...@k2m9p.com`), preventing unique key collision errors (`IntegrityError`).
4. **Mock State Restoration**: `unittest.mock.patch` context managers automatically unpatch imported objects upon exiting block scope.

---

## 13. Async & Infrastructure Script Testing

### 13.1 Pre-Start Infrastructure Verification

Before the backend or test suite starts in Docker, startup scripts run to verify database readiness. These scripts are tested in [`tests/scripts/`](file:///c:/Users/kiran/Desktop/doit-prod/backend/tests/scripts/).

* **File**: [`backend/tests/scripts/test_backend_pre_start.py`](file:///c:/Users/kiran/Desktop/doit-prod/backend/tests/scripts/test_backend_pre_start.py)

```python
from unittest.mock import MagicMock, patch
from app.backend_pre_start import init, logger

def test_init_successful_connection() -> None:
    engine_mock = MagicMock()
    session_mock = MagicMock()
    session_mock.__enter__.return_value = session_mock
    execute_mock = MagicMock(return_value=True)
    session_mock.configure_mock(**{"execute.return_value": execute_mock})

    with (
        patch("app.backend_pre_start.Session", return_value=session_mock),
        patch.object(logger, "info"),
        patch.object(logger, "error"),
        patch.object(logger, "warn"),
    ):
        init(engine_mock)
        assert session_mock.execute.called
```

* **Logic Verified**: Verifies that `init(engine_mock)` executes `SELECT 1` against the session to confirm DB readiness without throwing exceptions.

---

## 14. Coverage & Test Quality Metrics

Coverage configuration is defined in [`backend/pyproject.toml`](file:///c:/Users/kiran/Desktop/doit-prod/backend/pyproject.toml):

```toml
[tool.coverage.run]
source = ["app"]
dynamic_context = "test_function"

[tool.coverage.report]
show_missing = true
sort = "-Cover"

[tool.coverage.html]
show_contexts = true
```

### Running Coverage Analysis

```bash
# Execute test suite under coverage measurement
.venv\Scripts\python.exe -m coverage run -m pytest tests/

# Output terminal coverage report sorted by coverage percentage
.venv\Scripts\python.exe -m coverage report -m

# Generate visual HTML report
.venv\Scripts\python.exe -m coverage html
```

---

## 15. CI/CD Execution & Pre-Start Verification

In containerized production environments (Docker Compose / GitHub Actions), tests execute via the following pipeline:

```text
Build Docker Image (backend/Dockerfile)
           │
           ▼
Virtual Environment Dependencies Installed (uv sync / pip install)
           │
           ▼
Run Test Pre-Start Verification Script (python app/tests_pre_start.py)
           │
           ▼
Execute Pytest Suite (pytest tests/ --cov=app)
           │
           ▼
Evaluate Exit Code (0 = Pass pipeline, 1+ = Fail pipeline)
```

---

## 16. Pattern Cheat Sheet

| Testing Pattern | Project Representative Code Example | Purpose & Use Case | Key Pytest / Mock Feature |
| :--- | :--- | :--- | :--- |
| **Global Autouse Mock** | `conftest.py::mock_redis_in_tests` | Disable external Redis calls across entire suite | `@pytest.fixture(autouse=True, scope="session")` |
| **Transaction Rollback** | `conftest.py::db` | Fast, function-level DB isolation without dropping tables | `transaction.rollback()` on teardown |
| **Dependency Override** | `conftest.py::client` | Replace production `get_db` with test DB session | `app.dependency_overrides[get_db] = lambda: db` |
| **In-Process REST Test** | `test_items.py::test_create_item` | Fast API integration testing without socket overhead | `TestClient(app)` |
| **Live TCP Socket Test** | `test_live_server.py::test_live_server_login_and_me` | Verify Uvicorn socket, CORS & middleware over network | `httpx.Client` + `threading.Thread(uvicorn)` |
| **Schema Validation Error**| `test_models.py::test_user_create_invalid_email` | Verify client input validation at boundary | `pytest.raises(ValidationError)` |
| **SMTP Server Patch** | `test_email.py::test_send_email` | Intercept raw SMTP message creation | `@patch("smtplib.SMTP")` |
| **CRUD Unit Mock** | `unit/crud/test_user.py::test_create_user` | Test DB operations using mock session | `MagicMock(spec=Session)` |
| **Entity Factory** | `tests/utils/item.py::create_random_item` | Create realistic test database data dynamically | Dynamic ORM entity creation |

---

## 17. Production Testing Interview Questions & Answers

Below are 10 staff-level interview questions and model answers based on the `doit-prod` testing suite.

---

### Q1: How does FastAPI's `TestClient` work under the hood, and why is it preferred over spinning up a live server in CI/CD?
**Answer**:
FastAPI's `TestClient` inherits from Starlette's `TestClient`, which wraps `httpx`. Instead of opening an actual OS TCP socket and listening on a port, it communicates directly with the FastAPI ASGI application in-process via memory calls (`app(scope, receive, send)`). 

**Why it's preferred in CI/CD**:
1. **Performance**: Eliminates network socket binding, handshake, and HTTP parsing overhead, running 10x-100x faster.
2. **Container Isolation**: Requires no special networking privileges or available TCP ports inside restricted Docker CI runners.
3. **Runtime Overrides**: Allows immediate monkeypatching of FastAPI dependencies via `app.dependency_overrides`.

---

### Q2: What is the gold standard pattern for database test isolation in SQLAlchemy 2.0, and why is dropping/recreating tables between tests antipattern?
**Answer**:
The gold standard is **Transaction Rollback Isolation**. Schema creation (`Base.metadata.create_all`) occurs once per test session. For each test function, an outer transaction (`connection.begin()`) is opened, a `Session` is bound to that connection, and on test teardown, `transaction.rollback()` is executed.

**Why dropping/recreating tables is an antipattern**:
Executing DDL statements (`CREATE TABLE`, `DROP TABLE`) for every test causes severe disk I/O bottlenecks, increasing suite execution time from seconds to minutes. Transaction rollbacks take under 1 millisecond per test.

---

### Q3: What is the risk of sharing a `session`-scoped database session fixture across multiple test functions without cleanup?
**Answer**:
A `session`-scoped database session causes state leakage between tests. Data inserted or modified by Test A persists when Test B runs. This leads to **flaky, order-dependent test failures** where tests pass in isolation but fail when run in a suite due to unique constraint collisions or unexpected query row counts.

---

### Q4: How do FastAPI dependency overrides work, and what is a common gotcha when using them in Pytest?
**Answer**:
FastAPI endpoints inject dependencies declared via `Depends()`. In tests, assigning `app.dependency_overrides[target_dep] = override_func` swaps the dependency during request handling.

**Common Gotcha**:
Failing to clear overrides on fixture teardown (`app.dependency_overrides.clear()`). If Test A overrides `get_current_user` to return an Admin user and doesn't clear it, subsequent tests will execute with Admin privileges unexpectedly.

---

### Q5: How do you prevent external network calls (Redis, Stripe, S3, SMTP) from breaking CI/CD pipelines?
**Answer**:
By declaring **Session-scoped Autouse Pytest Fixtures** using `unittest.mock.patch`. In `conftest.py`, define a fixture with `autouse=True` that patches the client instantiation or network method globally. Even if a developer forgets to mock an external call in a new test file, the autouse fixture intercepts socket connections automatically.

---

### Q6: How do you debug an HTTP 422 Unprocessable Entity error in a FastAPI POST endpoint test?
**Answer**:
HTTP 422 indicates a Pydantic validation failure. Debug by:
1. Inspecting `response.json()["detail"]`, which contains exact field paths and error messages (e.g. `[{'loc': ['body', 'email'], 'msg': 'value is not a valid email address'}]`).
2. Cross-referencing the request dictionary payload against the required fields in the endpoint's Pydantic `Create` schema.

---

### Q7: What is the difference between unit testing a CRUD function directly vs. testing it through a FastAPI endpoint?
**Answer**:
* **Direct CRUD Unit Test (`crud.create_user(db, user_in)`)**: Tests SQL generation and business logic in isolation. Fast and returns Python model objects directly.
* **API Endpoint Integration Test (`client.post("/users/", json=data)`)**: Tests the full HTTP request stack: URL routing, query/body parameter parsing, Pydantic validation, dependency injection, authentication security, and JSON response serialization.

---

### Q8: How do you mock background tasks (`BackgroundTasks`) in FastAPI integration tests?
**Answer**:
FastAPI `BackgroundTasks` execute synchronously inside Starlette right before the response is returned when using `TestClient`. To test background tasks without executing external side effects (e.g. sending emails), patch the underlying worker utility (`@patch("app.utils.send_email")`) and assert `mock_send_email.assert_called_once()`.

---

### Q9: What are the limitations of testing with SQLite when production uses PostgreSQL?
**Answer**:
SQLite does not support native PostgreSQL features such as `JSONB` path queries, `ENUM` types, `ARRAY` types, `ILIKE` case-insensitive regex matching, or PostgreSQL sequence behaviors. If an endpoint relies on PostgreSQL-specific SQL syntax, tests running on SQLite may pass falsely or crash invalidly.

---

### Q10: How do you achieve 100% production parity in database integration testing?
**Answer**:
By utilizing **Testcontainers for Python** (`testcontainers-python`) or a Docker Compose test profile. In `conftest.py`, spin up an ephemeral PostgreSQL container on test session startup, run Alembic migrations (`alembic upgrade head`), and point the SQLAlchemy engine to the PostgreSQL container.

---

## 18. "Explain This in an Interview" Section

### 1. Explaining Dependency Overrides
> "In my FastAPI backend project, I use `app.dependency_overrides` inside pytest fixtures to inject test database sessions into my route handlers. This allows me to test real API endpoints through `TestClient` while redirecting database calls to an isolated test session wrapped in a transaction rollback."

### 2. Explaining Database Test Isolation
> "To keep database integration tests fast and isolated, I avoid dropping and recreating tables between tests. Instead, I initialize the schema once per session and wrap each test function in an uncommitted database transaction. On test teardown, I roll back the transaction, which instantly reverts all database mutations."

### 3. Explaining External Service Interception
> "To guarantee our CI pipeline never fails due to network hiccups or missing external services, I configure an autouse session fixture in `conftest.py`. This fixture globally mocks Redis socket calls across the entire test suite, ensuring fast, deterministic test execution."

---

## 19. Learning Roadmap

```text
                         Pytest Fundamentals
                      (Fixtures, Assertions, CLI)
                                   │
                                   ▼
             ┌──────────────────────────────────────────┐
             │            MUST KNOW (Core)              │
             │ - Transaction Rollbacks in SQLAlchemy    │
             │ - FastAPI TestClient & Dependency        │
             │   Overrides                              │
             │ - unittest.mock.patch & MagicMock        │
             └──────────────────────────────────────────┘
                                   │
                                   ▼
             ┌──────────────────────────────────────────┐
             │           SHOULD KNOW (Intermediate)     │
             │ - Autouse Session Fixtures (Redis Mock)  │
             │ - Pydantic ValidationError Assertions    │
             │ - Entity Factories & Random Data Helpers │
             └──────────────────────────────────────────┘
                                   │
                                   ▼
             ┌──────────────────────────────────────────┐
             │            NICE TO KNOW (Advanced)       │
             │ - Live Socket Uvicorn Threading Tests    │
             │ - Pre-start DB Connection Retries        │
             │ - Testcontainers for PostgreSQL Parity   │
             └──────────────────────────────────────────┘
```

---
*End of Pytest Project Testing Guide.*
