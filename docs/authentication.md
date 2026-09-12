# Authentication Architecture & Secure Refresh Token Rotation

This document details the production-ready authentication and authorization architecture implemented in the **DOit** platform, featuring short-lived access tokens, cryptographically hashed refresh tokens, secure rotation on every use, replay/reuse detection with session family invalidation, and dual cookie/header transport support.

---

## 1. Authentication Lifecycle Overview

```
                 ┌─────────────────┐
                 │      LOGIN      │
                 └────────┬────────┘
                          │ (User credentials validated)
                          ▼
            Issue Access Token + Refresh Token (RT1)
            [RT1 SHA-256 hash stored; raw token sent to client]
                          │
                          ▼
               Access Token expires (15m)
                          │
                          ▼
                 POST /api/v1/login/refresh-token
                          │
                  ┌───────┴────────┐
                  │ Validate RT1   │
                  └───────┬────────┘
                          │
          ┌───────────────┴───────────────┐
          │ (Valid & Unused)              │ (Already Used / Revoked)
          ▼                               ▼
    Mark RT1 used_at = NOW()       REUSE / THEFT DETECTED!
    Generate RT2 + hash            Revoke entire family (RT1, RT2...)
    Link RT1.replaced_by = RT2     Return 401 Unauthorized
    Return Access Token + RT2      Client redirected to login
          │
          ▼
   Next refresh uses RT2
```

---

## 2. Core Security Guarantees

### 2.1 Cryptographic Token Hashing (SHA-256)
- **Problem**: Storing raw refresh tokens in the database exposes long-lived credentials in the event of database leaks or snapshot exposure.
- **Solution**: The backend generates high-entropy, 512-bit opaque strings using `secrets.token_urlsafe(64)` and stores **only** their one-way SHA-256 hash (`token_hash`) in the `refreshtoken` table. Raw tokens are never logged or persisted.

### 2.2 Strict Single-Use Token Rotation
- Every successful call to `POST /api/v1/login/refresh-token` (or `/api/v1/auth/refresh`) rotates the credential.
- The presented token is marked with `used_at = NOW()` and cannot be used again.
- A new access token and a replacement refresh token are issued and returned to the client.

### 2.3 Token Reuse / Replay Detection & Family Invalidation
- **Problem**: If a malicious actor steals a refresh token that the legitimate client later rotates, or if an attacker attempts to replay an older token, unauthorized access could occur.
- **Solution**: Tokens belong to a `family_id` (a unique UUID representing a login session chain). If the server receives a refresh request for a token that is already marked as `used_at != NULL` or `revoked_at != NULL`:
  1. The server flags this immediately as a replay/theft event.
  2. All tokens sharing that `family_id` are revoked (`revoked_at = NOW()`).
  3. The request is rejected with `401 Unauthorized`.
  4. Both the attacker and the legitimate client must re-authenticate, stopping the token chain immediately.

### 2.4 Race Condition & Concurrency Protection
- Concurrent refresh requests for the same token are serialized using database row-level locking (`with_for_update()`) and transactional checks.
- Exactly one request will successfully rotate the token; any racing request will observe `used_at != NULL` and fail without issuing duplicate tokens.

### 2.5 Transport Security (Dual Mode: Cookie + JSON Body)
- **HttpOnly Cookies**: On login and refresh, the server sets a `Secure` (in production), `HttpOnly`, `SameSite=Lax` cookie named `refresh_token`. This protects against XSS credential theft in web browsers.
- **JSON Body Support**: The server also returns `refresh_token` in the JSON response body and accepts it in request payloads for compatibility with mobile apps, API clients, and automated testing tools.
- Axios (`frontend/src/api.ts`) is configured with `withCredentials: true`.

---

## 3. Database Schema

The `refreshtoken` table includes:

| Column | Type | Constraints & Indexes | Description |
| :--- | :--- | :--- | :--- |
| `id` | UUID | Primary Key | Unique token record ID |
| `user_id` | UUID | Foreign Key (`user.id` CASCADE), Index | User who owns the session |
| `token_hash` | VARCHAR(64) | Unique, Index | SHA-256 hash of the raw token |
| `family_id` | VARCHAR | Index | UUID grouping the rotation chain |
| `issued_at` | TIMESTAMP | Default NOW() | Timestamp when token was created |
| `expires_at` | TIMESTAMP | Index | Absolute token expiration time |
| `used_at` | TIMESTAMP | Nullable | Timestamp when token was rotated |
| `revoked_at` | TIMESTAMP | Nullable | Timestamp when revoked/invalidated |
| `is_revoked` | BOOLEAN | Default FALSE | Legacy boolean flag |
| `replaced_by` | UUID | Foreign Key (`refreshtoken.id` SET NULL), Nullable | Points to the next token in the chain |
| `created_at` | TIMESTAMP | Default NOW() | Record creation timestamp |
| `updated_at` | TIMESTAMP | Nullable | Record update timestamp |
| `token` | VARCHAR | Nullable | Legacy unhashed column (nullable) |

---

## 4. API Reference

### 4.1 Login / Obtain Tokens
- **Endpoint**: `POST /api/v1/login/access-token`
- **Content-Type**: `application/x-www-form-urlencoded`
- **Request Body**:
  ```ini
  username=user@example.com
  password=SecurePassword123
  ```
- **Response** (`200 OK`):
  ```json
  {
    "access_token": "eyJhbGciOi...",
    "refresh_token": "dGhpc19pc19hX3JhbmRvbV9yZWZyZXNoX3Rva2Vu...",
    "token_type": "bearer",
    "expires_in": 900
  }
  ```
- **Set-Cookie Header**:
  ```http
  Set-Cookie: refresh_token=...; Path=/; HttpOnly; SameSite=Lax
  ```

### 4.2 Refresh Tokens (Rotation)
- **Endpoints**: `POST /api/v1/login/refresh-token` or `POST /api/v1/auth/refresh`
- **Request Body** (optional if cookie is present):
  ```json
  {
    "refresh_token": "dGhpc19pc19hX3JhbmRvbV9yZWZyZXNoX3Rva2Vu..."
  }
  ```
- **Response** (`200 OK`):
  ```json
  {
    "access_token": "eyJhbGciOi...",
    "refresh_token": "bmV3X3JhbmRvbV9yZWZyZXNoX3Rva2Vu...",
    "token_type": "bearer",
    "expires_in": 900
  }
  ```
- **Error Responses**:
  - `401 Unauthorized` (`"Invalid refresh token"` / `"Refresh token missing"` / `"Refresh token has expired"` / `"Refresh token already used. Possible token theft detected..."`)

### 4.3 Logout (Current Session)
- **Endpoints**: `POST /api/v1/login/logout` or `POST /api/v1/auth/logout`
- **Request Body**:
  ```json
  {
    "refresh_token": "current_refresh_token_string"
  }
  ```
- **Response** (`200 OK`):
  ```json
  {
    "message": "Logged out successfully"
  }
  ```
- **Set-Cookie Header**: Clears `refresh_token` cookie (`Max-Age=0`).

### 4.4 Logout All Sessions
- **Endpoint**: `POST /api/v1/auth/logout-all`
- **Headers**: `Authorization: Bearer <access_token>`
- **Response** (`200 OK`):
  ```json
  {
    "message": "All sessions logged out successfully"
  }
  ```

---

## 5. Frontend Interceptor & State Architecture

### 5.1 Single-Flight Request Queue (`frontend/src/api.ts`)
When an access token expires:
1. The first failing request triggers `isRefreshing = true`.
2. Concurrent outgoing requests that also receive `401` are added to `failedQueue`.
3. Exactly one refresh request is dispatched to `/api/v1/login/refresh-token`.
4. When refresh succeeds:
   - New access token is set in `localStorage` and default axios headers.
   - All queued requests are resolved and automatically retried with the new token.
5. If refresh fails:
   - All queued requests are rejected.
   - Tokens are purged from storage.
   - User is redirected to `/login` without infinite loops.

### 5.2 React Auth Hook (`frontend/src/hooks/useAuth.ts`)
- Leverages **TanStack Query v5** (`useQuery`, `useMutation`).
- Strictly typed without `any`.
- Invalidation of `["currentUser"]` cache on login and logout.

---

## 6. Testing & CI/CD Verification

### Running Backend Tests
```bash
cd backend
uv run pytest tests/
```
Includes:
- Unit tests: `tests/unit/app/test_token_service.py`
- Integration tests: `tests/integration/api/test_login.py` (concurrency, reuse detection, cookie delivery, logout-all).

### Running Alembic Migrations
```bash
cd backend
uv run alembic heads
uv run alembic upgrade head
```

### Running Frontend Checks
```bash
cd frontend
npm run lint
npm run build
```
