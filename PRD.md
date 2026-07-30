# DOit — Product Requirements Document (PRD)

## 1. Product Vision & Goals

### 1.1 Vision Statement
DOit is an intuitive, fast, and scalable task and workspace management platform designed for software engineering teams, product managers, and organizations to organize projects, execute workflows, and collaborate effortlessly.

### 1.2 Core Objectives
- **Clarity & Execution:** Provide teams with clear visibility into project progress, task ownership, and upcoming deadlines through a unified single-page layout.
- **Zero Friction:** Eliminate multi-step navigation traps and unnecessary friction in common actions (invitations, profile editing, task creation, status updates).
- **Performance Excellence:** Deliver near-instant SPA page transitions (<100ms) and UI response times.
- **Enterprise-Grade Security & Isolation:** Ensure multi-tenancy with workspace and project-level role permissions.

---

## 2. User Roles & Role-Based Access Control (RBAC)

### 2.1 Workspace Roles & Permissions

| Role | Administrative Rights | Member Management Rights | Task & Project Rights |
| :--- | :--- | :--- | :--- |
| **Workspace Owner** | Full workspace administration, delete workspace, update name/description | Promote Member to Admin, Demote Admin to Member, Remove Members | Full project and task access |
| **Workspace Admin** | Workspace configuration | View members list, invite new members | Full project and task access |
| **Workspace Member** | View workspace projects and members | View members list | Access assigned projects and tasks |

### 2.2 Project Authorization Policy
- **Project Members Only**: Non-project members are blocked with an explicit **HTTP 403 Forbidden Access Denied** view.

---

## 3. Core Functional Requirements

### 3.1 Authentication & User Lifecycle
- **Sign Up & Registration:** Support user registration with email, full name, and password.
- **JWT Login:** Secure login yielding JWT bearer tokens stored in `localStorage`.
- **Profile Edit Modal:** Edit user details (`Full Name`, `Job Title`, `Email`) inside Settings via a pre-filled dialog with explicit Save and Cancel controls.

### 3.2 Workspace & Multi-Tenancy Management
- **Workspaces:** Top-level organizational container.
- **Member Role Management**: Dedicated Actions menu for Workspace Owners to manage member roles and removals.
- **Member Invitations:** Send invitation emails with unique tokens.

### 3.3 Project & Grouped Workflow Tasks
- **Projects:** Logical workspace containers for tracking software initiatives.
- **Grouped Workflow Sections:** Single-row high-density task tables organized into 4 workflow sections:
  1. **To Do**
  2. **In Progress**
  3. **In Review**
  4. **Completed**
- **Collapsible Headers**: Section headers with status badge, title, task count indicator, and collapse/expand toggles.
- **Mandatory Assignee & Due Date**: Task creation mandates assignee selection from project members and supports Due Date selection.
- **Task Detail Drawer**: Sliding drawer for viewing task details, posting comments, and viewing comments history.

---

## 4. Non-Functional Requirements (NFRs)

- **Performance:** Initial page load < 1.0s; subsequent client SPA transitions < 100ms; API response time < 50ms (p95).
- **Availability & Uptime:** 99.9% target uptime backed by healthchecks and container auto-restart policies.
- **Security:** Strict JWT token validation, CORS protection, SQL injection prevention via SQLAlchemy parameterized queries, and bcrypt password hashing.
