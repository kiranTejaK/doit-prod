# AGENTS.md — AI Coding Operating Manual & Repository Standards

This document is the authoritative operating manual for all AI coding agents working in the `doit-prod` repository. All future implementations, refactorings, and feature additions MUST strictly adhere to these rules and conventions.

---

## 1. Core Architecture Invariants

1. **Strict Separation of Concerns:**
   - Business logic belongs in backend services (`backend/app/services/`) or frontend custom hooks (`frontend/src/hooks/` or `frontend/src/features/*/hooks/`).
   - Components MUST remain focused on presentation and UI interaction.

2. **Data Fetching Rule:**
   - **NEVER** use raw `useEffect` with `fetch` or `axios` for fetching data in React components.
   - **ALWAYS** use **TanStack Query (React Query v5)** hooks (`useQuery`, `useMutation`).
   - Mutations MUST explicitly invalidate relevant query keys upon success.

3. **Type Safety Standard:**
   - TypeScript `any` is **STRICTLY FORBIDDEN**.
   - Define explicit types or interfaces for all props, API responses, state objects, and backend Pydantic schemas.

4. **Containerized Build Consciousness:**
   - The production frontend is served via a **pre-compiled Nginx container**. Changes to frontend source code will NOT reflect in running Docker containers without running `docker compose down; docker compose up -d --build`.

---

## 2. Code Conventions & Standards

### 2.1 React & TypeScript Standards
- Use functional components with arrow functions or named function declarations.
- Explicitly define component Prop interfaces (e.g. `interface ButtonProps { ... }`).
- Export components as named exports or default exports consistently per feature module.
- Keep components under 200 lines. Break large UI blocks into smaller subcomponents.

```tsx
// ✅ PREFERRED PATTERN
interface TaskCardProps {
  task: Task;
  onSelect: (id: string) => void;
}

export const TaskCard: React.FC<TaskCardProps> = ({ task, onSelect }) => {
  return (
    <div onClick={() => onSelect(task.id)} className="p-4 border rounded-lg hover:shadow-md transition">
      <h4 className="font-semibold text-gray-900 dark:text-gray-100">{task.title}</h4>
    </div>
  );
};
```

### 2.2 Styling Standards (Tailwind CSS + Shadcn UI)
- Use **Tailwind CSS v4** utility classes for layout, spacing, colors, and typography.
- Use `cn()` helper from `@/lib/utils` (combining `clsx` and `tailwind-merge`) when conditionally joining class names.
- Support **Dark Mode** out of the box using Tailwind's `dark:` variant.

### 2.3 Backend Python & FastAPI Standards
- Use Python 3.12 type annotations throughout (`str | None` instead of `Optional[str]`).
- Use Pydantic v2 schemas for request and response validation (`ConfigDict(from_attributes=True)`).
- Inject database sessions using `session: SessionDep` and current user via `current_user: CurrentUser`.
- Use SQLAlchemy 2.0 / SQLModel mapping syntax for models (`Mapped[str] = mapped_column(...)`).

```python
# ✅ PREFERRED BACKEND ROUTE PATTERN
@router.get("/{task_id}", response_model=TaskPublic)
def get_task(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    task_id: uuid.UUID,
) -> TaskPublic:
    task = task_service.get_task_by_id(session=session, user_id=current_user.id, task_id=task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task
```

---

## 3. Mandatory AI Rules ("Always Do" vs "Never Do")

### ✅ ALWAYS DO:
1. **Always verify API contracts** before creating frontend queries (check matching parameter types: path vs. query vs. body).
2. **Always handle loading and error states** explicitly in UI components.
3. **Always invalidate query keys** in TanStack Query mutations so UI updates instantly without manual page refreshes.
4. **Always clean up event listeners** or async subscriptions in custom hooks.
5. **Always write clean, self-documenting code** with descriptive variable names.

### ❌ NEVER DO:
1. **NEVER** write raw `useEffect` data fetches that re-trigger on render loops.
2. **NEVER** swallow exceptions silently in try/catch blocks without logging or notifying the user.
3. **NEVER** hardcode local API URLs (e.g. `http://localhost:8000`) inside components — use `import.meta.env.VITE_API_URL` or central `api.ts`.
4. **NEVER** commit secrets, raw passwords, or private keys to source code files.
5. **NEVER** modify backend ORM models without generating an Alembic migration script if database tables are affected.

---

## 4. Known Pitfalls & Gotchas

1. **FastAPI Query vs Path Parameter Mismatches:**
   - If a FastAPI endpoint signature is `def accept_invitation(..., token: str)`, FastAPI expects `token` as a query param (`?token=XYZ`). If the route is `@router.post("/accept/{token}")`, it expects a path param. Always check `routes/*.py` before building Axios requests.

2. **UUID String vs UUID Object Inconsistencies:**
   - Frontend sending string `"undefined"` or empty string `""` to UUID query params will cause FastAPI `422 Unprocessable Entity`. Always guard API calls against uninitialized `user?.id` or `workspaceId`.

3. **Docker Nginx Caching:**
   - Vite Hot Module Replacement (HMR) only works if running `npm run dev` directly on host. When testing in Docker Compose, always rebuild images after source changes (`docker compose up -d --build`).

---

## 5. Future Architectural Improvements (Deferred)

The following improvements are planned for the future to reach "perfect" production readiness. **They are currently explicitly deferred to avoid overloading the lightweight (1GB RAM) VPS.** Do NOT implement these without explicit user permission.

1. **Error Tracking (Sentry):**
   - **What:** Add `sentry-sdk` for automatic unhandled exception and crash reporting.
   - **Why:** To pinpoint the exact Python line and variable state when 500 errors occur, without digging through logs.

2. **Automated DB Backups:**
   - **What:** Create a cron job (or Docker container) running `pg_dump`.
   - **Why:** To take nightly snapshots of the PostgreSQL database and safely upload them to AWS S3.

3. **Hardware Metrics (Prometheus + Node Exporter):**
   - **What:** Run Prometheus and Node Exporter alongside Loki in the observability stack.
   - **Why:** To visualize exact VPS CPU, Memory, and Disk usage directly inside Grafana dashboards.
