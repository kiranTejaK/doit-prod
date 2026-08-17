# Master Backend Engineering Checklist: `doit-prod` Tech Stack

This document is the authoritative, comprehensive technical preparation checklist for the **DOit** (`doit-prod`) production repository. It is designed to evaluate your readiness for technical interviews and senior-level backend engineering tasks across every technology, library, framework, database, and infrastructure tool in this stack.

---

## 📊 Depth Levels Legend

* **`[L1 — Familiar]`**: Understand high-level purpose, terminology, and when to use vs. alternatives.
* **`[L2 — Working Knowledge]`**: Can write idiomatic code, configure options, and debug routine syntax/runtime errors.
* **`[L3 — Strong]`**: Understand internals, trade-offs, edge cases, failure modes, concurrency, and performance tuning.
* **`[L4 — Interview / Production Ready]`**: Capable of whiteboarding system design, conducting live troubleshooting under pressure, explaining low-level memory/networking mechanics, and defending architectural trade-offs.

---

## 1. FastAPI & The ASGI Web Ecosystem

```
               ┌────────────────────────────────────────────────────────┐
               │              Uvicorn (ASGI HTTP Server)                │
               └──────────────────────────┬─────────────────────────────┘
                                          │
               ┌──────────────────────────▼─────────────────────────────┐
               │    Starlette Middleware Stack (CORS, Logging, etc.)    │
               └──────────────────────────┬─────────────────────────────┘
                                          │
               ┌──────────────────────────▼─────────────────────────────┐
               │ FastAPI Dependency Injection Tree (Session, User, Role)│
               └──────────────────────────┬─────────────────────────────┘
                                          │
               ┌──────────────────────────▼─────────────────────────────┐
               │ Route Handlers (Controller / Domain Service Execution) │
               └────────────────────────────────────────────────────────┘
```

### 1.1 Fundamentals
* **Why it exists:** Built to provide high-performance asynchronous web APIs in Python with native data validation, automatic OpenAPI/Swagger documentation, and modern type annotations.
* **Terminology & Mental Models:** ASGI (Asynchronous Server Gateway Interface), Event Loop, Coroutine, Non-blocking I/O, Dependency Injection (DI), Path Operations, Request/Response Lifecycle.
* **Alternatives & Trade-offs:**
  * *Django / DRF:* Full-featured "batteries included" ORM/Admin, but heavier memory footprint and historically synchronous WSGI.
  * *Flask:* Lightweight and flexible, but lacks built-in async ergonomics, automatic schema generation, and native type-driven validation.
  * *Go (Gin/Fiber) or Node (Express/Fastify):* Faster raw throughput, but lacks Python's rapid data-science/ecosystem integration.

### 1.2 Core Concepts
- [ ] **[MUST | L3]** **ASGI vs. WSGI Architecture:** Understand how Uvicorn processes events asynchronously via the ASGI specification compared to synchronous WSGI workers (Gunicorn sync workers).
- [ ] **[MUST | L4]** **FastAPI Concurrency Model (`async def` vs. `def`):** Understand that `def` endpoints are executed inside an external threadpool (`anyio` worker threads) to prevent blocking the event loop, while `async def` runs directly on the single-threaded event loop.
- [ ] **[MUST | L4]** **Dependency Injection System (`Depends`, `Security`):** How FastAPI resolves sub-dependencies as a Directed Acyclic Graph (DAG), caches dependency results per request (`use_cache=True`), and handles resource cleanup via `yield`.
- [ ] **[MUST | L3]** **Request/Response Lifecycle:** Order of execution: Middleware $\rightarrow$ Dependency tree evaluation $\rightarrow$ Route handler $\rightarrow$ Response serialization $\rightarrow$ BackgroundTasks $\rightarrow$ Yield dependency teardown.
- [ ] **[SHOULD | L2]** **Router Composition (`APIRouter`):** Modular route registration, endpoint prefixes, tags, and router-level dependency injection.

### 1.3 Practical Implementation
- [ ] **[MUST | L3]** Implement a database session generator using `yield` dependency injection with automatic transaction commit/rollback and connection closing.
- [ ] **[MUST | L3]** Build custom Starlette middleware (`BaseHTTPMiddleware`) that intercepts requests, injects an `X-Correlation-ID` header, logs duration, and cleans context variables.
- [ ] **[MUST | L3]** Implement global exception handlers (`@app.exception_handler`) to normalize unhandled 500 errors, Pydantic validation errors (`RequestValidationError`), and domain exceptions into standard JSON error envelopes.
- [ ] **[SHOULD | L2]** Dispatch post-response background jobs using FastAPI's built-in `BackgroundTasks` (e.g., sending transactional notification emails).

### 1.4 Advanced Concepts (~3 Years Experience)
- [ ] **[MUST | L4]** **Event Loop Starvation Debugging:** Identify and eliminate blocking CPU-bound loops or synchronous third-party SDK calls (e.g., synchronous `requests` or `time.sleep`) inside `async def` endpoints.
- [ ] **[MUST | L3]** **Sub-dependency Lifecycle & Yield Context:** Understand the exact timing of generator cleanup in `yield` dependencies and how exceptions raised inside route handlers propagate into the generator's `finally` block.
- [ ] **[SHOULD | L3]** **FastAPI App Lifespan Handlers (`@asynccontextmanager`):** Implementing startup and shutdown routines for warm connection pools (Postgres, Redis) and clean connection draining.

### 1.5 Production & System Design
- [ ] **[MUST | L3]** **Process Management in Containers:** Why we run single Uvicorn processes per container in Docker and scale horizontally via container orchestration rather than running multi-worker Gunicorn inside a memory-constrained container.
- [ ] **[MUST | L4]** **CORS Configuration & Trailing Slash Traps:** How CORS preflight (`OPTIONS`) requests interact with FastAPI's automatic 307 Temporary Redirects on trailing slashes (e.g., `/items` vs. `/items/`), causing silent body dropping and browser CORS failures.

### 1.6 Interview Readiness
- [ ] **Interview Question:** *"What happens if you run a synchronous, blocking function like `time.sleep(5)` inside an `async def` route versus a regular `def` route in FastAPI?"*
  * *Answer key:* In `async def`, it blocks the entire event loop, stopping all concurrent requests on that worker. In `def`, FastAPI runs it in a background threadpool, allowing the event loop to continue serving other requests.
- [ ] **Whiteboard Scenario:** Draw the request lifecycle through Uvicorn $\rightarrow$ Custom Middleware $\rightarrow$ Security Dependency $\rightarrow$ Route Handler $\rightarrow$ Yield Teardown.
- [ ] **Debugging Trap:** A client sends a `POST` request to `/api/v1/login/` (with trailing slash), but the frontend client called `/api/v1/login`. Why does CORS fail in the browser? (FastAPI returns `307 Redirect` to the canonical URL; browsers do not send auth headers/body on unapproved preflight redirects).

---

## 2. Pydantic v2 & Pydantic-Settings

### 2.1 Fundamentals
* **Why it exists:** High-performance data parsing, validation, and type-coercion powered by a Rust core (`pydantic-core`), and configuration management via environment variables.
* **Terminology & Mental Models:** DTO (Data Transfer Object), Schema vs. Model, Serialization vs. Validation, Strict vs. Lax Coercion, Field Validators, Model Validators, Computed Fields.
* **Alternatives:** `marshmallow`, `attrs`, Python dataclasses. Pydantic v2 is standard in modern Python APIs due to native typing integration and Rust-backed performance.

### 2.2 Core Concepts
- [ ] **[MUST | L3]** **Pydantic v2 Architecture:** Separation between serialization (`model_dump`, `model_dump_json`) and validation (`model_validate`).
- [ ] **[MUST | L3]** **ORM Mode / Attribute Hydration:** `ConfigDict(from_attributes=True)` to parse SQLAlchemy/SQLModel objects directly into API response schemas without manual mapping.
- [ ] **[MUST | L3]** **Pydantic-Settings & Environment Loading:** `BaseSettings`, `.env` file parsing precedence, type coercion of environment variables, and `SettingsConfigDict`.
- [ ] **[SHOULD | L3]** **Validation Hooks:** `@field_validator` (single field transformation) vs. `@model_validator(mode='before'|'after')` (cross-field logic and root validation).

### 2.3 Practical Implementation
- [ ] **[MUST | L3]** Write a `Settings` class that loads `.env`, dynamically computes the Postgres connection URI via `@computed_field`, and enforces custom secret validation (e.g., rejecting default passwords in non-local environments).
- [ ] **[MUST | L3]** Create request schemas with custom field constraints (`Field(min_length=..., max_length=..., pattern=...)`) and response schemas masking sensitive properties (e.g., `hashed_password`).
- [ ] **[SHOULD | L2]** Implement custom serializers/validators to parse comma-separated environment variables into Python lists (`parse_cors`).

### 2.4 Advanced Concepts
- [ ] **[MUST | L3]** **Pydantic v1 vs. v2 Breaking Changes:** Migration patterns: `.dict()` $\rightarrow$ `.model_dump()`, `@validator` $\rightarrow$ `@field_validator`, `class Config` $\rightarrow$ `model_config = ConfigDict(...)`.
- [ ] **[SHOULD | L3]** **Performance Optimization:** Avoiding unnecessary deep copies during validation; leveraging `model_construct()` in trusted internal hot paths to bypass validation overhead.

### 2.5 Production & System Design
- [ ] **[MUST | L3]** **Fail-Fast Startup Configuration:** Designing settings classes that validate all required secrets, database strings, and third-party API keys at container boot time so the container crashes immediately on misconfiguration rather than during live traffic.

### 2.6 Interview Readiness
- [ ] **Interview Question:** *"How does `from_attributes=True` work internally when serializing a SQLAlchemy model with lazy-loaded relationships, and what danger does it introduce?"*
  * *Answer key:* It uses `getattr(obj, field)` instead of dictionary lookup. If a relationship field is in the Pydantic schema but not eagerly loaded in SQL, Pydantic triggers an accidental implicit SQL query (the N+1 problem) during serialization.

---

## 3. SQLAlchemy 2.0 & SQLModel

```
┌────────────────────────────────────────────────────────────────────────┐
│                        SQLModel / Declarative                          │
│                (Pydantic Schema + SQLAlchemy Columns)                  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│                    SQLAlchemy 2.0 Session (Unit of Work)               │
│                  - Identity Map (Deduplication by PK)                  │
│                  - Change Tracker (Dirty / Pending / Deleted)          │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│                    SQLAlchemy Engine & Connection Pool                 │
│              (QueuePool: pool_size=10, max_overflow=20, ping)         │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ (psycopg driver)
┌───────────────────────────────────▼────────────────────────────────────┐
│                        PostgreSQL 17 Database                          │
└────────────────────────────────────────────────────────────────────────┘
```

### 3.1 Fundamentals
* **Why it exists:** SQLModel combines Pydantic data validation with SQLAlchemy 2.0's Object Relational Mapper (ORM), minimizing duplicate class declarations. SQLAlchemy abstracts SQL generation, manages transactions, and manages connection pooling.
* **Terminology & Mental Models:** Unit of Work, Identity Map, Declarative Base, Session, Engine, Connection Pool, Lazy Loading, Eager Loading (`joinedload`, `selectinload`), Dirty Checking, Flush vs. Commit.
* **Alternatives:** `Tortoise-ORM`, `Peewee`, Raw `psycopg3` queries. SQLAlchemy 2.0 is the industry gold standard for Python enterprise applications.

### 3.2 Core Concepts
- [ ] **[MUST | L4]** **SQLAlchemy 2.0 Query Style:** Native use of `select(Model).where(...)`, `join()`, and `scalars().all()` instead of legacy 1.x `session.query(Model)`.
- [ ] **[MUST | L4]** **Session State & Unit of Work:** The lifecycle of an ORM object: *Transient* $\rightarrow$ *Pending* $\rightarrow$ *Persistent* $\rightarrow$ *Detached*.
- [ ] **[MUST | L4]** **Flush vs. Commit vs. Rollback:** `flush()` writes SQL queries to the database transaction buffer (generating DB-side defaults and primary keys) without committing; `commit()` permanently commits the transaction to disk; `rollback()` restores state on error.
- [ ] **[MUST | L4]** **Relationship Modeling & Cascades:** Defining `Relationship()`, foreign keys (`ForeignKey("table.id", ondelete="CASCADE")`), and bidirectional mapping (`back_populates`).

### 3.3 Practical Implementation
- [ ] **[MUST | L3]** Implement a complete CRUD service layer (`ProjectService`, `TaskService`) enforcing workspace boundary filtering on every query.
- [ ] **[MUST | L3]** Configure an explicit connection pool with `pool_size=10`, `max_overflow=20`, `pool_recycle=1800`, and `pool_pre_ping=True` (to handle stale dropped connections).
- [ ] **[MUST | L3]** Implement atomic multi-entity write operations with explicit `try ... except ... rollback()` error handling.

### 3.4 Advanced Concepts (~3 Years Experience)
- [ ] **[MUST | L4]** **The N+1 Query Problem & Loading Strategies:**
  * Understand the exact mechanics of N+1 queries.
  * When to use `joinedload` (SQL `LEFT JOIN`, best for 1-to-1 or small 1-to-many).
  * When to use `selectinload` (Separate `IN (...)` query, best for large 1-to-many collections).
- [ ] **[MUST | L3]** **Identity Map Mechanics:** How the session acts as an in-memory cache for objects accessed by primary key within a single transaction.
- [ ] **[SHOULD | L3]** **Bulk Operations:** Using `session.scalars(insert(Model).returning(Model))` or `session.bulk_insert_mappings` for batch operations without instantiating individual ORM objects.

### 3.5 Production & System Design
- [ ] **[MUST | L4]** **Connection Pool Sizing & VPS RAM Constraints:** Sizing DB pools when running multiple container replicas: Formula: `(Total Backend Containers * Pool Size) + Worker Reserve < Postgres max_connections`.
- [ ] **[MUST | L3]** **Transaction Boundaries:** Keeping transactions as short as possible to avoid holding locks and exhausting pool connections during slow downstream tasks (e.g., never perform external HTTP/S3 calls inside an open DB transaction).

### 3.6 Interview Readiness
- [ ] **Interview Question:** *"Explain the difference between `session.flush()` and `session.commit()`. In what real-world scenario would you call `flush()` explicitly?"*
  * *Answer key:* `flush()` executes pending SQL statements within the current transaction, allowing you to obtain auto-generated DB values (such as IDs or trigger outputs) to use in subsequent queries without finalizing the transaction to disk.
- [ ] **Interview Question:** *"What happens if an exception is raised inside a route after `session.add(item)` but before `session.commit()` if you do not handle rollback in your dependency?"*
  * *Answer key:* The transaction remains open or dirty, causing connection leaks or leaving the connection in an invalid state when returned to the connection pool.
- [ ] **Whiteboard Problem:** Given `User` $\rightarrow$ `Workspace` $\rightarrow$ `Project` $\rightarrow$ `Task`, write an optimized SQLAlchemy 2.0 query to retrieve all tasks for a user's workspace in a single round-trip without N+1 query triggers.

---

## 4. PostgreSQL 17

### 4.1 Fundamentals
* **Why it exists:** Advanced, ACID-compliant open-source relational database management system designed for data integrity, complex queries, and high concurrency.
* **Terminology & Mental Models:** ACID (Atomicity, Consistency, Isolation, Durability), MVCC (Multi-Version Concurrency Control), WAL (Write-Ahead Logging), Table Bloat, Autovacuum, Indexes (B-Tree, Hash, GIN, BRIN), Execution Plans (`EXPLAIN ANALYZE`).
* **Alternatives:** MySQL, MariaDB, CockroachDB, SQLite (development/embedded).

### 4.2 Core Concepts
- [ ] **[MUST | L4]** **MVCC (Multi-Version Concurrency Control):** How Postgres handles concurrent readers and writers without locking tables (readers don't block writers; writers don't block readers) via `xmin`/`xmax` row versioning.
- [ ] **[MUST | L3]** **Transaction Isolation Levels:**
  * *Read Committed* (Default in Postgres): Reads only committed data, but subject to non-repeatable reads and phantom reads.
  * *Repeatable Read:* Takes a snapshot at transaction start; prevents non-repeatable reads.
  * *Serializable:* Emulates serial execution; throws serialization failures on conflicts (requires application-level retry).
- [ ] **[MUST | L4]** **Indexing Mechanics:**
  * B-Tree (Default): $O(\log N)$ equality and range lookups.
  * Composite Indexes: Column order rules (Leftmost Prefix Rule).
  * Unique & Partial Indexes (`WHERE is_active = true`).

### 4.3 Practical Implementation
- [ ] **[MUST | L3]** Write normalized relational DDL with explicit foreign key cascades (`ON DELETE CASCADE`), unique constraints, and check constraints.
- [ ] **[MUST | L4]** Read and interpret `EXPLAIN (ANALYZE, BUFFERS)` output: Identify Sequential Scans (`Seq Scan`), Index Scans (`Index Scan` vs. `Bitmap Index Scan`), Filter overhead, and buffer hits.
- [ ] **[SHOULD | L3]** Tune PostgreSQL container runtime parameters (`shared_buffers=64MB`, `max_connections=50`, `work_mem=4MB`) for memory-constrained VPS deployments.

### 4.4 Advanced Concepts (~3 Years Experience)
- [ ] **[MUST | L4]** **Locking Modes & Deadlocks:** Row-level locks (`FOR UPDATE`, `FOR SHARE`), table-level locks, lock escalation, and how to prevent deadlocks (ordering lock acquisitions consistently across concurrent transactions).
- [ ] **[MUST | L3]** **UUID as Primary Key Trade-offs:** UUIDv4 randomness causing B-Tree page fragmentation and cache eviction vs. UUIDv7 (time-ordered sequential UUIDs) and standard auto-incrementing integers.
- [ ] **[SHOULD | L3]** **VACUUM & Autovacuum:** Why dead tuples accumulate from `UPDATE` and `DELETE` operations, and how autovacuum recovers space and updates data distribution statistics (`pg_statistic`).

### 4.5 Production & System Design
- [ ] **[MUST | L4]** **Connection Starvation & Connection Pooling:** Why PostgreSQL spawns a separate OS process per connection and why an external pooler (like PgBouncer) or internal SQLAlchemy pool is mandatory under high concurrency.
- [ ] **[MUST | L3]** **Data Durability & WAL Tuning:** Understanding `fsync`, WAL buffers, and checkpoints during sudden container/hardware crashes.

### 4.6 Interview Readiness
- [ ] **Interview Question:** *"Why would PostgreSQL choose a Sequential Scan over an Index Scan even when an index exists on the queried column?"*
  * *Answer key:* When the table is very small (disk pages can be read in a single I/O), or when the query matches a large percentage of table rows (low selectivity, e.g., >15-20%), the query planner calculates that sequential disk I/O is faster than random page lookups from the index.
- [ ] **Scenario:** *"Two background tasks simultaneously update task orders across sections in opposite order (Task A $\rightarrow$ Task B vs Task B $\rightarrow$ Task A) and fail with `DeadlockDetected`. How do you resolve this permanently?"*
  * *Answer key:* Enforce deterministic lock ordering in application code (always sort target entity IDs before issuing `SELECT ... FOR UPDATE` or updates).

---

## 5. Alembic (Database Migrations)

### 5.1 Fundamentals
* **Why it exists:** Version control and schema migration tool specifically built for SQLAlchemy to transition databases between schema revisions reliably.
* **Terminology & Mental Models:** Revision Script, Migration Head, Down-revision, `alembic_version` table, Autogenerate, Online vs. Offline Migrations.
* **Alternatives:** Raw SQL scripts, Flyway, Liquibase, Prisma Migrate.

### 5.2 Core Concepts
- [ ] **[MUST | L3]** **Alembic Architecture:** How `env.py`, `alembic.ini`, and `target_metadata` inspect declarative Python models against the live database catalog (`pg_catalog`).
- [ ] **[MUST | L4]** **Autogenerate Limitations:** What Alembic autogenerate catches (table creations, added columns) vs. what it misses or gets wrong (column name changes, server default changes, constraint renames, enum type alterations).
- [ ] **[MUST | L3]** **Linear vs. Branching Heads:** Resolving multiple conflicting migration heads (`alembic merge`) in team environments.

### 5.3 Practical Implementation
- [ ] **[MUST | L3]** Generate revisions (`alembic revision --autogenerate -m "..."`) and manually verify generated Python code before executing `alembic upgrade head`.
- [ ] **[MUST | L3]** Implement a container startup script (`prestart.sh`) that verifies database connectivity via retries and runs `alembic upgrade head` before booting the API server.

### 5.4 Advanced Concepts & Zero-Downtime
- [ ] **[MUST | L4]** **Zero-Downtime Migration Patterns (Expand / Contract):**
  * *Step 1 (Expand):* Add new nullable column / create new table.
  * *Step 2 (Deploy):* Deploy code reading/writing to both columns.
  * *Step 3 (Backfill):* Run async batch update on historical rows.
  * *Step 4 (Contract):* Deploy code reading only new column, then drop old column.
- [ ] **[MUST | L4]** **Safe Constraint Addition in PostgreSQL:** Adding a `NOT NULL` constraint or unique index without locking the entire table against writes (`CREATE INDEX CONCURRENTLY`, `ALTER TABLE ... VALIDATE CONSTRAINT`).

### 5.5 Production & System Design
- [ ] **[MUST | L4]** **Migration Execution in CI/CD:** Why migrations must run in a dedicated, isolated prestart container or release pipeline step rather than having multiple web replicas execute `alembic upgrade head` simultaneously on boot (race condition on `alembic_version`).

### 5.6 Interview Readiness
- [ ] **Interview Question:** *"You need to add a non-nullable column `workspace_id` to a table with 20 million tasks in production with zero downtime. What is your step-by-step migration plan?"*
  * *Answer key:* 1) Add column as `NULLABLE`. 2) Deploy code that writes to the new column on new records. 3) Backfill historical rows in small batches (`LIMIT 5000`). 4) Add a `CHECK (workspace_id IS NOT NULL) NOT VALID` constraint (instant lock). 5) Run `VALIDATE CONSTRAINT` (does not hold exclusive table lock). 6) Alter column to `NOT NULL`.

---

## 6. Redis 5.0+ (Caching, Locking & Stampede Prevention)

```
                       Incoming Read Request
                                │
                                ▼
                       Check Redis Cache
                                │
                 ┌──────────────┴──────────────┐
             [Hit]                           [Miss]
                 │                             │
                 ▼                             ▼
           Return JSON                 Acquire Lock (SET lock_key NX EX 10)
                                               │
                                  ┌────────────┴────────────┐
                             [Acquired]                [Not Acquired]
                                  │                           │
                                  ▼                           ▼
                        Execute DB Query               Sleep 50ms & Retry
                                  │                    Cache Lookup
                                  ▼
                        Set Redis (SETEX)
                                  │
                                  ▼
                        Release Lock & Return
```

### 6.1 Fundamentals
* **Why it exists:** In-memory, ultra-low-latency key-value data structure store used for caching database reads, session management, distributed rate limiting, and concurrency locks.
* **Terminology & Mental Models:** Single-Threaded Event Loop, In-Memory Storage, RDB Snapshots, AOF (Append-Only File), TTL (Time-To-Live), Eviction Policies (`allkeys-lru`, `volatile-lru`), Cache Hit/Miss, Cache Stampede (Thundering Herd), Cache Penetration, Cache Breakdown.
* **Alternatives:** Memcached, KeyDB, Dragonfly, DynamoDB DAX.

### 6.2 Core Concepts
- [ ] **[MUST | L3]** **Redis Data Structures:** Strings (used for JSON caching), Hashes, Sets, Sorted Sets (ZSET for leaderboards/sliding window rate limiters), and Pub/Sub.
- [ ] **[MUST | L4]** **Cache Invalidation Strategies:**
  * *Cache-Aside (Lazy Loading):* App reads cache; on miss, reads DB and populates cache. Writes update DB and invalidate cache.
  * *Write-Through / Write-Behind:* Cache updated synchronously or asynchronously on every write.
- [ ] **[MUST | L4]** **Distributed Locking (`SET lock_key value NX EX`):**
  * `NX`: Only set if key does not exist (atomic acquire).
  * `EX`: Automatic expiration (prevents permanent deadlocks if worker crashes).

### 6.3 Practical Implementation
- [ ] **[MUST | L4]** Implement a custom caching decorator (`@redis_cache`) in Python that computes query hashes, handles JSON serialization/deserialization, and supports dynamic TTL.
- [ ] **[MUST | L4]** Implement distributed lock acquisition with double-checked locking inside the caching decorator to prevent cache stampedes on expensive queries.
- [ ] **[MUST | L3]** Implement pattern-based cache clearing (`clear_cache`) using `scan_iter(match=pattern, count=100)` rather than blocking `KEYS *`.
- [ ] **[MUST | L3]** Implement graceful degradation: Wrap all Redis operations in `try ... except RedisError` so a Redis outage degrades system performance to database queries instead of throwing 500 errors to users.

### 6.4 Advanced Concepts (~3 Years Experience)
- [ ] **[MUST | L4]** **Cache Stampede Prevention Mechanics:** What happens when a high-traffic cache key expires simultaneously for 1,000 concurrent requests, and how mutex locking or probabilistic early expiration (XFetch) protects the database.
- [ ] **[MUST | L4]** **`KEYS *` vs. `SCAN`:** Why executing `KEYS *` in production is a critical failure (blocks Redis's single thread, causing application timeouts) and how cursor-based `SCAN` iterates without latency spikes.
- [ ] **[MUST | L4]** **Lock Release Safety:** Ensuring a worker only deletes its *own* lock if execution took longer than the TTL (using a unique UUID value and Lua script for atomic check-and-delete).

### 6.5 Production & System Design
- [ ] **[MUST | L3]** **Cache Key Namespacing & Versioning:** Structuring keys hierarchically (`doit:v1:projects:entity:<id>` vs `doit:v1:projects:query:<hash>`) so entire namespaces can be invalidated during version deployments by incrementing the cache version prefix.
- [ ] **[MUST | L3]** **Memory Limits & Eviction Configuration:** Setting `maxmemory 50mb` and `maxmemory-policy allkeys-lru` in containerized environments to prevent the OS kernel OOM killer from terminating the Redis process.

### 6.6 Interview Readiness
- [ ] **Interview Question:** *"Explain the difference between Cache Penetration, Cache Breakdown, and Cache Avalanche. What specific patterns prevent each?"*
  * *Answer key:*
    * *Penetration:* Querying non-existent keys repeatedly $\rightarrow$ Cache null values with short TTL or use Bloom filters.
    * *Breakdown:* Single hot key expires under heavy load $\rightarrow$ Distributed mutex lock or probabilistic early refresh.
    * *Avalanche:* Many keys expire simultaneously $\rightarrow$ Add random jitter to expiration TTLs (`TTL = base + rand()`).
- [ ] **Code Whiteboard:** Write an atomic Redis distributed lock acquisition and release block in Python using `redis-py`.
- [ ] **Debugging Scenario:** *"Redis CPU usage spikes to 100% and API requests start timing out. What commands would you run to diagnose the issue?"*
  * *Answer key:* Run `redis-cli SLOWLOG GET 10` to find blocking long-running commands (e.g., `KEYS *`), check `INFO commandstats`, and verify client connection counts with `CLIENT LIST`.

---

## 7. Security, Authentication & Authorization

```
                          Client Login Request
                                   │
                                   ▼
                       POST /api/v1/login/access-token
                                   │
                                   ▼
                    Verify Password (Passlib/Bcrypt)
                                   │
                                   ▼
                     Generate JWT (PyJWT: HS256)
                       Payload: { sub: user_id, exp }
                                   │
                                   ▼
                     Client Stores Token in Header
                    Authorization: Bearer <access_token>
                                   │
                                   ▼
                          Protected API Endpoint
                                   │
                                   ▼
                   FastAPI Dependency: get_current_user
                     - Decode Token & Verify Signature
                     - Check User is_active & Exists
                                   │
                                   ▼
                   Service Layer: RBAC Policy Check
                     - Is User Workspace Owner / Member?
                     - Allow / Deny (403 Forbidden)
```

### 7.1 Fundamentals
* **Why it exists:** Protects user data, ensures confidentiality and data integrity, authenticates identity, and restricts access via granular authorization policies.
* **Terminology & Mental Models:** Authentication (401 Unauthorized — "Who are you?") vs. Authorization (403 Forbidden — "What are you allowed to do?"), Password Hashing vs. Encryption, Salt & Work Factor, JWT (Header, Payload, Signature), RBAC (Role-Based Access Control), Multi-Tenancy Boundary Isolation.

### 7.2 Core Concepts
- [ ] **[MUST | L4]** **Bcrypt Hashing Algorithm:** How adaptive work factors (cost parameters) and random salting protect against rainbow tables, brute force attacks, and timing attacks.
- [ ] **[MUST | L4]** **JSON Web Tokens (JWT) Architecture:**
  * Anatomy: `base64UrlEncode(header) + "." + base64UrlEncode(payload) + "." + signature`.
  * Claims: `sub` (subject), `exp` (expiration timestamp), `iat` (issued at).
  * Symmetric (`HS256` with shared secret) vs. Asymmetric (`RS256` with public/private keypair).
- [ ] **[MUST | L4]** **Multi-Tenant Workspace RBAC Model:** Hierarchical permission evaluation: `Superuser` $\rightarrow$ `Workspace Owner` $\rightarrow$ `Workspace Admin` $\rightarrow$ `Workspace Member`.
- [ ] **[MUST | L3]** **OWASP API Security Top 10 Primitives:** Preventing BOLA/IDOR (Broken Object Level Authorization), Injection, Broken Authentication, and Mass Assignment.

### 7.3 Practical Implementation
- [ ] **[MUST | L4]** Implement JWT generation and token verification dependencies using `pyjwt` and FastAPI's `OAuth2PasswordBearer`.
- [ ] **[MUST | L4]** Build domain authorization policies (`auth_policy.py`) that verify whether a requesting user has permission to view, edit, or delete projects/tasks within a specific workspace before executing service logic.
- [ ] **[MUST | L3]** Secure password storage using `passlib.context.CryptContext(schemes=["bcrypt"])` with password complexity and verification methods.

### 7.4 Advanced Concepts (~3 Years Experience)
- [ ] **[MUST | L4]** **Stateless JWT Revocation Problem:** Why standard JWTs cannot be invalidated before expiration without server-side state, and how to implement token blacklisting/deny-lists in Redis on user logout or password reset.
- [ ] **[MUST | L3]** **Timing Attacks:** Why plain string comparison (`if password == stored_hash`) is vulnerable to timing attacks and how constant-time comparison (`secrets.compare_digest`) mitigates it.
- [ ] **[SHOULD | L3]** **Refresh Token Rotation:** Mitigating stolen access tokens using short-lived access tokens (e.g., 15 minutes) paired with single-use rotating refresh tokens.

### 7.5 Production & System Design
- [ ] **[MUST | L4]** **BOLA / IDOR Prevention in Multi-Tenant Architectures:** Ensuring every single query for an entity by ID includes an explicit tenancy condition (`WHERE id = :task_id AND workspace_id = :user_workspace_id`) rather than querying by ID alone.
- [ ] **[MUST | L3]** **Secret Key Rotation & Entropy:** Secure generation of `SECRET_KEY` via `secrets.token_urlsafe(32)` and injecting keys through container environment variables rather than source code.

### 7.6 Interview Readiness
- [ ] **Interview Question:** *"If JWTs are stateless, how do you immediately revoke an access token if a user's laptop is stolen?"*
  * *Answer key:* 1) Maintain a Redis blocklist of revoked `jti` (JWT IDs) or `user_id` timestamps checked during authentication until the token's natural expiration. 2) Use short token TTLs (e.g., 15 mins). 3) Increment a `token_version` column in the User DB table and invalidate tokens with older versions.
- [ ] **Scenario:** *"An attacker changes `projectId=123` to `projectId=124` in a task creation payload. How does your backend architecture prevent cross-tenant data corruption?"*
  * *Answer key:* The authorization service verifies that `projectId=124` belongs to the requesting user's active workspace and that the user holds at least `Member` permissions in that project before executing the insert.

---

## 8. Logging & Observability (Structlog, Promtail, Loki, Grafana, Sentry)

```
┌────────────────────────────────────────────────────────────────────────┐
│                        FastAPI Request Arrives                         │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ RequestLoggingMiddleware: Bind X-Correlation-ID to Contextvars         │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ Structlog Pipeline: Timestamp, Log Level, Module, Traceback Enrichment │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ RotatingFileHandler: Writes Structured JSON to /app/logs/app.log       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ (Docker Volume: backend_logs)
┌───────────────────────────────────▼────────────────────────────────────┐
│ Promtail Agent: Scrapes Log File, Parses JSON, Extracts Stream Labels  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ Loki: High-Efficiency Log Store (Indexes Stream Labels, Stores Chunks) │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ Grafana Dashboard: LogQL Queries (rate, filter by correlation_id)      │
└────────────────────────────────────────────────────────────────────────┘
```

### 8.1 Fundamentals
* **Why it exists:** Observability allows engineers to infer the internal health and failure states of distributed systems through structured telemetry data (logs, metrics, traces).
* **Terminology & Mental Models:** Structured JSON Logging, Correlation ID / Request ID, Distributed Tracing, Context Variables (`contextvars`), Log Rotation, Log Aggregation, Promtail Scraper, Loki Log Streams, High-Cardinality Traps, LogQL.
* **Alternatives:** ELK Stack (Elasticsearch, Logstash, Kibana), Datadog, AWS CloudWatch. The Grafana+Loki stack is significantly lighter on memory for modern containerized servers.

### 8.2 Core Concepts
- [ ] **[MUST | L4]** **Structured JSON Logging vs. Plain Text:** Why machines cannot reliably index unstructured strings and how JSON log formatting enables instant filtering by status code, latency, user ID, and correlation ID.
- [ ] **[MUST | L4]** **Context Propagation via `contextvars`:** How Python's `contextvars` module maintains request-scoped data (like correlation IDs) across asynchronous task switches without thread-local pollution.
- [ ] **[MUST | L3]** **Loki Architecture & High-Cardinality Trap:** Loki does not index full log text; it indexes metadata streams (labels). Adding high-cardinality values (e.g., `user_id`, `request_id`, `timestamp`) as Loki *labels* exhausts Loki index memory. High-cardinality data belongs in the JSON payload, filtered via LogQL.
- [ ] **[MUST | L3]** **File Rotation Mechanics (`RotatingFileHandler`):** Managing `maxBytes` (e.g., 5MB) and `backupCount` (e.g., 5) to guarantee log files never consume 100% of the VPS disk.

### 8.3 Practical Implementation
- [ ] **[MUST | L4]** Build the complete `structlog` pipeline bridging standard library loggers (SQLAlchemy, Uvicorn) through `ProcessorFormatter` into unified JSON output.
- [ ] **[MUST | L3]** Configure Promtail (`promtail-config.yml`) to mount shared Docker volumes, parse JSON log lines, and ship logs to Loki over internal Docker networks.
- [ ] **[MUST | L3]** Configure Sentry SDK integration (`sentry_sdk.init`) to capture unhandled exceptions with full stack traces, release versions, and user context.

### 8.4 Advanced Concepts & Production Debugging
- [ ] **[MUST | L4]** **End-to-End Distributed Request Tracing:** Generating `X-Correlation-ID` in the edge proxy/middleware, propagating it through backend logs, returning it in response headers, and using LogQL in Grafana to reconstruct the complete request lifecycle during customer incidents:
  ```logql
  {job="doit-backend"} | json | correlation_id = "f47ac10b-58cc-4372-a567-0e02b2c3d479"
  ```
- [ ] **[MUST | L3]** **Initialization Guards & Duplicate Handler Bugs:** Preventing duplicate log lines caused by running logging configuration multiple times during test execution or module re-imports.

### 8.5 Production & System Design
- [ ] **[MUST | L3]** **Health-Check Log Suppression:** Excluding high-frequency automated load balancer health checks (e.g., `/health-check/` every 10s) from access logs to prevent log spam and disk saturation.

### 8.6 Interview Readiness
- [ ] **Interview Question:** *"Why should you never use `user_id` or `order_id` as a stream label in Grafana Loki, and where should those fields be placed instead?"*
  * *Answer key:* Loki creates a separate index chunk for every unique label combination. High-cardinality fields create millions of tiny streams, exhausting Loki's memory and degrading query performance. Place them inside the structured JSON log body and query them using LogQL JSON filters.
- [ ] **Whiteboard Scenario:** Draw the observability data flow from a FastAPI exception $\rightarrow$ Structlog JSON formatting $\rightarrow$ Log file $\rightarrow$ Promtail $\rightarrow$ Loki $\rightarrow$ Grafana Alert.

---

## 9. Cloud Object Storage (AWS S3 & Boto3)

### 9.1 Fundamentals
* **Why it exists:** Provides highly scalable, durable, and cost-effective cloud object storage for binary files (attachments, images, documents) without storing large BLOBs in the relational database or VPS file system.
* **Terminology & Mental Models:** Object Storage vs. Block Storage, Bucket, Object Key, IAM Access Keys, Presigned URL, MIME Content-Type, Multipart Upload.
* **Alternatives:** Google Cloud Storage (GCS), Azure Blob Storage, MinIO (self-hosted S3-compatible).

### 9.2 Core Concepts
- [ ] **[MUST | L4]** **Presigned URLs vs. Direct Backend Streaming:**
  * *Direct Backend Proxying:* File flows Client $\rightarrow$ Backend Server $\rightarrow$ S3. Wastes backend bandwidth, memory, and worker threads on large files.
  * *Presigned URLs:* Backend generates a cryptographic time-limited URL (`s3.generate_presigned_url`); Client uploads/downloads directly to/from S3.
- [ ] **[MUST | L3]** **Key Organization & Partitioning:** Organizing S3 object keys hierarchically (`workspaces/{ws_id}/tasks/{task_id}/{uuid}-{filename}`) to prevent key collisions and support multi-tenant isolation.
- [ ] **[MUST | L3]** **Boto3 Client Thread Safety:** Boto3 `Session` vs `Client` vs `Resource` thread-safety rules in multi-threaded/async web servers.

### 9.3 Practical Implementation
- [ ] **[MUST | L3]** Implement file upload helpers using `boto3.client('s3').upload_fileobj` with explicit `ContentType` metadata.
- [ ] **[MUST | L4]** Generate secure, time-limited presigned download URLs with configurable expiration (e.g., 3600 seconds).
- [ ] **[MUST | L3]** Handle Boto3 exceptions (`botocore.exceptions.ClientError`, `NoCredentialsError`) with graceful fallback.

### 9.4 Production & System Design
- [ ] **[MUST | L3]** **Orphaned File Garbage Collection:** Handling edge cases where a database record creation fails after an S3 file is uploaded, or deleting S3 objects when parent entities (tasks/workspaces) are purged.

### 9.5 Interview Readiness
- [ ] **Interview Question:** *"Why should you avoid storing user-uploaded files on the local VPS file system or as database BLOBs in PostgreSQL?"*
  * *Answer key:* Local disk storage prevents horizontal scaling (multiple backend containers cannot access each other's local disk) and risks disk exhaustion. Storing BLOBs in PostgreSQL causes massive table bloat, degrades database backup/restore speed, and consumes expensive database RAM/cache space.

---

## 10. Testing Infrastructure (Pytest, TestClient, Fixtures)

### 10.1 Fundamentals
* **Why it exists:** Automated testing framework to verify code correctness, prevent regressions, enforce API contracts, and validate security boundaries before deployment.
* **Terminology & Mental Models:** Fixtures, Scope (`function`, `module`, `session`), Monkeypatching, Mocking, Dependency Overrides, Test Isolation, Code Coverage.

### 10.2 Core Concepts
- [ ] **[MUST | L4]** **FastAPI `dependency_overrides`:** Swapping out production dependencies (e.g., overriding `get_db` with a test database session, or overriding `get_current_user` to bypass OAuth token generation in unit tests).
- [ ] **[MUST | L4]** **Test Database Isolation Strategies:**
  * *Strategy A (In-Memory SQLite):* Fast, but lacks PostgreSQL-specific features/types (e.g., JSONB, UUIDs, PGVector).
  * *Strategy B (Dedicated Test PostgreSQL Database with Rollback / Truncation):* 100% production-parity. Run migrations on startup, wrap each test in a transaction and roll back on teardown.
- [ ] **[MUST | L3]** **Pytest Fixture Scoping & Teardown:** Yield fixtures for setup and teardown of HTTP clients, mock S3 clients, and temporary seed data.

### 10.3 Practical Implementation
- [ ] **[MUST | L3]** Write integration tests using FastAPI's `TestClient` (or `httpx.AsyncClient`) asserting status codes, headers, and JSON response shapes.
- [ ] **[MUST | L3]** Mock external network calls (Redis, Brevo/SMTP, S3 Boto3) using `unittest.mock.patch` or `pytest-mock` to keep test suites fast, deterministic, and hermetic.
- [ ] **[MUST | L3]** Measure and generate coverage reports (`pytest --cov=app --cov-report=html`) enforcing minimum coverage thresholds.

### 10.4 Interview Readiness
- [ ] **Interview Question:** *"How do you test that an endpoint correctly returns HTTP 403 Forbidden when a user attempts to access a project belonging to a different workspace?"*
  * *Answer key:* Create two distinct workspaces and two users in the test fixture; generate an auth token for User A; issue a `GET /api/v1/projects/{project_b_id}` request with User A's token; assert response status is `403` with specific error detail.

---

## 11. Containerization & Edge Routing (Docker, Docker Compose, Traefik)

```
                            Internet (Client Browser)
                                       │
                                       ▼
                       Port 80 / 443 (HTTP / HTTPS)
                                       │
                    ┌──────────────────▼──────────────────┐
                    │       Traefik Reverse Proxy         │
                    │   - Let's Encrypt SSL Termination   │
                    │   - HTTP to HTTPS Redirection       │
                    │   - Docker Provider Routing Rules   │
                    └───────────┬──────────────┬──────────┘
                                │              │
        Host(`api.domain.com`)  │              │  Host(`dashboard.domain.com`)
                                ▼              ▼
                    ┌──────────────────┐  ┌──────────────────┐
                    │ Backend (FastAPI)│  │ Frontend (Nginx) │
                    │   Port: 8000     │  │    Port: 80      │
                    └─────────┬────────┘  └──────────────────┘
                              │
                    ┌─────────┴────────┐
                    │ Internal Network │
                    │ (Postgres, Redis)│
                    └──────────────────┘
```

### 11.1 Fundamentals
* **Why it exists:** Containerization provides immutable, reproducible deployment environments across development and production. Traefik provides automatic edge routing, SSL termination, and service discovery via Docker labels.
* **Terminology & Mental Models:** Image Layering, Multi-Stage Builds, Container Lifecycle, Bridge Networks, External Networks, Reverse Proxy, SSL/TLS Handshake, Let's Encrypt ACME Challenge, Healthchecks.

### 11.2 Core Concepts
- [ ] **[MUST | L4]** **Traefik Dynamic Routing via Docker Labels:** How Traefik listens to the Docker daemon socket (`/var/run/docker.sock`), reads container labels (`traefik.http.routers.backend.rule=Host('api.domain.com')`), and updates routing tables dynamically without restarting the proxy.
- [ ] **[MUST | L3]** **Automated SSL/TLS Termination:** Automated certificate provisioning and renewal via ACME (Let's Encrypt) challenge resolver.
- [ ] **[MUST | L4]** **Docker Networking & Service Discovery:** How containers on the same Docker bridge network communicate via internal service names (e.g., `http://db:5432`, `http://redis:6379`) resolved by Docker's embedded DNS server (`127.0.0.11`).
- [ ] **[MUST | L3]** **Resource Limits (`deploy.resources.limits`):** Setting explicit CPU and RAM constraints (e.g., `memory: 300M` for Postgres, `memory: 50M` for Redis) to protect 1GB/2GB VPS instances from OOM crashes.

### 11.3 Practical Implementation
- [ ] **[MUST | L3]** Configure multi-stage `Dockerfile` (e.g., UV build stage $\rightarrow$ slim runtime image) to minimize image footprint and attack surface.
- [ ] **[MUST | L4]** Write production `docker-compose.prod.yml` with healthchecks (`pg_isready`, `redis-cli ping`, HTTP curl), volume mounts for data persistence, and dependency conditions (`condition: service_healthy`).
- [ ] **[MUST | L3]** Configure log driver options (`json-file`, `max-size: 10m`, `max-file: 3`) to prevent Docker container logs from consuming disk space.

### 11.4 Advanced Concepts (~3 Years Experience)
- [ ] **[MUST | L4]** **Container Startup Ordering & Race Conditions:** Why simple `depends_on: [db]` is insufficient (it only waits for container start, not DB engine readiness) and why healthchecks with `condition: service_healthy` are mandatory for reliable automated deployments.
- [ ] **[MUST | L3]** **Nginx Production Container for React:** Serving compiled static assets through Nginx with `try_files $uri $uri/ /index.html;` to support React Router client-side routing.

### 11.5 Interview Readiness
- [ ] **Interview Question:** *"Why does `depends_on: [db]` sometimes fail when the backend container starts up, and how do you fix it permanently in Docker Compose?"*
  * *Answer key:* `depends_on` only waits for the DB container to be created and running at the OS level, not for PostgreSQL to finish initializing and accepting socket connections. Fix it by defining a `healthcheck` on the database service (`pg_isready`) and setting `depends_on: { db: { condition: service_healthy } }`.
- [ ] **Debugging Scenario:** *"Traefik returns 502 Bad Gateway when routing to the backend. What are the top 3 causes you check first?"*
  * *Answer key:* 1) Backend container is crashing/restarting (check `docker logs backend`). 2) Port mismatch between Traefik label `loadbalancer.server.port` (e.g., 8000) and the port Uvicorn is listening on. 3) Backend container is not attached to the shared `traefik-public` network.

---

## 12. Resilience, Background Tasks & Utilities

### 12.1 Core Concepts
- [ ] **[MUST | L3]** **Tenacity Retry Mechanisms:** Configuring exponential backoff, maximum attempts, jitter, and retry filtering on specific exceptions (e.g., `retry_if_exception_type(OperationalError)`) for transient database/network connections.
- [ ] **[MUST | L2]** **Jinja2 HTML Email Templating:** Rendering dynamic contextual templates with variable substitution, auto-escaping (preventing XSS in email clients), and layout inheritance for transactional invitations and password resets.
- [ ] **[SHOULD | L3]** **Transactional Outbox Pattern (Conceptual):** Understanding how to guarantee that database updates and asynchronous email/webhook dispatches remain consistent even if the mail server crashes.

---

## 13. Master Checklists & Self-Assessment

### 13.1 Critical Gaps Checklist (Most Commonly Missed Concepts)

These are the exact high-impact topics that candidates with 1–3 years of experience frequently miss during technical interviews:

- [ ] **1. FastAPI Trailing Slash CORS Redirection Failure:** Missing that `/route/` vs `/route` causes a `307 Temporary Redirect` that drops CORS headers and request bodies in browser preflight requests.
- [ ] **2. SQLAlchemy Implicit Lazy-Load Triggers (N+1):** Missing that accessing relationship attributes during Pydantic serialization executes synchronous database queries behind the scenes.
- [ ] **3. Cache Stampede under High Concurrency:** Assuming `redis.set()` and `redis.get()` are sufficient for caching without distributed mutex locking or double-checked locking.
- [ ] **4. High-Cardinality Labels in Loki:** Adding dynamic identifiers (`user_id`, `correlation_id`) as Loki stream labels instead of structured JSON log properties.
- [ ] **5. Incomplete Yield Dependency Cleanup:** Failing to anticipate what happens to an uncommitted transaction when an unhandled exception is raised in a FastAPI route handler.
- [ ] **6. Docker Healthcheck vs Container State:** Believing `depends_on` waits for database readiness, leading to flaky container deployments.
- [ ] **7. Context Variable Leaks in Async Workers:** Forgetting to clear `structlog.contextvars` in middleware `finally` blocks, resulting in correlation IDs bleeding across requests on the same async worker.
- [ ] **8. Multi-Tenant Authorization Leaks (IDOR):** Relying solely on URL parameter entity IDs without validating tenant boundaries in the database query `WHERE` clause.

---

### 13.2 Interview Readiness Checklist (High-Stakes Filter Questions)

You should be able to answer each of these questions on a whiteboard in under 2 minutes:

- [ ] **Q1:** *How does FastAPI's concurrency model handle `def` vs `async def` endpoints, and what happens if you invoke a synchronous blocking function in each?*
- [ ] **Q2:** *Walk me through the lifecycle of a database session in this project from the moment an HTTP request hits the endpoint to when the response is returned.*
- [ ] **Q3:** *How did you implement distributed caching in Redis while preventing cache stampedes and thundering herd problems?*
- [ ] **Q4:** *Explain how your logging pipeline tracks a single request from the browser through middleware, backend logs, Promtail, Loki, and into Grafana.*
- [ ] **Q5:** *What is the difference between `joinedload` and `selectinload` in SQLAlchemy 2.0, and how do you decide which one to use?*
- [ ] **Q6:** *How do you enforce Multi-Tenant Role-Based Access Control (RBAC) across Workspaces, Projects, and Tasks to prevent IDOR vulnerabilities?*
- [ ] **Q7:** *Why do we run database migrations in a dedicated prestart container rather than inside the main application container boot sequence?*
- [ ] **Q8:** *How do you gracefully handle a complete Redis failure so that user requests do not fail with HTTP 500 errors?*

---

### 13.3 Project-Specific Cross-Technology Architecture Scenarios

These scenarios test your ability to reason across multiple layers of the `doit-prod` stack:

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                            CROSS-TECHNOLOGY INTEGRATION MATRIX                                   │
├──────────────────────┬──────────────────────────────────┬────────────────────────────────────────┤
│ Scenario             │ Technologies Involved            │ Core Mechanics & Failure Mitigation    │
├──────────────────────┼──────────────────────────────────┼────────────────────────────────────────┤
│ 1. User Login &      │ FastAPI + Pydantic + Passlib +   │ Verify bcrypt hash -> Issue JWT ->     │
│    Authenticated API │ PostgreSQL + Traefik             │ Passlib verify -> Axios Bearer ->      │
│    Access            │                                  │ Dependency extracts CurrentUser.       │
├──────────────────────┼──────────────────────────────────┼────────────────────────────────────────┤
│ 2. Task Fetch with   │ FastAPI + Redis + SQLAlchemy +   │ Compute query hash -> Redis lookup ->  │
│    Distributed Cache │ PostgreSQL + Structlog           │ Lock on miss -> Fetch SQL -> Cache set │
│    & Invalidation    │                                  │ Invalidate on write via scan_iter.     │
├──────────────────────┼──────────────────────────────────┼────────────────────────────────────────┤
│ 3. Automated Zero-   │ GitHub Actions + Docker +        │ Run tests -> Build images -> Push ->   │
│    Downtime Deploy   │ Alembic + Traefik + Postgres     │ Compose pulls -> Prestart migrates ->  │
│    Pipeline          │                                  │ Traefik switches traffic smoothly.     │
├──────────────────────┼──────────────────────────────────┼────────────────────────────────────────┤
│ 4. End-to-End Log    │ RequestLoggingMiddleware +       │ Intercept request -> Bind UUID to      │
│    Tracing & Error   │ Structlog + Promtail + Loki +    │ contextvars -> JSON log -> Promtail    │
│    Triage            │ Grafana                          │ scrape -> Query by correlation ID.     │
└──────────────────────┴──────────────────────────────────┴────────────────────────────────────────┘
```

- [ ] **Cross-Scenario 1: Authenticated State & RBAC Pipeline**
  * *Flow:* Client sends credentials $\rightarrow$ FastAPI validates with Pydantic $\rightarrow$ Passlib verifies bcrypt hash $\rightarrow$ PyJWT encodes payload with `SECRET_KEY` $\rightarrow$ Client attaches `Bearer <token>` to requests $\rightarrow$ `CurrentUser` dependency decodes JWT, queries Postgres identity map $\rightarrow$ `AuthPolicy` evaluates role permissions.
- [ ] **Cross-Scenario 2: Read-Through Caching & Cache Invalidation**
  * *Flow:* Client requests task list $\rightarrow$ `@redis_cache` decorator hashes query parameters + `workspace_id` $\rightarrow$ Checks Redis key `doit:v1:tasks:query:<hash>` $\rightarrow$ If hit: returns deserialized JSON instantly $\rightarrow$ If miss: acquires Redis lock `lock:...` with TTL $\rightarrow$ Executes SQLAlchemy 2.0 query against PostgreSQL $\rightarrow$ Normalizes Pydantic/SQLAlchemy model $\rightarrow$ Stores in Redis with TTL $\rightarrow$ Releases lock. On task creation/update: `clear_cache("doit:v1:tasks:*")` purges stale queries via `scan_iter`.
- [ ] **Cross-Scenario 3: Containerized Prestart Migration Pipeline**
  * *Flow:* `docker-compose.prod.yml` defines `prestart` service $\rightarrow$ Waits for `db` to pass healthcheck (`pg_isready`) $\rightarrow$ Runs `backend_pre_start.py` (Tenacity retry connection check) $\rightarrow$ Executes `alembic upgrade head` $\rightarrow$ Runs `initial_data.py` (seeds First Superuser) $\rightarrow$ `backend` service starts only after `prestart` completes with code 0 (`condition: service_completed_successfully`).

---

### 13.4 Master Priority Matrix

| Domain | Must Know (80% of Interviews & Daily Work) | Should Know (Edge Cases & Advanced Tuning) | Nice to Know (Specialized Optimizations) |
| :--- | :--- | :--- | :--- |
| **FastAPI & ASGI** | Concurrency (`async def` vs `def`), Dependency Injection, Middleware, Router setup, Exception handling | DAG dependency resolution, Yield lifecycle, App Lifespan context | Custom ASGI middleware, internal AnyIO taskgroups |
| **Pydantic v2** | `BaseModel`, `from_attributes=True`, `model_dump()`, Field validations, Pydantic-Settings | `@model_validator` before/after modes, Computed properties, Custom deserializers | `model_construct()` performance bypass, custom core schemas |
| **SQLAlchemy 2.0** | 2.0 `select()` syntax, Unit of Work, Session lifecycle, N+1 query problem, Cascades | `joinedload` vs `selectinload`, Connection pool sizing, `flush()` vs `commit()` | Custom compilation extensions, Session events/hooks |
| **PostgreSQL 17** | Relational DDL, B-Tree indexes, Foreign keys, ACID, `EXPLAIN ANALYZE` reading | MVCC internals (`xmin`/`xmax`), Isolation levels, Deadlock resolution | Partial indexes, UUIDv7 vs v4 fragmentation, WAL tuning |
| **Alembic** | Revision generation, Migration head management, `env.py`, `prestart.sh` automation | Zero-downtime expand/contract pattern, Autogenerate limitations | Writing custom migration operations, branch merges |
| **Redis** | Caching patterns, TTL expiration, Distributed locking (`SET NX EX`), Key naming | Cache stampede prevention, Double-checked locking, `SCAN` vs `KEYS *` | Lua script lock release, Redis replication/sentinel internals |
| **Security & Auth** | Bcrypt hashing, JWT structure & verification, OAuth2 Bearer, Multi-tenant RBAC | Stateless token revocation with Redis, Timing attack mitigations | Refresh token rotation, Asymmetric RS256 token signing |
| **Observability** | Structured JSON logging, `structlog` pipeline, Correlation ID tracking, Log rotation | Loki stream label cardinality rules, LogQL filtering, Promtail config | Custom Prometheus metric exporters, Grafana alerting rules |
| **Docker & Traefik**| Compose file syntax, Traefik dynamic labels, Service networks, Port mapping | Healthcheck dependencies, Multi-stage builds, Memory limits | ACME DNS challenge configuration, Docker overlay networks |
| **AWS S3 & Boto3** | Presigned URLs, S3 upload/download methods, Boto3 ClientError handling | Object key prefix partitioning, MIME Content-Type headers | Multipart direct uploads, S3 bucket lifecycle policies |
| **Testing** | Pytest fixtures, `TestClient`, HTTP status assertions, `dependency_overrides` | Database test isolation via transaction rollback, Mocking external APIs | Coverage HTML analysis, parallel test execution with `pytest-xdist` |

---

### 13.5 Final Self-Assessment Scoring System

Audit your readiness by counting the total number of **[MUST]** and **[SHOULD]** checkboxes you can confidently mark as **Strong (L3)** or **Interview Ready (L4)**:

$$\text{Readiness Score} = \frac{\text{Completed Checked Items}}{\text{Total MUST + SHOULD Items}} \times 100\%$$

```
                               READINESS BENCHMARK
                               
    0% ──────────── 50% ──────────────── 75% ─────────────── 90% ──────────── 100%
    │                │                    │                   │                 │
 [Not Ready]   [Partially Ready]  [Interview Ready]   [Strongly Prepared]  [Staff/Lead]
```

* **$< 50\%$ — Not Ready:** Significant gaps in fundamentals. Focus on Section 1 (FastAPI Concurrency), Section 3 (SQLAlchemy Unit of Work), and Section 4 (PostgreSQL Indexing).
* **$50\% - 74\%$ — Partially Ready:** Capable of daily feature development, but vulnerable to advanced interview questions regarding distributed caching, race conditions, and production debugging.
* **$75\% - 89\%$ — Interview Ready:** Confident across all core backend topics, trade-offs, and multi-tenant security architecture. Ready to interview for Mid-to-Senior Backend Engineer roles.
* **$\ge 90\%$ — Strongly Prepared / Senior Ready:** Thorough theoretical and practical mastery of the entire ecosystem, failure modes, observability pipelines, and system design trade-offs. Ready to lead technical architecture discussions.
