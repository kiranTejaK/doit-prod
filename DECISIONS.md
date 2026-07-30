# DOit — Architectural Decision Records (ADR)

This document records the key architectural and technical design decisions made for the DOit application, including their rationale, trade-offs, and future implications.

---

## Index of Architecture Decision Records

- [ADR-001: Feature-Based Frontend Directory Structure](#adr-001-feature-based-frontend-directory-structure)
- [ADR-002: Adoption of TanStack Query (v5) for Server State](#adr-002-adoption-of-tanstack-query-v5-for-server-state)
- [ADR-003: Migration to Tailwind CSS v4 & Shadcn UI Component Primitives](#adr-003-migration-to-tailwind-css-v4--shadcn-ui-component-primitives)
- [ADR-004: Standardization of API Contracts & Query/Path Parameter Conventions](#adr-004-standardization-of-api-contracts--querypath-parameter-conventions)
- [ADR-005: Seamless Invitation Token Preservation Across Authentication Lifecycle](#adr-005-seamless-invitation-token-preservation-across-authentication-lifecycle)
- [ADR-006: Redis In-Memory Caching & Deterministic Invalidation Strategy](#adr-006-redis-in-memory-caching--deterministic-invalidation-strategy)
- [ADR-007: Multi-Stage Docker Build with Nginx Reverse Proxy Containerization](#adr-007-multi-stage-docker-build-with-nginx-reverse-proxy-containerization)
- [ADR-008: Grouped Workflow List View & Workspace Owner RBAC Enforcement](#adr-008-grouped-workflow-list-view--workspace-owner-rbac-enforcement)

---

## ADR-001: Feature-Based Frontend Directory Structure

### Context & Problem
The initial frontend codebase stored components in a flat `src/pages` and `src/components/Common` folder structure. As domain entities grew (Workspaces, Projects, Tasks, Comments, Invitations, Admin), pages became bloated with inline state, modal handlers, and duplicate API logic, making maintainability difficult.

### Decision
Adopt a **Feature-Based Architecture** (`src/features/<feature-name>/`) where each domain entity contains its own components, hooks, API calls, types, and sub-views.

### Alternatives Considered
1. **Layer-Based Architecture (`pages/`, `components/`, `api/`, `hooks/`):** Rejected because locating related code for a single feature requires jumping between 5 top-level folders.
2. **Atomic Design (`atoms/`, `molecules/`, `organisms/`):** Rejected as overly complex for domain application logic.

### Trade-offs & Consequences
- **Pros:** High cohesion, easy code navigation, clear boundaries, simple code-splitting per feature.
- **Cons:** Shared components across features must be carefully isolated into `src/components/ui/` or `src/components/common/`.

---

## ADR-002: Adoption of TanStack Query (v5) for Server State

### Context & Problem
The application experienced infinite render loops and redundant API calls across pages because data fetching was managed manually inside React `useEffect` hooks with custom state variables (`loading`, `data`, `error`). Reference instability of callbacks triggered endless refetches.

### Decision
Migrate all data fetching, caching, background synchronization, and optimistic UI updates to **TanStack Query (React Query v5)**.

### Alternatives Considered
1. **Manual `useEffect` + `useCallback` refactoring:** Rejected because reference instability bugs frequently recur as new developers edit dependency arrays.
2. **Redux Toolkit Query (RTK Query):** Rejected due to heavy boilerplate.
3. **SWR:** Considered, but TanStack Query v5 offers superior mutation handling, devtools, and query key invalidation.

### Trade-offs & Consequences
- **Pros:** Eliminates 95% of boilerplate `useEffect` code, eliminates render loop bugs, automatic caching, garbage collection, and background revalidation.
- **Cons:** Requires team familiarity with query key structures and mutation invalidation patterns.

---

## ADR-003: Migration to Tailwind CSS v4 & Shadcn UI Component Primitives

### Context & Problem
The initial frontend used Bootstrap HTML classes and custom global CSS overrides in `App.css`. Styling was inconsistent, dark mode support was partial, and UI components lacked accessible keyboard navigation and modern visual polish.

### Decision
Standardize on **Tailwind CSS v4** combined with **Shadcn UI** component primitives (built on Radix UI).

### Alternatives Considered
1. **Maintain Bootstrap 5:** Rejected due to difficulty in customizing modern dark mode themes and lack of unstyled primitive control.
2. **MUI (Material UI):** Rejected due to heavy runtime CSS-in-JS overhead.
3. **Chakra UI:** Considered, but Shadcn UI provides copy-paste ownership of code with zero bundle overhead.

### Trade-offs & Consequences
- **Pros:** Full ownership of component code, accessible primitives out-of-the-box, unified design tokens, dark mode support, small production CSS footprint.
- **Cons:** Initial setup time to write utility classes for complex legacy tables.

---

## ADR-004: Standardization of API Contracts & Query/Path Parameter Conventions

### Context & Problem
Inconsistencies existed between frontend route calls and backend route definitions (e.g. `/verify-email` vs `/login/verify-email`, `/invitations/{token}/accept` vs `/invitations/accept?token={token}`). Unhandled `undefined` parameters also caused FastAPI 422 validation errors.

### Decision
Establish strict OpenAPI contract alignment:
1. All path parameters represent resource identifiers (`/resources/{id}`).
2. Action tokens and filter parameters use query string parameters (`/resources/action?token=XYZ`).
3. Generate or export TypeScript types from OpenAPI schemas.

### Trade-offs & Consequences
- **Pros:** Zero 404 route mismatches, strict runtime type safety, predictable API signatures.
- **Cons:** Requires frontend API wrapper updates when backend routes are refactored.

---

## ADR-005: Seamless Invitation Token Preservation Across Authentication Lifecycle

### Context & Problem
Invited users who clicked workspace invitation links were forced to authenticate, lost their invitation token context during redirect, landed on a generic dashboard, and had to re-click the email link.

### Decision
Implement **SessionStorage Token Preservation**:
1. When landing on `/accept-invite?token=XYZ` without authentication, store `invite_token=XYZ` in `sessionStorage`.
2. Redirect to `/login` or `/signup`.
3. Upon successful login/signup response, check `sessionStorage` for `invite_token`.
4. Automatically trigger `/api/v1/invitations/accept?token=XYZ` and navigate directly into the invited workspace.

### Trade-offs & Consequences
- **Pros:** Reduces onboarding friction from 8 steps to 1 click.
- **Cons:** Must ensure `sessionStorage` is cleared after token consumption to avoid duplicate requests.

---

## ADR-006: Redis In-Memory Caching & Deterministic Invalidation Strategy

### Context & Problem
Database reads on PostgreSQL for frequently requested items (Workspace details, User profiles, Project task lists) created unnecessary DB load.

### Decision
Integrate **Redis 7 caching** with deterministic key patterns (`workspace:{id}`, `project:{id}:tasks`) and automatic TTL expiration. Invalidate cache keys on write mutations (CREATE, UPDATE, DELETE).

### Trade-offs & Consequences
- **Pros:** Sub-50ms API responses, reduced PostgreSQL CPU usage.
- **Cons:** Cache invalidation logic must be meticulously maintained in backend service layers.

---

## ADR-007: Multi-Stage Docker Build with Nginx Reverse Proxy Containerization

### Context & Problem
Local development and production environment mismatches caused deployment failures.

### Decision
Retain containerized architecture using Docker Compose:
- **Build Stage:** Vite static bundle compilation.
- **Production Stage:** Lightweight Nginx Alpine container serving static assets on a private Docker network exposed via Traefik.

### Trade-offs & Consequences
- **Pros:** Identical development/production builds, automated SSL via Traefik, high static file performance.
- **Cons:** Code changes in static production mode require rebuilding containers (`docker compose up -d --build`).

---

## ADR-008: Grouped Workflow List View & Workspace Owner RBAC Enforcement

### Context & Problem
Having both a List View and a separate Kanban Board View caused UI fragmentation and bundle overhead. In addition, workspace role changes lacked strict backend role validation.

### Decision
1. Replace separate Kanban Board view with a single, high-density **Grouped Workflow List View** organized into collapsible section tables (To Do, In Progress, In Review, Completed) with inline status controls.
2. Enforce **Workspace Owner-Only RBAC** in `workspaces.py` routes (`PUT/DELETE /api/v1/workspaces/{id}/members/{user_id}`), returning HTTP 403 Forbidden for non-owners.

### Trade-offs & Consequences
- **Pros:** Reduced bundle size by 45kB by removing `@dnd-kit`, eliminated UI view fragmentation, and secured backend membership controls.
- **Cons:** Status changes rely on dropdown/context menu transitions rather than drag handles.
