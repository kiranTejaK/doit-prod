# Master Backend Engineering Interview Answers: `doit-prod` Tech Stack

This document contains comprehensive, interview-ready answers to every question in [backend-tech-stack-interview-questions.md](file:///c:/Users/kiran/Desktop/doit-prod/docs/backend-tech-stack-interview-questions.md). It is written from the perspective of a **3-year Python Backend Engineer**, emphasizing architectural reasoning, production failure modes, performance trade-offs, and project-specific implementations.

---

# 1. FastAPI & The ASGI Web Ecosystem

## 1.1 ASGI Architecture & Web Server Execution

### Question 1
**Q:** What is the fundamental architectural difference between WSGI (e.g., Gunicorn sync workers, Flask) and ASGI (e.g., Uvicorn, FastAPI)?

**A:**
WSGI is a synchronous, sequential request-response specification. Under WSGI, each incoming request binds to a dedicated worker thread or process; that worker is completely blocked while waiting for I/O (such as database queries or network calls), unable to accept new traffic.

ASGI (Asynchronous Server Gateway Interface) is built on Python's `asyncio` event loop. Instead of dedicating one OS thread per connection, a single ASGI worker process runs a cooperative event loop. When a coroutine awaits I/O, the event loop yields execution and processes other incoming requests, HTTP connections, or WebSockets concurrently.

**Key Points:**
- **WSGI:** Synchronous, 1 thread/process = 1 active connection, high memory overhead at high concurrency, cannot handle WebSockets/SSE natively.
- **ASGI:** Asynchronous, non-blocking single-threaded event loop per worker, handles thousands of concurrent I/O connections efficiently, native support for HTTP/2, WebSockets, and background streaming.

---

### Question 2
**Q:** What role does Uvicorn play in relation to FastAPI, and what does the ASGI specification actually standardize between the server and the application?

**A:**
Uvicorn is the **ASGI web server** (HTTP protocol parser, TCP socket listener, and TLS/SSL terminator), while FastAPI is the **application framework** (routing, dependency injection, serialization, validation, and business logic).

The ASGI specification standardizes the interface callable:
```python
async def app(scope, receive, send):
    ...
```
- `scope`: A dictionary containing connection metadata (HTTP method, headers, path, client IP, protocol version).
- `receive`: An async callable that yields incoming HTTP request body chunks or WebSocket frames.
- `send`: An async callable used by the application to push response status codes, headers, and body chunks back to the server.

---

### Question 3
**Q:** When running Uvicorn in production, how do you configure workers, timeouts, and headers behind a reverse proxy?

**A:**
Behind a reverse proxy like Traefik or Nginx, Uvicorn should be configured to trust forwarded proxy headers and manage timeouts appropriately:

```bash
uvicorn app.main:app \
  --host 0.0.0.0 \
  --port 8000 \
  --proxy-headers \
  --forwarded-allow-ips='*' \
  --timeout-keep-alive 65 \
  --limit-concurrency 1000 \
  --no-access-log
```

**Key Points:**
- `--proxy-headers` & `--forwarded-allow-ips`: Instructs Uvicorn to parse `X-Forwarded-For` and `X-Forwarded-Proto`, ensuring `request.client.host` reports the real user IP and `request.url` reflects HTTPS.
- `--timeout-keep-alive 65`: Must be set slightly higher than the reverse proxy's upstream keep-alive timeout (e.g., Traefik/Nginx default of 60s) to prevent race conditions where Uvicorn closes a connection right as the proxy reuses it.
- `--no-access-log`: Suppresses raw Uvicorn stdout logs when centralized structured logging (like `structlog`) is handling request telemetry.

---

### Question 4
**Q:** How does Uvicorn's event loop interact with the OS network stack (e.g., `epoll` on Linux, `kqueue` on BSD/macOS) to handle thousands of open socket connections concurrently?

**A:**
Uvicorn utilizes `uvloop` (an ultra-fast C/Cython wrapper around `libuv`). Under Linux, `libuv` registers non-blocking client TCP sockets with the OS kernel using `epoll` (or `kqueue` on macOS/BSD).

Instead of polling sockets in a busy loop, the worker thread sleeps in the kernel via `epoll_wait()`. When network packets arrive on any registered socket descriptor, the Linux kernel wakes the event loop and delivers the ready file descriptors. The event loop then resumes the corresponding suspended Python coroutines. This $O(1)$ event notification allows a single process to multiplex thousands of active connections with minimal CPU overhead.

---

### Question 5
**Q:** Why is running multiple worker processes inside a single Docker container generally considered an anti-pattern for ASGI applications deployed on container orchestrators?

**A:**
In containerized architectures (Docker Compose, Kubernetes, ECS), the orchestrator is designed to manage process lifecycles, health monitoring, and horizontal scaling.

**Disadvantages of multi-worker containers:**
1. **Health Check Ambiguity:** A single container health check (`/health-check/`) probes only one worker. If one child worker deadlocks or leaks memory, the container still appears "healthy" to the orchestrator.
2. **Resource Allocation & Autoscaling:** Orchestrators scale at the container level based on CPU/memory metrics. One worker per container provides a 1:1 mapping between container metrics and application load.
3. **Signal Forwarding & Graceful Termination:** Process managers inside containers (like Gunicorn managing Uvicorn workers) often swallow or mismanage `SIGTERM` signals from Docker, leading to ungraceful worker termination after timeout.

---

### Question 6
**Q:** If your FastAPI application is running on a memory-constrained VPS (e.g., 1GB RAM), how would you configure Uvicorn workers and connection limits to prevent out-of-memory (OOM) termination?

**A:**
On a 1GB VPS running PostgreSQL, Redis, Loki, and FastAPI simultaneously:
1. **Single Worker Process:** Run exactly 1 Uvicorn worker per container. Each Python process with FastAPI/SQLAlchemy consumes ~80–120MB baseline RAM.
2. **Set Hard Connection & Concurrency Limits:** Use `--limit-concurrency 100` and `--limit-max-requests 10000` (restarts worker after 10k requests to clear potential Python memory fragmentation).
3. **Docker Memory Limits:** Set `deploy.resources.limits.memory: 300M` in `docker-compose.prod.yml` to prevent a memory spike in FastAPI from taking down PostgreSQL or the host OS.

---

### Question 7
**Q:** A FastAPI endpoint starts returning `502 Bad Gateway` through the reverse proxy only when concurrent requests exceed 500 req/sec, but CPU utilization is only at 30%. What underlying network or ASGI worker limits would you investigate?

**A:**
**Investigation & Thought Process:**
1. **Uvicorn Backlog & Socket Queue:** Check `--backlog` parameter (default 2048). If incoming connection requests arrive faster than the event loop accepts them, the OS TCP backlog queue (`somaxconn`) overflows, and incoming SYN packets are dropped, prompting Traefik/Nginx to return 502.
2. **OS File Descriptor Limits:** Run `ulimit -n`. The default Linux limit is often 1024 open file descriptors. Under 500 req/sec with database connections and Redis sockets, the process exhausts available file descriptors (`EMFILE: Too many open files`).
3. **Upstream Keep-Alive Pool:** Check if the reverse proxy is exhausting local ephemeral ports connecting to the backend due to `TIME_WAIT` socket buildup.

---

### Question 8
**Q:** In this project's `docker-compose.prod.yml`, how is Uvicorn executed, and why are we relying on container-level management rather than Gunicorn process managers?

**A:**
In `doit-prod`, Uvicorn is executed directly as the container entrypoint process (PID 1). We rely on container-level orchestration because:
- Memory limits (`300M`) are strictly enforced per container to safeguard the 1GB VPS.
- Traefik dynamically routes traffic to the backend service container.
- Docker automatically restarts the container on failure (`restart: always`) and performs health checks directly against the Uvicorn endpoint using `pg_isready` and HTTP probes.

---

### Follow-up Questions (1.1)

#### Question 9
**Q:** If an ASGI server is single-threaded per worker, how can it serve 10,000 idle keep-alive connections without running out of threads?

**A:**
Idle keep-alive HTTP connections consume no CPU cycles; they are simply open socket file descriptors registered in the Linux kernel's `epoll` table. The single Uvicorn thread only executes Python code when data actually arrives on a socket. The only cost of 10,000 idle connections is a small amount of kernel socket buffer memory (~2–4KB per socket).

#### Question 10
**Q:** What happens if a client abruptly disconnects midway through an ongoing response stream in ASGI? Does the coroutine keep running, and how does FastAPI detect the disconnect?

**A:**
When a client disconnects, Uvicorn's socket read/write fails with an `EOF` / `BrokenPipeError`. Uvicorn sends an `http.disconnect` message over the ASGI `receive` channel. In standard FastAPI endpoints, the coroutine will continue running until it attempts to yield or send data back to the client, at which point an `asyncio.CancelledError` is raised, terminating the coroutine.

---

## 1.2 Concurrency Model (`async def` vs. `def`)

### Question 1
**Q:** In FastAPI, what happens behind the scenes when you declare an endpoint as `def endpoint()` versus `async def endpoint()`?

**A:**
- **`async def`:** FastAPI executes the route directly on the main event loop thread. It expects the code inside to be strictly non-blocking and use `await` for all I/O.
- **`def` (standard synchronous):** FastAPI recognizes that this function contains blocking code. To prevent it from freezing the event loop, FastAPI offloads the execution to an external threadpool managed by `anyio` (`anyio.to_thread.run_sync`). The event loop continues processing other requests while the worker thread executes the synchronous function.

---

### Question 2
**Q:** What is the Python Global Interpreter Lock (GIL), and how does it relate to asynchronous I/O in FastAPI?

**A:**
The GIL is a mutex that prevents multiple native OS threads from executing Python bytecode simultaneously within a single process. 

However, during **I/O-bound operations** (network socket reads, database queries via C-extensions, disk access), the Python C-runtime releases the GIL. Asynchronous I/O (FastAPI `asyncio`) does not use multiple threads for concurrency; it runs on a single thread and switches coroutines whenever an I/O wait occurs. Therefore, async I/O achieves high concurrency for network tasks without being bottlenecked by the GIL.

---

### Question 3
**Q:** If an endpoint needs to execute a database query using a synchronous library (like synchronous SQLAlchemy or `psycopg2`), should you declare the route as `def` or `async def`? Why?

**A:**
You **MUST** declare the route as `def`.

**Reasoning:**
Synchronous database drivers block the calling thread while waiting for PostgreSQL to execute queries and return bytes over TCP. If you put synchronous queries inside an `async def` route, it blocks the single event loop thread, completely freezing all other concurrent requests across the entire application for the duration of the query. Declaring it as `def` ensures FastAPI runs it inside the worker threadpool.

---

### Question 4
**Q:** How does FastAPI utilize AnyIO / Starlette's threadpool for synchronous `def` endpoints? What is the default threadpool size limit, and what happens when that limit is saturated?

**A:**
FastAPI uses `anyio.to_thread.run_sync`, which wraps a threadpool with a default limit of **40 tokens (threads)**.

When 40 concurrent synchronous requests are actively executing, the 41st request is queued in memory. If all 40 threads are occupied with slow database queries (e.g., taking 2 seconds each), new incoming requests experience queueing delay and latency spikes, even though the CPU is largely idle.

---

### Question 5
**Q:** If someone accidentally calls `time.sleep(5)` or a synchronous HTTP client (`requests.get(...)`) inside an `async def` route, what is the precise impact on other concurrent users hitting completely different endpoints on that worker?

**A:**
It completely stops the entire worker process for 5 seconds. Because `time.sleep(5)` does not yield control back to the event loop (unlike `await asyncio.sleep(5)`), no other coroutine can run. Any other user attempting to log in, view tasks, or hit `/health-check/` on that worker will hang until the 5-second sleep finishes.

---

### Question 6
**Q:** How do you profile and detect event loop blockage in a running production FastAPI service?

**A:**
1. **Enable Asyncio Debug Mode / Slow Callback Detection:** Configure the loop to log callbacks taking longer than 100ms:
   ```python
   loop = asyncio.get_running_loop()
   loop.slow_callback_duration = 0.1
   ```
2. **Use Profilers:** Tools like `yappi` (coroutine-aware profiler) or `py-spy` (non-intrusive sampling profiler that captures flamegraphs of running Python processes without restarting them).
3. **Heartbeat Task Monitoring:** Run a background task that sleeps for 1 second (`await asyncio.sleep(1)`) and measures clock drift. If the task took 2.5s to wake up, the event loop was blocked for 1.5s.

---

### Question 7
**Q:** An endpoint declared as `async def get_dashboard()` runs in 15ms under low traffic. Under a load of 100 concurrent requests, the average response time climbs to 4,500ms while CPU usage drops to near zero. What is the most likely root cause in the code?

**A:**
**Diagnosis:** The endpoint was declared as `async def`, but inside the function or one of its dependencies, a synchronous, blocking call is being executed (e.g., synchronous SQLAlchemy `session.execute()`, synchronous `redis.get()`, or `requests.get()`). 

Under low traffic (1 user), 15ms feels fast. Under 100 concurrent requests, because the route is `async def`, all 100 requests are serialized on the single event loop thread:
$$100 \times 15\text{ms} = 1500\text{ms} - 4500\text{ms}$$
CPU usage is near zero because the thread is spending all its time idle inside OS socket I/O locks.

---

### Question 8
**Q:** Looking at this project's backend routes, why are our route handlers declared with `def` when interacting with synchronous SQLAlchemy sessions, and what would break if we switched to `async def` without an async engine?

**A:**
In `doit-prod`, we use the synchronous `SQLAlchemy 2.0 / SQLModel` engine with `psycopg` driver.

Our route handlers are declared with `def` so that FastAPI automatically dispatches each request to its worker threadpool. If we changed them to `async def` without migrating the engine to `create_async_engine()` and `AsyncSession`, synchronous database calls would block Uvicorn's event loop, destroying concurrent throughput.

---

### Follow-up Questions (1.2)

#### Question 9
**Q:** If you must run a CPU-bound operation (e.g., image resizing or complex hashing) in FastAPI, how should you offload it so it blocks neither the event loop nor the worker threadpool?

**A:**
Offload it to a `concurrent.futures.ProcessPoolExecutor` using `loop.run_in_executor(process_pool, func, *args)` or dispatch it to an external asynchronous task worker (like Celery/RQ). Running heavy CPU work in processes bypasses the GIL entirely.

#### Question 10
**Q:** Can you mix `async` dependencies with synchronous `def` route handlers in FastAPI? How does the dependency resolver handle the execution context switch?

**A:**
Yes. FastAPI's dependency injection resolver handles this transparently: it awaits the `async` dependency on the event loop first, extracts the resolved value, and then passes it into the synchronous `def` route handler running inside the threadpool.

---

## 1.3 Dependency Injection System

### Question 1
**Q:** What is FastAPI's Dependency Injection (`Depends`) system, and what problems does it solve compared to global imports or Django-style middleware?

**A:**
FastAPI's DI system allows route handlers to declare their required dependencies (database sessions, authentication credentials, permission checkers, pagination params) as function parameters.

**Problems it solves:**
- **Decoupling & Testability:** Enables seamless mocking via `app.dependency_overrides` without monkeypatching globals.
- **Granular Scoping:** Solves middleware limitations where logic applies globally; dependencies can be applied per-route or per-router.
- **Resource Lifecycle Management:** Yield-based dependencies automatically manage initialization and teardown (e.g., closing DB sessions).

---

### Question 2
**Q:** How do you define a dependency that yields a resource and guarantees cleanup code execution after the response is sent?

**A:**
Use Python generator functions with `yield`:

```python
def get_db():
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
```
Code before `yield` runs prior to the route handler; code after `yield` runs after the HTTP response has been generated and sent to the client.

---

### Question 3
**Q:** How do you compose hierarchical dependencies in FastAPI (e.g., `get_db` $\rightarrow$ `get_current_user` $\rightarrow$ `get_current_active_workspace_admin`)?

**A:**
FastAPI automatically resolves sub-dependencies:

```python
def get_current_user(
    session: Session = Depends(get_db), 
    token: str = Depends(oauth2_scheme)
) -> User:
    ...

def get_current_active_workspace_admin(
    workspace_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_db)
) -> User:
    # Verifies workspace role
    return current_user
```

---

### Question 4
**Q:** How does FastAPI construct and resolve the Dependency Directed Acyclic Graph (DAG)? What does the `use_cache=True` (default) parameter in `Depends` do across sub-dependencies within a single request?

**A:**
FastAPI analyzes function type annotations at application startup and builds a Directed Acyclic Graph (DAG) of dependencies.

When `use_cache=True` (the default), if multiple sub-dependencies depend on the same dependency (e.g., both `get_current_user` and `get_current_workspace` depend on `get_db`), FastAPI executes `get_db` **only once per HTTP request**, caching the yielded value in the request's internal scope and sharing the exact same instance across the graph.

---

### Question 5
**Q:** If an unhandled exception is raised inside a route handler, what is the exact execution flow of the `yield` statement in a database session dependency? Does the code after `yield` execute? Does the exception propagate into the generator?

**A:**
Yes. In Starlette/FastAPI, if an exception is raised inside a route handler, FastAPI re-raises that exception inside the generator at the point of the `yield` statement (similar to calling `generator.throw()`).

If your dependency wraps `yield` in `try ... except ... finally`, the `except` block catches the exception, executes `session.rollback()`, and the `finally` block executes `session.close()`.

---

### Question 6
**Q:** How do you leverage `app.dependency_overrides` during integration testing to mock database connections and authenticated user identities without modifying application source code?

**A:**
In Pytest fixtures, you override the dependency callable in the FastAPI instance's dictionary:

```python
@pytest.fixture
def client(db_session: Session):
    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()
```

---

### Question 7
**Q:** A developer wrote a `yield` dependency for database sessions, but noticed that when an endpoint raises an `HTTPException(404)`, database transactions are being rolled back instead of committed, or connections are leaking. How would you structure the `try ... except ... finally` block inside the dependency to prevent this?

**A:**
`HTTPException` is an expected application control-flow exception, not a database crash.

```python
def get_db():
    db = SessionLocal()
    try:
        yield db
    except HTTPException:
        # Expected HTTP errors should not necessarily corrupt session state,
        # but if modifications occurred, decide whether to commit or rollback.
        raise
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
```
Explicitly separate `HTTPException` from unexpected system crashes (`Exception`) and always ensure `db.close()` in `finally`.

---

### Question 8
**Q:** How does `backend/app/api/deps.py` implement `SessionDep`, `CurrentUser`, and `get_current_active_superuser`? How are type annotations (`Annotated`) utilized to enforce clean endpoint signatures?

**A:**
In `backend/app/api/deps.py`:
```python
SessionDep = Annotated[Session, Depends(get_db)]
TokenDep = Annotated[str, Depends(reusable_oauth2)]
CurrentUser = Annotated[User, Depends(get_current_user)]
```
Using `typing.Annotated`, endpoint signatures remain concise and readable:
```python
@router.get("/tasks")
def list_tasks(session: SessionDep, current_user: CurrentUser):
    ...
```

---

### Follow-up Questions (1.3)

#### Question 9
**Q:** What happens if two independent sub-dependencies both depend on `get_db` with `use_cache=True`? Do they share the exact same SQLAlchemy Session instance or get distinct sessions?

**A:**
They share the exact same `Session` instance. This guarantees that operations performed across different service dependencies within the same HTTP request participate in the same database transaction.

#### Question 10
**Q:** Why is `Security(get_current_user, scopes=[...])` used instead of `Depends(get_current_user)` when building OAuth2/OpenAPI compliant authorization?

**A:**
`Security` is a subclass of `Depends` that accepts an additional `scopes` parameter. It registers the required OAuth2 security scopes in the generated OpenAPI (`/docs`) specification, allowing Swagger UI to render permission locks.

---

## 1.4 Middleware & Request Lifecycle

### Question 1
**Q:** What is the execution order of Starlette Middleware, FastAPI Dependencies, Route Handlers, and Exception Handlers during an incoming HTTP request?

**A:**
1. **Incoming Request** $\rightarrow$ Traverses **Middleware Stack** (outermost to innermost, e.g., CORS $\rightarrow$ Logging).
2. **Routing & Parameter Parsing** $\rightarrow$ Path and query parameters matched.
3. **Dependency Injection Tree Evaluation** (e.g., `get_db`, `get_current_user`).
4. **Pydantic Request Body Validation**.
5. **Route Handler Execution** (controller logic).
6. **Pydantic Response Serialization** (`response_model`).
7. **BackgroundTasks Dispatch**.
8. **Dependency Teardown** (code after `yield` in generators).
9. **Middleware Response Traversal** (innermost to outermost).
10. **Outgoing HTTP Response**.

---

### Question 2
**Q:** What is CORS, why do browsers enforce it, and how is it configured in FastAPI?

**A:**
CORS (Cross-Origin Resource Sharing) is a browser security mechanism that restricts web applications running at one origin (domain, protocol, or port) from making AJAX requests to a different origin.

In FastAPI:
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://dashboard.example.com"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

---

### Question 3
**Q:** How do you write a custom `BaseHTTPMiddleware` in FastAPI that measures endpoint execution time and appends a custom header (e.g., `X-Process-Time`) to the HTTP response?

**A:**
```python
import time
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

class ProcessTimeMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        start_time = time.perf_counter()
        response = await call_next(request)
        process_time = time.perf_counter() - start_time
        response.headers["X-Process-Time"] = f"{process_time:.4f}"
        return response
```

---

### Question 4
**Q:** Why does FastAPI return an HTTP `307 Temporary Redirect` when a route is defined with a trailing slash (e.g., `/items/`) but requested without one (e.g., `/items`), and why does this frequently break CORS preflight requests in Single Page Applications?

**A:**
FastAPI/Starlette enforces strict URL routing. If a route is registered as `/items/`, requesting `/items` causes FastAPI to issue a `307 Temporary Redirect` to the canonical URL.

**Why it breaks CORS:**
Browsers do not forward custom authorization headers (like `Authorization: Bearer ...`) or request bodies across unapproved redirect responses during CORS preflight checks. The browser flags the redirect as an insecure cross-origin error, failing the request before the frontend code can read the response.

---

### Question 5
**Q:** What are the performance overheads and context variable propagation pitfalls associated with `BaseHTTPMiddleware` in Starlette, and when should you use pure ASGI middleware instead?

**A:**
`BaseHTTPMiddleware` wraps request processing in a separate `anyio` task group to intercept streaming bodies. This introduces memory overhead, adds latency to streaming responses, and can cause context variable (`contextvars`) mutations inside the route handler to lose synchronization with the outer middleware.

For high-throughput proxies or simple header injection, writing a pure ASGI middleware (`async def __call__(self, scope, receive, send)`) avoids taskgroup overhead.

---

### Question 6
**Q:** How should a logging middleware handle request body consumption without causing subsequent route handlers or Pydantic validation to receive an empty stream?

**A:**
HTTP request bodies in ASGI are single-read async streams. If a middleware calls `await request.body()`, the stream is consumed.

To allow downstream route handlers to read the body, the middleware must reconstruct the receive callable:
```python
body = await request.body()

async def receive():
    return {"type": "http.request", "body": body, "more_body": False}

request = Request(request.scope, receive=receive)
response = await call_next(request)
```

---

### Question 7
**Q:** A frontend client sends a `POST` request with JSON body to `/api/v1/auth/login`. The browser console reports a CORS error, but the backend logs show a `307 Redirect` and no CORS headers on the response. How do you fix this permanently in both backend route declarations and frontend Axios configuration?

**A:**
**Fix:**
1. **Backend Route Normalization:** Ensure all backend API route decorators are explicitly defined without trailing slashes: `@router.post("/login")` instead of `@router.post("/login/")`.
2. **Frontend Axios Base URL:** Ensure frontend API requests match exact route paths without trailing slashes.
3. **CORS Middleware Precedence:** Ensure `CORSMiddleware` is added as the outermost middleware so redirect responses still receive CORS headers.

---

### Question 8
**Q:** How does `RequestLoggingMiddleware.py` in this project extract or generate `X-Correlation-ID`, bind it to `structlog.contextvars`, exclude health check endpoints, and ensure context cleanup in the `finally` block?

**A:**
In `backend/app/middleware/RequestLoggingMiddleware.py`:
1. **Extraction/Generation:** Reads `request.headers.get("X-Correlation-ID")` or generates `str(uuid.uuid4())`.
2. **Health Check Exclusion:** Checks `if request.url.path.endswith("/health-check/"): return await call_next(request)`.
3. **Binding:** Calls `structlog.contextvars.bind_contextvars(correlation_id=correlation_id)`.
4. **Header Injection:** Sets `response.headers["X-Correlation-ID"] = correlation_id`.
5. **Cleanup:** In the `finally` block, executes `structlog.contextvars.clear_contextvars()` to prevent correlation ID leakage across async worker tasks.

---

### Follow-up Questions (1.4)

#### Question 9
**Q:** If an unhandled exception occurs inside a custom middleware *before* `call_next(request)` is reached, does FastAPI's `@app.exception_handler(Exception)` catch it? Why or why not?

**A:**
No. Exception handlers registered with `@app.exception_handler` reside *inside* Starlette's routing layer. Middleware executing before the routing layer sits outside this boundary. An exception raised in outer middleware results in a raw 500 error generated by the ASGI server.

#### Question 10
**Q:** How does the `CORSMiddleware` determine whether to respond directly to an `OPTIONS` request or pass it downstream to the router?

**A:**
If the incoming HTTP method is `OPTIONS` and contains the header `Access-Control-Request-Method`, `CORSMiddleware` identifies it as a preflight request. It evaluates the origin against `allow_origins`, responds immediately with `200 OK` and appropriate CORS headers, and terminates the request without invoking the downstream router.

---

## 1.5 Exception Handling & Background Tasks

### Question 1
**Q:** What is the difference between raising a standard Python `Exception`, raising FastAPI's `HTTPException`, and returning a JSON response with a 4xx status code?

**A:**
- **Standard `Exception`:** Unhandled error; triggers a 500 Internal Server Error and logs a traceback.
- **FastAPI `HTTPException`:** Explicit, controlled error halting endpoint execution immediately, triggering FastAPI's exception handler to return structured JSON with the specified HTTP status code.
- **Returning a `JSONResponse(status_code=400)`:** Completes function execution normally and returns the payload; does not trigger exception handling hooks.

---

### Question 2
**Q:** What is FastAPI's `BackgroundTasks`, and how does it differ from a distributed task queue like Celery or RQ?

**A:**
- **`BackgroundTasks`:** Runs in-process inside the same Python server instance immediately after the HTTP response is sent. It shares process memory and CPU.
- **Celery / RQ:** Distributed task queue. Serializes job payloads into an external message broker (Redis/RabbitMQ); executed by separate worker processes on separate machines with retry logic, rate limiting, and persistence across server restarts.

---

### Question 3
**Q:** How do you register a custom exception handler for `RequestValidationError` to override the default 422 error payload with a custom UI-friendly error format?

**A:**
```python
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    errors = [
        {"field": ".".join(str(loc) for loc in err["loc"]), "message": err["msg"]}
        for err in exc.errors()
    ]
    return JSONResponse(
        status_code=422,
        content={"success": False, "error_type": "validation_error", "details": errors},
    )
```

---

### Question 4
**Q:** At what exact stage in the request/response lifecycle are `BackgroundTasks` executed? Does a failure in a background task alter the HTTP status code already sent to the client?

**A:**
`BackgroundTasks` execute **after** the HTTP response status and headers have already been transmitted over the socket to the client.

A failure or unhandled exception in a background task **cannot** alter the status code (the client has already received `200 OK`). The exception must be caught and logged by the server.

---

### Question 5
**Q:** What happens if a background task created via `BackgroundTasks.add_task()` relies on a database session yielded from a FastAPI dependency? Why does this fail with a "Session is closed" error, and how must you pass database access to background jobs?

**A:**
FastAPI closes dependency generator sessions immediately after sending the response, *before* background tasks finish.

**Why it fails:** The background task attempts to query the database using a closed session.
**Fix:** Do not pass the request-scoped session. Instead, pass the session factory (`SessionLocal`) and instantiate a fresh, independent session inside the background function using a context manager.

---

### Question 6
**Q:** When is it acceptable to use FastAPI `BackgroundTasks` in production, and at what scale/criticality threshold must you migrate to an external broker-backed worker queue (e.g., Redis + Celery/ARQ)?

**A:**
**Acceptable for:** Non-critical, fast, lightweight tasks (e.g., firing a non-blocking email notification, logging audit metrics, incrementing view counters).

**Must migrate to Celery/ARQ when:**
1. Task execution takes $>2$ seconds (e.g., video processing, large PDF generation, AI model inference).
2. Tasks must survive server crashes (durability/retry requirements).
3. Tasks require rate limiting, prioritization, or distributed scaling across dedicated compute workers.

---

### Question 7
**Q:** An endpoint successfully returns `200 OK` to the client, but the background task responsible for sending an invitation email silently fails. How do you configure structured logging and error tracking to capture background task failures?

**A:**
Wrap the background task execution in a top-level error handler that logs via `structlog` and reports to Sentry:
```python
def send_email_background(email_data: dict):
    try:
        smtp_service.send(email_data)
        logger.info("email_sent_successfully", recipient=email_data["to"])
    except Exception as exc:
        logger.error("email_delivery_failed", recipient=email_data["to"], error=str(exc))
        sentry_sdk.capture_exception(exc)
```

---

### Question 8
**Q:** In this project, how are invitation and reset password emails dispatched? Are they synchronous, using `BackgroundTasks`, or handled via an external worker? What are the reliability trade-offs of this decision?

**A:**
In `doit-prod`, emails are dispatched synchronously or via utilities using Brevo/SMTP.

**Trade-offs:**
- **Advantage:** Low operational overhead; no need to maintain a separate Celery worker container and Redis broker state on a 1GB VPS.
- **Disadvantage:** If the SMTP server is slow (e.g., 800ms latency), the HTTP request response time increases by 800ms.

---

### Follow-up Questions (1.5)

#### Question 9
**Q:** If the server process is abruptly restarted (e.g., SIGTERM / OOM kill) while 50 FastAPI `BackgroundTasks` are queued in memory, what happens to those jobs?

**A:**
All queued background tasks in memory are permanently lost because they are not backed by a persistent queue on disk or Redis.

#### Question 10
**Q:** How does FastAPI's `HTTPException` differ from Starlette's `HTTPException` in terms of headers and response formatting?

**A:**
FastAPI's `HTTPException` allows passing arbitrary data structures (dicts, lists) to the `detail` parameter, which are automatically serialized to JSON. Starlette's `HTTPException` strictly accepts only string details.

---

# 2. Pydantic v2 & Pydantic-Settings

## 2.1 Pydantic Core Mechanics & Validation

### Question 1
**Q:** What is the primary purpose of Pydantic in a FastAPI backend, and how does it differentiate data *validation* from data *parsing/coercion*?

**A:**
Pydantic guarantees that input and output payloads match expected types.

- **Validation:** Enforcing business and structural constraints (e.g., ensuring an email has an `@` sign, or an integer is $>0$).
- **Parsing/Coercion:** Transforming raw input types into Python types (e.g., converting the string `"123"` into the integer `123`, or parsing an ISO-8601 string into a `datetime` object).

---

### Question 2
**Q:** What is the difference between a Pydantic `BaseModel` and a Python standard library `dataclass`?

**A:**
- **Python `dataclass`:** Pure Python container for storing data; performs no runtime type coercion or validation by default (passing `"hello"` to an `int` field succeeds without error).
- **Pydantic `BaseModel`:** Executes rigorous runtime type validation, coercion, serialization, JSON schema generation, and Rust-powered performance optimizations via `pydantic-core`.

---

### Question 3
**Q:** How do you define optional fields, default values, and field-level metadata (such as `min_length`, `max_length`, `regex`, `gt`) using `Field()` in Pydantic v2?

**A:**
```python
from pydantic import BaseModel, Field

class TaskCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255, description="Task title")
    priority: str = Field(default="medium", pattern="^(low|medium|high|urgent)$")
    estimated_hours: float | None = Field(default=None, gt=0)
```

---

### Question 4
**Q:** How does Pydantic v2 achieve up to 5-10x performance gains over Pydantic v1? What is the role of `pydantic-core` written in Rust?

**A:**
In Pydantic v1, validation and parsing were implemented in pure Python, traversing dictionary trees recursively.

In Pydantic v2, all core validation logic, type coercion, and JSON parsing are implemented in **Rust** inside the compiled `pydantic-core` library. Python bytecode execution is completely bypassed during JSON serialization and validation loops.

---

### Question 5
**Q:** What is the difference between `@field_validator` and `@model_validator` in Pydantic v2? When must you use `mode='before'` versus `mode='after'`?

**A:**
- **`@field_validator`:** Validates a single specific field.
- **`@model_validator`:** Validates the entire model instance across multiple fields (e.g., checking that `end_date > start_date`).
- **`mode='before'`:** Runs *before* Pydantic's internal type parsing (receives raw input data/dict).
- **`mode='after'`:** Runs *after* standard type validation (receives the validated Python class instance).

---

### Question 6
**Q:** Why should API request schemas and API response schemas be defined as separate Pydantic models even when their fields are 90% identical?

**A:**
**Reasoning:**
1. **Security (Over-Posting / Mass Assignment):** Request models must restrict what clients can write (clients should never submit `id`, `created_at`, or `hashed_password`).
2. **Data Leakage:** Response models define the exact public boundary (masking internal secrets or soft-delete flags).
3. **Validation Symmetry:** Request fields might be optional during updates (`PATCH`), whereas response fields must be present.

---

### Question 7
**Q:** A Pydantic validation error occurs on an incoming payload, but the error message returned to the client exposes internal database column names and schema structures. How do you sanitize validation error responses for production security?

**A:**
Implement a custom exception handler for `RequestValidationError` that maps error locations to client-facing DTO field names and hides internal database schema metadata.

---

### Question 8
**Q:** How does this project structure its schemas in `backend/app/schemas.py` to differentiate between `TaskCreate`, `TaskUpdate`, `TaskPublic`, and `TasksPublic`?

**A:**
In `backend/app/schemas.py`:
- `TaskBase`: Shared attributes (`title`, `description`, `priority`, `due_date`).
- `TaskCreate`: Inherits `TaskBase`, requires `title`, accepts `project_id` and `section_id`.
- `TaskUpdate`: All fields optional (`title: str | None = None`).
- `TaskPublic`: Inherits `TaskBase`, includes database-generated fields (`id`, `owner_id`, `created_at`).
- `TasksPublic`: List wrapper (`data: list[TaskPublic]`, `count: int`) for standardized paginated API responses.

---

### Follow-up Questions (2.1)

#### Question 9
**Q:** What is the difference between `model.model_dump()` and `model.model_dump_json()`? How do you customize serialization for data types like `datetime` or `UUID`?

**A:**
`model_dump()` returns a Python `dict`; `model_dump_json()` returns a serialized JSON `str`. Custom serialization is achieved using `@field_serializer` in Pydantic v2.

#### Question 10
**Q:** What does `model_construct()` do, and why is it dangerous to use on untrusted user input?

**A:**
`model_construct()` instantiates a Pydantic model **without running any validation or type checks**. It is fast, but if used on untrusted user input, invalid data or malicious types will bypass validation entirely.

---

## 2.2 ORM Hydration & Pydantic-Settings

### Question 1
**Q:** What does `model_config = ConfigDict(from_attributes=True)` do in Pydantic v2 (previously `orm_mode = True` in v1)?

**A:**
It allows Pydantic to read data from object attributes (using `getattr(obj, 'field')`) in addition to dictionary keys (`obj['field']`). This enables direct serialization of SQLAlchemy ORM instances into Pydantic response schemas.

---

### Question 2
**Q:** How does `pydantic-settings` load and cast environment variables into a typed Python object?

**A:**
`pydantic-settings` reads system environment variables and `.env` files. It matches environment variable names (case-insensitively) to fields declared on a `BaseSettings` class, automatically casting string values to the declared types (`int`, `bool`, `PostgresDsn`, etc.).

---

### Question 3
**Q:** How do you implement a `@computed_field` in a Pydantic Settings class (e.g., constructing a full database connection string from separate host, user, password, and port variables)?

**A:**
```python
from pydantic import PostgresDsn, computed_field
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    POSTGRES_SERVER: str
    POSTGRES_PORT: int = 5432
    POSTGRES_USER: str
    POSTGRES_PASSWORD: str
    POSTGRES_DB: str

    @computed_field
    @property
    def SQLALCHEMY_DATABASE_URI(self) -> PostgresDsn:
        return PostgresDsn.build(
            scheme="postgresql+psycopg",
            username=self.POSTGRES_USER,
            password=self.POSTGRES_PASSWORD,
            host=self.POSTGRES_SERVER,
            port=self.POSTGRES_PORT,
            path=self.POSTGRES_DB,
        )
```

---

### Question 4
**Q:** When serializing a SQLAlchemy model with lazy-loaded relationships using a Pydantic schema configured with `from_attributes=True`, what dangerous database behavior can be inadvertently triggered?

**A:**
If the Pydantic schema declares a relationship field (e.g., `comments: list[CommentPublic]`) that was not eagerly loaded in the SQL query, Pydantic's `getattr(orm_instance, 'comments')` access triggers an implicit synchronous SQL query for every parent record, causing the **N+1 query problem**.

---

### Question 5
**Q:** How do you implement custom pre-validators in `BaseSettings` to parse complex environment variables (like a comma-separated string or a JSON array of CORS origins) into a Python `list[str]`?

**A:**
```python
from typing import Annotated, Any
from pydantic import BeforeValidator

def parse_cors(v: Any) -> list[str]:
    if isinstance(v, str) and not v.startswith("["):
        return [i.strip() for i in v.split(",") if i.strip()]
    return v

class Settings(BaseSettings):
    BACKEND_CORS_ORIGINS: Annotated[list[str], BeforeValidator(parse_cors)] = []
```

---

### Question 6
**Q:** How do you implement "fail-fast" configuration validation so that if a required secret (e.g., `SECRET_KEY`, `POSTGRES_PASSWORD`) is missing or set to an insecure default, the application crashes immediately on startup rather than during a customer request?

**A:**
Use `@model_validator(mode="after")` in your `Settings` class:
```python
@model_validator(mode="after")
def check_secrets(self) -> Self:
    if self.ENVIRONMENT != "local" and self.SECRET_KEY in ("changethis", ""):
        raise ValueError("Insecure SECRET_KEY configured in non-local environment")
    return self
```
When `settings = Settings()` executes at module import, the app crashes immediately if invalid.

---

### Question 7
**Q:** You deployed your application to staging, and `Settings` raised a validation error stating `POSTGRES_PORT` is invalid because it was passed as `"5432"` (string). How does Pydantic handle environment variable type coercion, and why might it fail if custom validators are misconfigured?

**A:**
Pydantic attempts to coerce strings from environment variables into target types (`int`). However, if a custom `@field_validator(mode='before')` or pre-validator assumes the input is already an integer or returns an unparsed string improperly, Pydantic's default casting pipeline is interrupted, raising a validation error.

---

### Question 8
**Q:** In `backend/app/core/config.py`, how does `Settings` validate that `SECRET_KEY` and `FIRST_SUPERUSER_PASSWORD` are not set to `"changethis"` in non-local environments?

**A:**
In `backend/app/core/config.py`:
`_enforce_non_default_secrets()` checks `ENVIRONMENT`. If `ENVIRONMENT == "local"`, it emits a `warnings.warn()`. If `ENVIRONMENT != "local"`, it raises a `ValueError`, halting startup.

---

### Follow-up Questions (2.2)

#### Question 9
**Q:** What is the precedence order in `pydantic-settings` when a variable is defined in the system environment, a `.env` file, and as a default value in the Python class?

**A:**
1. System environment variables (highest priority).
2. `.env` file variables.
3. Default values declared in the `Settings` class (lowest priority).

#### Question 10
**Q:** How do you exclude sensitive fields (like API keys or passwords) from appearing in log outputs when printing or dumping a `Settings` model?

**A:**
Use `SecretStr` from Pydantic (`SECRET_KEY: SecretStr`). When dumped or converted to string, it prints as `SecretStr('**********')`. To access the raw string value in code, call `.get_secret_value()`.

---

# 3. SQLAlchemy 2.0 & SQLModel

## 3.1 2.0 Query Syntax & Declarative Modeling

### Question 1
**Q:** What is SQLModel, and how does it unify Pydantic models with SQLAlchemy declarative tables?

**A:**
SQLModel is a library written by the creator of FastAPI that inherits from both Pydantic's `BaseModel` and SQLAlchemy's `DeclarativeBase`.

By defining a single class with type annotations and `table=True`, SQLModel creates both a valid **Pydantic schema** (for API validation/serialization) and a valid **SQLAlchemy ORM table mapping**, eliminating duplicate model definitions.

---

### Question 2
**Q:** What is the difference between SQLAlchemy 1.x legacy query syntax (`session.query(User).filter(...)`) and SQLAlchemy 2.0 syntax (`session.execute(select(User).where(...))`)?

**A:**
- **1.x Legacy:** Fluent interface tied directly to the `Query` object (`session.query(User)`). It mixed query construction with execution.
- **2.0 Syntax:** Clean separation of query construction (`select(User).where(...)`) and execution (`session.execute(statement)`). Matches standard SQL syntax, supports strict typing, and works identically across synchronous and asynchronous engines.

---

### Question 3
**Q:** How do you write a complete SQLAlchemy 2.0 query with filtering, sorting, limit, offset, and scalar execution returning a list of ORM objects?

**A:**
```python
stmt = (
    select(Task)
    .where(Task.workspace_id == workspace_id, Task.status != "archived")
    .order_by(Task.due_date.asc().nulls_last())
    .offset(skip)
    .limit(limit)
)
tasks = session.execute(stmt).scalars().all()
```

---

### Question 4
**Q:** What is the difference between `session.execute(statement).scalars().all()`, `session.execute(statement).scalars().first()`, and `session.execute(statement).scalar_one_or_none()`? When will `scalar_one()` raise an exception?

**A:**
- **`.scalars().all()`:** Returns a list of all matching ORM instances.
- **`.scalars().first()`:** Returns the first record or `None` without raising exceptions if multiple rows exist.
- **`.scalar_one_or_none()`:** Returns the single matching record, or `None` if zero exist. Raises `MultipleResultsFound` if more than one row matches.
- **`.scalar_one()`:** Raises `NoResultFound` if 0 rows exist, and `MultipleResultsFound` if $>1$ row exists.

---

### Question 5
**Q:** How do you model self-referential relationships (e.g., hierarchical task dependencies or parent/child comments) and composite foreign keys in SQLModel / SQLAlchemy 2.0?

**A:**
```python
class Comment(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    content: str
    parent_id: uuid.UUID | None = Field(default=None, foreign_key="comment.id")
    
    parent: "Comment" | None = Relationship(
        back_populates="replies",
        sa_relationship_kwargs={"remote_side": "Comment.id"}
    )
    replies: list["Comment"] = Relationship(back_populates="parent")
```

---

### Question 6
**Q:** Why is executing raw SQL queries via `session.execute(text("SELECT ..."))` risky if not parameterized, and how does SQLAlchemy ensure SQL injection protection when using parameterized `text()` or core constructs?

**A:**
String-concatenating user input into `text("SELECT * FROM users WHERE id = '" + user_id + "'")` allows attackers to inject malicious SQL commands (e.g., `' OR '1'='1`).

SQLAlchemy parameterized queries (`text("SELECT * FROM users WHERE id = :user_id")`) pass user inputs separately from the SQL statement. The database driver transmits parameters via prepared statements, ensuring the database treats user input strictly as literal values, never as executable SQL.

---

### Question 7
**Q:** A developer wrote `session.exec(select(Task).where(Task.id == task_id))`. In SQLModel, why does this return `None` or an iterable instead of a single object if `.first()` is omitted?

**A:**
`session.exec(statement)` returns a `ScalarResult` iterator representing the database cursor. If you do not call `.first()` or `.one_or_none()`, you are holding the iterator object itself, not the underlying `Task` entity.

---

### Question 8
**Q:** In `backend/app/models.py`, how are the `User`, `Workspace`, `Project`, `Section`, and `Task` models structured? How are UUIDs configured as primary keys with default generation?

**A:**
In `backend/app/models.py`:
Each table inherits from `SQLModel, table=True`. Primary keys are configured as:
```python
id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
```
Relationships use foreign keys with explicit cascades (`ForeignKey("workspace.id", ondelete="CASCADE")`) and bidirectional mappings (`Relationship(back_populates="...")`).

---

### Follow-up Questions (3.1)

#### Question 9
**Q:** What is the difference between `table=True` and `table=False` on a SQLModel class?

**A:**
`table=True` generates a database table mapping via SQLAlchemy declarative metadata. `table=False` creates a pure Pydantic schema used for API validation and serialization without creating a database table.

#### Question 10
**Q:** How do you perform an `UPDATE` or `DELETE` statement in SQLAlchemy 2.0 without fetching the entity into memory first (bulk execution)?

**A:**
```python
stmt = (
    update(Task)
    .where(Task.project_id == project_id)
    .values(status="archived")
)
session.execute(stmt)
session.commit()
```

---

## 3.2 Session Lifecycle, Unit of Work & Transactions

### Question 1
**Q:** What is the "Unit of Work" pattern, and how does the SQLAlchemy `Session` implement it?

**A:**
The Unit of Work pattern maintains a list of objects affected by a business transaction and coordinates the writing out of changes.

In SQLAlchemy, the `Session` acts as the Unit of Work. When you modify, add, or delete objects, the session tracks them in memory. It does not execute SQL immediately; instead, it accumulates changes and flushes them to the database in a single optimized batch transaction upon `session.flush()` or `session.commit()`.

---

### Question 2
**Q:** What are the four states an ORM entity can occupy in relation to a session (*Transient*, *Pending*, *Persistent*, *Detached*)?

**A:**
1. **Transient:** Newly instantiated in Python (`user = User(...)`); not in session, no database identity.
2. **Pending:** Added to session via `session.add(user)`; not yet flushed to database.
3. **Persistent:** Flushed to database; has primary key; present in session identity map.
4. **Detached:** Exists in database with a primary key, but the session that loaded it has been closed.

---

### Question 3
**Q:** What is the exact difference between `session.flush()` and `session.commit()`? Give a concrete code example where calling `session.flush()` is necessary.

**A:**
- **`flush()`:** Sends SQL statements (INSERT/UPDATE/DELETE) to the database transaction buffer. Generates primary keys and database-side defaults, but **does not finalize** the transaction on disk.
- **`commit()`:** Commits the transaction permanently to disk, closes the transaction boundary, and releases table locks.

**Example where `flush()` is necessary:**
```python
new_project = Project(name="Q3 Roadmap", workspace_id=ws_id)
session.add(new_project)
session.flush() # Generates new_project.id without committing transaction

# Use generated ID immediately for child records
new_section = Section(title="To Do", project_id=new_project.id)
session.add(new_section)
session.commit() # Commit both atomically
```

---

### Question 4
**Q:** What is the Identity Map in SQLAlchemy? If you execute two identical `select(User).where(User.id == 1)` queries within the same transaction, does SQLAlchemy query the database twice?

**A:**
The Identity Map is an in-memory dictionary inside the `Session` that maps `(ModelClass, PrimaryKey)` to the loaded ORM object.

If you query `User` with ID 1 twice in the same session, SQLAlchemy executes the SQL query, but upon inspecting the result, recognizes that primary key 1 is already in the Identity Map and returns the existing in-memory Python object, ensuring object uniqueness.

---

### Question 5
**Q:** What happens when an exception is raised halfway through a multi-step database operation inside an active transaction? If `session.rollback()` is not called before the connection is returned to the pool, what happens to the next request that borrows that connection?

**A:**
If an exception occurs and `rollback()` is not called, the underlying PostgreSQL transaction remains in an aborted or dirty state (`ERROR: current transaction is aborted, commands ignored until end of transaction block`).

When the connection is returned to the pool and borrowed by a subsequent request, that next request immediately fails on its first SQL statement.

---

### Question 6
**Q:** Why should long-running I/O operations (such as calling an external payment API or generating an AI embedding) NEVER be performed while holding an open SQLAlchemy transaction?

**A:**
Open transactions hold database connection slots from the pool and hold row/table locks in PostgreSQL.

If 50 requests are each blocked for 3 seconds waiting for an external AI API while holding open transactions, all 50 database pool connections are occupied doing nothing, causing database connection exhaustion and taking down the entire API for all other users.

---

### Question 7
**Q:** You encounter a `DetachedInstanceError: Parent instance <Task at 0x...> is not bound to a Session; lazy load operation of attribute 'comments' cannot proceed`. What caused this error, and how do you resolve it?

**A:**
**Cause:** The `Task` object was retrieved in a session that was subsequently closed. Later in the code (e.g., during Pydantic response serialization), code accessed `task.comments`. Because `comments` was not eagerly loaded, SQLAlchemy attempted to issue a lazy-load SQL query, but failed because the session is gone.

**Fix:** Use eager loading (`selectinload(Task.comments)`) when originally querying the task, or keep the session open during serialization.

---

### Question 8
**Q:** How does this project manage database session creation and teardown in `backend/app/core/db.py` and `backend/app/api/deps.py`? Is auto-commit enabled or disabled?

**A:**
In `backend/app/core/db.py`, the engine is created with `autocommit=False` (standard in SQLAlchemy 2.0).

In `deps.py`, `get_db()` yields `Session(engine)` inside a `try ... finally` block, ensuring `session.close()` is executed when the HTTP request finishes.

---

### Follow-up Questions (3.2)

#### Question 9
**Q:** What does `session.refresh(instance)` do, and why is it commonly called after `session.commit()`?

**A:**
`commit()` expires all attributes on loaded instances. Calling `session.refresh(instance)` re-queries the database for that specific row to populate database-generated defaults (e.g., updated timestamps, trigger values).

#### Question 10
**Q:** What is the difference between `session.close()` and `session.rollback()` when returning a connection to the pool?

**A:**
`session.rollback()` explicitly rolls back uncommitted changes. `session.close()` cleans up session state, clears the identity map, and returns the underlying connection to the connection pool (which internally issues a rollback to ensure clean state).

---

## 3.3 Loading Strategies & The N+1 Problem

### Question 1
**Q:** What is the "N+1 Query Problem" in ORMs, and how does it happen when retrieving a list of Projects and their associated Tasks?

**A:**
The N+1 problem occurs when an application executes 1 initial query to fetch $N$ parent records, and then executes $N$ additional individual queries to fetch child records for each parent.

**Example:** Fetching 50 Projects (1 query). Iterating through each project to read `project.tasks` triggers 50 separate SQL queries. Total queries = $1 + 50 = 51$.

---

### Question 2
**Q:** What is Lazy Loading, and why is it the default behavior in most ORMs?

**A:**
Lazy Loading defers loading relationship data from the database until the property is explicitly accessed in Python code. It is default because it saves memory and network bandwidth when child collections are not needed.

---

### Question 3
**Q:** How do you configure and apply Eager Loading in SQLAlchemy 2.0 using `joinedload()` and `selectinload()` in a `select()` query?

**A:**
```python
from sqlalchemy.orm import joinedload, selectinload

# joinedload (SQL LEFT JOIN)
stmt1 = select(Project).options(joinedload(Project.owner))

# selectinload (Separate IN query)
stmt2 = select(Project).options(selectinload(Project.tasks))
```

---

### Question 4
**Q:** What is the underlying SQL execution difference between `joinedload` (SQL `LEFT OUTER JOIN`) and `selectinload` (two queries with `WHERE id IN (...)`)?

**A:**
- **`joinedload`:** Emits a single SQL query with a `LEFT OUTER JOIN`. Combines parent and child columns into a single wide result set.
- **`selectinload`:** Emits 2 SQL queries:
  1. `SELECT * FROM projects WHERE ...`
  2. `SELECT * FROM tasks WHERE project_id IN (1, 2, 3, ...)`
  SQLAlchemy matches children to parents in Python memory.

---

### Question 5
**Q:** When querying a 1-to-Many relationship with a large collection of child rows (e.g., 100 workspaces each containing 500 tasks), why can `joinedload` cause massive memory explosion (Cartesian product problem), and why is `selectinload` superior in this scenario?

**A:**
With `joinedload`, joining 100 workspaces with 500 tasks each yields a result set of $100 \times 500 = 50,000$ rows. The workspace columns are duplicated 500 times across network packets, causing severe memory bloat.

`selectinload` sends 100 workspace rows in query 1, and 50,000 task rows in query 2 (total 50,100 rows, zero column duplication), transferring far less data over the wire.

---

### Question 6
**Q:** When is `contains_eager()` used instead of `joinedload()`, and how does it allow you to filter child entities inside an eager load query?

**A:**
`joinedload()` creates its own anonymous JOIN that cannot be filtered with a `.where()` clause.

If you explicitly join a table with `.join()` and filter children (`.where(Task.status == 'in_progress')`), you use `.options(contains_eager(Project.tasks))` to tell SQLAlchemy to populate the `tasks` relationship from the already-filtered JOIN.

---

### Question 7
**Q:** Your API endpoint listing 50 tasks takes 800ms. Enabling SQL query logging reveals that 51 SQL queries were executed for a single HTTP request. How do you identify which attribute access triggered the 50 queries, and how do you fix it with a single query option?

**A:**
1. **Identify:** Check the Pydantic response schema or serialization loop. Look for accessing `task.owner` or `task.section`.
2. **Fix:** Add `.options(joinedload(Task.owner), joinedload(Task.section))` to the root query.

---

### Question 8
**Q:** In this project, when fetching a `Project` with all its `Sections` and `Tasks`, how are the queries structured in `project_service.py` to prevent N+1 overhead?

**A:**
In `project_service.py`:
Queries fetching project details explicitly load sections and tasks using `selectinload(Project.sections)` and `selectinload(Section.tasks)`, ensuring the entire project hierarchy loads in exactly 3 deterministic queries.

---

### Follow-up Questions (3.3)

#### Question 9
**Q:** What is `raiseload` in SQLAlchemy, and why do senior engineers configure `lazy="raise"` on production models to prevent accidental N+1 queries in code reviews?

**A:**
`raiseload` causes SQLAlchemy to raise an `InvalidRequestError` if code attempts to lazy-load a relationship. Setting `lazy="raise"` in models ensures that any developer forgetting to specify eager loading in queries catches the bug immediately during unit testing.

#### Question 10
**Q:** Does `joinedload` modify the result set of a query when using `offset()` and `limit()` on the parent entity? Why does SQLAlchemy emit a subquery warning when paginating with `joinedload`?

**A:**
Yes. When pagination (`LIMIT 10`) is applied to a query with `joinedload` on a 1-to-many relationship, `LIMIT 10` limits the joined rows, not parent entities. SQLAlchemy must wrap the parent query in an expensive subquery to paginate correctly.

---

## 3.4 Connection Pooling & Engine Configuration

### Question 1
**Q:** What is a Database Connection Pool, and why is creating a fresh TCP connection to PostgreSQL on every HTTP request unacceptably slow?

**A:**
A connection pool maintains a cache of open, authenticated database connections.

Creating a new connection requires a 3-way TCP handshake, TLS negotiation, process forking in PostgreSQL, authentication, and backend catalog loading (~30–80ms per connection). Pooling eliminates this overhead, allowing requests to reuse existing connections in $<1$ms.

---

### Question 2
**Q:** What is `QueuePool` in SQLAlchemy?

**A:**
`QueuePool` is the default thread-safe connection pool implementation in SQLAlchemy for standard relational databases. It maintains a fixed queue of open connections and allows temporary overflow up to a configured threshold.

---

### Question 3
**Q:** What do the engine parameters `pool_size`, `max_overflow`, `pool_timeout`, and `pool_recycle` configure?

**A:**
- `pool_size`: Number of persistent connections kept open in the pool.
- `max_overflow`: Maximum number of temporary connections allowed beyond `pool_size` during traffic bursts.
- `pool_timeout`: Seconds to wait before raising a `TimeoutError` if no connection is available.
- `pool_recycle`: Max seconds a connection can live before being recycled (prevents stale drops).

---

### Question 4
**Q:** What does `pool_pre_ping=True` do, and what specific production issue (e.g., firewall dropping idle TCP connections after 15 minutes) does it solve?

**A:**
Before handing a connection to an application thread, `pool_pre_ping=True` executes a lightweight test query (`SELECT 1`).

If an idle connection was silently dropped by a firewall, cloud NAT gateway, or PostgreSQL restart, the pool catches the broken socket, discards it, and transparently opens a fresh connection without raising a 500 error to the user.

---

### Question 5
**Q:** If you run 4 backend container replicas, each configured with `pool_size=10` and `max_overflow=20`, what is the maximum theoretical number of concurrent connections your application can open against PostgreSQL?

**A:**
$$\text{Max Connections} = 4 \times (\text{pool\_size} + \text{max\_overflow}) = 4 \times (10 + 20) = 120\text{ connections}$$

---

### Question 6
**Q:** If your PostgreSQL server has `max_connections = 100`, how would you distribute pool limits across web workers, background task workers, and migration jobs to prevent `FATAL: remaining connection slots are reserved for non-superuser connections`?

**A:**
Reserve connection headroom:
- **Web Replicas (2 containers):** `pool_size=20`, `max_overflow=10` $\rightarrow$ Max 60.
- **Background Workers (1 container):** `pool_size=10`, `max_overflow=5` $\rightarrow$ Max 15.
- **Adminer / Migrations / DBA Reserve:** 10 connections.
- **Postgres Superuser Safety Reserve (`superuser_reserved_connections`):** 3 connections.
Total: $60 + 15 + 10 + 3 = 88 < 100$.

---

### Question 7
**Q:** Under high load, your API begins throwing `TimeoutError: QueuePool limit of size 10 overflow 20 reached, connection timed out, timeout 30.00`. How do you determine whether this is caused by high traffic, connection leaks (unclosed sessions), or slow database queries holding connections too long?

**A:**
1. **Query PostgreSQL:** Run `SELECT state, query, age(clock_timestamp(), query_start) FROM pg_stat_activity WHERE datname = 'app';`
2. **Analysis:**
   - If connections show `state = 'idle in transaction'` for long periods $\rightarrow$ **Connection Leak** (unclosed sessions or unhandled exceptions in code).
   - If connections show `state = 'active'` on complex queries $\rightarrow$ **Slow Database Queries** (missing indexes or table locks).
   - If queries execute in $<5$ms but pool is exhausted $\rightarrow$ **High Traffic** (increase pool size or add replicas).

---

### Question 8
**Q:** What are the connection pool settings configured in `backend/app/core/db.py`, and how are they optimized for our Docker VPS environment?

**A:**
In `backend/app/core/db.py`:
We configure `create_engine()` with `pool_pre_ping=True` and moderate pool sizes (`pool_size=10`, `max_overflow=10`) to operate safely within the 50-connection limit configured in PostgreSQL on our 1GB VPS.

---

### Follow-up Questions (3.4)

#### Question 9
**Q:** What is the difference between client-side connection pooling (SQLAlchemy `QueuePool`) and server-side connection pooling (PgBouncer)? When is PgBouncer required?

**A:**
SQLAlchemy pools connections per Python process. If you have 50 serverless Lambdas or 20 container workers, total connections explode. PgBouncer sits in front of PostgreSQL, maintaining thousands of incoming client connections and multiplexing them over a small pool of 20 real PostgreSQL connections using transaction pooling.

#### Question 10
**Q:** What happens if a database failover occurs and existing pooled connections become stale? How does `pool_pre_ping` handle the reconnect transparently?

**A:**
When `pool_pre_ping` detects a closed socket during `SELECT 1`, it catches `psycopg.OperationalError`, removes the dead connection from the pool, connects to the new database master, and returns the valid connection to the caller without application error.

---

# 4. PostgreSQL 17

## 4.1 Architecture, MVCC & Storage Internals

### Question 1
**Q:** What is Multi-Version Concurrency Control (MVCC) in PostgreSQL, and how does it achieve the principle that "readers never block writers, and writers never block readers"?

**A:**
MVCC allows concurrent transactions to view consistent database snapshots without table-level read locks.

When a row is updated or deleted, PostgreSQL does not overwrite the existing data on disk. Instead, it writes a new version (tuple) of the row. Readers see only the row versions that were committed before their transaction snapshot began, while writers create new row versions independently.

---

### Question 2
**Q:** What is Write-Ahead Logging (WAL) in PostgreSQL, and why is it essential for ACID durability and crash recovery?

**A:**
WAL is an append-only log on disk where changes are recorded **before** they are written to data heap files.

Writing sequential WAL records is significantly faster than writing random disk blocks. During a crash or power failure, PostgreSQL replays WAL records from the last checkpoint to restore all committed transactions to data files, guaranteeing ACID Durability.

---

### Question 3
**Q:** How do the hidden system columns `xmin` and `xmax` on every PostgreSQL row determine row visibility for concurrent transactions?

**A:**
- `xmin`: The Transaction ID (XID) of the transaction that **inserted** this row version.
- `xmax`: The Transaction ID of the transaction that **deleted or updated** this row version (0 if not deleted).
A row is visible to Transaction $T$ if `xmin` was committed before $T$'s snapshot began AND `xmax` is either unset or belongs to an uncommitted transaction.

---

### Question 4
**Q:** What happens at the storage layer when you execute an `UPDATE` statement in PostgreSQL? Why is an update essentially an `INSERT` of a new row version and a soft-delete (`xmax` set) of the old row version?

**A:**
PostgreSQL sets `xmax` on the existing row tuple to the current transaction ID (marking it dead for future transactions) and inserts an entirely new row tuple on a disk page with `xmin` set to the current transaction ID.

---

### Question 5
**Q:** What is Table Bloat and Index Bloat? How does the `VACUUM` and `autovacuum` process reclaim dead tuples, and what happens if a long-running transaction prevents `autovacuum` from cleaning dead rows?

**A:**
- **Table/Index Bloat:** The accumulation of dead row versions and unused disk space caused by repeated `UPDATE` and `DELETE` operations.
- **`VACUUM`:** Scans pages, marks dead tuples as free space for future inserts, and updates visibility maps.
- If a long-running transaction remains open, `autovacuum` cannot remove dead tuples with `xmax` newer than that transaction's start time, causing massive disk bloat.

---

### Question 6
**Q:** What are the critical PostgreSQL server configuration parameters (`shared_buffers`, `work_mem`, `maintenance_work_mem`, `effective_cache_size`), and how should they be sized on a dedicated database server versus a shared 1GB VPS?

**A:**
- `shared_buffers`: Dedicated RAM for caching data pages (25% of total RAM on dedicated servers; ~64MB–128MB on 1GB VPS).
- `work_mem`: RAM allocated per sort/hash operation per query (4MB–16MB).
- `maintenance_work_mem`: RAM for `VACUUM` and index creation (64MB).
- `effective_cache_size`: Estimation of total disk cache available to OS and Postgres (50–75% of RAM).

---

### Question 7
**Q:** A database table with 100,000 rows takes up 500MB of disk space after a weekend of heavy updates. Running `SELECT count(*)` is extremely slow. How do you check for dead tuple accumulation, and what is the difference between running `VACUUM` versus `VACUUM FULL`?

**A:**
1. **Check:** Query `SELECT n_live_tup, n_dead_tup FROM pg_stat_user_tables WHERE relname = 'tasks';`
2. **`VACUUM`:** Reclaims dead tuple space for reuse within the table; runs online without locking reads or writes; does not shrink OS file size.
3. **`VACUUM FULL`:** Rewrites the entire table to a new disk file, releasing unused space back to the OS, but acquires an exclusive lock (`ACCESS EXCLUSIVE`) blocking all reads and writes.

---

### Question 8
**Q:** In `docker-compose.prod.yml`, why does the `db` service specify `command: postgres -c shared_buffers=64MB -c max_connections=50 -c work_mem=4MB`?

**A:**
To constrain PostgreSQL's memory footprint on a 1GB VPS. Restricting `shared_buffers` to 64MB and `max_connections` to 50 prevents the database process from triggering the Linux kernel Out-Of-Memory (OOM) killer.

---

### Follow-up Questions (4.1)

#### Question 9
**Q:** Why does `VACUUM FULL` require an exclusive table lock (`ACCESS EXCLUSIVE`), and why is it dangerous to run during production business hours?

**A:**
`VACUUM FULL` builds a brand-new copy of the table and indexes. The exclusive lock halts all user queries and API endpoints accessing that table until completion, causing customer-facing downtime. Use `pg_repack` for online bloat removal instead.

#### Question 10
**Q:** What is Transaction ID Wraparound in PostgreSQL, and how does aggressive autovacuum freeze old transaction IDs to prevent catastrophic data loss?

**A:**
PostgreSQL XIDs are 32-bit integers ($2^{32} \approx 4\text{ billion}$). At 2 billion transactions, numbers wrap around. If not frozen, past transactions would appear in the future, rendering data invisible. Aggressive autovacuum freezes old XIDs to a special constant `FrozenTransactionId` to prevent wraparound.

---

## 4.2 Isolation Levels & Concurrency Anomalies

### Question 1
**Q:** What are the four ANSI SQL transaction isolation levels, and what is the default isolation level in PostgreSQL?

**A:**
1. `READ UNCOMMITTED`
2. `READ COMMITTED` (Default in PostgreSQL)
3. `REPEATABLE READ`
4. `SERIALIZABLE`

---

### Question 2
**Q:** Define the following concurrency anomalies: *Dirty Read*, *Non-Repeatable Read*, and *Phantom Read*.

**A:**
- **Dirty Read:** Transaction A reads uncommitted data written by Transaction B (which might later rollback).
- **Non-Repeatable Read:** Transaction A reads row $X$. Transaction B updates row $X$ and commits. Transaction A re-reads row $X$ and sees changed data.
- **Phantom Read:** Transaction A queries rows matching a condition (`count = 5`). Transaction B inserts a new row matching that condition and commits. Transaction A re-queries and sees 6 rows.

---

### Question 3
**Q:** How do you explicitly set the isolation level for a transaction in PostgreSQL and SQLAlchemy?

**A:**
- **PostgreSQL:** `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ;`
- **SQLAlchemy:**
  ```python
  with engine.connect().execution_options(isolation_level="REPEATABLE READ") as conn:
      ...
  ```

---

### Question 4
**Q:** Can Dirty Reads ever occur in PostgreSQL even at the `READ UNCOMMITTED` isolation level? Why or why not?

**A:**
**No.** In PostgreSQL, `READ UNCOMMITTED` is treated identically to `READ COMMITTED`. PostgreSQL's MVCC architecture inherently prevents reading uncommitted row versions.

---

### Question 5
**Q:** What is *Serialization Anomaly / Write Skew*? Provide a concrete business logic scenario (e.g., two users booking the last available seat or doctors on call) where `REPEATABLE READ` fails to prevent data inconsistency and only `SERIALIZABLE` or explicit locking succeeds.

**A:**
**Write Skew Scenario (Doctors on Call):**
Rule: At least 1 doctor must be on call. Doctors Alice and Bob are on call.
1. Alice checks: `SELECT count(*) FROM doctors WHERE on_call = true` (returns 2).
2. Bob checks: `SELECT count(*) FROM doctors WHERE on_call = true` (returns 2).
3. Alice updates her record to `on_call = false` and commits.
4. Bob updates his record to `on_call = false` and commits.
Under `REPEATABLE READ`, both transactions commit because they modified different rows. However, the system now has 0 doctors on call (constraint violated). `SERIALIZABLE` or `SELECT FOR UPDATE` prevents this.

---

### Question 6
**Q:** When using `SERIALIZABLE` isolation in PostgreSQL, what exception (`40001 serialization_failure`) must your application be engineered to handle, and how do you implement retry logic with exponential backoff?

**A:**
When PostgreSQL detects a read-write conflict under SSI, it aborts one transaction with error `40001 serialization_failure`. Application code must wrap the transaction in a retry loop (e.g., using `tenacity`) to re-execute the entire business transaction from the beginning.

---

### Question 7
**Q:** Two concurrent requests read a workspace's task count (`count = 10`) and each independently insert a task because the limit is 11. Both transactions commit successfully, leaving 12 tasks in the workspace. Why did this happen under `READ COMMITTED` isolation, and how do you prevent it using locking or constraints?

**A:**
**Why:** Under `READ COMMITTED`, both transactions read the count before either committed an insert.
**Prevention:**
1. Lock the parent workspace row: `SELECT * FROM workspace WHERE id = :id FOR UPDATE;` before checking task count.
2. Maintain a `task_count` column on `workspace` with a database `CHECK (task_count <= 11)` constraint.

---

### Question 8
**Q:** In our multi-tenant task assignment and workspace member role updates, how do we ensure atomic updates without encountering race conditions?

**A:**
We execute updates inside explicit database transactions and enforce unique constraints (`workspace_id, user_id` in `WorkspaceMember`) to prevent duplicate role assignments.

---

### Follow-up Questions (4.2)

#### Question 9
**Q:** What is the difference between Optimistic Concurrency Control (OCC using a version column) and Pessimistic Concurrency Control (PCC using row locks)?

**A:**
- **OCC:** Assumes conflicts are rare. Updates check `WHERE id = :id AND version = :v`. Fails if version changed. Best for high-read, low-write systems.
- **PCC:** Assumes conflicts are frequent. Acquires database row locks (`FOR UPDATE`) upfront. Best for high-contention writes (financial ledger, inventory booking).

#### Question 10
**Q:** How does PostgreSQL's SSI (Serializable Snapshot Isolation) detect read-write conflicts using `SIREAD` locks without actually blocking readers?

**A:**
`SIREAD` locks are in-memory tracking flags (non-blocking). When Transaction A reads a row and Transaction B writes to that row, PostgreSQL marks a `rw-antidependency`. If a cycle of such dependencies occurs across transactions, the engine aborts one with a serialization failure.

---

## 4.3 Indexing Strategies & Query Optimization

### Question 1
**Q:** How does a standard B-Tree index work in PostgreSQL, and what is the time complexity of an indexed lookup versus a sequential scan?

**A:**
A B-Tree (Balanced Tree) stores sorted keys in hierarchical tree pages (Root $\rightarrow$ Branch $\rightarrow$ Leaf). Leaf nodes contain pointers (`ItemPointer` / `TID`) to table heap rows.
- **B-Tree Lookup:** $O(\log N)$ disk page reads.
- **Sequential Scan:** $O(N)$ full table scan.

---

### Question 2
**Q:** What is the Leftmost Prefix Rule for composite (multi-column) indexes? If an index is on `(workspace_id, status, priority)`, can a query filtering only on `status` use this index?

**A:**
Composite B-Trees are sorted hierarchically by column 1, then column 2, then column 3.
A query filtering only on `status` **cannot** efficiently use the index because the tree is ordered primarily by `workspace_id`. (It would require a full index scan instead of an index seek).

---

### Question 3
**Q:** How do you create a Partial Index in PostgreSQL (e.g., `CREATE INDEX idx_active_tasks ON tasks (user_id) WHERE status != 'completed'`), and what are the performance/storage benefits?

**A:**
```sql
CREATE INDEX idx_active_tasks ON tasks (user_id) WHERE status != 'completed';
```
**Benefits:**
- **Storage:** Excludes millions of historical completed tasks, making the index 80% smaller.
- **Performance:** Small index fits entirely into RAM cache (`shared_buffers`), speeding up queries for active tasks.

---

### Question 4
**Q:** What is Index Selectivity, and why will the PostgreSQL query planner choose a Sequential Scan (`Seq Scan`) over an Index Scan if a query matches 25% of the rows in a table?

**A:**
**Selectivity:** The ratio of matching rows to total rows.
If a query matches 25% of rows, an Index Scan requires reading index pages PLUS performing thousands of random I/O seeks across table heap pages. Reading the entire table sequentially with fast sequential I/O is faster than thousands of random lookups.

---

### Question 5
**Q:** What is an Index-Only Scan, and what role does the table's Visibility Map play in determining whether PostgreSQL can return data directly from the index without reading table heap pages?

**A:**
An Index-Only Scan answers a query entirely using index leaf columns without reading the heap table.
Because indexes do not contain `xmin`/`xmax` MVCC visibility data, PostgreSQL checks the **Visibility Map**. If the page is marked all-visible (meaning no uncommitted tuples exist on that page), Postgres returns index data immediately.

---

### Question 6
**Q:** Why should you always use `CREATE INDEX CONCURRENTLY` in production environments, and what happens if you create an index without `CONCURRENTLY` on a table with 5 million active rows?

**A:**
Standard `CREATE INDEX` acquires a `SHARE` lock on the table, blocking all incoming `INSERT`, `UPDATE`, and `DELETE` queries until the index builds (which can take minutes on 5M rows).

`CREATE INDEX CONCURRENTLY` builds the index in two passes without acquiring write locks, keeping the API online.

---

### Question 7
**Q:** An API endpoint querying `tasks` by `due_date` has an index on `due_date`, but `EXPLAIN ANALYZE` shows `Seq Scan on tasks`. You notice the query was written as `WHERE due_date + INTERVAL '1 day' > NOW()`. Why did the index fail to trigger, and how do you rewrite it?

**A:**
**Cause:** Applying an arithmetic function/operator to the column (`due_date + INTERVAL`) prevents B-Tree index lookup.
**Fix (Isolate the column):**
```sql
WHERE due_date > NOW() - INTERVAL '1 day';
```

---

### Question 8
**Q:** In our database schema, what indexes exist on foreign keys (`workspace_id`, `project_id`, `task_id`), and why is indexing foreign keys critical for `ON DELETE CASCADE` performance?

**A:**
When a parent record (e.g., `Project`) is deleted, PostgreSQL must find and delete all child rows (`tasks`). If `tasks.project_id` is unindexed, PostgreSQL must perform a slow **full sequential scan** on the `tasks` table for every deleted project.

---

### Follow-up Questions (4.3)

#### Question 9
**Q:** What is the difference between a B-Tree index, a GIN (Generalized Inverted Index) index, and a GiST index in PostgreSQL? When would you use GIN?

**A:**
- **B-Tree:** Scalar equality and range queries ($<, =, >$).
- **GIN:** Multi-key inverted index. Best for indexing JSONB documents, arrays, and full-text search.
- **GiST:** Generalized Search Tree. Best for geometric/GIS coordinates and range types.

#### Question 10
**Q:** What does `ANALYZE` (or `VACUUM ANALYZE`) do to table statistics in `pg_statistic`, and why can outdated table statistics cause the query planner to choose disastrously slow execution plans?

**A:**
`ANALYZE` samples table data and updates column value distributions (histograms, most common values) in `pg_statistic`. If statistics are outdated, the query planner may grossly underestimate row counts and choose a Nested Loop join over a Hash Join, degrading query performance by 100x.

---

## 4.4 Explicit Locking, Deadlocks & Primary Keys

### Question 1
**Q:** What is a Deadlock in a database, and how does PostgreSQL detect and break deadlocks?

**A:**
A deadlock occurs when Transaction 1 holds Lock A and waits for Lock B, while Transaction 2 holds Lock B and waits for Lock A.

PostgreSQL runs a background deadlock detection timer (`deadlock_timeout`, default 1s). When a cycle is detected, PostgreSQL aborts one transaction with error `40P01 deadlock_detected`, allowing the other to proceed.

---

### Question 2
**Q:** What is the difference between `SELECT ... FOR UPDATE` and `SELECT ... FOR SHARE`?

**A:**
- `FOR UPDATE`: Acquires an exclusive row lock; blocks other transactions from updating, deleting, or locking the row with `FOR UPDATE`.
- `FOR SHARE`: Acquires a shared row lock; allows other transactions to read or acquire `FOR SHARE`, but blocks updates and `FOR UPDATE`.

---

### Question 3
**Q:** How do you use `SELECT ... FOR UPDATE SKIP LOCKED` to implement a high-throughput, concurrent task-worker queue without lock contention?

**A:**
```sql
SELECT id FROM background_jobs 
WHERE status = 'pending' 
ORDER BY created_at ASC 
LIMIT 1 
FOR UPDATE SKIP LOCKED;
```
`SKIP LOCKED` instructs workers to ignore rows locked by competing workers, eliminating lock wait contention.

---

### Question 4
**Q:** If Transaction 1 updates Task A then Task B, while Transaction 2 updates Task B then Task A simultaneously, what will happen? How do you prevent this programmatically in backend service code?

**A:**
**Result:** A Deadlock occurs.
**Prevention:** Enforce strict, deterministic lock ordering in application code. Always sort entity IDs before acquiring locks or executing batch updates:
```python
task_ids = sorted([task_a_id, task_b_id])
for t_id in task_ids:
    session.execute(select(Task).where(Task.id == t_id).with_for_update())
```

---

### Question 5
**Q:** What are the engineering trade-offs of using UUIDv4 vs. UUIDv7 vs. auto-incrementing BigInt as primary keys in PostgreSQL? Explain the B-Tree page fragmentation and cache eviction problems caused by random UUIDv4 keys at scale.

**A:**
- **Auto-Increment BigInt:** Fast, sequential, zero B-Tree fragmentation. Downside: Exposes business volume; vulnerable to IDOR enumeration attacks.
- **UUIDv4 (Random):** Globally unique, unguessable. Downside: Inserts hit random B-Tree pages, causing heavy page splits, table bloat, and cache eviction.
- **UUIDv7 (Time-Ordered):** Combines Unix timestamp prefix with random suffix. Best of both worlds: unguessable, distributed-safe, and inserts sequentially into B-Tree leaf pages without fragmentation.

---

### Question 6
**Q:** How do you safely alter a column type or add a `NOT NULL` constraint on a large production table without acquiring an `ACCESS EXCLUSIVE` lock that blocks all incoming reads and writes?

**A:**
1. Add a check constraint without validating:
   ```sql
   ALTER TABLE tasks ADD CONSTRAINT chk_title_not_null CHECK (title IS NOT NULL) NOT VALID;
   ```
2. Validate the constraint in the background (holds only a `SHARE UPDATE EXCLUSIVE` lock, allowing normal reads and writes):
   ```sql
   ALTER TABLE tasks VALIDATE CONSTRAINT chk_title_not_null;
   ```
3. Alter column to `NOT NULL` (instantaneous catalog update).

---

### Question 7
**Q:** Your application logs show frequent `asyncpg.exceptions.DeadlockDetectedError: deadlock detected`. What PostgreSQL log settings (`log_lock_waits`, `deadlock_timeout`) would you enable to capture the competing SQL statements and lock targets?

**A:**
Set in `postgresql.conf`:
- `log_lock_waits = on`
- `deadlock_timeout = 1000ms`
- `log_line_prefix = '%t [%p]: [%l-1] user=%u,db=%d,client=%h '`
PostgreSQL will log both competing SQL queries, process IDs, and lock resource numbers upon deadlock detection.

---

### Question 8
**Q:** In this project, all entities use UUID primary keys (`id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)`). Why was UUID chosen over integer IDs for a multi-tenant SaaS application?

**A:**
1. **Security:** Prevents sequential IDOR enumeration attacks where an attacker guesses `/api/v1/projects/1`, `/projects/2`.
2. **Client-Side Generation:** Allows optimistic UI updates on the frontend by generating IDs client-side before database commits.
3. **Distributed Safety:** Enables multi-region replication and seamless database shard migration without primary key collision.

---

### Follow-up Questions (4.4)

#### Question 9
**Q:** What is the lock escalation behavior in PostgreSQL compared to Microsoft SQL Server or Oracle? Does PostgreSQL ever escalate row locks to table locks automatically?

**A:**
**No.** PostgreSQL never escalates row-level locks to table-level locks, regardless of how many thousands of rows are locked.

#### Question 10
**Q:** What is `NOWAIT` in `SELECT ... FOR UPDATE NOWAIT`, and when should you use it to prevent request threads from hanging on locked rows?

**A:**
`NOWAIT` instructs PostgreSQL to raise error `55P03 lock_not_available` immediately if the requested row is currently locked by another transaction, instead of blocking the request thread.

---

# 5. Alembic (Database Migrations)

## 5.1 Migration Architecture & Workflow

### Question 1
**Q:** What is Alembic, and what is the role of the `alembic_version` table in the target database?

**A:**
Alembic is the database schema migration engine for SQLAlchemy.

The `alembic_version` table contains a single column storing the current revision hash (e.g., `a1b2c3d4e5f6`). When running `alembic upgrade head`, Alembic compares this hash against migration scripts to determine which upgrade steps to apply.

---

### Question 2
**Q:** What are the roles of `alembic.ini` and `env.py` in an Alembic migration setup?

**A:**
- `alembic.ini`: Configuration file containing file paths, logging settings, and migration directory locations.
- `env.py`: Python script executed whenever Alembic runs. It imports application models, sets `target_metadata = SQLModel.metadata`, connects to the database engine, and runs migration contexts.

---

### Question 3
**Q:** How do you generate an autogenerated migration script, and why should an engineer NEVER commit an autogenerated migration without manual review?

**A:**
```bash
alembic revision --autogenerate -m "add_priority_to_tasks"
```
**Why manual review is mandatory:** Autogenerate relies on heuristic diffing between SQLModel metadata and database catalog tables. It frequently misinterprets column renames as `drop_column` followed by `add_column` (causing catastrophic data loss) and fails to detect custom check constraints or enum modifications.

---

### Question 4
**Q:** What specific schema changes can Alembic's `--autogenerate` reliably detect, and what changes does it typically miss or misinterpret (e.g., column renames, enum type alterations, table renames, check constraints)?

**A:**
- **Reliably Detects:** Added/removed tables, added/removed columns, basic nullable changes, simple index additions.
- **Misses / Misinterprets:** Column renames (generates drop + add), table renames, PostgreSQL `ENUM` value additions, table partition definitions, and server-side check constraints.

---

### Question 5
**Q:** How do you resolve a "Multiple Heads" conflict in Alembic when two developers independently create and merge migration revisions from the same base?

**A:**
Run `alembic merge`:
```bash
alembic merge -m "merge_branch_a_and_b" <rev1_hash> <rev2_hash>
```
This generates a new merge revision with both branches as dependencies, restoring a single linear head.

---

### Question 6
**Q:** Why should database migrations in production be executed from a single, dedicated release step or prestart container rather than during the initialization of multiple web server worker processes?

**A:**
If 4 backend containers start simultaneously and all execute `alembic upgrade head` on boot, they race to modify `alembic_version` and execute DDL concurrently, causing migration deadlocks or corrupt schema states.

---

### Question 7
**Q:** A migration script failed halfway through execution with an SQL syntax error. The database is now in a partially upgraded state, and subsequent `alembic upgrade head` commands fail with `Target database is not up to date`. How do you safely repair the schema and synchronize the `alembic_version` table?

**A:**
1. Manually inspect PostgreSQL to determine which DDL statements completed.
2. Manually rollback or complete the missing DDL statements in PostgreSQL.
3. Fix the syntax error in the migration script.
4. Manually update the `alembic_version` table using `alembic stamp <revision_hash>` to synchronize Alembic's tracker with the actual database state.

---

### Question 8
**Q:** In this project, how does `backend/app/alembic/env.py` configure `target_metadata` to link SQLModel table definitions with Alembic?

**A:**
In `backend/app/alembic/env.py`:
It imports all models from `app.models` and sets:
```python
from app.models import SQLModel
target_metadata = SQLModel.metadata
```
This ensures Alembic can inspect all table models declared in the project.

---

### Follow-up Questions (5.1)

#### Question 9
**Q:** What is the difference between running Alembic in "online" mode versus "offline" mode (`--sql`), and when is offline mode required in enterprise CI/CD environments?

**A:**
- **Online:** Connects directly to the live database and executes DDL.
- **Offline (`--sql`):** Generates raw SQL migration scripts without connecting to a live database. Required in strict enterprise environments where DBAs review raw SQL scripts before execution.

#### Question 10
**Q:** How do you write a custom data-migration script in Alembic (e.g., populating a new column based on existing data) using `op.bulk_insert` or raw execution within the migration transaction?

**A:**
```python
from alembic import op
import sqlalchemy as sa

def upgrade():
    op.add_column('tasks', sa.Column('short_code', sa.String(), nullable=True))
    # Custom data backfill
    op.execute("UPDATE tasks SET short_code = SUBSTRING(id::text, 1, 8)")
```

---

## 5.2 Zero-Downtime Migration Strategies

### Question 1
**Q:** What does "Zero-Downtime Migration" mean, and why is running `alembic upgrade head` while older application versions are actively handling user traffic hazardous?

**A:**
Zero-downtime migration means upgrading database schemas and deploying new code without taking the API offline or dropping customer requests.

**Hazard:** Older running backend containers may issue SQL queries referencing columns that a destructive migration just dropped or altered, causing active HTTP requests to throw 500 errors.

---

### Question 2
**Q:** Explain the four phases of the **Expand and Contract (Parallel Run)** migration pattern.

**A:**
1. **Expand:** Add new columns/tables as optional/nullable. Older code continues operating normally.
2. **Dual-Write / Deploy:** Deploy code that writes to both old and new columns, reading primarily from old.
3. **Backfill:** Run an asynchronous batch job to populate new columns for historical rows.
4. **Contract:** Deploy code reading only new columns, then execute a migration dropping the old columns.

---

### Question 3
**Q:** If you need to rename a column from `full_name` to `name` on a production table with zero downtime, what is the exact step-by-step deployment sequence across migrations and application code deployments?

**A:**
1. **Migration 1:** Add `name` as nullable.
2. **Deploy Code 1:** Write to both `full_name` and `name`; read from `full_name`.
3. **Data Backfill:** Execute `UPDATE users SET name = full_name WHERE name IS NULL`.
4. **Deploy Code 2:** Read and write exclusively to `name`.
5. **Migration 2:** Drop column `full_name`.

---

### Question 4
**Q:** How do you safely add a `NOT NULL` constraint to an existing column with 10 million rows in PostgreSQL without locking the table for several minutes? (Explain `CHECK (...) NOT VALID` and `VALIDATE CONSTRAINT`).

**A:**
```sql
-- Step 1: Add check constraint (instant, no table lock)
ALTER TABLE tasks ADD CONSTRAINT chk_not_null CHECK (status IS NOT NULL) NOT VALID;

-- Step 2: Validate constraint (scans table with non-blocking share lock)
ALTER TABLE tasks VALIDATE CONSTRAINT chk_not_null;

-- Step 3: Set column NOT NULL (instantaneous catalog update)
ALTER TABLE tasks ALTER COLUMN status SET NOT NULL;
ALTER TABLE tasks DROP CONSTRAINT chk_not_null;
```

---

### Question 5
**Q:** How do you safely drop a deprecated column in a high-traffic production system without breaking running backend instances that may still have cached SQL queries referencing the column?

**A:**
1. Deploy code that removes the attribute from all SQLAlchemy models and Pydantic schemas.
2. Wait until all old container instances have terminated and only new instances serve traffic.
3. Execute the Alembic migration `op.drop_column(...)`.

---

### Question 6
**Q:** During a deployment, a migration adding a column with a server default `ALTER TABLE tasks ADD COLUMN priority VARCHAR DEFAULT 'medium'` locks the table and causes all API requests to time out. Why did this happen in older PostgreSQL versions, and how does PostgreSQL 11+ handle defaults on new columns differently?

**A:**
In PostgreSQL $\le 10$, adding a column with a default value rewrote every single row on disk, holding an exclusive table lock for the duration.

In PostgreSQL 11+, non-volatile defaults are stored in the system catalog metadata table (`pg_attribute`) without rewriting heap pages, making the operation instantaneous.

---

### Question 7
**Q:** How does `scripts/prestart.sh` in this project ensure that database migrations finish executing before the backend service starts accepting incoming HTTP traffic?

**A:**
In `scripts/prestart.sh`:
1. Runs `backend_pre_start.py` (verifies DB socket connection).
2. Executes `alembic upgrade head`.
3. Runs `initial_data.py` (seeds default roles/superusers).
In Docker Compose, the `backend` service specifies `depends_on: { prestart: { condition: service_completed_successfully } }`.

---

### Follow-up Questions (5.2)

#### Question 8
**Q:** Why should you never use `op.drop_table()` or `op.drop_column()` in a `downgrade()` function without considering data recovery?

**A:**
Running `downgrade()` would immediately destroy production data with zero recovery option. Production downgrades should be handled via Forward Fix migrations.

#### Question 9
**Q:** How do you test rollback (`alembic downgrade -1`) safely in a staging environment before deploying to production?

**A:**
In CI/CD staging pipelines:
1. Apply migrations: `alembic upgrade head`.
2. Seed test data.
3. Roll back: `alembic downgrade -1`.
4. Re-apply: `alembic upgrade head` and assert data integrity.

---

# 6. Redis 5.0+ (Caching, Locking & Stampede Prevention)

## 6.1 Redis Architecture & In-Memory Fundamentals

### Question 1
**Q:** What is Redis, and why is it categorized as an in-memory, single-threaded data structure store?

**A:**
Redis stores all data directly in RAM, achieving sub-millisecond read/write latency. Its core command execution engine runs on a single event-driven thread, eliminating multi-threaded race conditions and lock contention.

---

### Question 2
**Q:** Since Redis execution is single-threaded, how does it process tens of thousands of operations per second without CPU saturation?

**A:**
1. **In-Memory Operations:** RAM access is orders of magnitude faster than disk seeks.
2. **I/O Multiplexing:** Uses `epoll`/`kqueue` to manage network sockets asynchronously.
3. **Efficient Data Structures:** C-optimized internal structures (SkipLists, ZipLists, Sds strings).

---

### Question 3
**Q:** What are the core Redis data types (Strings, Hashes, Lists, Sets, Sorted Sets), and what is a practical backend use case for each?

**A:**
- **Strings:** JSON caching, distributed locks (`SET NX EX`).
- **Hashes:** Storing user session objects / partial profile updates.
- **Lists:** Message queues (LPUSH / RPOP).
- **Sets:** Unique tags, online user tracking (`SADD`, `SISMEMBER`).
- **Sorted Sets (ZSET):** Leaderboards, sliding-window rate limiters (scored by timestamp).

---

### Question 4
**Q:** What is the difference between Redis RDB (point-in-time snapshots) and AOF (Append-Only File) persistence? What are the trade-offs between write durability and recovery speed?

**A:**
- **RDB:** Periodic compact snapshots of RAM saved to disk. Fast restart recovery, but risks losing data between snapshot intervals (e.g., 5 mins).
- **AOF:** Logs every write command sequentially. Higher durability (`fsync everysec`), but larger file size and slower restart recovery.

---

### Question 5
**Q:** What are Redis eviction policies (`allkeys-lru`, `volatile-lru`, `allkeys-lfu`, `noeviction`), and which policy should be configured when Redis is used strictly as a cache versus a message broker?

**A:**
- **`allkeys-lru`:** Evicts least recently used keys across all data (Recommended for caching).
- **`volatile-lru`:** Evicts least recently used keys only among those with an active TTL.
- **`noeviction`:** Returns OOM error when memory is full (Recommended for message queues/brokers).

---

### Question 6
**Q:** Why is executing the `KEYS *` command in a production Redis instance considered an operational disaster, and what cursor-based command should be used instead?

**A:**
`KEYS *` performs an $O(N)$ full scan of all keys in RAM. Because Redis is single-threaded, `KEYS *` blocks all other operations for seconds/minutes, causing all web API requests to time out.
**Fix:** Use `SCAN` (cursor-based iteration, e.g., `scan_iter()`).

---

### Question 7
**Q:** Redis memory usage reaches its 50MB limit and starts returning `OOM command not allowed when used memory > 'maxmemory'`. How do you identify which key namespaces are consuming the most memory?

**A:**
1. Run `redis-cli --bigkeys` to scan for largest keys.
2. Run `redis-cli MEMORY USAGE <key>`.
3. Check `INFO memory` and configure `maxmemory-policy allkeys-lru`.

---

### Question 8
**Q:** In this project, how is Redis configured in `backend/app/core/redis_client.py` and `docker-compose.prod.yml`? What memory limits and decoding parameters are applied?

**A:**
In `backend/app/core/redis_client.py`:
We instantiate `redis.Redis` with `decode_responses=True`, `socket_timeout=5`, and `socket_connect_timeout=5`.
In `docker-compose.prod.yml`, Redis is constrained to `50M` memory limit.

---

### Follow-up Questions (6.1)

#### Question 9
**Q:** What is Redis Pipelining, and how does it reduce network round-trip time (RTT) when issuing multiple read/write commands?

**A:**
Pipelining batches multiple Redis commands together on the client and sends them in a single TCP packet, reading all replies in a single response, reducing network round-trip overhead.

#### Question 10
**Q:** How does Redis expire keys in the background (passive vs. active expiration)?

**A:**
- **Passive:** Key is checked when accessed by a command; if expired, it is deleted.
- **Active:** Redis periodically tests a random sample of keys with TTLs 10 times per second and purges expired keys.

---

## 6.2 Caching Strategies, Invalidation & Key Design

### Question 1
**Q:** What is the **Cache-Aside (Lazy Loading)** pattern, and what are its advantages and disadvantages compared to Write-Through caching?

**A:**
- **Cache-Aside:** Application queries cache. On hit $\rightarrow$ return. On miss $\rightarrow$ read DB $\rightarrow$ write to cache $\rightarrow$ return.
- **Advantage:** Caches only requested data; resilient to cache node restarts.
- **Disadvantage:** Cache miss penalty on initial load; risk of stale data if DB updates fail to invalidate cache.

---

### Question 2
**Q:** Why must every cached key in Redis almost always have a TTL (Time-To-Live) set?

**A:**
1. Acts as a safety net against permanent data staleness if cache invalidation events fail.
2. Prevents memory leaks by ensuring temporary or abandoned data eventually purges from RAM.

---

### Question 3
**Q:** How do you design a structured, collision-free key naming convention for a multi-tenant SaaS application?

**A:**
Use hierarchical namespacing separated by colons:
`<app_prefix>:<cache_version>:<module>:<tenant_id>:<resource>:<identifier>`
**Example:** `doit:v1:projects:ws_123:entity:proj_456`

---

### Question 4
**Q:** How do you cache complex database queries with pagination and filters (e.g., `/tasks?status=in_progress&page=2&assignee=xyz`)? How do you generate a deterministic cache key from arbitrary request parameters?

**A:**
Filter non-cache parameters (like DB sessions), sort dictionary keys, serialize to canonical JSON, and generate an MD5/SHA256 hash:
```python
payload = json.dumps({"args": args, "kwargs": sorted_kwargs}, sort_keys=True)
hash_key = hashlib.md5(payload.encode()).hexdigest()
cache_key = f"doit:v1:tasks:query:{hash_key}"
```

---

### Question 5
**Q:** How do you implement namespace-wide cache invalidation (e.g., invalidating all cached task queries for a specific project when a single task is updated) without clearing the entire Redis database?

**A:**
Use cursor-based `scan_iter()` with a pattern match:
```python
def clear_cache(pattern: str):
    for key in redis_client.scan_iter(match=pattern, count=100):
        redis_client.delete(key)
```
Invalidate: `clear_cache("doit:v1:tasks:ws_123:*")`

---

### Question 6
**Q:** What is the trade-off between fine-grained cache invalidation (purging only specific entity keys) and coarse-grained cache invalidation (purging all queries for a module), and how do you prevent stale reads?

**A:**
- **Fine-Grained:** High cache hit ratio; complex invalidation logic (must trace every query where entity appears).
- **Coarse-Grained:** Simple, guaranteed freshness; lower hit ratio because all queries in the namespace are purged on write.

---

### Question 7
**Q:** A user updates their profile name from "Alice" to "Alicia". The update succeeds in PostgreSQL, but when they refresh their dashboard, their old name "Alice" is still displayed. List the 3 most common caching bugs that cause this behavior.

**A:**
1. **Missing Invalidation on Write:** The `PUT /users/me` endpoint updated the database but omitted `redis.delete(user_cache_key)`.
2. **Stale Cache TTL:** Cache key was set without TTL or has an excessively long TTL.
3. **Key Mismatch:** Cache key was generated with `user_id` but invalidated with `email`.

---

### Question 8
**Q:** In `backend/app/core/redis_client.py`, how do `_hash_payload`, `query_key_generator`, and `entity_key_generator` work? How is `APP_PREFIX` and `CACHE_VERSION` used to prevent cache poisoning across deployments?

**A:**
In `backend/app/core/redis_client.py`:
- `_hash_payload`: Filters out `Session` and `Request` objects, extracts `current_user.id`, and hashes query kwargs with MD5.
- `_base_prefix`: Prepends `{settings.APP_PREFIX}:{settings.CACHE_VERSION}:{module}`. Changing `CACHE_VERSION` from `v1` to `v2` in `.env` instantly invalidates all legacy caches on deployment.

---

### Follow-up Questions (6.2)

#### Question 9
**Q:** What is the impact of JSON serialization/deserialization CPU overhead when caching very large lists in Redis, and when should you store data as Redis Hashes instead of JSON strings?

**A:**
Serializing 10,000 ORM models to JSON consumes significant Python CPU time. For large dictionaries where only individual fields are updated (e.g., user session attributes), storing as Redis `HSET` allows updating single fields via `HSET key field val` without reserializing the entire JSON blob.

#### Question 10
**Q:** What is "Dual-Writing", and why can updating the database and cache without a transaction lead to permanent cache inconsistency?

**A:**
If an app updates the database and immediately writes to cache: if Worker A updates DB, then Worker B updates DB and updates Cache, and Worker A writes its stale data to Cache last $\rightarrow$ Cache contains stale data permanently. Always **delete** the cache key on DB write.

---

## 6.3 Concurrency Control, Distributed Locks & Failure Scenarios

### Question 1
**Q:** What is a Cache Stampede (also known as the Thundering Herd or Cache Breakdown problem)?

**A:**
When a high-traffic cache key expires, hundreds of concurrent requests experience a cache miss simultaneously. All requests hit the database at once to recompute the same data, causing database CPU spikes and connection pool exhaustion.

---

### Question 2
**Q:** What is the difference between Cache Penetration, Cache Breakdown, and Cache Avalanche?

**A:**
- **Cache Penetration:** Querying non-existent keys repeatedly (bypasses cache, hits DB every time). $\rightarrow$ *Fix: Cache null values or use Bloom filters.*
- **Cache Breakdown:** A single hot key expires under heavy traffic. $\rightarrow$ *Fix: Distributed mutex lock.*
- **Cache Avalanche:** Thousands of keys expire simultaneously. $\rightarrow$ *Fix: Add random jitter to TTL.*

---

### Question 3
**Q:** How do you implement a distributed lock in Redis using `SET key value NX EX`? What do `NX` and `EX` signify?

**A:**
```python
lock_acquired = redis_client.set("lock:project:123", "locked", nx=True, ex=10)
```
- `NX`: Set only if Not eXists (atomic lock acquisition).
- `EX 10`: Auto-expire in 10 seconds (prevents deadlocks if worker crashes).

---

### Question 4
**Q:** Why is the "Double-Checked Locking" pattern necessary when using a distributed lock to protect an expensive database query during a cache miss?

**A:**
When 100 requests miss cache, 1 acquires the lock and 99 wait. When the 1st finishes and populates cache, the 99 waiting requests wake up. Double-checking cache *after* acquiring the lock prevents the remaining 99 from re-executing the database query.

---

### Question 5
**Q:** What is the "Lock Release Race Condition" where Worker A takes longer than the lock TTL, the lock auto-expires, Worker B acquires the lock, and Worker A finishes and deletes Worker B's lock? How do you prevent this using unique lock tokens and Lua scripts?

**A:**
**Fix:** Set the lock value to a unique UUID (`token = str(uuid.uuid4())`).
Release the lock using an atomic Lua script that verifies the token before deleting:
```lua
if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
else
    return 0
end
```

---

### Question 6
**Q:** What is **Graceful Degradation** in caching? If the Redis container crashes or network connectivity is severed, how should your backend application handle the failure without returning 500 errors to end users?

**A:**
Wrap all Redis calls in `try ... except RedisError`. On failure, log a warning and fall back directly to executing the database query. The API runs slightly slower, but user requests succeed with 200 OK.

---

### Question 7
**Q:** Under high concurrent traffic, 200 requests for an expired cache key arrive simultaneously. Instead of 1 query hitting the database, all 200 hit PostgreSQL, causing database CPU to spike to 100%. Looking at your caching decorator, how would you diagnose why the mutex lock failed to throttle the thundering herd?

**A:**
**Root Causes to Check:**
1. `nx=True` was omitted from `redis.set()`.
2. Waiting workers did not sleep before retrying cache lookup.
3. The double-check inside the lock block was missing.

---

### Question 8
**Q:** Analyze the `@redis_cache` decorator in `backend/app/core/redis_client.py`. How does it acquire locks, retry on contention, double-check cache existence, and gracefully fall back to the database on Redis errors?

**A:**
In `backend/app/core/redis_client.py`:
1. Checks cache via `cache_get(key)`. On hit $\rightarrow$ return.
2. Loops up to `max_retries` attempting `set(lock_key, "locked", nx=True, ex=10)`.
3. If lock acquired: double-checks cache; executes DB function; serializes and sets cache; deletes `lock_key` in `finally`.
4. If lock busy: sleeps `0.5s` and checks cache again.
5. All Redis commands are wrapped in `try/except sync_redis.RedisError` for graceful degradation.

---

### Follow-up Questions (6.3)

#### Question 9
**Q:** What is Probabilistic Early Expiration (XFetch algorithm), and how does it prevent cache stampedes without using explicit distributed locks?

**A:**
XFetch computes a probability of recomputing the cache *before* it expires based on read compute time, remaining TTL, and a constant $\beta$:
$$\text{Recompute if } -\beta \times \text{delta} \times \ln(\text{rand}()) > \text{TTL}$$
One lucky reader asynchronously refreshes cache before expiration, eliminating stampedes.

#### Question 10
**Q:** What is Redlock, and why has its safety been debated in distributed systems literature for multi-node Redis clusters?

**A:**
Redlock is a distributed lock algorithm across $\ge 5$ independent Redis masters. Distributed systems engineers (like Martin Kleppmann) noted that without monotonic clocks and process pause detection (GC pauses), Redlock cannot guarantee strict mutual exclusion under network partitions.

---

# 7. Security, Authentication & Authorization

## 7.1 Cryptography, Password Hashing & JWT Architecture

### Question 1
**Q:** Why should user passwords NEVER be encrypted using reversible encryption (AES/RSA) and MUST instead be hashed using a salted, slow cryptographic hash function?

**A:**
Reversible encryption uses a key. If the encryption key or server is compromised, all user passwords can be decrypted in plaintext.

Cryptographic hash functions are one-way mathematical algorithms ($H(P) = K$). Passwords cannot be decrypted; authentication simply hashes the incoming password and compares the hash.

---

### Question 2
**Q:** How does Bcrypt work, what is a "Salt", and what is the purpose of the "Work Factor / Cost Parameter"?

**A:**
- **Salt:** A cryptographically random string generated per user and appended to the password before hashing, preventing Rainbow Table attacks.
- **Work Factor (Cost):** Dictates how many hashing rounds are performed ($2^{\text{cost}}$). As hardware becomes faster, increasing the cost factor keeps cracking attempts prohibitively slow.

---

### Question 3
**Q:** What are the three parts of a JSON Web Token (JWT), and what is contained in each part?

**A:**
`header.payload.signature`
1. **Header:** Algorithm (`HS256`, `RS256`) and token type (`JWT`).
2. **Payload (Claims):** Subject (`sub`: user ID), expiration (`exp`), issued at (`iat`).
3. **Signature:** Cryptographic hash of `HMACSHA256(base64Url(header) + "." + base64Url(payload), secret)`.

---

### Question 4
**Q:** What is the mathematical difference between symmetric JWT signing (`HS256` with a shared secret) and asymmetric JWT signing (`RS256` with public/private key pairs)? When should you use RS256?

**A:**
- **`HS256` (Symmetric):** The same secret key is used to both sign and verify tokens.
- **`RS256` (Asymmetric):** A private key signs tokens; a public key verifies them.
**When to use RS256:** Microservice architectures where an Auth Service signs tokens, and 20 downstream services verify tokens using only the public key without possessing the private signing key.

---

### Question 5
**Q:** What is a Timing Attack in password verification or token validation? How does `secrets.compare_digest()` prevent timing attacks compared to standard string equality (`==`)?

**A:**
Standard `==` comparison terminates on the first mismatched character. An attacker measuring response times in nanoseconds can deduce characters one by one.
`secrets.compare_digest()` runs in constant time, checking every byte regardless of mismatch.

---

### Question 6
**Q:** Why should sensitive information (such as passwords, internal permissions, or social security numbers) NEVER be stored in the JWT payload (claims)?

**A:**
JWT payloads are only Base64Url-encoded, not encrypted. Anyone who intercepts the token can decode and read all payload claims in plaintext using `jwt.io`.

---

### Question 7
**Q:** A security audit flags your API for using `jwt.decode(token, verify=False)` or accepting `alg: "none"` in the JWT header. How does an attacker exploit the `alg: none` vulnerability to forge superuser tokens, and how do modern libraries prevent it?

**A:**
An attacker modifies the payload to `{"sub": "admin", "is_superuser": true}` and sets header `{"alg": "none"}` with an empty signature. If the server accepts `none`, it treats the forged token as valid.
Modern PyJWT versions require explicit `algorithms=["HS256"]` and reject `none` by default.

---

### Question 8
**Q:** In `backend/app/core/security.py`, how are `pwd_context` (Passlib CryptContext) and `create_access_token` (PyJWT) implemented? What algorithm and token expiration are configured?

**A:**
In `backend/app/core/security.py`:
- `pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")`
- `create_access_token`: Uses `jwt.encode()`, algorithm `HS256`, setting `exp` to `datetime.now(timezone.utc) + expires_delta`.

---

### Follow-up Questions (7.1)

#### Question 9
**Q:** If your database of bcrypt password hashes is leaked, how does a high work factor (e.g., cost = 12) protect user passwords against modern GPU-based cracking clusters?

**A:**
Bcrypt is memory-hard and computation-intensive. At cost 12, computing 1 hash takes ~300ms. Testing 1 billion passwords would take thousands of GPU-years, making brute-force cracking economically unfeasible.

#### Question 10
**Q:** What are standard registered JWT claims (`sub`, `exp`, `nbf`, `iat`, `iss`, `aud`), and how does FastAPI's OAuth2 implementation validate them?

**A:**
- `sub` (Subject ID), `exp` (Expiration), `nbf` (Not Before), `iat` (Issued At), `iss` (Issuer), `aud` (Audience). PyJWT validates `exp` and `nbf` automatically during `jwt.decode()`, raising `ExpiredSignatureError` if expired.

---

## 7.2 Stateless JWT Revocation & Session Management

### Question 1
**Q:** What is the inherent trade-off of using stateless JWTs: why is it difficult to immediately log out a user or revoke a token before its `exp` timestamp passes?

**A:**
Because verification checks only the cryptographic signature and expiration timestamp without querying a central database, any validly signed token remains accepted everywhere until it expires.

---

### Question 2
**Q:** How can you implement an instantaneous token revocation / logout mechanism using Redis? What should the Redis key TTL be set to when blacklisting a token?

**A:**
When a user logs out, store the JWT ID (`jti`) in Redis:
`redis.set(f"blacklist:{jti}", "revoked", ex=remaining_token_ttl)`
In your auth dependency, check if `jti` exists in Redis. Set TTL to the exact remaining seconds until token expiration so Redis automatically purges the entry when the token naturally expires.

---

### Question 3
**Q:** What is the **Token Version / Token Epoch** pattern for global session revocation (e.g., "Log out of all devices" after password reset)? How does it work without storing individual revoked JWTs in Redis?

**A:**
Add an integer column `token_version` to the `User` table (e.g., `token_version = 1`) and embed `"token_version": 1` in the JWT payload.
When a user resets their password, increment `User.token_version = 2`. Any incoming JWT with version 1 is immediately rejected.

---

### Question 4
**Q:** What is the **Short-Lived Access Token + Rotating Refresh Token** pattern? How does refresh token rotation detect and mitigate token theft?

**A:**
- **Access Token:** Short-lived (15 mins), used for API requests.
- **Refresh Token:** Stored in DB, single-use. When used to obtain a new access token, the old refresh token is invalidated and a new one is issued.
- **Theft Detection:** If an attacker and a victim both attempt to use the same old refresh token, the server detects reuse, invalidates the entire token family, and forces re-authentication.

---

### Question 5
**Q:** Where should JWTs be stored on the frontend client (e.g., `HttpOnly; Secure; SameSite=Strict` cookies vs. `localStorage`), and what are the specific XSS vs. CSRF vulnerabilities of each approach?

**A:**
- **`localStorage`:** Vulnerable to XSS (any malicious injected JavaScript can steal tokens). Immune to CSRF.
- **`HttpOnly; Secure; SameSite=Strict` Cookies:** Immune to XSS token theft (JavaScript cannot read cookie). Protected against CSRF via `SameSite=Strict` and Anti-CSRF tokens. (Most secure).

---

### Question 6
**Q:** A user changes their password because their account was compromised. However, an attacker who previously stole an access token is still making authenticated API requests for the next 8 days. How do you redesign your auth layer to invalidate all existing access tokens immediately upon password change?

**A:**
Implement the **Token Version** or **Password Changed Timestamp** check in the auth dependency:
Embed `password_changed_at` timestamp in JWT; reject any token issued before the user's current `password_changed_at` DB column.

---

### Question 7
**Q:** What is the access token expiration time configured in `backend/app/core/config.py` (`ACCESS_TOKEN_EXPIRE_MINUTES`), and what are the security trade-offs of this duration?

**A:**
In `backend/app/core/config.py`:
`ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 8` (8 days).
- **Advantage:** User convenience (infrequent re-logins).
- **Trade-off:** Security risk if a token is intercepted; requires explicit revocation mechanisms for high-security environments.

---

### Follow-up Questions (7.2)

#### Question 8
**Q:** How does a Sliding Session work with JWTs, and how can you refresh a user's session without requiring them to re-enter credentials every 15 minutes?

**A:**
The frontend Axios interceptor detects when the access token has $<2$ minutes remaining and silently calls `/api/v1/auth/refresh-token` in the background to obtain a fresh token.

#### Question 9
**Q:** What is the impact on database read load if your auth dependency queries the `users` table on every single incoming API request to verify `is_active`? How can Redis caching mitigate this?

**A:**
Querying the DB on every request adds read latency and DB connection load. Cache the user profile in Redis (`user:active:<id>`) with a 5-minute TTL to reduce DB read load by 95%.

---

## 7.3 Multi-Tenant RBAC & Authorization Enforcement

### Question 1
**Q:** What is Role-Based Access Control (RBAC), and how does it differ from Attribute-Based Access Control (ABAC)?

**A:**
- **RBAC:** Permissions are mapped to static roles (`Owner`, `Admin`, `Member`).
- **ABAC:** Permissions are evaluated dynamically based on user, resource, and environmental attributes (e.g., "Allow access if user department == resource department and time is between 9 AM - 5 PM").

---

### Question 2
**Q:** What is BOLA (Broken Object Level Authorization) / IDOR (Insecure Direct Object Reference), and why is it consistently ranked #1 on the OWASP API Security Top 10?

**A:**
BOLA/IDOR occurs when an endpoint accepts an object identifier (e.g., `/api/v1/projects/f47ac10b...`) and retrieves the record without verifying whether the requesting user actually has permission to access that specific object. It is #1 because it leads directly to cross-tenant data leaks.

---

### Question 3
**Q:** How do you structure a multi-tenant authorization policy check in Python to ensure a user cannot read or mutate resources outside of their assigned workspace?

**A:**
```python
def check_workspace_access(session: Session, user: User, workspace_id: uuid.UUID, min_role: str = "member"):
    membership = session.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == user.id
        )
    ).scalar_one_or_none()
    
    if not membership and not user.is_superuser:
        raise HTTPException(status_code=403, detail="Access denied to this workspace")
```

---

### Question 4
**Q:** Why is relying on UI-level role checks (e.g., hiding the "Delete Project" button in React) completely useless for security if the backend endpoint does not independently enforce the check?

**A:**
Attackers do not use your UI. They use tools like Postman, curl, or browser dev tools to send raw HTTP `DELETE` requests directly to backend API endpoints.

---

### Question 5
**Q:** How do you prevent BOLA/IDOR at the database query layer rather than checking permissions in application code after fetching the object? (Explain: `WHERE id = :task_id AND workspace_id = :current_user_workspace_id`).

**A:**
Include tenant boundary constraints directly in the SQL query:
```python
stmt = select(Task).where(
    Task.id == task_id,
    Task.project_id.in_(
        select(Project.id).where(Project.workspace_id.in_(user_workspace_ids))
    )
)
```
If the ID belongs to another tenant, the query returns `None` at the database level.

---

### Question 6
**Q:** In a hierarchical permissions system (`Workspace` $\rightarrow$ `Project` $\rightarrow$ `Task`), how do you model and evaluate permissions efficiently when a user is an `Admin` in Workspace A, but only a `Member` with read-only access in Project B within Workspace A?

**A:**
Evaluate permissions hierarchically:
1. Superuser $\rightarrow$ Grant.
2. Workspace Owner $\rightarrow$ Grant.
3. Check explicit Project-level membership override.
4. Fall back to Workspace-level role permissions.

---

### Question 7
**Q:** A user with `Member` role discovers that by sending a `PUT /api/v1/workspaces/{id}/members/{user_id}` request with `role: "owner"`, they can promote themselves to Workspace Owner because the endpoint checked only that the caller was a workspace member, not an owner. How do you refactor the authorization policy to prevent privilege escalation?

**A:**
Enforce strict policy checks in `auth_policy.py`:
```python
if target_role == "owner" or current_member.role != "owner":
    if not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Only Workspace Owners can modify roles")
```

---

### Question 8
**Q:** In `backend/app/services/auth_policy.py` and `backend/app/api/routes/workspaces.py`, how are role permissions (`Owner`, `Admin`, `Member`, `Superuser`) evaluated before allowing workspace member modifications, project deletions, or task assignments?

**A:**
In `backend/app/services/auth_policy.py`:
Explicit helper functions (`can_modify_workspace`, `can_delete_project`, `can_assign_task`) verify caller roles against target resources, throwing `403 Forbidden` if requirements are not met.

---

### Follow-up Questions (7.3)

#### Question 9
**Q:** What is the difference between an authorization failure returning `401 Unauthorized` versus `403 Forbidden` versus `404 Not Found`? When should you intentionally return `404 Not Found` for an unauthorized resource to prevent resource enumeration?

**A:**
- `401`: Missing or invalid authentication token.
- `403`: Authenticated, but lacking permission.
- `404`: Resource does not exist.
**When to use 404:** When confirming the existence of an object (via 403) would leak sensitive business intelligence (e.g., verifying secret project IDs).

#### Question 10
**Q:** How do you unit test and integration test authorization policies to guarantee that every single endpoint enforces role boundaries across different tenants?

**A:**
Create test fixtures with User A (Workspace 1) and User B (Workspace 2). Parameterize tests across all routes sending User B's token to User A's resources and asserting `403/404` status codes.

---

# 8. Logging & Observability (Structlog, Promtail, Loki, Grafana, Sentry)

## 8.1 Structured Logging & Context Propagation

### Question 1
**Q:** Why is structured JSON logging superior to unstructured plaintext logging in production environments?

**A:**
Structured JSON logs can be parsed and indexed automatically by log aggregators (Loki, Elasticsearch, Datadog), allowing engineers to filter and aggregate by specific keys (`status_code`, `user_id`, `duration`) rather than using slow, fragile regex parsing.

---

### Question 2
**Q:** What is a Correlation ID / Request ID, and why is it essential for debugging distributed systems and microservices?

**A:**
A Correlation ID is a unique UUID assigned to an HTTP request at the edge. It is passed across all internal services, database queries, and log statements, allowing engineers to trace the entire lifecycle of a single request across distributed logs.

---

### Question 3
**Q:** How do you use Python's standard `contextvars` module to store and propagate request-scoped metadata (like correlation IDs and user IDs) across asynchronous tasks without thread-local storage leaks?

**A:**
`contextvars` manages context state per coroutine/task:
```python
import contextvars
correlation_id_var = contextvars.ContextVar("correlation_id", default=None)

# In middleware:
correlation_id_var.set("uuid-123")
```
When coroutines switch on the event loop, `contextvars` maintains isolated state automatically.

---

### Question 4
**Q:** How does `structlog` process log events through a pipeline of processors (e.g., timestamping, adding log levels, formatting exception tracebacks, JSON rendering)?

**A:**
`structlog` treats log events as Python dictionaries. A log passes through an ordered list of processor functions, where each processor enriches or formats the dictionary before the final `JSONRenderer` outputs the serialized string.

---

### Question 5
**Q:** How do you bridge standard library logging (e.g., logs emitted by Uvicorn, SQLAlchemy, Boto3) into your `structlog` pipeline using `ProcessorFormatter` so that 100% of application output is unified JSON?

**A:**
Use `structlog.stdlib.ProcessorFormatter`:
Configure root stdlib logger handlers with `ProcessorFormatter.wrap_for_formatter`, routing all third-party stdlib log messages through the structlog processor pipeline.

---

### Question 6
**Q:** Why must `structlog.contextvars.clear_contextvars()` always be called in a middleware `finally` block when running on asynchronous ASGI servers? What happens if you forget to clear context variables?

**A:**
If omitted, when an async worker thread reuses the execution context for a subsequent request, the previous request's `correlation_id` or `user_id` will bleed into the new request's logs.

---

### Question 7
**Q:** During an outage, your logs are flooded with duplicate log lines (each log message printed 3 times with identical timestamps). What configuration mistake in Python's root logger handlers and propagation settings causes duplicate log emission?

**A:**
1. Multiple handlers were attached to the root logger during re-imports.
2. `logger.propagate = True` was set on a child logger while handlers were also attached to parent loggers.
3. Initialization guards (`if _CONFIGURED: return`) were missing.

---

### Question 8
**Q:** Walk through `backend/app/core/logging.py`. How does `setup_logging()` prevent duplicate handler registration using `_CONFIGURED`, and how does `RotatingFileHandler` prevent disk space exhaustion?

**A:**
In `backend/app/core/logging.py`:
- `global _CONFIGURED`: Checks if setup already ran.
- `RotatingFileHandler`: Configured with `maxBytes=5_000_000` (5MB) and `backupCount=5`. When `app.log` hits 5MB, it archives `app.log.1` and creates a fresh file, limiting total log disk space to 25MB.

---

### Follow-up Questions (8.1)

#### Question 9
**Q:** What is the difference between `logger.exception("message")` and `logger.error("message")` in terms of stack trace capture?

**A:**
`logger.exception()` automatically captures `sys.exc_info()` and serializes the full exception stack trace into the log payload. `logger.error()` logs only the message unless `exc_info=True` is explicitly passed.

#### Question 10
**Q:** How do you configure log levels dynamically via environment variables so you can toggle `DEBUG` logging in staging without changing code?

**A:**
In `Settings`, declare `LOG_LEVEL: str = "INFO"`. In `setup_logging()`, set:
`root_logger.setLevel(getattr(logging, settings.LOG_LEVEL.upper()))`

---

## 8.2 Log Aggregation (Loki, Promtail) & Metrics (Grafana)

### Question 1
**Q:** What is the architecture of the Grafana Loki logging stack, and what are the respective roles of Promtail, Loki, and Grafana?

**A:**
- **Promtail:** Agent that tails log files on disk or Docker sockets, extracts labels, and ships logs to Loki.
- **Loki:** Horizontally-scalable, indexed log aggregation store.
- **Grafana:** Web visualization UI for querying logs via LogQL and building monitoring dashboards.

---

### Question 2
**Q:** How does Loki differ fundamentally from Elasticsearch in terms of indexing strategy and memory consumption?

**A:**
- **Elasticsearch:** Builds full-text inverted indexes for every word in every log. Extremely memory/disk intensive.
- **Loki:** Indexes **only metadata stream labels** (e.g., `job="backend"`, `env="prod"`), storing compressed raw log chunks in object storage. Uses up to 80% less memory than Elasticsearch.

---

### Question 3
**Q:** How do you write a LogQL query in Grafana to filter logs for a specific service, extract JSON fields, and find all requests that returned a status code $\ge 500$?

**A:**
```logql
{job="doit-backend"} | json | status_code >= 500
```

---

### Question 4
**Q:** What is the **High-Cardinality Label Trap** in Grafana Loki? Why will adding `user_id`, `request_id`, or `ip_address` as a Loki stream label crash the Loki server, and where should those fields be placed instead?

**A:**
Loki creates a separate index stream for every unique combination of labels. High-cardinality values create millions of tiny streams, exhausting Loki index memory.
**Rule:** High-cardinality fields belong inside the **JSON log body**, queried via LogQL JSON filters.

---

### Question 5
**Q:** How does Promtail scrape Docker container logs via `/var/run/docker.sock` and parse multiline exception stack traces into a single log entry?

**A:**
Promtail connects to the Docker socket, reads container metadata labels, and uses a `multiline` stage in its pipeline configuration to combine lines beginning with whitespace or `Traceback` into a single log record.

---

### Question 6
**Q:** How do you construct Grafana dashboards and alerting rules (e.g., trigger an alert if 5xx error rate exceeds 1% over a 5-minute rolling window) using LogQL metrics queries like `rate(...)`?

**A:**
```logql
sum(rate({job="doit-backend"} | json | status_code >= 500 [5m])) 
/ 
sum(rate({job="doit-backend"} [5m])) > 0.01
```

---

### Question 7
**Q:** A customer reports that their task creation failed with a 500 error 10 minutes ago, providing `X-Correlation-ID: 7a8b9c...`. How would you use LogQL in Grafana to find the exact line of Python code and stack trace that caused the failure?

**A:**
Query in Grafana Explore:
```logql
{job="doit-backend"} | json | correlation_id = "7a8b9c..."
```
Inspect the returned log record containing `event="request_failed"` and the formatted `exception` stack trace.

---

### Question 8
**Q:** In `docker-compose.prod.yml` and `docker/promtail/promtail-config.yml`, how is the log volume shared between the FastAPI container, Promtail, and Loki?

**A:**
`docker-compose.prod.yml` defines a named volume `backend_logs`.
- Backend mounts `backend_logs:/app/logs`.
- Promtail mounts `backend_logs:/var/log/doit:ro` (read-only) and tails `/var/log/doit/*.log`.

---

### Follow-up Questions (8.2)

#### Question 9
**Q:** What is Log Retention in Loki, and how do you configure table manager / retention policies to automatically delete logs older than 30 days?

**A:**
Configure in `loki-config.yml`:
`retention_enabled: true` and `retention_period: 720h` (30 days).

#### Question 10
**Q:** How does Sentry complement Loki, and why is Sentry better suited for exception grouping and release regression tracking while Loki is suited for broad log querying?

**A:**
Sentry aggregates identical stack traces into actionable issues, tracks crash-free user rates, and maps errors to specific Git commits. Loki provides complete historical log traces for all requests (successes and failures).

---

# 9. Cloud Object Storage (AWS S3 & Boto3)

## 9.1 S3 Architecture, Boto3 SDK & File Uploads

### Question 1
**Q:** What is Object Storage, and how does it differ fundamentally from Block Storage (EBS) and File Storage (EFS/NFS)?

**A:**
- **Object Storage (S3):** Flat address space; data stored as immutable objects with unique keys and custom metadata; accessed via REST APIs over HTTP.
- **Block Storage (EBS):** Raw storage volume formatted with a filesystem and mounted to a single server instance.
- **File Storage (EFS):** Hierarchical file tree shared concurrently across multiple servers via NFS.

---

### Question 2
**Q:** What is an S3 Bucket, an Object Key, and Object Metadata?

**A:**
- **Bucket:** Globally unique top-level container for objects.
- **Object Key:** Unique string path identifier (e.g., `uploads/tasks/123/file.png`).
- **Metadata:** Key-value pairs (e.g., `Content-Type: image/png`, `Cache-Control`).

---

### Question 3
**Q:** How do you upload a file stream to S3 using `boto3.client('s3').upload_fileobj()` with explicit `ContentType` (MIME type) headers?

**A:**
```python
s3_client.upload_fileobj(
    file_obj,
    bucket_name,
    object_key,
    ExtraArgs={"ContentType": content_type}
)
```

---

### Question 4
**Q:** What is the security and scalability trade-off between:
* **Approach A:** Frontend uploads file to FastAPI backend $\rightarrow$ Backend uploads file to S3.
* **Approach B:** Frontend requests presigned URL from Backend $\rightarrow$ Frontend uploads file directly to S3.

**A:**
- **Approach A (Proxy):** Simple; allows backend virus scanning/validation before upload. Downside: Consumes backend server bandwidth, memory, and worker threads on large files.
- **Approach B (Presigned):** Ultra-scalable; offloads 100% of upload network bandwidth and concurrency to AWS S3 infrastructure.

---

### Question 5
**Q:** Why is Boto3's `boto3.client()` thread-safe, whereas creating a `boto3.resource()` or sharing a `boto3.Session()` across threads can cause race conditions?

**A:**
`boto3.client()` instances are stateless and thread-safe. `boto3.resource()` and `boto3.Session()` contain mutable internal state dictionaries and shared connection pools that are not thread-safe.

---

### Question 6
**Q:** How do you structure S3 object keys in a multi-tenant application to ensure tenant isolation, prevent naming collisions, and support prefix-based lifecycle deletion policies?

**A:**
`workspaces/{workspace_id}/projects/{project_id}/tasks/{task_id}/{uuid4}_{sanitized_filename}`

---

### Question 7
**Q:** When users download PDF attachments uploaded through your API, the browser downloads the file as a generic `octet-stream` without an extension rather than opening it inline. What missing S3 metadata header (`ContentType` / `ContentDisposition`) caused this?

**A:**
`ContentType: application/pdf` was missing during upload, defaulting to `binary/octet-stream`. Set `Content-Disposition: inline` to view in browser or `attachment; filename="doc.pdf"` to download with name.

---

### Question 8
**Q:** In `backend/app/core/s3.py`, how are `get_s3_client`, `upload_file_to_s3`, and `delete_file_from_s3` implemented? How does the application handle scenarios where AWS credentials are not configured?

**A:**
In `backend/app/core/s3.py`:
`get_s3_client()` checks `if not settings.S3_BUCKET: return None`. All upload/delete functions check for `None`, log a warning, and return `False` safely without crashing the API in local development.

---

### Follow-up Questions (9.1)

#### Question 9
**Q:** What is S3 Multipart Upload, and at what file size threshold (e.g., >100MB) should you switch from single-part upload to multipart upload?

**A:**
Multipart upload splits large files into chunks uploaded concurrently in parallel. Recommended for files $>100$MB to allow resuming failed chunk uploads without restarting the entire file.

#### Question 10
**Q:** How do S3 Lifecycle Rules allow you to automatically transition older task attachments to S3 Infrequent Access (IA) or Glacier to save storage costs?

**A:**
Configure S3 bucket lifecycle rules matching key prefix `workspaces/` to transition objects to S3 Standard-IA after 90 days and Glacier after 365 days.

---

## 9.2 Presigned URLs & Orphaned File Lifecycle

### Question 1
**Q:** What is an S3 Presigned URL, and how does it use cryptographic signatures (AWS Signature Version 4) to grant temporary access without making the S3 bucket public?

**A:**
A presigned URL embeds an AWS SigV4 cryptographic signature in the query string (`X-Amz-Signature`). S3 verifies the signature against your secret key, granting temporary access to private objects without making the bucket public.

---

### Question 2
**Q:** How do you generate a presigned download URL with a 1-hour expiration time using `boto3`?

**A:**
```python
url = s3_client.generate_presigned_url(
    "get_object",
    Params={"Bucket": bucket_name, "Key": object_key},
    ExpiresIn=3600
)
```

---

### Question 3
**Q:** How do you generate a presigned *upload* (PUT/POST) URL that restricts the client to uploading a specific file size and MIME type?

**A:**
Use `s3_client.generate_presigned_post()` with conditions:
```python
conditions = [
    ["content-length-range", 1, 10_000_000], # Max 10MB
    {"Content-Type": "image/png"}
]
```

---

### Question 4
**Q:** What is the **Orphaned File Problem** in object storage? (e.g., File is uploaded to S3, but the subsequent database transaction creating the `Attachment` record fails or times out). How do you prevent accumulation of unreferenced files in S3?

**A:**
Files exist in S3 with no database record reference.
**Mitigation:**
1. Configure S3 bucket lifecycle rule to auto-delete unconfirmed uploads in a `/temp` folder after 24 hours.
2. Run a periodic reconciliation cron job comparing S3 object keys against database `Attachment.file_path` records.

---

### Question 5
**Q:** When a user deletes a Task or an entire Workspace in PostgreSQL, how do you handle the deletion of associated S3 files? Should S3 deletion occur synchronously inside the DB request or asynchronously via a background task?

**A:**
Asynchronously via a background task or event queue. Synchronous S3 network calls inside database transactions hold connection locks and slow down user response times.

---

### Question 6
**Q:** A presigned S3 URL generated by your backend returns `403 SignatureDoesNotMatch` when accessed by the frontend. What are the common causes (e.g., system clock skew, URL-encoding issues, region mismatch)?

**A:**
1. **Clock Skew:** Backend server system time differs by $>15$ minutes from AWS NTP time.
2. **Region Mismatch:** S3 client initialized with default `us-east-1` when bucket resides in `eu-west-1`.
3. **URL Alteration:** Client modified headers or query parameters after signature generation.

---

### Question 7
**Q:** In `backend/app/api/routes/attachments.py`, how are file uploads and presigned URL downloads handled when tasks have attachments?

**A:**
Endpoints verify task workspace ownership, upload files using `s3.py`, store the `file_path` in PostgreSQL, and generate temporary presigned URLs when users request attachment downloads.

---

### Follow-up Questions (9.2)

#### Question 8
**Q:** Why should S3 bucket CORS policies be strictly configured when clients upload files directly via presigned URLs?

**A:**
Browsers block direct AJAX `PUT`/`POST` requests to S3 from frontend origins unless the S3 bucket returns appropriate `Access-Control-Allow-Origin` headers.

#### Question 9
**Q:** How can S3 Event Notifications (triggering AWS Lambda or SNS/SQS) be used to automatically generate image thumbnails or scan uploaded files for malware?

**A:**
Configure S3 bucket event on `s3:ObjectCreated:*` to trigger an AWS Lambda function that downloads the image, resizes it, uploads the thumbnail to S3, and updates the database.

---

# 10. Testing Infrastructure (Pytest, TestClient, Fixtures)

## 10.1 Fixture Architecture, Scoping & Isolation

### Question 1
**Q:** What is Pytest, and how do Pytest fixtures improve upon standard `unittest.TestCase` setup/teardown methods?

**A:**
Pytest is a modular Python testing framework. Fixtures use dependency injection with explicit scoping, composability, and clean `yield` teardown syntax, avoiding fragile object-oriented inheritance hierarchies.

---

### Question 2
**Q:** What are the different Pytest fixture scopes (`function`, `class`, `module`, `package`, `session`), and what are the lifecycle rules of each?

**A:**
- `function` (default): Executed once per test function.
- `class`: Executed once per test class.
- `module`: Executed once per test file (`.py`).
- `session`: Executed once across the entire test suite run (ideal for test DB creation).

---

### Question 3
**Q:** How do you write a `yield` fixture in Pytest that sets up a clean database session and automatically tears it down / rolls back after the test executes?

**A:**
```python
@pytest.fixture(scope="function")
def db_session():
    connection = engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection)
    
    yield session
    
    session.close()
    transaction.rollback()
    connection.close()
```

---

### Question 4
**Q:** What are the architectural trade-offs between testing against an in-memory SQLite database versus a real containerized PostgreSQL instance? What Postgres-specific features fail silently when tested on SQLite?

**A:**
- **SQLite:** Fast startup. Downside: Fails to catch PostgreSQL-specific syntax, `JSONB` operators, `ON CONFLICT` clauses, UUID validation, and concurrency isolation rules.
- **Postgres (Testcontainer):** 100% production parity. Catches real database constraints and migration issues.

---

### Question 5
**Q:** How do you implement **Transaction-Rollback Test Isolation** in SQLAlchemy, where each test runs inside a nested transaction (savepoint) and rolls back on completion, avoiding the overhead of dropping and re-creating tables between tests?

**A:**
Bind tests to an external transaction with savepoints (`begin_nested()`). At test completion, rolling back the savepoint restores the database state in $<2$ms without truncating tables.

---

### Question 6
**Q:** How do you configure Pytest to execute tests in parallel across multiple CPU cores using `pytest-xdist` without database race conditions?

**A:**
Run `pytest -n auto`. Use the `worker_id` fixture in `conftest.py` to create isolated test database schemas per worker process (e.g., `test_db_gw0`, `test_db_gw1`).

---

### Question 7
**Q:** You run your test suite: Test A passes when run alone, but fails when the entire suite runs because Test B mutated database state. How do you diagnose and fix shared state pollution across tests?

**A:**
**Diagnosis:** Test B committed changes to the database without rollback.
**Fix:** Ensure all test database fixtures use function-scoped rollback isolation and clear global singletons in teardown.

---

### Question 8
**Q:** In `backend/app/tests/conftest.py`, what fixtures are provided for database sessions, superuser tokens, and standard user authentication?

**A:**
`conftest.py` provides:
- `db: Session`: Database session fixture.
- `client: TestClient`: HTTP test client.
- `superuser_token_headers`: Bearer headers for superuser requests.
- `normal_user_token_headers`: Authenticated headers for standard member requests.

---

### Follow-up Questions (10.1)

#### Question 9
**Q:** What does the `autouse=True` parameter do on a fixture, and why should it be used sparingly?

**A:**
`autouse=True` forces the fixture to run on every test without explicit declaration in test function arguments. Used sparingly to avoid hidden side-effects and slow test runs.

#### Question 10
**Q:** How do you use `pytest.mark.parametrize` to run a single test function against 10 different input/output boundary cases?

**A:**
```python
@pytest.mark.parametrize("status_input, expected_code", [
    ("in_progress", 200),
    ("completed", 200),
    ("invalid_status", 422),
])
def test_task_status(client, status_input, expected_code):
    ...
```

---

## 10.2 Mocking, Dependency Overrides & Coverage

### Question 1
**Q:** What is the difference between a Mock, a Stub, and a Fake in backend testing?

**A:**
- **Stub:** Returns static canned data.
- **Mock:** Expects specific method calls and asserts they occurred with specific arguments.
- **Fake:** Working implementation with shortcuts (e.g., in-memory dict fake repository).

---

### Question 2
**Q:** How does FastAPI's `app.dependency_overrides` dictionary allow you to inject mock services during integration tests?

**A:**
```python
app.dependency_overrides[get_current_user] = lambda: mock_user
```
FastAPI substitutes the mock callable when resolving dependencies for the test request.

---

### Question 3
**Q:** How do you mock an external network call (e.g., Redis client, Brevo SMTP email dispatch, or AWS S3 upload) using `unittest.mock.patch`?

**A:**
```python
@patch("app.core.s3.upload_file_to_s3", return_value=True)
def test_upload(mock_s3, client):
    response = client.post("/api/v1/attachments/upload", ...)
    assert response.status_code == 200
    mock_s3.assert_called_once()
```

---

### Question 4
**Q:** How do you write an integration test using `httpx.AsyncClient` or FastAPI's `TestClient` to verify that an endpoint returns `403 Forbidden` when a non-admin attempts to delete a project?

**A:**
```python
def test_delete_project_forbidden(client: TestClient, normal_user_token_headers):
    response = client.delete(
        f"/api/v1/projects/{other_project_id}",
        headers=normal_user_token_headers
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "Not enough permissions"
```

---

### Question 5
**Q:** Why is over-mocking dangerous in integration tests, and how do you determine the boundary between what should be mocked (external third-party APIs) and what should run real code (ORM, database, validation schemas)?

**A:**
**Danger:** Over-mocking tests your mocks instead of your code; tests pass while production crashes due to SQL errors.
**Boundary:**
- **Real Code:** Database queries, Pydantic validation, auth dependencies, business logic.
- **Mocked Code:** External third-party networks (AWS S3, Stripe, Brevo SMTP).

---

### Question 6
**Q:** How do you configure `pytest-cov` and `.coveragerc` to enforce branch coverage thresholds and generate HTML coverage reports in CI/CD pipelines?

**A:**
In `pyproject.toml`:
```toml
[tool.coverage.run]
source = ["app"]
branch = true

[tool.coverage.report]
fail_under = 85
```
Run: `pytest --cov=app --cov-report=html`

---

### Question 7
**Q:** An integration test for a protected route passes in local development, but in CI it fails with `401 Unauthorized` because the mock JWT secret or database seed was not loaded. How do you ensure environment variables in `conftest.py` are hermetic?

**A:**
Use `monkeypatch.setenv("SECRET_KEY", "testsecret")` in a session-scoped autouse fixture before application modules are imported.

---

### Question 8
**Q:** Review the testing guide in `docs/pytest-project-testing-guide.md`. What testing conventions and assertion patterns are enforced in this repository?

**A:**
In `docs/pytest-project-testing-guide.md`:
Enforces using `TestClient`, fixture isolation, testing status codes, payload shapes, and asserting database mutations.

---

### Follow-up Questions (10.2)

#### Question 9
**Q:** What is the difference between testing with `TestClient` (which runs synchronous WSGI/ASGI in-process transport) and testing against a live running server over real HTTP?

**A:**
`TestClient` calls the ASGI application callable directly in memory without actual TCP network socket transmission. Fast, but does not test reverse proxy routing or TLS termination.

#### Question 10
**Q:** How do you assert that a specific background task or log message was emitted during an endpoint test execution?

**A:**
Use Pytest's built-in `caplog` fixture:
```python
def test_log(client, caplog):
    client.get("/endpoint")
    assert "request_finished" in caplog.text
```

---

# 11. Containerization & Edge Routing (Docker, Compose, Traefik)

## 11.1 Multi-Stage Dockerfile & Image Optimization

### Question 1
**Q:** What is the difference between a Docker Image and a Docker Container?

**A:**
- **Image:** Immutable, read-only template with application code and dependencies.
- **Container:** Isolated, runnable runtime instance of an image with a writable container layer.

---

### Question 2
**Q:** What is the Docker Build Cache, and why should `COPY pyproject.toml` come *before* `COPY . /app` in a Dockerfile?

**A:**
Docker caches layers sequentially. Copying `pyproject.toml` and installing dependencies *before* copying source code ensures Docker reuses cached dependency layers, rebuilding only the fast source code layer when code changes.

---

### Question 3
**Q:** What is a Multi-Stage Docker Build, and how does it reduce the final production container image size?

**A:**
Multi-stage builds use multiple `FROM` instructions. Build tools, compilers, and caches (like `gcc`, `uv`) run in the builder stage; only the final compiled artifacts are copied into a lean runtime image, shrinking image sizes from 1GB to $<150$MB.

---

### Question 4
**Q:** What are the security and operational differences between running containers as `root` versus a dedicated non-root user (`USER appuser`)?

**A:**
If an attacker exploits an application vulnerability in a container running as `root`, they possess root privileges on the container and can potentially exploit container escape vulnerabilities to compromise the host OS kernel.

---

### Question 5
**Q:** What are the differences between Debian slim images (`python:3.12-slim`) and Alpine Linux images (`python:3.12-alpine`) for Python backends? Why can Alpine's `musl libc` cause slower execution and compilation issues with C-extensions (like `bcrypt` or `psycopg`) compared to `glibc`?

**A:**
Alpine uses `musl libc` instead of `glibc`. Python wheels compiled for Linux (`manylinux`) do not work on Alpine, forcing pip to compile C-extensions from source during build. In production, `musl` memory allocators can be slower for multi-threaded Python workloads. `python:3.12-slim` is preferred.

---

### Question 6
**Q:** How do you handle container graceful shutdown when Docker sends a `SIGTERM` signal? Why is using `exec uvicorn ...` necessary in entrypoint shell scripts to ensure PID 1 signal forwarding?

**A:**
If an entrypoint script runs `uvicorn ...` without `exec`, the shell process is PID 1 and swallows `SIGTERM`, causing Docker to kill the container abruptly after 10 seconds (`SIGKILL`). `exec` replaces the shell process with Uvicorn as PID 1, receiving signals directly.

---

### Question 7
**Q:** Your backend container takes 8 minutes to build in CI because dependencies are reinstalled on every commit, even when `pyproject.toml` hasn't changed. How do you fix the Dockerfile layer ordering and cache mount settings?

**A:**
1. Separate dependency installation from code copy.
2. Use BuildKit cache mounts:
   `RUN --mount=type=cache,target=/root/.cache/uv uv pip install -r pyproject.toml`

---

### Question 8
**Q:** In this project's backend Dockerfile, how is the `uv` package manager utilized to build dependencies, and how is the final runtime stage constructed?

**A:**
The Dockerfile uses `ghcr.io/astral-sh/uv:latest` to sync virtual environment dependencies rapidly into `/app/.venv` and copies the compiled venv into the final `python:3.12-slim` runtime stage.

---

### Follow-up Questions (11.1)

#### Question 9
**Q:** What is a `.dockerignore` file, and what sensitive files (`.env`, `.git`, `__pycache__`, `.venv`) must always be excluded from build contexts?

**A:**
`.dockerignore` prevents local host files from copying into build contexts, protecting secrets (`.env`) and keeping build context sizes small.

#### Question 10
**Q:** What does the `HEALTHCHECK` instruction in a Dockerfile do, and how does the Docker daemon monitor container health?

**A:**
It defines a command (e.g., `curl -f http://localhost:8000/api/v1/utils/health-check/`) executed periodically by the Docker daemon to mark container status as `healthy` or `unhealthy`.

---

## 11.2 Edge Routing, SSL & Traefik Reverse Proxy

### Question 1
**Q:** What is a Reverse Proxy, and how does it differ from a Forward Proxy?

**A:**
- **Forward Proxy:** Sits in front of clients; forwards outbound requests to the internet (e.g., corporate VPN).
- **Reverse Proxy:** Sits in front of backend web servers; intercepts incoming client traffic and routes it to internal backend services.

---

### Question 2
**Q:** What is Traefik, and how does it differ from traditional reverse proxies like Nginx or HAProxy in containerized environments?

**A:**
Traefik is a modern cloud-native edge router. Unlike Nginx (which requires static configuration files and manual reloads), Traefik listens directly to the Docker daemon socket and updates routing rules dynamically when containers start or stop.

---

### Question 3
**Q:** How does Traefik use Docker Labels on containers (`traefik.http.routers.backend.rule=Host('api.domain.com')`) for dynamic service discovery and routing without manual configuration reloads?

**A:**
Traefik monitors `/var/run/docker.sock`. When a container starts with labels:
1. Creates a router matching `Host(api.domain.com)`.
2. Creates a service targeting the container's internal IP and port `8000`.

---

### Question 4
**Q:** How does Traefik automate SSL/TLS certificate generation and renewal using Let's Encrypt and the ACME HTTP-01 challenge?

**A:**
Traefik negotiates directly with Let's Encrypt ACME servers. It answers HTTP-01 challenges on port 80, retrieves valid SSL certificates, stores them in `acme.json`, and automatically renews them before expiration.

---

### Question 5
**Q:** How does Traefik handle HTTP-to-HTTPS redirection globally using entrypoint redirection or router middleware?

**A:**
In Traefik labels:
```yaml
- "traefik.http.middlewares.https-redirect.redirectscheme.scheme=https"
- "traefik.http.routers.backend-http.middlewares=https-redirect"
```

---

### Question 6
**Q:** What is the network architecture of the `traefik-public` external Docker network? Why are database and cache containers kept on an isolated internal network inaccessible to Traefik?

**A:**
- `traefik-public`: Shared bridge network where Traefik routes public traffic to frontend and backend containers.
- `default` (internal network): Isolated network connecting Backend, PostgreSQL, and Redis. Database ports are not exposed to Traefik or the public internet.

---

### Question 7
**Q:** A newly deployed service returns `502 Bad Gateway` through Traefik. The container is running and healthy. What are the top 3 configuration checks (e.g., `traefik.docker.network`, `loadbalancer.server.port`, container port exposure)?

**A:**
1. Check `traefik.docker.network=traefik-public` (Traefik cannot reach containers on different Docker networks).
2. Check `loadbalancer.server.port=8000` (mismatch with actual Uvicorn port).
3. Check container firewall / Uvicorn binding (`0.0.0.0` vs `127.0.0.1`).

---

### Question 8
**Q:** In `docker-compose.prod.yml` and `docker-compose.traefik.yml`, analyze the routing labels for `frontend`, `backend`, `adminer`, and `grafana`. How is basic authentication applied to Adminer via Traefik middleware?

**A:**
In `docker-compose.prod.yml`:
Adminer defines a BasicAuth middleware:
```yaml
- "traefik.http.middlewares.adminer-auth.basicauth.users=${USERNAME}:${HASHED_PASSWORD}"
- "traefik.http.routers.adminer-https.middlewares=adminer-auth"
```
Traefik intercepts requests to `adminer.domain.com` and challenges users for HTTP Basic Auth before routing traffic.

---

### Follow-up Questions (11.2)

#### Question 9
**Q:** What is the difference between Traefik Routers, Middlewares, and Services?

**A:**
- **Routers:** Analyze incoming request (Host, Path, Headers).
- **Middlewares:** Transform request/response (Auth, Headers, RateLimit, HTTPS redirect).
- **Services:** Forward request to actual target container load balancer endpoints.

#### Question 10
**Q:** How does Traefik perform health checks on backend container instances before routing live traffic to them?

**A:**
Traefik queries the service's configured healthcheck URL periodically. If a container instance fails health checks, Traefik removes it from the active load-balancing rotation.

---

## 11.3 Docker Compose Orchestration & Production Operations

### Question 1
**Q:** What is Docker Compose, and what is the difference between `docker-compose.yml`, `docker-compose.override.yml`, and `docker-compose.prod.yml`?

**A:**
- `docker-compose.yml`: Base multi-container service definition.
- `docker-compose.override.yml`: Local development overrides (auto-applied by `docker compose up`).
- `docker-compose.prod.yml`: Production configuration with explicit resource limits, production volumes, and Traefik labels.

---

### Question 2
**Q:** What is the difference between a Named Docker Volume and a Bind Mount? Which one should be used for database storage in production?

**A:**
- **Named Volume:** Managed entirely by Docker inside `/var/lib/docker/volumes/`. High performance, isolated permissions. (Mandatory for production databases: `app-db-data`).
- **Bind Mount:** Direct mount of a host directory (e.g., `./backend:/app`). Ideal for local development live-reloading.

---

### Question 3
**Q:** How do you configure memory and CPU limits (`deploy.resources.limits`) in Docker Compose to prevent a runaway container from crashing the host VPS?

**A:**
```yaml
deploy:
  resources:
    limits:
      cpus: '0.50'
      memory: 300M
```

---

### Question 4
**Q:** Why is `depends_on: [db]` insufficient to prevent backend startup crashes, and how do you configure `condition: service_healthy` with a `pg_isready` healthcheck?

**A:**
`depends_on: [db]` only waits for the DB container process to start, not for PostgreSQL to finish initialization.
```yaml
depends_on:
  db:
    condition: service_healthy
```
Paired with `healthcheck: test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]`.

---

### Question 5
**Q:** How does Docker container logging with the `json-file` driver cause disk exhaustion if `max-size` and `max-file` options are omitted?

**A:**
By default, Docker's `json-file` driver writes container stdout indefinitely. Under high traffic, log files grow until 100% of the VPS disk is consumed. Configure `max-size: "10m"` and `max-file: "3"`.

---

### Question 6
**Q:** What is the exact sequence of commands to execute a zero-downtime or minimal-downtime deployment using `docker compose pull`, `docker compose up -d --remove-orphans`, and prestart migration checks?

**A:**
```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d --remove-orphans
```

---

### Question 7
**Q:** PostgreSQL inside Docker crashes unexpectedly during peak load. Running `docker inspect db` shows `ExitCode: 137`. What does Exit Code 137 mean (OOM Killer), and how do you resolve it?

**A:**
Exit code 137 = `128 + 9 (SIGKILL)` $\rightarrow$ The Linux kernel Out-Of-Memory (OOM) killer terminated PostgreSQL because it exceeded its container memory limit.
**Fix:** Reduce `shared_buffers` and `max_connections` or increase the container memory limit in Compose.

---

### Question 8
**Q:** Review the entire `docker-compose.prod.yml` in this repository. Explain the dependency chain: `db` $\rightarrow$ `prestart` $\rightarrow$ `backend` and `redis` $\rightarrow$ `backend`.

**A:**
1. `db` and `redis` start and pass health checks.
2. `prestart` runs migrations and seeds initial data, then exits with code 0.
3. `backend` starts only after `db` (healthy), `redis` (healthy), and `prestart` (`service_completed_successfully`).

---

### Follow-up Questions (11.3)

#### Question 9
**Q:** What is the difference between `docker compose down` and `docker compose stop`? Why will running `docker compose down -v` destroy your production database?

**A:**
- `stop`: Halts running containers without removing them.
- `down`: Stops and removes containers and networks.
- `down -v`: **Deletes all attached named volumes**, permanently deleting database files (`app-db-data`).

#### Question 10
**Q:** How does Docker's internal DNS resolver (`127.0.0.11`) resolve container service names (e.g., `http://backend:8000`) across shared networks?

**A:**
Docker runs an embedded DNS server on `127.0.0.11`. When a container queries `db`, Docker DNS looks up the active container IP on the shared bridge network and returns it.

---

# 12. Resilience, Background Tasks & Utilities

## 12.1 Retry Strategies with Tenacity & Fault Tolerance

### Question 1
**Q:** What is Exponential Backoff with Jitter, and why is retrying failed operations immediately in a tight loop harmful to recovering services?

**A:**
- **Exponential Backoff:** Doubles wait time after each retry ($2^n$).
- **Jitter:** Adds random noise to wait times, preventing all clients from retrying simultaneously (thundering herd).
Immediate retries flood an already-overloaded recovering database, keeping it in a crash loop.

---

### Question 2
**Q:** What is the Tenacity library in Python?

**A:**
Tenacity is a general-purpose Python retrying library with configurable stop conditions, backoff strategies, retry callbacks, and exception filtering.

---

### Question 3
**Q:** How do you decorate a function with `@retry` in Tenacity to retry up to 5 times with exponential backoff only when a specific exception (e.g., `psycopg.OperationalError`) is raised?

**A:**
```python
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
from psycopg import OperationalError

@retry(
    stop=stop_after_attempt(5),
    wait=wait_exponential(multiplier=1, min=1, max=10),
    retry=retry_if_exception_type(OperationalError)
)
def connect_to_db():
    ...
```

---

### Question 4
**Q:** What is the Circuit Breaker pattern, and how does it prevent an application from continuously executing doomed requests against a failing downstream dependency?

**A:**
A Circuit Breaker tracks failures.
- **Closed:** Normal operations.
- **Open:** If failure rate exceeds threshold, calls fail immediately without attempting network calls.
- **Half-Open:** Periodically tests if downstream dependency has recovered.

---

### Question 5
**Q:** How do you prevent retry storms when hundreds of concurrent backend requests all retry failed database queries simultaneously?

**A:**
Combine **Exponential Backoff with Full Jitter** and a global rate limiter / circuit breaker to cap total retry attempts.

---

### Question 6
**Q:** How do you ensure that operations wrapped in retry decorators are **Idempotent** so that partial failures do not result in duplicate records (e.g., charging a card twice or inserting duplicate tasks)?

**A:**
Use database unique constraint idempotency keys (e.g., `idempotency_key` header or database `ON CONFLICT DO NOTHING`) so re-executing an operation produces the exact same state without duplicate rows.

---

### Question 7
**Q:** A backend startup script using Tenacity hangs indefinitely during a deployment because the retry stop condition was omitted. How do you configure `stop_after_attempt` or `stop_after_delay`?

**A:**
`@retry(stop=(stop_after_attempt(10) | stop_after_delay(60)))`

---

### Question 8
**Q:** In `backend/app/backend_pre_start.py`, how is Tenacity used to verify database connectivity before initiating Alembic migrations?

**A:**
In `backend_pre_start.py`:
`@retry` attempts a `SELECT 1` query up to 5 times with 1-second intervals before allowing Alembic to execute migrations.

---

### Follow-up Questions (12.1)

#### Question 9
**Q:** What is the difference between `retry_if_exception_type` and `retry_if_result` in Tenacity?

**A:**
- `retry_if_exception_type`: Retries when an exception is raised.
- `retry_if_result`: Retries when a function returns a specific return value (e.g., `response.status_code == 503`).

#### Question 10
**Q:** How do you log every retry attempt with `structlog` to track transient network instability?

**A:**
Pass `before_sleep=before_sleep_log(logger, logging.WARNING)` to `@retry`.

---

## 12.2 Transactional Email & HTML Templating (Jinja2, SMTP)

### Question 1
**Q:** How does SMTP communication work, and what is the difference between port 587 (STARTTLS) and port 465 (SSL/TLS)?

**A:**
- **Port 587 (STARTTLS):** Begins in plaintext and upgrades to encrypted TLS via the `STARTTLS` command (Modern standard).
- **Port 465 (SMTPS):** Establishes encrypted TLS immediately upon connection.

---

### Question 2
**Q:** What is Jinja2, and how does it render HTML email templates with dynamic variables?

**A:**
Jinja2 is a Python templating engine. It replaces placeholders (`{{ name }}`, `{% for item in items %}`) with dynamic variables and renders an HTML string.

---

### Question 3
**Q:** How do you configure Jinja2 template auto-escaping to prevent Cross-Site Scripting (XSS) attacks in HTML emails when inserting user-generated text?

**A:**
```python
from jinja2 import Environment, select_autoescape

env = Environment(
    autoescape=select_autoescape(["html", "xml"])
)
```

---

### Question 4
**Q:** Why should email dispatch NEVER be executed synchronously within the HTTP request/response cycle of a web API?

**A:**
SMTP handshakes take 500ms–2000ms. Synchronous email dispatch blocks the user's HTTP request for 2 seconds.

---

### Question 5
**Q:** What is the **Transactional Outbox Pattern**, and how does it guarantee that a user registration database commit and an invitation email dispatch remain strictly consistent even if the mail server or application crashes?

**A:**
1. Within the user registration DB transaction, insert an email record into an `outbox` table.
2. A separate background worker reads the `outbox` table, sends the email, and marks it as `sent`.
Guarantees zero lost emails.

---

### Question 6
**Q:** How do you handle email deliverability issues, bounce handling, and rate limits when sending transactional emails via Brevo, SendGrid, or AWS SES?

**A:**
Configure webhooks on the email provider (Brevo/SES) listening for `bounce` and `spam_report` events to mark emails as invalid in your database.

---

### Question 7
**Q:** Users report that email verification links in invitation emails are rendering as broken plaintext or escaping URL query parameters incorrectly. How do you debug the Jinja2 template rendering context?

**A:**
Inspect variable substitution in the template; ensure URL tokens are not double-encoded with `urlencode` filters and use `safe` only on trusted URLs.

---

### Question 8
**Q:** In `backend/app/utils.py` and `backend/app/email-templates/`, how are email templates loaded, rendered, and dispatched?

**A:**
In `backend/app/utils.py`:
`render_email_template()` loads templates from `email-templates/build/` using Jinja2 and sends emails via `emails.Message` / SMTP.

---

### Follow-up Questions (12.2)

#### Question 9
**Q:** What are SPF, DKIM, and DMARC DNS records, and why will transactional emails land in spam folders without them?

**A:**
- **SPF:** Authorizes specific IPs to send email for your domain.
- **DKIM:** Cryptographically signs emails to verify sender authenticity.
- **DMARC:** Specifies policy if SPF/DKIM checks fail. Without them, Gmail/Outlook mark emails as spam.

#### Question 10
**Q:** How do you mock email dispatch in local development and testing environments using tools like MailHog or local console output?

**A:**
Run MailHog in Docker (listening on port 1025 for SMTP, port 8025 for web UI). In local `.env`, set `SMTP_HOST=mailhog` and view sent emails in MailHog's web UI.

---

# 13. Project-Level Mock Interview

---

### Scenario 1: Multi-Tenant Data Isolation & BOLA Breach Prevention
**Q:** *"Walk me through the lifecycle of a request to `DELETE /api/v1/projects/{project_id}`. A malicious user who is a valid Member of Workspace A obtains the UUID of a Project in Workspace B. Trace the execution path through Traefik, Middleware, FastAPI Dependencies, the Service Layer, and PostgreSQL. At what exact layer is the attack thwarted, what status code is returned, what query is executed, and what log is emitted to Grafana Loki?"*

**A:**
1. **Traefik:** Intercepts HTTPS request on port 443, verifies TLS, and routes traffic over `traefik-public` to the `backend:8000` container.
2. **Middleware:** `RequestLoggingMiddleware` extracts/generates `X-Correlation-ID` and binds it to `structlog.contextvars`.
3. **FastAPI Dependencies:**
   - `get_db`: Yields database `Session`.
   - `get_current_user`: Decodes JWT Bearer token, verifies signature, loads `User A` from database.
4. **Service Layer & Authorization Policy (`project_service.py` & `auth_policy.py`):**
   - The service queries PostgreSQL:
     ```sql
     SELECT * FROM project WHERE id = :project_id;
     ```
   - It retrieves Project B (`workspace_id = Workspace_B`).
   - It queries `workspace_member` table for `user_id = User_A.id` AND `workspace_id = Workspace_B.id`.
   - **Thwarted Layer:** The query returns `None` (User A is not a member of Workspace B).
   - `auth_policy.py` immediately raises `HTTPException(status_code=403, detail="Not enough permissions")` (or `404` to prevent ID enumeration).
5. **PostgreSQL:** No `DELETE` statement is ever issued.
6. **Logging & Loki:** `structlog` emits:
   ```json
   {"event": "access_denied", "user_id": "user_a", "target_project": "proj_b", "correlation_id": "7a8b...", "status_code": 403}
   ```
   Promtail ships the log to Loki; Grafana records the 403 metric.

#### Probing Follow-up Answers:
* **Why SQL WHERE filtering is superior:** Querying `WHERE id = :proj_id AND workspace_id IN (:user_workspace_ids)` delegates isolation to PostgreSQL; if the project belongs to another tenant, 0 rows return, eliminating human error in application-layer if-conditions.
* **Role differentiation:** Workspace Owners and Admins can delete any project in their workspace. Regular Members can only delete projects they explicitly own.
* **Cascade mechanics:** PostgreSQL foreign key `ON DELETE CASCADE` automatically deletes all child `Section`, `Task`, `Comment`, and `Attachment` rows in a single atomic database transaction.

---

### Scenario 2: High-Concurrency Cache Stampede & Redis Outage
**Q:** *"Your system is experiencing a sudden traffic spike: 2,000 concurrent requests arrive for the task list of a popular project right as the Redis cache key expires. Concurrently, the Redis container runs out of memory and crashes. Explain in detail how your backend architecture prevents this traffic spike from bringing down PostgreSQL, and how your code gracefully degrades."*

**A:**
1. **Under Normal Operation (Cache Stampede Protection):**
   - The `@redis_cache` decorator computes the key `doit:v1:tasks:query:<hash>`.
   - All 2,000 requests miss cache.
   - Request #1 acquires distributed mutex lock `lock:...` via `redis.set(..., nx=True, ex=10)`.
   - Requests #2–2000 fail to acquire the lock and enter a sleep-retry loop (`time.sleep(0.5)`).
   - Request #1 executes the single SQL query, populates Redis cache via `SETEX`, and deletes the lock.
   - Requests #2–2000 wake up, double-check cache, hit the populated cache key, and return instantly. Database receives **1 query, not 2,000**.
2. **During Redis Crash (Graceful Degradation):**
   - When Redis crashes, `redis_client.get()` and `.set()` raise `sync_redis.RedisError`.
   - The `@redis_cache` decorator catches `RedisError`, logs a warning (`logger.warning("redis_get_failed")`), and proceeds directly to execute the underlying database query.
   - **PostgreSQL Protection:** Connection pool limits in `db.py` (`pool_size=10`, `max_overflow=10`) throttle concurrent queries to max 20 connections. The remaining requests queue safely in the SQLAlchemy `QueuePool` rather than opening 2,000 connections and crashing PostgreSQL.

---

### Scenario 3: Zero-Downtime Database Schema Migration Under Load
**Q:** *"You have 5 million tasks in production. You need to split the `title` column into `title` and `short_code` (which must be `NOT NULL` and `UNIQUE`), and remove a deprecated `is_archived` boolean column. Walk me through the complete zero-downtime migration lifecycle using Alembic, Docker Compose, and CI/CD without dropping a single user request or locking tables."*

**A:**
**Phase 1: Expand Migration (PR 1)**
1. Alembic Migration:
   - Add `short_code` as `NULLABLE`.
   - Create unique index concurrently: `CREATE UNIQUE INDEX CONCURRENTLY idx_tasks_short_code ON tasks (short_code);`
2. Deploy PR 1: Code writes to both `title` and generates `short_code` on new records; continues reading `is_archived`.

**Phase 2: Backfill Job**
3. Run async background script to backfill `short_code` for historical rows in batches:
   `UPDATE tasks SET short_code = ... WHERE short_code IS NULL LIMIT 5000;`

**Phase 3: Enforce Constraints (PR 2)**
4. Alembic Migration:
   - Add `CHECK (short_code IS NOT NULL) NOT VALID;`
   - Run `VALIDATE CONSTRAINT;`
   - Set `short_code NOT NULL;`

**Phase 4: Contract Migration (PR 3)**
5. Deploy PR 3: Code uses `short_code` and ignores `is_archived`.
6. Final Alembic Migration: `ALTER TABLE tasks DROP COLUMN is_archived;`

---

### Scenario 4: Live Production Incident Triage via Observability Stack
**Q:** *"A customer reports that their team is intermittently receiving `500 Internal Server Error` when uploading attachments to tasks. You open Grafana. Walk me through your exact live debugging workflow using LogQL, Promtail, Structlog correlation IDs, and Sentry to isolate the root cause within 5 minutes."*

**A:**
1. **Query Grafana Loki:**
   Open Grafana Explore and run LogQL query for 500 errors over the last 15 minutes:
   ```logql
   {job="doit-backend"} | json | status_code = 500
   ```
2. **Identify Failing Endpoint & Correlation ID:**
   Locate matching log lines on `POST /api/v1/attachments/upload`. Copy `correlation_id = "f47ac10b..."`.
3. **Trace Complete Request:**
   Filter all logs by that correlation ID:
   ```logql
   {job="doit-backend"} | json | correlation_id = "f47ac10b..."
   ```
4. **Isolate Root Cause:**
   The log event displays:
   `botocore.exceptions.ClientError: An error occurred (ExpiredToken) when calling the PutObject operation.`
5. **Fix & Alert:**
   Diagnose that AWS IAM credentials expired in `.env`. Rotate keys, reload container via `docker compose up -d`, and verify `/health-check/`.

---

### Scenario 5: Asynchronous Concurrency Pitfalls & Event Loop Starvation
**Q:** *"A junior engineer submits a pull request adding an AI summary feature. Inside an `async def get_project_summary(...)` endpoint, they used `requests.post(...)` to call the Groq LLM API, and standard `time.sleep(2)` for retries. What happens to the entire DOit backend under production load when this endpoint is called? How would you guide them to refactor it properly?"*

**A:**
**Production Impact:**
Because the route is declared as `async def`, it runs directly on Uvicorn's single event loop thread. When `requests.post()` and `time.sleep(2)` execute, the entire event loop is completely blocked for 3–5 seconds. All other users attempting to fetch tasks, log in, or load dashboards on that worker process hang.

**Refactoring Guidance:**
Refactor to non-blocking asynchronous libraries using `httpx.AsyncClient` and `asyncio.sleep`:
```python
import httpx
import asyncio

@router.get("/summary")
async def get_project_summary(project_id: uuid.UUID, session: SessionDep):
    async with httpx.AsyncClient(timeout=30.0) as client:
        for attempt in range(3):
            try:
                response = await client.post("https://api.groq.com/...", json=payload)
                return response.json()
            except httpx.HTTPError:
                await asyncio.sleep(2 ** attempt)
```

---

### Scenario 6: Architectural Trade-Off Defense
**Q:** *"Why did you choose a monolithic FastAPI + PostgreSQL + Redis architecture containerized with Docker Compose on a single VPS over a distributed microservices architecture deployed on Kubernetes (EKS/GKE)? Defend this engineering decision in terms of operational complexity, memory footprint, latency, development velocity, and infrastructure cost."*

**A:**
1. **Infrastructure Cost & Memory Footprint:** A single lightweight VPS ($5–$20/mo) with 1GB–2GB RAM cannot run Kubernetes control planes (which require $\ge 2$GB RAM for `k8s` system components alone). Monolithic containerization runs FastAPI, Postgres, Redis, and Loki within $<600$MB RAM.
2. **Operational Simplicity:** Zero distributed network failure modes (no gRPC/service mesh overhead, no distributed transaction consensus). Docker Compose and Traefik provide automatic SSL, automated healthchecks, and single-command deployments.
3. **Low Latency:** In-process domain service calls execute in microseconds with zero network serialization overhead compared to HTTP/gRPC microservice hops.
4. **Development Velocity:** Single repository, unified database migrations with Alembic, unified typing across models/schemas, and fast local development setup.

**When to decompose into microservices:**
When engineering team size exceeds 25+ engineers with independent deployment cycles, or when a specific sub-service (e.g., async AI document ingestion) requires horizontal GPU scaling independent of the main transactional database.
