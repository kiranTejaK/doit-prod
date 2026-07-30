# DOit — Production Task Management Platform

DOit is a modern, enterprise-grade Task Management Platform engineered to help software teams, product managers, and organizations organize workspaces, projects, tasks, and team collaboration.

Built with high performance, strict type safety, and clean architecture in mind, DOit combines a responsive React frontend with a scalable FastAPI backend and fully containerized infrastructure.

---

## Key Features

### 🏢 Workspaces & Organization
- **Multi-Tenant Workspaces**: Organize projects, tasks, and collaborators within dedicated workspace environments.
- **Role-Based Access Control (RBAC)**: Enforce granular Workspace roles (`Owner`, `Admin`, `Member`). Only Workspace Owners can promote/demote member roles or manage membership.

### 📁 Project Management
- **Project Isolation**: Create projects tied to specific workspaces with custom metadata.
- **Access Restrictions**: Enforce project-level authorization (HTTP 403 Forbidden for non-project-members).

### 📋 Grouped Workflow Task Management
- **Workflow Sectioning**: Organize tasks into visually distinct workflow sections:
  - 🟡 **To Do**
  - 🔵 **In Progress**
  - 🟠 **In Review**
  - 🟢 **Completed**
- **Single-Row High-Density Tables**: Compact, scan-friendly tables displaying Task Name, Status, Priority, Assignee (Avatar + Name), Due Date, and Action menus.
- **Real-Time Section Transitioning**: Transition tasks between workflow stages instantly with optimistic UI updates and backend synchronization.
- **Mandatory Assignee Selection**: Ensure all created tasks are assigned to active project members.
- **Due Date & Filtering**: Live title/description search, priority filters, and column header sorting.

### 💬 Discussion & Collaboration
- **Task Detail Drawer**: View full task details and nested comments without losing context.
- **Real-Time Comments**: Post and track task discussions.

### 👤 User Settings & Profile Management
- **Profile Edit Modal**: Edit user details (`Full Name`, `Job Title`, `Email`) with pre-filled fields, validation, and explicit Save/Cancel handlers.
- **Appearance & Security**: Toggle dark/light themes and update passwords securely.

---

## Technology Stack

### 🚀 Frontend
- **Core Framework**: [React 19](https://react.dev) + [TypeScript](https://www.typescriptlang.org/)
- **Build Tool**: [Vite](https://vitejs.dev/)
- **Styling & Components**: [Tailwind CSS v4](https://tailwindcss.com/) + [Shadcn UI](https://ui.shadcn.com/) + [Lucide Icons](https://lucide.dev/)
- **Data Fetching & State**: [TanStack Query v5](https://tanstack.com/query/v5) (React Query)
- **Routing**: [React Router v7](https://reactrouter.com/)
- **HTTP Client**: Centralized [Axios](https://axios-http.com/) wrapper

### ⚡ Backend
- **Framework**: [FastAPI](https://fastapi.tiangolo.com/) (Python 3.12)
- **ORM & Data Layer**: [SQLAlchemy 2.0](https://www.sqlalchemy.org/) / [SQLModel](https://sqlmodel.tiangolo.com/)
- **Validation**: [Pydantic v2](https://docs.pydantic.dev/)
- **Database**: [PostgreSQL 17](https://www.postgresql.org/)
- **Caching & Sessions**: [Redis](https://redis.io/)
- **Package Manager**: [uv](https://github.com/astral-sh/uv)

### 🐋 Infrastructure & Operations
- **Containerization**: Docker & Docker Compose
- **Production Server**: Nginx (serving static precompiled Vite bundle for frontend)
- **Reverse Proxy**: Traefik (handles automatic SSL/TLS via Let's Encrypt)
- **CI/CD**: GitHub Actions (linting, type checking, test execution, remote deployment)

---

## Project Structure

```text
doit-prod/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── deps.py             # Dependency injection (SessionDep, CurrentUser)
│   │   │   └── routes/             # FastAPI Endpoint Routers (workspaces, projects, tasks, comments, users)
│   │   ├── models.py               # SQLAlchemy / SQLModel database entities
│   │   ├── schemas.py              # Pydantic v2 Request/Response validation schemas
│   │   └── services/               # Business logic services (auth, tasks, workspaces, permissions)
│   ├── Dockerfile
│   └── pyproject.toml
├── frontend/
│   ├── src/
│   │   ├── api.ts                  # Central Axios instance with authorization interceptor
│   │   ├── components/
│   │   │   ├── ui/                 # Reusable Shadcn UI primitives (Button, Card, Dialog, Badge, etc.)
│   │   │   └── Common/             # Global layout & shared presentation components
│   │   ├── hooks/                  # Custom TanStack Query mutation & query hooks
│   │   └── pages/                  # Top-level view components (ProjectDetailPage, TasksPage, WorkspacesPage, SettingsPage)
│   ├── Dockerfile
│   ├── package.json
│   └── vite.config.ts
├── docker-compose.yml              # Local & development orchestration
├── README.md
├── ARCHITECTURE.md
├── PRD.md
├── AGENTS.md
├── DECISIONS.md
└── TASKS.md
```

---

## Getting Started

### Prerequisites
- [Docker](https://www.docker.com/) and Docker Compose installed.
- Node.js 22+ (for local host development).
- Python 3.12+ (for local backend development).

### Running with Docker Compose (Recommended)

1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-org/doit-prod.git
   cd doit-prod
   ```

2. **Start the environment**:
   ```bash
   docker compose up -d --build
   ```

3. **Access Services**:
   - **Frontend Application**: `http://localhost:5173` (or `http://dashboard.localhost`)
   - **Backend REST API Docs**: `http://localhost:8000/docs`
   - **Adminer Database Manager**: `http://localhost:8080`
   - **Mailcatcher**: `http://localhost:1080`

### Running Locally (Without Docker)

#### Backend Setup
```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install uv
uv sync
fastapi dev app/main.py
```

#### Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

---

## Production Deployment

DOit is pre-configured for automated continuous deployment using GitHub Actions (`.github/workflows/deploy-remote.yml`). 

Pushing to `main` executes:
1. Backend unit tests & Pydantic schema validation.
2. Frontend TypeScript type checking (`tsc`) & Vite bundle build.
3. Multi-stage Docker image compilation.
4. Production container deployment with zero downtime via Docker Compose and Traefik.

---

## License

This project is licensed under the MIT License.
