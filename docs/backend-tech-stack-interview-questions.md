# Master Backend Engineering Interview Questions: `doit-prod` Tech Stack

This document contains a comprehensive, topic-by-topic battery of technical interview questions tailored for a **3-year Python Backend Engineer**. It directly tests the concepts, internals, failure modes, trade-offs, and production engineering decisions from the `doit-prod` technology stack.

---

# 1. FastAPI & The ASGI Web Ecosystem

## 1.1 ASGI Architecture & Web Server Execution

### Questions
1. **[Basic]** What is the fundamental architectural difference between WSGI (e.g., Gunicorn sync workers, Flask) and ASGI (e.g., Uvicorn, FastAPI)?
2. **[Basic]** What role does Uvicorn play in relation to FastAPI, and what does the ASGI specification actually standardize between the server and the application?
3. **[Practical]** When running Uvicorn in production, how do you configure workers, timeouts, and headers behind a reverse proxy?
4. **[Intermediate]** How does Uvicorn's event loop interact with the OS network stack (e.g., `epoll` on Linux, `kqueue` on BSD/macOS) to handle thousands of open socket connections concurrently?
5. **[Advanced]** Why is running multiple worker processes inside a single Docker container generally considered an anti-pattern for ASGI applications deployed on container orchestrators?
6. **[Production]** If your FastAPI application is running on a memory-constrained VPS (e.g., 1GB RAM), how would you configure Uvicorn workers and connection limits to prevent out-of-memory (OOM) termination?
7. **[Debugging]** A FastAPI endpoint starts returning `502 Bad Gateway` through the reverse proxy only when concurrent requests exceed 500 req/sec, but CPU utilization is only at 30%. What underlying network or ASGI worker limits would you investigate?
8. **[Project]** In this project's `docker-compose.prod.yml`, how is Uvicorn executed, and why are we relying on container-level management rather than Gunicorn process managers?

### Follow-up Questions
9. If an ASGI server is single-threaded per worker, how can it serve 10,000 idle keep-alive connections without running out of threads?
10. What happens if a client abruptly disconnects midway through an ongoing response stream in ASGI? Does the coroutine keep running, and how does FastAPI detect the disconnect?

---

## 1.2 Concurrency Model (`async def` vs. `def`)

### Questions
1. **[Basic]** In FastAPI, what happens behind the scenes when you declare an endpoint as `def endpoint()` versus `async def endpoint()`?
2. **[Basic]** What is the Python Global Interpreter Lock (GIL), and how does it relate to asynchronous I/O in FastAPI?
3. **[Practical]** If an endpoint needs to execute a database query using a synchronous library (like synchronous SQLAlchemy or `psycopg2`), should you declare the route as `def` or `async def`? Why?
4. **[Intermediate]** How does FastAPI utilize AnyIO / Starlette's threadpool for synchronous `def` endpoints? What is the default threadpool size limit, and what happens when that limit is saturated?
5. **[Advanced]** If someone accidentally calls `time.sleep(5)` or a synchronous HTTP client (`requests.get(...)`) inside an `async def` route, what is the precise impact on other concurrent users hitting completely different endpoints on that worker?
6. **[Production]** How do you profile and detect event loop blockage in a running production FastAPI service?
7. **[Debugging]** An endpoint declared as `async def get_dashboard()` runs in 15ms under low traffic. Under a load of 100 concurrent requests, the average response time climbs to 4,500ms while CPU usage drops to near zero. What is the most likely root cause in the code?
8. **[Project]** Looking at this project's backend routes, why are our route handlers declared with `def` when interacting with synchronous SQLAlchemy sessions, and what would break if we switched to `async def` without an async engine?

### Follow-up Questions
9. If you must run a CPU-bound operation (e.g., image resizing or complex hashing) in FastAPI, how should you offload it so it blocks neither the event loop nor the worker threadpool?
10. Can you mix `async` dependencies with synchronous `def` route handlers in FastAPI? How does the dependency resolver handle the execution context switch?

---

## 1.3 Dependency Injection System

### Questions
1. **[Basic]** What is FastAPI's Dependency Injection (`Depends`) system, and what problems does it solve compared to global imports or Django-style middleware?
2. **[Basic]** How do you define a dependency that yields a resource and guarantees cleanup code execution after the response is sent?
3. **[Practical]** How do you compose hierarchical dependencies in FastAPI (e.g., `get_db` $\rightarrow$ `get_current_user` $\rightarrow$ `get_current_active_workspace_admin`)?
4. **[Intermediate]** How does FastAPI construct and resolve the Dependency Directed Acyclic Graph (DAG)? What does the `use_cache=True` (default) parameter in `Depends` do across sub-dependencies within a single request?
5. **[Advanced]** If an unhandled exception is raised inside a route handler, what is the exact execution flow of the `yield` statement in a database session dependency? Does the code after `yield` execute? Does the exception propagate into the generator?
6. **[Production]** How do you leverage `app.dependency_overrides` during integration testing to mock database connections and authenticated user identities without modifying application source code?
7. **[Debugging]** A developer wrote a `yield` dependency for database sessions, but noticed that when an endpoint raises an `HTTPException(404)`, database transactions are being rolled back instead of committed, or connections are leaking. How would you structure the `try ... except ... finally` block inside the dependency to prevent this?
8. **[Project]** How does `backend/app/api/deps.py` implement `SessionDep`, `CurrentUser`, and `get_current_active_superuser`? How are type annotations (`Annotated`) utilized to enforce clean endpoint signatures?

### Follow-up Questions
9. What happens if two independent sub-dependencies both depend on `get_db` with `use_cache=True`? Do they share the exact same SQLAlchemy Session instance or get distinct sessions?
10. Why is `Security(get_current_user, scopes=[...])` used instead of `Depends(get_current_user)` when building OAuth2/OpenAPI compliant authorization?

---

## 1.4 Middleware & Request Lifecycle

### Questions
1. **[Basic]** What is the execution order of Starlette Middleware, FastAPI Dependencies, Route Handlers, and Exception Handlers during an incoming HTTP request?
2. **[Basic]** What is CORS, why do browsers enforce it, and how is it configured in FastAPI?
3. **[Practical]** How do you write a custom `BaseHTTPMiddleware` in FastAPI that measures endpoint execution time and appends a custom header (e.g., `X-Process-Time`) to the HTTP response?
4. **[Intermediate]** Why does FastAPI return an HTTP `307 Temporary Redirect` when a route is defined with a trailing slash (e.g., `/items/`) but requested without one (e.g., `/items`), and why does this frequently break CORS preflight requests in Single Page Applications?
5. **[Advanced]** What are the performance overheads and context variable propagation pitfalls associated with `BaseHTTPMiddleware` in Starlette, and when should you use pure ASGI middleware instead?
6. **[Production]** How should a logging middleware handle request body consumption without causing subsequent route handlers or Pydantic validation to receive an empty stream?
7. **[Debugging]** A frontend client sends a `POST` request with JSON body to `/api/v1/auth/login`. The browser console reports a CORS error, but the backend logs show a `307 Redirect` and no CORS headers on the response. How do you fix this permanently in both backend route declarations and frontend Axios configuration?
8. **[Project]** How does `RequestLoggingMiddleware.py` in this project extract or generate `X-Correlation-ID`, bind it to `structlog.contextvars`, exclude health check endpoints, and ensure context cleanup in the `finally` block?

### Follow-up Questions
9. If an unhandled exception occurs inside a custom middleware *before* `call_next(request)` is reached, does FastAPI's `@app.exception_handler(Exception)` catch it? Why or why not?
10. How does the `CORSMiddleware` determine whether to respond directly to an `OPTIONS` request or pass it downstream to the router?

---

## 1.5 Exception Handling & Background Tasks

### Questions
1. **[Basic]** What is the difference between raising a standard Python `Exception`, raising FastAPI's `HTTPException`, and returning a JSON response with a 4xx status code?
2. **[Basic]** What is FastAPI's `BackgroundTasks`, and how does it differ from a distributed task queue like Celery or RQ?
3. **[Practical]** How do you register a custom exception handler for `RequestValidationError` to override the default 422 error payload with a custom UI-friendly error format?
4. **[Intermediate]** At what exact stage in the request/response lifecycle are `BackgroundTasks` executed? Does a failure in a background task alter the HTTP status code already sent to the client?
5. **[Advanced]** What happens if a background task created via `BackgroundTasks.add_task()` relies on a database session yielded from a FastAPI dependency? Why does this fail with a "Session is closed" error, and how must you pass database access to background jobs?
6. **[Production]** When is it acceptable to use FastAPI `BackgroundTasks` in production, and at what scale/criticality threshold must you migrate to an external broker-backed worker queue (e.g., Redis + Celery/ARQ)?
7. **[Debugging]** An endpoint successfully returns `200 OK` to the client, but the background task responsible for sending an invitation email silently fails. How do you configure structured logging and error tracking to capture background task failures?
8. **[Project]** In this project, how are invitation and reset password emails dispatched? Are they synchronous, using `BackgroundTasks`, or handled via an external worker? What are the reliability trade-offs of this decision?

### Follow-up Questions
9. If the server process is abruptly restarted (e.g., SIGTERM / OOM kill) while 50 FastAPI `BackgroundTasks` are queued in memory, what happens to those jobs?
10. How does FastAPI's `HTTPException` differ from Starlette's `HTTPException` in terms of headers and response formatting?

---

# 2. Pydantic v2 & Pydantic-Settings

## 2.1 Pydantic Core Mechanics & Validation

### Questions
1. **[Basic]** What is the primary purpose of Pydantic in a FastAPI backend, and how does it differentiate data *validation* from data *parsing/coercion*?
2. **[Basic]** What is the difference between a Pydantic `BaseModel` and a Python standard library `dataclass`?
3. **[Practical]** How do you define optional fields, default values, and field-level metadata (such as `min_length`, `max_length`, `regex`, `gt`) using `Field()` in Pydantic v2?
4. **[Intermediate]** How does Pydantic v2 achieve up to 5-10x performance gains over Pydantic v1? What is the role of `pydantic-core` written in Rust?
5. **[Advanced]** What is the difference between `@field_validator` and `@model_validator` in Pydantic v2? When must you use `mode='before'` versus `mode='after'`?
6. **[Production]** Why should API request schemas and API response schemas be defined as separate Pydantic models even when their fields are 90% identical?
7. **[Debugging]** A Pydantic validation error occurs on an incoming payload, but the error message returned to the client exposes internal database column names and schema structures. How do you sanitize validation error responses for production security?
8. **[Project]** How does this project structure its schemas in `backend/app/schemas.py` to differentiate between `TaskCreate`, `TaskUpdate`, `TaskPublic`, and `TasksPublic`?

### Follow-up Questions
9. What is the difference between `model.model_dump()` and `model.model_dump_json()`? How do you customize serialization for data types like `datetime` or `UUID`?
10. What does `model_construct()` do, and why is it dangerous to use on untrusted user input?

---

## 2.2 ORM Hydration & Pydantic-Settings

### Questions
1. **[Basic]** What does `model_config = ConfigDict(from_attributes=True)` do in Pydantic v2 (previously `orm_mode = True` in v1)?
2. **[Basic]** How does `pydantic-settings` load and cast environment variables into a typed Python object?
3. **[Practical]** How do you implement a `@computed_field` in a Pydantic Settings class (e.g., constructing a full database connection string from separate host, user, password, and port variables)?
4. **[Intermediate]** When serializing a SQLAlchemy model with lazy-loaded relationships using a Pydantic schema configured with `from_attributes=True`, what dangerous database behavior can be inadvertently triggered?
5. **[Advanced]** How do you implement custom pre-validators in `BaseSettings` to parse complex environment variables (like a comma-separated string or a JSON array of CORS origins) into a Python `list[str]`?
6. **[Production]** How do you implement "fail-fast" configuration validation so that if a required secret (e.g., `SECRET_KEY`, `POSTGRES_PASSWORD`) is missing or set to an insecure default, the application crashes immediately on startup rather than during a customer request?
7. **[Debugging]** You deployed your application to staging, and `Settings` raised a validation error stating `POSTGRES_PORT` is invalid because it was passed as `"5432"` (string). How does Pydantic handle environment variable type coercion, and why might it fail if custom validators are misconfigured?
8. **[Project]** In `backend/app/core/config.py`, how does `Settings` validate that `SECRET_KEY` and `FIRST_SUPERUSER_PASSWORD` are not set to `"changethis"` in non-local environments?

### Follow-up Questions
9. What is the precedence order in `pydantic-settings` when a variable is defined in the system environment, a `.env` file, and as a default value in the Python class?
10. How do you exclude sensitive fields (like API keys or passwords) from appearing in log outputs when printing or dumping a `Settings` model?

---

# 3. SQLAlchemy 2.0 & SQLModel

## 3.1 2.0 Query Syntax & Declarative Modeling

### Questions
1. **[Basic]** What is SQLModel, and how does it unify Pydantic models with SQLAlchemy declarative tables?
2. **[Basic]** What is the difference between SQLAlchemy 1.x legacy query syntax (`session.query(User).filter(...)`) and SQLAlchemy 2.0 syntax (`session.execute(select(User).where(...))`)?
3. **[Practical]** How do you write a complete SQLAlchemy 2.0 query with filtering, sorting, limit, offset, and scalar execution returning a list of ORM objects?
4. **[Intermediate]** What is the difference between `session.execute(statement).scalars().all()`, `session.execute(statement).scalars().first()`, and `session.execute(statement).scalar_one_or_none()`? When will `scalar_one()` raise an exception?
5. **[Advanced]** How do you model self-referential relationships (e.g., hierarchical task dependencies or parent/child comments) and composite foreign keys in SQLModel / SQLAlchemy 2.0?
6. **[Production]** Why is executing raw SQL queries via `session.execute(text("SELECT ..."))` risky if not parameterized, and how does SQLAlchemy ensure SQL injection protection when using parameterized `text()` or core constructs?
7. **[Debugging]** A developer wrote `session.exec(select(Task).where(Task.id == task_id))`. In SQLModel, why does this return `None` or an iterable instead of a single object if `.first()` is omitted?
8. **[Project]** In `backend/app/models.py`, how are the `User`, `Workspace`, `Project`, `Section`, and `Task` models structured? How are UUIDs configured as primary keys with default generation?

### Follow-up Questions
9. What is the difference between `table=True` and `table=False` on a SQLModel class?
10. How do you perform an `UPDATE` or `DELETE` statement in SQLAlchemy 2.0 without fetching the entity into memory first (bulk execution)?

---

## 3.2 Session Lifecycle, Unit of Work & Transactions

### Questions
1. **[Basic]** What is the "Unit of Work" pattern, and how does the SQLAlchemy `Session` implement it?
2. **[Basic]** What are the four states an ORM entity can occupy in relation to a session (*Transient*, *Pending*, *Persistent*, *Detached*)?
3. **[Practical]** What is the exact difference between `session.flush()` and `session.commit()`? Give a concrete code example where calling `session.flush()` is necessary.
4. **[Intermediate]** What is the Identity Map in SQLAlchemy? If you execute two identical `select(User).where(User.id == 1)` queries within the same transaction, does SQLAlchemy query the database twice?
5. **[Advanced]** What happens when an exception is raised halfway through a multi-step database operation inside an active transaction? If `session.rollback()` is not called before the connection is returned to the pool, what happens to the next request that borrows that connection?
6. **[Production]** Why should long-running I/O operations (such as calling an external payment API or generating an AI embedding) NEVER be performed while holding an open SQLAlchemy transaction?
7. **[Debugging]** You encounter a `DetachedInstanceError: Parent instance <Task at 0x...> is not bound to a Session; lazy load operation of attribute 'comments' cannot proceed`. What caused this error, and how do you resolve it?
8. **[Project]** How does this project manage database session creation and teardown in `backend/app/core/db.py` and `backend/app/api/deps.py`? Is auto-commit enabled or disabled?

### Follow-up Questions
9. What does `session.refresh(instance)` do, and why is it commonly called after `session.commit()`?
10. What is the difference between `session.close()` and `session.rollback()` when returning a connection to the pool?

---

## 3.3 Loading Strategies & The N+1 Problem

### Questions
1. **[Basic]** What is the "N+1 Query Problem" in ORMs, and how does it happen when retrieving a list of Projects and their associated Tasks?
2. **[Basic]** What is Lazy Loading, and why is it the default behavior in most ORMs?
3. **[Practical]** How do you configure and apply Eager Loading in SQLAlchemy 2.0 using `joinedload()` and `selectinload()` in a `select()` query?
4. **[Intermediate]** What is the underlying SQL execution difference between `joinedload` (SQL `LEFT OUTER JOIN`) and `selectinload` (two queries with `WHERE id IN (...)`)?
5. **[Advanced]** When querying a 1-to-Many relationship with a large collection of child rows (e.g., 100 workspaces each containing 500 tasks), why can `joinedload` cause massive memory explosion (Cartesian product problem), and why is `selectinload` superior in this scenario?
6. **[Production]** When is `contains_eager()` used instead of `joinedload()`, and how does it allow you to filter child entities inside an eager load query?
7. **[Debugging]** Your API endpoint listing 50 tasks takes 800ms. Enabling SQL query logging reveals that 51 SQL queries were executed for a single HTTP request. How do you identify which attribute access triggered the 50 queries, and how do you fix it with a single query option?
8. **[Project]** In this project, when fetching a `Project` with all its `Sections` and `Tasks`, how are the queries structured in `project_service.py` to prevent N+1 overhead?

### Follow-up Questions
9. What is `raiseload` in SQLAlchemy, and why do senior engineers configure `lazy="raise"` on production models to prevent accidental N+1 queries in code reviews?
10. Does `joinedload` modify the result set of a query when using `offset()` and `limit()` on the parent entity? Why does SQLAlchemy emit a subquery warning when paginating with `joinedload`?

---

## 3.4 Connection Pooling & Engine Configuration

### Questions
1. **[Basic]** What is a Database Connection Pool, and why is creating a fresh TCP connection to PostgreSQL on every HTTP request unacceptably slow?
2. **[Basic]** What is `QueuePool` in SQLAlchemy?
3. **[Practical]** What do the engine parameters `pool_size`, `max_overflow`, `pool_timeout`, and `pool_recycle` configure?
4. **[Intermediate]** What does `pool_pre_ping=True` do, and what specific production issue (e.g., firewall dropping idle TCP connections after 15 minutes) does it solve?
5. **[Advanced]** If you run 4 backend container replicas, each configured with `pool_size=10` and `max_overflow=20`, what is the maximum theoretical number of concurrent connections your application can open against PostgreSQL?
6. **[Production]** If your PostgreSQL server has `max_connections = 100`, how would you distribute pool limits across web workers, background task workers, and migration jobs to prevent `FATAL: remaining connection slots are reserved for non-superuser connections`?
7. **[Debugging]** Under high load, your API begins throwing `TimeoutError: QueuePool limit of size 10 overflow 20 reached, connection timed out, timeout 30.00`. How do you determine whether this is caused by high traffic, connection leaks (unclosed sessions), or slow database queries holding connections too long?
8. **[Project]** What are the connection pool settings configured in `backend/app/core/db.py`, and how are they optimized for our Docker VPS environment?

### Follow-up Questions
9. What is the difference between client-side connection pooling (SQLAlchemy `QueuePool`) and server-side connection pooling (PgBouncer)? When is PgBouncer required?
10. What happens if a database failover occurs and existing pooled connections become stale? How does `pool_pre_ping` handle the reconnect transparently?

---

# 4. PostgreSQL 17

## 4.1 Architecture, MVCC & Storage Internals

### Questions
1. **[Basic]** What is Multi-Version Concurrency Control (MVCC) in PostgreSQL, and how does it achieve the principle that "readers never block writers, and writers never block readers"?
2. **[Basic]** What is Write-Ahead Logging (WAL) in PostgreSQL, and why is it essential for ACID durability and crash recovery?
3. **[Practical]** How do the hidden system columns `xmin` and `xmax` on every PostgreSQL row determine row visibility for concurrent transactions?
4. **[Intermediate]** What happens at the storage layer when you execute an `UPDATE` statement in PostgreSQL? Why is an update essentially an `INSERT` of a new row version and a soft-delete (`xmax` set) of the old row version?
5. **[Advanced]** What is Table Bloat and Index Bloat? How does the `VACUUM` and `autovacuum` process reclaim dead tuples, and what happens if a long-running transaction prevents `autovacuum` from cleaning dead rows?
6. **[Production]** What are the critical PostgreSQL server configuration parameters (`shared_buffers`, `work_mem`, `maintenance_work_mem`, `effective_cache_size`), and how should they be sized on a dedicated database server versus a shared 1GB VPS?
7. **[Debugging]** A database table with 100,000 rows takes up 500MB of disk space after a weekend of heavy updates. Running `SELECT count(*)` is extremely slow. How do you check for dead tuple accumulation, and what is the difference between running `VACUUM` versus `VACUUM FULL`?
8. **[Project]** In `docker-compose.prod.yml`, why does the `db` service specify `command: postgres -c shared_buffers=64MB -c max_connections=50 -c work_mem=4MB`?

### Follow-up Questions
9. Why does `VACUUM FULL` require an exclusive table lock (`ACCESS EXCLUSIVE`), and why is it dangerous to run during production business hours?
10. What is Transaction ID Wraparound in PostgreSQL, and how does aggressive autovacuum freeze old transaction IDs to prevent catastrophic data loss?

---

## 4.2 Isolation Levels & Concurrency Anomalies

### Questions
1. **[Basic]** What are the four ANSI SQL transaction isolation levels, and what is the default isolation level in PostgreSQL?
2. **[Basic]** Define the following concurrency anomalies: *Dirty Read*, *Non-Repeatable Read*, and *Phantom Read*.
3. **[Practical]** How do you explicitly set the isolation level for a transaction in PostgreSQL and SQLAlchemy?
4. **[Intermediate]** Can Dirty Reads ever occur in PostgreSQL even at the `READ UNCOMMITTED` isolation level? Why or why not?
5. **[Advanced]** What is *Serialization Anomaly / Write Skew*? Provide a concrete business logic scenario (e.g., two users booking the last available seat or doctors on call) where `REPEATABLE READ` fails to prevent data inconsistency and only `SERIALIZABLE` or explicit locking succeeds.
6. **[Production]** When using `SERIALIZABLE` isolation in PostgreSQL, what exception (`40001 serialization_failure`) must your application be engineered to handle, and how do you implement retry logic with exponential backoff?
7. **[Debugging]** Two concurrent requests read a workspace's task count (`count = 10`) and each independently insert a task because the limit is 11. Both transactions commit successfully, leaving 12 tasks in the workspace. Why did this happen under `READ COMMITTED` isolation, and how do you prevent it using locking or constraints?
8. **[Project]** In our multi-tenant task assignment and workspace member role updates, how do we ensure atomic updates without encountering race conditions?

### Follow-up Questions
9. What is the difference between Optimistic Concurrency Control (OCC using a version column) and Pessimistic Concurrency Control (PCC using row locks)?
10. How does PostgreSQL's SSI (Serializable Snapshot Isolation) detect read-write conflicts using `SIREAD` locks without actually blocking readers?

---

## 4.3 Indexing Strategies & Query Optimization

### Questions
1. **[Basic]** How does a standard B-Tree index work in PostgreSQL, and what is the time complexity of an indexed lookup versus a sequential scan?
2. **[Basic]** What is the Leftmost Prefix Rule for composite (multi-column) indexes? If an index is on `(workspace_id, status, priority)`, can a query filtering only on `status` use this index?
3. **[Practical]** How do you create a Partial Index in PostgreSQL (e.g., `CREATE INDEX idx_active_tasks ON tasks (user_id) WHERE status != 'completed'`), and what are the performance/storage benefits?
4. **[Intermediate]** What is Index Selectivity, and why will the PostgreSQL query planner choose a Sequential Scan (`Seq Scan`) over an Index Scan if a query matches 25% of the rows in a table?
5. **[Advanced]** What is an Index-Only Scan, and what role does the table's Visibility Map play in determining whether PostgreSQL can return data directly from the index without reading table heap pages?
6. **[Production]** Why should you always use `CREATE INDEX CONCURRENTLY` in production environments, and what happens if you create an index without `CONCURRENTLY` on a table with 5 million active rows?
7. **[Debugging]** An API endpoint querying `tasks` by `due_date` has an index on `due_date`, but `EXPLAIN ANALYZE` shows `Seq Scan on tasks`. You notice the query was written as `WHERE due_date + INTERVAL '1 day' > NOW()`. Why did the index fail to trigger, and how do you rewrite it?
8. **[Project]** In our database schema, what indexes exist on foreign keys (`workspace_id`, `project_id`, `task_id`), and why is indexing foreign keys critical for `ON DELETE CASCADE` performance?

### Follow-up Questions
9. What is the difference between a B-Tree index, a GIN (Generalized Inverted Index) index, and a GiST index in PostgreSQL? When would you use GIN?
10. What does `ANALYZE` (or `VACUUM ANALYZE`) do to table statistics in `pg_statistic`, and why can outdated table statistics cause the query planner to choose disastrously slow execution plans?

---

## 4.4 Explicit Locking, Deadlocks & Primary Keys

### Questions
1. **[Basic]** What is a Deadlock in a database, and how does PostgreSQL detect and break deadlocks?
2. **[Basic]** What is the difference between `SELECT ... FOR UPDATE` and `SELECT ... FOR SHARE`?
3. **[Practical]** How do you use `SELECT ... FOR UPDATE SKIP LOCKED` to implement a high-throughput, concurrent task-worker queue without lock contention?
4. **[Intermediate]** If Transaction 1 updates Task A then Task B, while Transaction 2 updates Task B then Task A simultaneously, what will happen? How do you prevent this programmatically in backend service code?
5. **[Advanced]** What are the engineering trade-offs of using UUIDv4 vs. UUIDv7 vs. auto-incrementing BigInt as primary keys in PostgreSQL? Explain the B-Tree page fragmentation and cache eviction problems caused by random UUIDv4 keys at scale.
6. **[Production]** How do you safely alter a column type or add a `NOT NULL` constraint on a large production table without acquiring an `ACCESS EXCLUSIVE` lock that blocks all incoming reads and writes?
7. **[Debugging]** Your application logs show frequent `asyncpg.exceptions.DeadlockDetectedError: deadlock detected`. What PostgreSQL log settings (`log_lock_waits`, `deadlock_timeout`) would you enable to capture the competing SQL statements and lock targets?
8. **[Project]** In this project, all entities use UUID primary keys (`id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)`). Why was UUID chosen over integer IDs for a multi-tenant SaaS application?

### Follow-up Questions
9. What is the lock escalation behavior in PostgreSQL compared to Microsoft SQL Server or Oracle? Does PostgreSQL ever escalate row locks to table locks automatically?
10. What is `NOWAIT` in `SELECT ... FOR UPDATE NOWAIT`, and when should you use it to prevent request threads from hanging on locked rows?

---

# 5. Alembic (Database Migrations)

## 5.1 Migration Architecture & Workflow

### Questions
1. **[Basic]** What is Alembic, and what is the role of the `alembic_version` table in the target database?
2. **[Basic]** What are the roles of `alembic.ini` and `env.py` in an Alembic migration setup?
3. **[Practical]** How do you generate an autogenerated migration script, and why should an engineer NEVER commit an autogenerated migration without manual review?
4. **[Intermediate]** What specific schema changes can Alembic's `--autogenerate` reliably detect, and what changes does it typically miss or misinterpret (e.g., column renames, enum type alterations, table renames, check constraints)?
5. **[Advanced]** How do you resolve a "Multiple Heads" conflict in Alembic when two developers independently create and merge migration revisions from the same base?
6. **[Production]** Why should database migrations in production be executed from a single, dedicated release step or prestart container rather than during the initialization of multiple web server worker processes?
7. **[Debugging]** A migration script failed halfway through execution with an SQL syntax error. The database is now in a partially upgraded state, and subsequent `alembic upgrade head` commands fail with `Target database is not up to date`. How do you safely repair the schema and synchronize the `alembic_version` table?
8. **[Project]** In this project, how does `backend/app/alembic/env.py` configure `target_metadata` to link SQLModel table definitions with Alembic?

### Follow-up Questions
9. What is the difference between running Alembic in "online" mode versus "offline" mode (`--sql`), and when is offline mode required in enterprise CI/CD environments?
10. How do you write a custom data-migration script in Alembic (e.g., populating a new column based on existing data) using `op.bulk_insert` or raw execution within the migration transaction?

---

## 5.2 Zero-Downtime Migration Strategies

### Questions
1. **[Basic]** What does "Zero-Downtime Migration" mean, and why is running `alembic upgrade head` while older application versions are actively handling user traffic hazardous?
2. **[Practical]** Explain the four phases of the **Expand and Contract (Parallel Run)** migration pattern.
3. **[Intermediate]** If you need to rename a column from `full_name` to `name` on a production table with zero downtime, what is the exact step-by-step deployment sequence across migrations and application code deployments?
4. **[Advanced]** How do you safely add a `NOT NULL` constraint to an existing column with 10 million rows in PostgreSQL without locking the table for several minutes? (Explain `CHECK (...) NOT VALID` and `VALIDATE CONSTRAINT`).
5. **[Production]** How do you safely drop a deprecated column in a high-traffic production system without breaking running backend instances that may still have cached SQL queries referencing the column?
6. **[Debugging]** During a deployment, a migration adding a column with a server default `ALTER TABLE tasks ADD COLUMN priority VARCHAR DEFAULT 'medium'` locks the table and causes all API requests to time out. Why did this happen in older PostgreSQL versions, and how does PostgreSQL 11+ handle defaults on new columns differently?
7. **[Project]** How does `scripts/prestart.sh` in this project ensure that database migrations finish executing before the backend service starts accepting incoming HTTP traffic?

### Follow-up Questions
8. Why should you never use `op.drop_table()` or `op.drop_column()` in a `downgrade()` function without considering data recovery?
9. How do you test rollback (`alembic downgrade -1`) safely in a staging environment before deploying to production?

---

# 6. Redis 5.0+ (Caching, Locking & Stampede Prevention)

## 6.1 Redis Architecture & In-Memory Fundamentals

### Questions
1. **[Basic]** What is Redis, and why is it categorized as an in-memory, single-threaded data structure store?
2. **[Basic]** Since Redis execution is single-threaded, how does it process tens of thousands of operations per second without CPU saturation?
3. **[Practical]** What are the core Redis data types (Strings, Hashes, Lists, Sets, Sorted Sets), and what is a practical backend use case for each?
4. **[Intermediate]** What is the difference between Redis RDB (point-in-time snapshots) and AOF (Append-Only File) persistence? What are the trade-offs between write durability and recovery speed?
5. **[Advanced]** What are Redis eviction policies (`allkeys-lru`, `volatile-lru`, `allkeys-lfu`, `noeviction`), and which policy should be configured when Redis is used strictly as a cache versus a message broker?
6. **[Production]** Why is executing the `KEYS *` command in a production Redis instance considered an operational disaster, and what cursor-based command should be used instead?
7. **[Debugging]** Redis memory usage reaches its 50MB limit and starts returning `OOM command not allowed when used memory > 'maxmemory'`. How do you identify which key namespaces are consuming the most memory?
8. **[Project]** In this project, how is Redis configured in `backend/app/core/redis_client.py` and `docker-compose.prod.yml`? What memory limits and decoding parameters are applied?

### Follow-up Questions
9. What is Redis Pipelining, and how does it reduce network round-trip time (RTT) when issuing multiple read/write commands?
10. How does Redis expire keys in the background (passive vs. active expiration)?

---

## 6.2 Caching Strategies, Invalidation & Key Design

### Questions
1. **[Basic]** What is the **Cache-Aside (Lazy Loading)** pattern, and what are its advantages and disadvantages compared to Write-Through caching?
2. **[Basic]** Why must every cached key in Redis almost always have a TTL (Time-To-Live) set?
3. **[Practical]** How do you design a structured, collision-free key naming convention for a multi-tenant SaaS application?
4. **[Intermediate]** How do you cache complex database queries with pagination and filters (e.g., `/tasks?status=in_progress&page=2&assignee=xyz`)? How do you generate a deterministic cache key from arbitrary request parameters?
5. **[Advanced]** How do you implement namespace-wide cache invalidation (e.g., invalidating all cached task queries for a specific project when a single task is updated) without clearing the entire Redis database?
6. **[Production]** What is the trade-off between fine-grained cache invalidation (purging only specific entity keys) and coarse-grained cache invalidation (purging all queries for a module), and how do you prevent stale reads?
7. **[Debugging]** A user updates their profile name from "Alice" to "Alicia". The update succeeds in PostgreSQL, but when they refresh their dashboard, their old name "Alice" is still displayed. List the 3 most common caching bugs that cause this behavior.
8. **[Project]** In `backend/app/core/redis_client.py`, how do `_hash_payload`, `query_key_generator`, and `entity_key_generator` work? How is `APP_PREFIX` and `CACHE_VERSION` used to prevent cache poisoning across deployments?

### Follow-up Questions
9. What is the impact of JSON serialization/deserialization CPU overhead when caching very large lists in Redis, and when should you store data as Redis Hashes instead of JSON strings?
10. What is "Dual-Writing", and why can updating the database and cache without a transaction lead to permanent cache inconsistency?

---

## 6.3 Concurrency Control, Distributed Locks & Failure Scenarios

### Questions
1. **[Basic]** What is a Cache Stampede (also known as the Thundering Herd or Cache Breakdown problem)?
2. **[Basic]** What is the difference between Cache Penetration, Cache Breakdown, and Cache Avalanche?
3. **[Practical]** How do you implement a distributed lock in Redis using `SET key value NX EX`? What do `NX` and `EX` signify?
4. **[Intermediate]** Why is the "Double-Checked Locking" pattern necessary when using a distributed lock to protect an expensive database query during a cache miss?
5. **[Advanced]** What is the "Lock Release Race Condition" where Worker A takes longer than the lock TTL, the lock auto-expires, Worker B acquires the lock, and Worker A finishes and deletes Worker B's lock? How do you prevent this using unique lock tokens and Lua scripts?
6. **[Production]** What is **Graceful Degradation** in caching? If the Redis container crashes or network connectivity is severed, how should your backend application handle the failure without returning 500 errors to end users?
7. **[Debugging]** Under high concurrent traffic, 200 requests for an expired cache key arrive simultaneously. Instead of 1 query hitting the database, all 200 hit PostgreSQL, causing database CPU to spike to 100%. Looking at your caching decorator, how would you diagnose why the mutex lock failed to throttle the thundering herd?
8. **[Project]** Analyze the `@redis_cache` decorator in `backend/app/core/redis_client.py`. How does it acquire locks, retry on contention, double-check cache existence, and gracefully fall back to the database on Redis errors?

### Follow-up Questions
9. What is Probabilistic Early Expiration (XFetch algorithm), and how does it prevent cache stampedes without using explicit distributed locks?
10. What is Redlock, and why has its safety been debated in distributed systems literature for multi-node Redis clusters?

---

# 7. Security, Authentication & Authorization

## 7.1 Cryptography, Password Hashing & JWT Architecture

### Questions
1. **[Basic]** Why should user passwords NEVER be encrypted using reversible encryption (AES/RSA) and MUST instead be hashed using a salted, slow cryptographic hash function?
2. **[Basic]** How does Bcrypt work, what is a "Salt", and what is the purpose of the "Work Factor / Cost Parameter"?
3. **[Practical]** What are the three parts of a JSON Web Token (JWT), and what is contained in each part?
4. **[Intermediate]** What is the mathematical difference between symmetric JWT signing (`HS256` with a shared secret) and asymmetric JWT signing (`RS256` with public/private key pairs)? When should you use RS256?
5. **[Advanced]** What is a Timing Attack in password verification or token validation? How does `secrets.compare_digest()` prevent timing attacks compared to standard string equality (`==`)?
6. **[Production]** Why should sensitive information (such as passwords, internal permissions, or social security numbers) NEVER be stored in the JWT payload (claims)?
7. **[Debugging]** A security audit flags your API for using `jwt.decode(token, verify=False)` or accepting `alg: "none"` in the JWT header. How does an attacker exploit the `alg: none` vulnerability to forge superuser tokens, and how do modern libraries prevent it?
8. **[Project]** In `backend/app/core/security.py`, how are `pwd_context` (Passlib CryptContext) and `create_access_token` (PyJWT) implemented? What algorithm and token expiration are configured?

### Follow-up Questions
9. If your database of bcrypt password hashes is leaked, how does a high work factor (e.g., cost = 12) protect user passwords against modern GPU-based cracking clusters?
10. What are standard registered JWT claims (`sub`, `exp`, `nbf`, `iat`, `iss`, `aud`), and how does FastAPI's OAuth2 implementation validate them?

---

## 7.2 Stateless JWT Revocation & Session Management

### Questions
1. **[Basic]** What is the inherent trade-off of using stateless JWTs: why is it difficult to immediately log out a user or revoke a token before its `exp` timestamp passes?
2. **[Practical]** How can you implement an instantaneous token revocation / logout mechanism using Redis? What should the Redis key TTL be set to when blacklisting a token?
3. **[Intermediate]** What is the **Token Version / Token Epoch** pattern for global session revocation (e.g., "Log out of all devices" after password reset)? How does it work without storing individual revoked JWTs in Redis?
4. **[Advanced]** What is the **Short-Lived Access Token + Rotating Refresh Token** pattern? How does refresh token rotation detect and mitigate token theft?
5. **[Production]** Where should JWTs be stored on the frontend client (e.g., `HttpOnly; Secure; SameSite=Strict` cookies vs. `localStorage`), and what are the specific XSS vs. CSRF vulnerabilities of each approach?
6. **[Debugging]** A user changes their password because their account was compromised. However, an attacker who previously stole an access token is still making authenticated API requests for the next 8 days. How do you redesign your auth layer to invalidate all existing access tokens immediately upon password change?
7. **[Project]** What is the access token expiration time configured in `backend/app/core/config.py` (`ACCESS_TOKEN_EXPIRE_MINUTES`), and what are the security trade-offs of this duration?

### Follow-up Questions
8. How does a Sliding Session work with JWTs, and how can you refresh a user's session without requiring them to re-enter credentials every 15 minutes?
9. What is the impact on database read load if your auth dependency queries the `users` table on every single incoming API request to verify `is_active`? How can Redis caching mitigate this?

---

## 7.3 Multi-Tenant RBAC & Authorization Enforcement

### Questions
1. **[Basic]** What is Role-Based Access Control (RBAC), and how does it differ from Attribute-Based Access Control (ABAC)?
2. **[Basic]** What is BOLA (Broken Object Level Authorization) / IDOR (Insecure Direct Object Reference), and why is it consistently ranked #1 on the OWASP API Security Top 10?
3. **[Practical]** How do you structure a multi-tenant authorization policy check in Python to ensure a user cannot read or mutate resources outside of their assigned workspace?
4. **[Intermediate]** Why is relying on UI-level role checks (e.g., hiding the "Delete Project" button in React) completely useless for security if the backend endpoint does not independently enforce the check?
5. **[Advanced]** How do you prevent BOLA/IDOR at the database query layer rather than checking permissions in application code after fetching the object? (Explain: `WHERE id = :task_id AND workspace_id = :current_user_workspace_id`).
6. **[Production]** In a hierarchical permissions system (`Workspace` $\rightarrow$ `Project` $\rightarrow$ `Task`), how do you model and evaluate permissions efficiently when a user is an `Admin` in Workspace A, but only a `Member` with read-only access in Project B within Workspace A?
7. **[Debugging]** A user with `Member` role discovers that by sending a `PUT /api/v1/workspaces/{id}/members/{user_id}` request with `role: "owner"`, they can promote themselves to Workspace Owner because the endpoint checked only that the caller was a workspace member, not an owner. How do you refactor the authorization policy to prevent privilege escalation?
8. **[Project]** In `backend/app/services/auth_policy.py` and `backend/app/api/routes/workspaces.py`, how are role permissions (`Owner`, `Admin`, `Member`, `Superuser`) evaluated before allowing workspace member modifications, project deletions, or task assignments?

### Follow-up Questions
9. What is the difference between an authorization failure returning `401 Unauthorized` versus `403 Forbidden` versus `404 Not Found`? When should you intentionally return `404 Not Found` for an unauthorized resource to prevent resource enumeration?
10. How do you unit test and integration test authorization policies to guarantee that every single endpoint enforces role boundaries across different tenants?

---

# 8. Logging & Observability (Structlog, Promtail, Loki, Grafana, Sentry)

## 8.1 Structured Logging & Context Propagation

### Questions
1. **[Basic]** Why is structured JSON logging superior to unstructured plaintext logging in production environments?
2. **[Basic]** What is a Correlation ID / Request ID, and why is it essential for debugging distributed systems and microservices?
3. **[Practical]** How do you use Python's standard `contextvars` module to store and propagate request-scoped metadata (like correlation IDs and user IDs) across asynchronous tasks without thread-local storage leaks?
4. **[Intermediate]** How does `structlog` process log events through a pipeline of processors (e.g., timestamping, adding log levels, formatting exception tracebacks, JSON rendering)?
5. **[Advanced]** How do you bridge standard library logging (e.g., logs emitted by Uvicorn, SQLAlchemy, Boto3) into your `structlog` pipeline using `ProcessorFormatter` so that 100% of application output is unified JSON?
6. **[Production]** Why must `structlog.contextvars.clear_contextvars()` always be called in a middleware `finally` block when running on asynchronous ASGI servers? What happens if you forget to clear context variables?
7. **[Debugging]** During an outage, your logs are flooded with duplicate log lines (each log message printed 3 times with identical timestamps). What configuration mistake in Python's root logger handlers and propagation settings causes duplicate log emission?
8. **[Project]** Walk through `backend/app/core/logging.py`. How does `setup_logging()` prevent duplicate handler registration using `_CONFIGURED`, and how does `RotatingFileHandler` prevent disk space exhaustion?

### Follow-up Questions
9. What is the difference between `logger.exception("message")` and `logger.error("message")` in terms of stack trace capture?
10. How do you configure log levels dynamically via environment variables so you can toggle `DEBUG` logging in staging without changing code?

---

## 8.2 Log Aggregation (Loki, Promtail) & Metrics (Grafana)

### Questions
1. **[Basic]** What is the architecture of the Grafana Loki logging stack, and what are the respective roles of Promtail, Loki, and Grafana?
2. **[Basic]** How does Loki differ fundamentally from Elasticsearch in terms of indexing strategy and memory consumption?
3. **[Practical]** How do you write a LogQL query in Grafana to filter logs for a specific service, extract JSON fields, and find all requests that returned a status code $\ge 500$?
4. **[Intermediate]** What is the **High-Cardinality Label Trap** in Grafana Loki? Why will adding `user_id`, `request_id`, or `ip_address` as a Loki stream label crash the Loki server, and where should those fields be placed instead?
5. **[Advanced]** How does Promtail scrape Docker container logs via `/var/run/docker.sock` and parse multiline exception stack traces into a single log entry?
6. **[Production]** How do you construct Grafana dashboards and alerting rules (e.g., trigger an alert if 5xx error rate exceeds 1% over a 5-minute rolling window) using LogQL metrics queries like `rate(...)`?
7. **[Debugging]** A customer reports that their task creation failed with a 500 error 10 minutes ago, providing `X-Correlation-ID: 7a8b9c...`. How would you use LogQL in Grafana to find the exact line of Python code and stack trace that caused the failure?
8. **[Project]** In `docker-compose.prod.yml` and `docker/promtail/promtail-config.yml`, how is the log volume shared between the FastAPI container, Promtail, and Loki?

### Follow-up Questions
9. What is Log Retention in Loki, and how do you configure table manager / retention policies to automatically delete logs older than 30 days?
10. How does Sentry complement Loki, and why is Sentry better suited for exception grouping and release regression tracking while Loki is suited for broad log querying?

---

# 9. Cloud Object Storage (AWS S3 & Boto3)

## 9.1 S3 Architecture, Boto3 SDK & File Uploads

### Questions
1. **[Basic]** What is Object Storage, and how does it differ fundamentally from Block Storage (EBS) and File Storage (EFS/NFS)?
2. **[Basic]** What is an S3 Bucket, an Object Key, and Object Metadata?
3. **[Practical]** How do you upload a file stream to S3 using `boto3.client('s3').upload_fileobj()` with explicit `ContentType` (MIME type) headers?
4. **[Intermediate]** What is the security and scalability trade-off between:
   * **Approach A:** Frontend uploads file to FastAPI backend $\rightarrow$ Backend uploads file to S3.
   * **Approach B:** Frontend requests presigned URL from Backend $\rightarrow$ Frontend uploads file directly to S3.
5. **[Advanced]** Why is Boto3's `boto3.client()` thread-safe, whereas creating a `boto3.resource()` or sharing a `boto3.Session()` across threads can cause race conditions?
6. **[Production]** How do you structure S3 object keys in a multi-tenant application to ensure tenant isolation, prevent naming collisions, and support prefix-based lifecycle deletion policies?
7. **[Debugging]** When users download PDF attachments uploaded through your API, the browser downloads the file as a generic `octet-stream` without an extension rather than opening it inline. What missing S3 metadata header (`ContentType` / `ContentDisposition`) caused this?
8. **[Project]** In `backend/app/core/s3.py`, how are `get_s3_client`, `upload_file_to_s3`, and `delete_file_from_s3` implemented? How does the application handle scenarios where AWS credentials are not configured?

### Follow-up Questions
9. What is S3 Multipart Upload, and at what file size threshold (e.g., >100MB) should you switch from single-part upload to multipart upload?
10. How do S3 Lifecycle Rules allow you to automatically transition older task attachments to S3 Infrequent Access (IA) or Glacier to save storage costs?

---

## 9.2 Presigned URLs & Orphaned File Lifecycle

### Questions
1. **[Basic]** What is an S3 Presigned URL, and how does it use cryptographic signatures (AWS Signature Version 4) to grant temporary access without making the S3 bucket public?
2. **[Practical]** How do you generate a presigned download URL with a 1-hour expiration time using `boto3`?
3. **[Intermediate]** How do you generate a presigned *upload* (PUT/POST) URL that restricts the client to uploading a specific file size and MIME type?
4. **[Advanced]** What is the **Orphaned File Problem** in object storage? (e.g., File is uploaded to S3, but the subsequent database transaction creating the `Attachment` record fails or times out). How do you prevent accumulation of unreferenced files in S3?
5. **[Production]** When a user deletes a Task or an entire Workspace in PostgreSQL, how do you handle the deletion of associated S3 files? Should S3 deletion occur synchronously inside the DB request or asynchronously via a background task?
6. **[Debugging]** A presigned S3 URL generated by your backend returns `403 SignatureDoesNotMatch` when accessed by the frontend. What are the common causes (e.g., system clock skew, URL-encoding issues, region mismatch)?
7. **[Project]** In `backend/app/api/routes/attachments.py`, how are file uploads and presigned URL downloads handled when tasks have attachments?

### Follow-up Questions
8. Why should S3 bucket CORS policies be strictly configured when clients upload files directly via presigned URLs?
9. How can S3 Event Notifications (triggering AWS Lambda or SNS/SQS) be used to automatically generate image thumbnails or scan uploaded files for malware?

---

# 10. Testing Infrastructure (Pytest, TestClient, Fixtures)

## 10.1 Fixture Architecture, Scoping & Isolation

### Questions
1. **[Basic]** What is Pytest, and how do Pytest fixtures improve upon standard `unittest.TestCase` setup/teardown methods?
2. **[Basic]** What are the different Pytest fixture scopes (`function`, `class`, `module`, `package`, `session`), and what are the lifecycle rules of each?
3. **[Practical]** How do you write a `yield` fixture in Pytest that sets up a clean database session and automatically tears it down / rolls back after the test executes?
4. **[Intermediate]** What are the architectural trade-offs between testing against an in-memory SQLite database versus a real containerized PostgreSQL instance? What Postgres-specific features fail silently when tested on SQLite?
5. **[Advanced]** How do you implement **Transaction-Rollback Test Isolation** in SQLAlchemy, where each test runs inside a nested transaction (savepoint) and rolls back on completion, avoiding the overhead of dropping and re-creating tables between tests?
6. **[Production]** How do you configure Pytest to execute tests in parallel across multiple CPU cores using `pytest-xdist` without database race conditions?
7. **[Debugging]** You run your test suite: Test A passes when run alone, but fails when the entire suite runs because Test B mutated database state. How do you diagnose and fix shared state pollution across tests?
8. **[Project]** In `backend/app/tests/conftest.py`, what fixtures are provided for database sessions, superuser tokens, and standard user authentication?

### Follow-up Questions
9. What does the `autouse=True` parameter do on a fixture, and why should it be used sparingly?
10. How do you use `pytest.mark.parametrize` to run a single test function against 10 different input/output boundary cases?

---

## 10.2 Mocking, Dependency Overrides & Coverage

### Questions
1. **[Basic]** What is the difference between a Mock, a Stub, and a Fake in backend testing?
2. **[Basic]** How does FastAPI's `app.dependency_overrides` dictionary allow you to inject mock services during integration tests?
3. **[Practical]** How do you mock an external network call (e.g., Redis client, Brevo SMTP email dispatch, or AWS S3 upload) using `unittest.mock.patch`?
4. **[Intermediate]** How do you write an integration test using `httpx.AsyncClient` or FastAPI's `TestClient` to verify that an endpoint returns `403 Forbidden` when a non-admin attempts to delete a project?
5. **[Advanced]** Why is over-mocking dangerous in integration tests, and how do you determine the boundary between what should be mocked (external third-party APIs) and what should run real code (ORM, database, validation schemas)?
6. **[Production]** How do you configure `pytest-cov` and `.coveragerc` to enforce branch coverage thresholds and generate HTML coverage reports in CI/CD pipelines?
7. **[Debugging]** An integration test for a protected route passes in local development, but in CI it fails with `401 Unauthorized` because the mock JWT secret or database seed was not loaded. How do you ensure environment variables in `conftest.py` are hermetic?
8. **[Project]** Review the testing guide in `docs/pytest-project-testing-guide.md`. What testing conventions and assertion patterns are enforced in this repository?

### Follow-up Questions
9. What is the difference between testing with `TestClient` (which runs synchronous WSGI/ASGI in-process transport) and testing against a live running server over real HTTP?
10. How do you assert that a specific background task or log message was emitted during an endpoint test execution?

---

# 11. Containerization & Edge Routing (Docker, Compose, Traefik)

## 11.1 Multi-Stage Dockerfile & Image Optimization

### Questions
1. **[Basic]** What is the difference between a Docker Image and a Docker Container?
2. **[Basic]** What is the Docker Build Cache, and why should `COPY pyproject.toml` come *before* `COPY . /app` in a Dockerfile?
3. **[Practical]** What is a Multi-Stage Docker Build, and how does it reduce the final production container image size?
4. **[Intermediate]** What are the security and operational differences between running containers as `root` versus a dedicated non-root user (`USER appuser`)?
5. **[Advanced]** What are the differences between Debian slim images (`python:3.12-slim`) and Alpine Linux images (`python:3.12-alpine`) for Python backends? Why can Alpine's `musl libc` cause slower execution and compilation issues with C-extensions (like `bcrypt` or `psycopg`) compared to `glibc`?
6. **[Production]** How do you handle container graceful shutdown when Docker sends a `SIGTERM` signal? Why is using `exec uvicorn ...` necessary in entrypoint shell scripts to ensure PID 1 signal forwarding?
7. **[Debugging]** Your backend container takes 8 minutes to build in CI because dependencies are reinstalled on every commit, even when `pyproject.toml` hasn't changed. How do you fix the Dockerfile layer ordering and cache mount settings?
8. **[Project]** In this project's backend Dockerfile, how is the `uv` package manager utilized to build dependencies, and how is the final runtime stage constructed?

### Follow-up Questions
9. What is a `.dockerignore` file, and what sensitive files (`.env`, `.git`, `__pycache__`, `.venv`) must always be excluded from build contexts?
10. What does the `HEALTHCHECK` instruction in a Dockerfile do, and how does the Docker daemon monitor container health?

---

## 11.2 Edge Routing, SSL & Traefik Reverse Proxy

### Questions
1. **[Basic]** What is a Reverse Proxy, and how does it differ from a Forward Proxy?
2. **[Basic]** What is Traefik, and how does it differ from traditional reverse proxies like Nginx or HAProxy in containerized environments?
3. **[Practical]** How does Traefik use Docker Labels on containers (`traefik.http.routers.backend.rule=Host('api.domain.com')`) for dynamic service discovery and routing without manual configuration reloads?
4. **[Intermediate]** How does Traefik automate SSL/TLS certificate generation and renewal using Let's Encrypt and the ACME HTTP-01 challenge?
5. **[Advanced]** How does Traefik handle HTTP-to-HTTPS redirection globally using entrypoint redirection or router middleware?
6. **[Production]** What is the network architecture of the `traefik-public` external Docker network? Why are database and cache containers kept on an isolated internal network inaccessible to Traefik?
7. **[Debugging]** A newly deployed service returns `502 Bad Gateway` through Traefik. The container is running and healthy. What are the top 3 configuration checks (e.g., `traefik.docker.network`, `loadbalancer.server.port`, container port exposure)?
8. **[Project]** In `docker-compose.prod.yml` and `docker-compose.traefik.yml`, analyze the routing labels for `frontend`, `backend`, `adminer`, and `grafana`. How is basic authentication applied to Adminer via Traefik middleware?

### Follow-up Questions
9. What is the difference between Traefik Routers, Middlewares, and Services?
10. How does Traefik perform health checks on backend container instances before routing live traffic to them?

---

## 11.3 Docker Compose Orchestration & Production Operations

### Questions
1. **[Basic]** What is Docker Compose, and what is the difference between `docker-compose.yml`, `docker-compose.override.yml`, and `docker-compose.prod.yml`?
2. **[Basic]** What is the difference between a Named Docker Volume and a Bind Mount? Which one should be used for database storage in production?
3. **[Practical]** How do you configure memory and CPU limits (`deploy.resources.limits`) in Docker Compose to prevent a runaway container from crashing the host VPS?
4. **[Intermediate]** Why is `depends_on: [db]` insufficient to prevent backend startup crashes, and how do you configure `condition: service_healthy` with a `pg_isready` healthcheck?
5. **[Advanced]** How does Docker container logging with the `json-file` driver cause disk exhaustion if `max-size` and `max-file` options are omitted?
6. **[Production]** What is the exact sequence of commands to execute a zero-downtime or minimal-downtime deployment using `docker compose pull`, `docker compose up -d --remove-orphans`, and prestart migration checks?
7. **[Debugging]** PostgreSQL inside Docker crashes unexpectedly during peak load. Running `docker inspect db` shows `ExitCode: 137`. What does Exit Code 137 mean (OOM Killer), and how do you resolve it?
8. **[Project]** Review the entire `docker-compose.prod.yml` in this repository. Explain the dependency chain: `db` $\rightarrow$ `prestart` $\rightarrow$ `backend` and `redis` $\rightarrow$ `backend`.

### Follow-up Questions
9. What is the difference between `docker compose down` and `docker compose stop`? Why will running `docker compose down -v` destroy your production database?
10. How does Docker's internal DNS resolver (`127.0.0.11`) resolve container service names (e.g., `http://backend:8000`) across shared networks?

---

# 12. Resilience, Background Tasks & Utilities

## 12.1 Retry Strategies with Tenacity & Fault Tolerance

### Questions
1. **[Basic]** What is Exponential Backoff with Jitter, and why is retrying failed operations immediately in a tight loop harmful to recovering services?
2. **[Basic]** What is the Tenacity library in Python?
3. **[Practical]** How do you decorate a function with `@retry` in Tenacity to retry up to 5 times with exponential backoff only when a specific exception (e.g., `psycopg.OperationalError`) is raised?
4. **[Intermediate]** What is the Circuit Breaker pattern, and how does it prevent an application from continuously executing doomed requests against a failing downstream dependency?
5. **[Advanced]** How do you prevent retry storms when hundreds of concurrent backend requests all retry failed database queries simultaneously?
6. **[Production]** How do you ensure that operations wrapped in retry decorators are **Idempotent** so that partial failures do not result in duplicate records (e.g., charging a card twice or inserting duplicate tasks)?
7. **[Debugging]** A backend startup script using Tenacity hangs indefinitely during a deployment because the retry stop condition was omitted. How do you configure `stop_after_attempt` or `stop_after_delay`?
8. **[Project]** In `backend/app/backend_pre_start.py`, how is Tenacity used to verify database connectivity before initiating Alembic migrations?

### Follow-up Questions
9. What is the difference between `retry_if_exception_type` and `retry_if_result` in Tenacity?
10. How do you log every retry attempt with `structlog` to track transient network instability?

---

## 12.2 Transactional Email & HTML Templating (Jinja2, SMTP)

### Questions
1. **[Basic]** How does SMTP communication work, and what is the difference between port 587 (STARTTLS) and port 465 (SSL/TLS)?
2. **[Basic]** What is Jinja2, and how does it render HTML email templates with dynamic variables?
3. **[Practical]** How do you configure Jinja2 template auto-escaping to prevent Cross-Site Scripting (XSS) attacks in HTML emails when inserting user-generated text?
4. **[Intermediate]** Why should email dispatch NEVER be executed synchronously within the HTTP request/response cycle of a web API?
5. **[Advanced]** What is the **Transactional Outbox Pattern**, and how does it guarantee that a user registration database commit and an invitation email dispatch remain strictly consistent even if the mail server or application crashes?
6. **[Production]** How do you handle email deliverability issues, bounce handling, and rate limits when sending transactional emails via Brevo, SendGrid, or AWS SES?
7. **[Debugging]** Users report that email verification links in invitation emails are rendering as broken plaintext or escaping URL query parameters incorrectly. How do you debug the Jinja2 template rendering context?
8. **[Project]** In `backend/app/utils.py` and `backend/app/email-templates/`, how are email templates loaded, rendered, and dispatched?

### Follow-up Questions
9. What are SPF, DKIM, and DMARC DNS records, and why will transactional emails land in spam folders without them?
10. How do you mock email dispatch in local development and testing environments using tools like MailHog or local console output?

---

# 13. Project-Level Mock Interview

*These difficult, cross-cutting scenarios test whether you can synthesize multiple technologies and defend the architectural decisions of the **DOit** (`doit-prod`) platform under senior engineering interview conditions.*

---

### Scenario 1: Multi-Tenant Data Isolation & BOLA Breach Prevention
> **Interviewer:** *"Walk me through the lifecycle of a request to `DELETE /api/v1/projects/{project_id}`. A malicious user who is a valid Member of Workspace A obtains the UUID of a Project in Workspace B. Trace the execution path through Traefik, Middleware, FastAPI Dependencies, the Service Layer, and PostgreSQL. At what exact layer is the attack thwarted, what status code is returned, what query is executed, and what log is emitted to Grafana Loki?"*

#### Follow-up Probing Questions:
* If the developer wrote `session.get(Project, project_id)` and checked permissions in Python afterwards, why is that inferior to enforcing tenant boundary filtering directly in the SQL `WHERE` clause?
* How does your authorization policy differentiate between a Workspace Owner, a Workspace Admin, and a regular Member attempting this deletion?
* What happens to all the Sections, Tasks, Comments, and Attachments belonging to that Project in PostgreSQL when the delete succeeds? Explain foreign key cascade mechanics.

---

### Scenario 2: High-Concurrency Cache Stampede & Redis Outage
> **Interviewer:** *"Your system is experiencing a sudden traffic spike: 2,000 concurrent requests arrive for the task list of a popular project right as the Redis cache key expires. Concurrently, the Redis container runs out of memory and crashes. Explain in detail how your backend architecture prevents this traffic spike from bringing down PostgreSQL, and how your code gracefully degrades."*

#### Follow-up Probing Questions:
* Explain the step-by-step mechanics of how the `@redis_cache` decorator's distributed lock (`SET NX EX`) and double-checked locking throttle the 2,000 requests.
* When Redis crashes and raises `sync_redis.RedisError`, what try/except block catches it, and why does the application continue serving requests instead of returning HTTP 500?
* How is your PostgreSQL connection pool sized in `db.py` to ensure that even if multiple requests hit the database, the server does not run out of connection slots?

---

### Scenario 3: Zero-Downtime Database Schema Migration Under Load
> **Interviewer:** *"You have 5 million tasks in production. You need to split the `title` column into `title` and `short_code` (which must be `NOT NULL` and `UNIQUE`), and remove a deprecated `is_archived` boolean column. Walk me through the complete zero-downtime migration lifecycle using Alembic, Docker Compose, and CI/CD without dropping a single user request or locking tables."*

#### Follow-up Probing Questions:
* Why would running a naive `ALTER TABLE tasks ADD COLUMN short_code VARCHAR NOT NULL` fail immediately?
* Explain the Expand/Contract deployment phases: how many separate pull requests and migrations are required?
* How does `scripts/prestart.sh` and Docker Compose's `condition: service_completed_successfully` ensure that migrations finish before the new web containers start accepting traffic?

---

### Scenario 4: Live Production Incident Triage via Observability Stack
> **Interviewer:** *"A customer reports that their team is intermittently receiving `500 Internal Server Error` when uploading attachments to tasks. You open Grafana. Walk me through your exact live debugging workflow using LogQL, Promtail, Structlog correlation IDs, and Sentry to isolate the root cause within 5 minutes."*

#### Follow-up Probing Questions:
* What exact LogQL query do you type into Grafana to filter for status 500 errors on the backend container over the last 15 minutes?
* Once you extract the `correlation_id` from the error log, how do you query Loki to view the entire request lifecycle from middleware entry to failure?
* If the root cause is an expired AWS IAM credential in Boto3, where will that exception be caught, how will it be formatted in JSON, and what alert would fire?

---

### Scenario 5: Asynchronous Concurrency Pitfalls & Event Loop Starvation
> **Interviewer:** *"A junior engineer submits a pull request adding an AI summary feature. Inside an `async def get_project_summary(...)` endpoint, they used `requests.post(...)` to call the Groq LLM API, and standard `time.sleep(2)` for retries. What happens to the entire DOit backend under production load when this endpoint is called? How would you guide them to refactor it properly?"*

#### Follow-up Probing Questions:
* Explain the mechanics of event loop starvation: why does a blocking call inside an `async def` route freeze all other concurrent users on that worker process?
* What are the two valid refactoring solutions? (Solution A: switch route to `def` and let FastAPI use the threadpool; Solution B: rewrite using `httpx.AsyncClient` and `asyncio.sleep`).
* What are the memory and throughput trade-offs between those two solutions?

---

### Scenario 6: Architectural Trade-Off Defense
> **Interviewer:** *"Why did you choose a monolithic FastAPI + PostgreSQL + Redis architecture containerized with Docker Compose on a single VPS over a distributed microservices architecture deployed on Kubernetes (EKS/GKE)? Defend this engineering decision in terms of operational complexity, memory footprint, latency, development velocity, and infrastructure cost."*

#### Follow-up Probing Questions:
* At what specific metric threshold (e.g., team size, req/sec, background compute load, database write throughput) would you recommend decomposing this monolith into microservices?
* Why is Traefik preferred over Nginx for Docker-based edge routing in this project?
* How would you scale this architecture horizontally if read traffic increases by 10x next month? (Explain: Postgres Read Replicas, Redis Read Scaling, Stateless Web Container horizontal scaling behind Traefik).
