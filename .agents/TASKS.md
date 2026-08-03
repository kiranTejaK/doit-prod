# DOit — Engineering Master Roadmap & Implementation Tasks (TASKS.md)

This document outlines the master engineering roadmap for the DOit platform modernization, detailing priorities, complexity, and status for all core deliverables.

---

## Deliverables Status Overview

```text
+-----------------------------------------------------------------------------------+
|                         EPIC 1: KNOWLEDGE BASE & ARCHITECTURE                     |
|            [COMPLETED] System Audit, Architecture, PRD, AGENTS, ADRs              |
+-----------------------------------------------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
|                     EPIC 2: FRONTEND DESIGN SYSTEM & REWRITE                      |
|       [COMPLETED] React 19, Tailwind CSS v4, Shadcn UI, TanStack Query v5         |
+-----------------------------------------------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
|                   EPIC 3: WORKFLOW LIST VIEW & ROLE MANAGEMENT                    |
|       [COMPLETED] Grouped Sections, Workspace Owner RBAC, Profile Modal           |
+-----------------------------------------------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
|                 EPIC 4: AUTHENTICATION & SEAMLESS INVITE FLOW                     |
|       [COMPLETED] SessionStorage Token Preservation, Auto-Join Workspace Flow     |
+-----------------------------------------------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
|                   EPIC 5: DOCKER & PRODUCTION HARDENING                           |
|       [COMPLETED] Multi-Stage Builds, Nginx Production Server, Traefik SSL        |
+-----------------------------------------------------------------------------------+
```

---

## Epic 1: Knowledge Base & Architecture Foundation
- **Status:** ✅ **Completed**
- **Deliverables:** `README.md`, `ARCHITECTURE.md`, `PRD.md`, `AGENTS.md`, `DECISIONS.md`, `TASKS.md`.

---

## Epic 2: Frontend Modernization & Design System Rewrite
- **Status:** ✅ **Completed**
- **Deliverables:**
  - Integrated Tailwind CSS v4 and Shadcn UI component primitives (`Button`, `Card`, `Dialog`, `Badge`, `Toast`, `DropdownMenu`).
  - Implemented centralized TanStack Query v5 data fetching layer with dual query key invalidations (`["project", id]` and `["tasks"]`).
  - Added full Dark Mode / Light Mode theme switching support (`useTheme.ts`).

---

## Epic 3: Grouped Workflow Section List View & Workspace Role Management
- **Status:** ✅ **Completed**
- **Deliverables:**
  - **Grouped Workflow List View**: Tasks organized into 4 collapsible section tables (To Do, In Progress, In Review, Completed) with inline status selectors and instant optimistic updates.
  - **Workspace Owner Role Management**: Enforced backend RBAC (`PUT/DELETE /api/v1/workspaces/{id}/members/{user_id}`), enabling Workspace Owners to promote members to Admin, demote Admins to Member, or remove members.
  - **Edit Profile Modal Flow**: Created an Edit Profile modal in `SettingsPage.tsx` with pre-filled fields, validation, and explicit Save/Cancel controls.
  - **Task Due Date Integration**: Added Due Date selection to project task creation forms.

---

## Epic 4: Auth & Seamless UX Invitation Flow Overhaul
- **Status:** ✅ **Completed**
- **Deliverables:**
  - Implemented token preservation in `sessionStorage` for invitation links to automatically join users post-login/signup.

---

## Epic 5: Containerization & Production Deployment
- **Status:** ✅ **Completed**
- **Deliverables:**
  - Configured multi-stage Docker builds for backend and precompiled Nginx frontend.
  - Verified local and production orchestration with Docker Compose.
