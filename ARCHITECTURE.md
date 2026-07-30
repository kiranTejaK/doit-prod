# DOit — System Architecture & Engineering Blueprint

This document defines the high-level system architecture, component boundaries, data flow lifecycle, and technical conventions for the DOit Task Management Platform. It serves as the primary technical specification for current and future development.

---

## 1. Executive Summary & System Context

DOit is an enterprise-ready, containerized Task and Workspace Management Platform. The system utilizes a multi-tenant hierarchy comprising **Workspaces**, **Projects**, **Workflow Sections**, **Tasks**, **Comments**, and **Attachments**.

```text
+-----------------------------------------------------------------------------------+
|                                 CLIENT LAYER                                      |
|                       Modern Web Browser / Mobile Web                             |
+-----------------------------------------------------------------------------------+
                                         |
                                  HTTPS Requests
                                         v
+-----------------------------------------------------------------------------------+
|                           REVERSE PROXY & EDGE LAYER                              |
|                         Traefik Reverse Proxy (TLS / SSL)                         |
+-----------------------------------------------------------------------------------+
                     /                                       \
          dashboard.localhost                               api.localhost
                   /                                           \
                  v                                             v
+------------------------------------+        +-------------------------------------+
|          FRONTEND SERVICE          |        |           BACKEND SERVICE           |
|  React 19 + Vite + TypeScript      |        |  FastAPI (Python 3.12) + Pydantic v2|
|  Tailwind CSS v4 + Shadcn UI       |        |  SQLModel / SQLAlchemy 2.0 ORM      |
|  TanStack Query v5 + React Router  |        |  JWT Authentication                 |
+------------------------------------+        +-------------------------------------+
                                                                 |
                                                     Database Queries & Caching
                                                                 v
                                              +-------------------------------------+
                                              |           DATA STORAGE LAYER        |
                                              |   PostgreSQL 17 (Primary Relational)|
                                              |   Redis 7 (Cache & Session Store)   |
                                              +-------------------------------------+
```

---

## 2. Component Architecture

### 2.1 Frontend Architecture

The frontend is structured as a feature-driven Single Page Application (SPA) designed for responsiveness, performance, and strict type safety.

```text
frontend/src/
├── api.ts                # Central Axios instance with JWT Authorization interceptor
├── components/           # Reusable UI primitives & shared presentation components
│   ├── Common/           # Global layout & shared presentation (NotFound, Navigation, Header)
│   └── ui/               # Shadcn/UI primitive components (Button, Card, Dialog, Badge, Toast, etc.)
├── hooks/                # Custom TanStack Query & Application hooks
│   ├── useAuth.ts        # Authentication state, login, signup, logout
│   ├── useProjects.ts    # Project detail & list query hooks
│   ├── useTasks.ts       # Task queries & mutations (dual key invalidation)
│   ├── useWorkspaces.ts  # Workspace management & member role mutation hooks
│   └── useTheme.ts       # Dark/Light theme mode hook
├── lib/                  # Utilities (clsx, tailwind-merge)
└── pages/                # Top-level view components
    ├── Dashboard.tsx            # Personal dashboard overview
    ├── ProjectDetailPage.tsx    # Grouped Workflow section list view & task drawer
    ├── TasksPage.tsx            # Global "My Tasks" view with search & filters
    ├── WorkspaceDetailPage.tsx  # Workspace details & owner role management
    ├── WorkspacesPage.tsx       # Workspace list & member invite modal
    ├── SettingsPage.tsx         # Profile edit modal, password update, appearance
    ├── AdminPage.tsx            # Platform user management (Superuser only)
    └── AcceptInvite.tsx         # Invitation processing view
```

#### Key Technical Patterns:
- **Server State Management:** Handled entirely by **TanStack Query (React Query v5)**. Automatic caching, background refetching, dual query key invalidation on write mutations (`["project", id]` and `["tasks"]`), and optimistic updates.
- **Client Form & Dialog Controls:** Pre-filled Shadcn `Dialog` modals for profile edits, task creation, workspace creation, and member invitations.
- **Styling:** **Tailwind CSS v4** + **Shadcn UI** primitives for accessible, responsive, dark-mode-ready interface components.

---

### 2.2 Backend Architecture

The backend is built with **FastAPI** (Python 3.12), leveraging asynchronous request processing, strict Pydantic v2 data validation, and SQLModel/SQLAlchemy ORM data models.

```text
backend/app/
├── api/
│   ├── deps.py           # Dependency Injection (SessionDep, CurrentUser, SuperUser)
│   ├── main.py           # API Router aggregation
│   └── routes/           # Domain REST endpoints (auth, users, workspaces, projects, tasks, comments)
├── core/
│   ├── config.py         # Pydantic Settings management (ENV parameters)
│   ├── db.py             # SQLAlchemy Engine & Session Generator
│   ├── redis.py          # Redis client singleton and helper methods
│   └── security.py       # Password hashing (bcrypt) & JWT token creation/verification
├── models.py             # Database Table definitions (SQLModel / SQLAlchemy Declarative)
├── schemas.py            # Pydantic request & response DTO schemas
└── services/             # Business logic layer (auth_policy, task_service, workspace_service)
```

#### Key Technical Patterns:
- **Dependency Injection:** FastAPI `Depends` for Database sessions (`SessionDep`), User authentication (`CurrentUser`), and Authorization checks.
- **Data Validation:** Strict separation between DB Entities (`models.py`) and API Data Transfer Objects (`schemas.py`).
- **Database ORM:** PostgreSQL 17 accessed via SQLAlchemy 2.0 / SQLModel with UUID primary keys and explicit foreign key cascades.
- **Role Authorization:** Granular policy checks enforcing Workspace Owner privileges for role updates/removals and Project Membership for task access.

---

## 3. Data Flow & Authorization Lifecycle

### 3.1 Authentication Strategy
1. **User Login:** Client sends POST request to `/api/v1/login/access-token` with credentials.
2. **JWT Issuance:** Backend returns an encrypted JWT `access_token` containing user identifier (`sub`) and expiration time.
3. **Client Storage:** Token stored in `localStorage`.
4. **API Requests:** Central Axios interceptor attaches `Authorization: Bearer <token>` to all HTTP requests.
5. **Unauthorized Handlers:** On 401/403 responses, client interceptor redirects to `/login`.

### 3.2 Workspace & Project Authorization Hierarchy
- **Workspace Level**: Users can only retrieve workspaces they belong to or own. Superusers have elevated administrative access.
- **Workspace Roles**: Workspace Owners can promote members to Admin, demote Admins to Member, or remove members (`PUT/DELETE /api/v1/workspaces/{id}/members/{user_id}`). Admins and Members are restricted from modifying workspace roles.
- **Project Access**: Non-project members requesting project details or tasks receive HTTP 403 Forbidden.

---

## 4. Deployment & Containerization

The system is fully containerized using multi-stage Docker builds:
- **Frontend Container:** Multi-stage build (Node.js build stage -> Nginx Alpine serving static production assets).
- **Backend Container:** FastAPI Python container executing UV dependency management & Uvicorn ASGI server.
- **Reverse Proxy:** Traefik listening on ports 80/443 with automatic TLS certificate generation.
- **CI/CD Pipeline:** GitHub Actions workflow (`deploy-remote.yml`) performing automated linting, testing, Docker image creation, and SSH deployment.
