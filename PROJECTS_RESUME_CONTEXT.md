# Multi-Project Master Technical Guide & Resume Context

This document serves as the single source of truth for five software projects (**DOit**, **TrackIT**, **KnowIT**, **Orbit / Productivity Hub**, and **Personal Portfolio**). It provides comprehensive technical breakdowns, system architecture highlights, tech stacks, behavioral interview talking points, and copy-paste resume bullet points optimized for Software Engineering, Full-Stack, Backend, and AI Platform roles.

---

## 📊 1. Multi-Project Technical Comparison Matrix

| Dimension | DOit (`doit-prod`) | TrackIT (`trackIT`) | KnowIT (`knowIT`) | Orbit / Productivity Hub (`resource-hub`) | Personal Portfolio (`portfolio`) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Domain** | Enterprise Task & Workspace Management | Smart Financial Ledger & Budgeting | RAG Document AI & Knowledge Base | Daily Planning, Career & Resource Suite | Developer Showcase & System Design |
| **Architecture** | Microservices-Ready Client-Server | Monolithic Async Ledger API | Async RAG Pipeline + SaaS Backend | Next.js App Router Full-Stack | Zero-JS Island SSG |
| **Frontend Framework** | React 19 + TypeScript (Vite) | React 19 + TypeScript (Vite) | React 19 + TypeScript (Vite) | Next.js 16 (App Router) + React 19 | Astro SSG |
| **Backend Framework** | FastAPI (Python 3.12) | FastAPI (Python 3.12) | FastAPI (Python 3.12, Async) | Next.js Server Actions / API Routes | N/A (Static Generation) |
| **Primary Database** | PostgreSQL 17 | PostgreSQL 17 | PostgreSQL 17 + PGVector Extension | PostgreSQL | N/A |
| **ORM / Data Layer** | SQLAlchemy 2.0 / SQLModel | SQLAlchemy 2.0 | Async SQLAlchemy + Alembic | Prisma ORM | Static Files / Astro Assets |
| **Caching & Messaging** | Redis | Redis | Redis / Async S3 Pipeline | In-Memory / Next.js Server Cache | Browser / CDN Static Edge |
| **AI / Machine Learning** | N/A | Heuristic Anomaly Rules | Groq LLM (`llama-3.3-70b`), Embeddings | N/A | N/A |
| **Styling & UI** | Tailwind CSS v4 + Shadcn UI | Custom Vanilla CSS (Dark Theme) | Tailwind CSS v4 + Shadcn UI | Tailwind CSS v4 + Glassmorphism | Pure Vanilla CSS |
| **State & Data Fetching**| TanStack Query v5 + Axios | Axios + Custom Hooks | TanStack Query v5 + React Hook Form | Server Components + Radix UI | Vanilla JS (Intersection Observer) |
| **Authentication** | OAuth2 / JWT + Workspace RBAC | JWT + Email Verification | JWT + Refresh Tokens | NextAuth.js v5 (Credentials) | N/A |
| **DevOps & Infra** | Docker, Nginx, Traefik, GitHub Actions | Docker, Traefik, GitHub Actions | Docker, Traefik, AWS S3, GitHub Actions | Docker | Vercel / GitHub Pages |
| **Observability** | Grafana + Loki + Promtail | Centralized JSON Logging | structlog + Grafana/Loki/Promtail | Node.js Error Logging | Browser Console |

---

## 🛠️ 2. Detailed Project Deep-Dives

---

### Project 1: DOit (`doit-prod`)
> **Tagline**: Modern, enterprise-grade task and multi-tenant workspace collaboration platform engineered with strict type safety and production containerization.

#### 🎯 System Purpose & Core Features
- **Multi-Tenant Workspaces & Granular RBAC**: Isolated tenant environments where Workspace Owners manage member roles (`Owner`, `Admin`, `Member`) and enforce security policies.
- **Workflow Sectioning & High-Density Tables**: Organizes tasks into workflow states (**To Do**, **In Progress**, **In Review**, **Completed**) presented in scan-friendly, single-row high-density tables displaying Priority, Assignee (Avatar + Name), Due Date, and Actions.
- **Optimistic UI & Real-Time Transitions**: Smooth task status transitions leveraging optimistic state updates synchronized with backend validation.
- **Contextual Drawer & Comments**: Nested detail drawer enabling deep-dive task discussions without losing view state.
- **Production Observability**: Fully integrated logging pipeline emitting structured metrics to Grafana dashboards via Loki and Promtail.

#### 💻 Technical Stack
- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, Shadcn UI, Lucide Icons, TanStack Query v5, React Router v7, Axios.
- **Backend**: FastAPI (Python 3.12), SQLAlchemy 2.0 / SQLModel, Pydantic v2, PostgreSQL 17, Redis, `uv` package manager.
- **Infrastructure**: Docker & Docker Compose, Nginx (Vite static bundle server), Traefik Reverse Proxy (Automated Let's Encrypt SSL/TLS), Grafana + Loki + Promtail, GitHub Actions CI/CD.

#### 💡 Key System Design Highlights
1. **Strict Separation of Concerns**: Enforced clean architecture separating backend endpoint controllers (`routes/`), data models (`models.py`), Pydantic validation schemas (`schemas.py`), and domain services (`services/`).
2. **Standardized Query Invalidation**: Implemented TanStack Query v5 mutation hooks that automatically invalidate relevant query keys on write operations, maintaining UI consistency without manual refreshes.
3. **Containerized Nginx Production Pipeline**: Built multi-stage Docker builds deploying a compiled, optimized React bundle behind Nginx, fronted by Traefik for reverse proxying and SSL termination.

#### 📝 Resume Bullet Points (Copy & Paste Ready)
- Engineered a full-stack, multi-tenant task management platform using **React 19**, **FastAPI**, **PostgreSQL 17**, and **Docker**, serving multi-tenant workspaces with fine-grained **RBAC authorization**.
- Designed high-density workflow management UI using **Tailwind CSS v4** and **TanStack Query v5**, implementing optimistic updates for instantaneous status transitions and real-time state synchronization.
- Architected production containerization with **Docker Compose**, **Nginx**, and **Traefik Reverse Proxy**, automating zero-downtime deployments via **GitHub Actions** CI/CD pipelines.
- Configured enterprise observability stack utilizing **Grafana**, **Loki**, and **Promtail** to collect structured backend logs, monitor latency, and track system health metrics.

---

### Project 2: TrackIT (`trackIT`)
> **Tagline**: High-performance personal financial ledger with automated budget alerts, dynamic caching, and intelligent spending pattern detection.

#### 🎯 System Purpose & Core Features
- **Smart Financial Ledger**: Comprehensive income and expense tracking with category classification and dynamic ledger summaries.
- **Intelligent Spending Detection (Redis Caching)**: Calculates all-time daily spending averages; triggers dynamic visual insight warnings when any transaction wildly exceeds baseline spending ($\ge 3\times$).
- **Dynamic Category Budget Email Alerts**: Monitors category-specific user budgets; fires automated Jinja2-templated HTML warning emails via Brevo SMTP upon threshold breaches.
- **Custom Aesthetic Design System**: Completely custom-built dark UI with glassmorphism, responsive components, zero-jump collapsible sidebar, and micro-animations (no heavy CSS frameworks).

#### 💻 Technical Stack
- **Frontend**: React 19, TypeScript, Vite, Custom Vanilla CSS Design System, Axios, Biome code formatter/linter.
- **Backend**: FastAPI (Python 3.12), SQLAlchemy 2.0, PostgreSQL 17, Redis, Brevo SMTP (Jinja2 HTML templates), Ruff + Mypy.
- **Infrastructure**: Docker, Docker Compose, Traefik Reverse Proxy, GitHub Actions CI/CD.

#### 🧠 Human Engineering Judgment & AI Collaboration Case Studies
1. **The FastAPI Trailing Slash CORS Trap**:
   - *Problem*: AI co-pilot generated backend route `@router.post("/reset-password/")` with a trailing slash while frontend called `/reset-password`. FastAPI returned a `307 Temporary Redirect` which dropped JSON body payloads in preflight CORS requests.
   - *Fix*: Diagnosed browser network traces, removed trailing slashes from API definitions, and eliminated 307 preflight CORS failures.
2. **React Router Verification Link Disconnect**:
   - *Problem*: AI built backend JWT logic and `VerifyEmail.tsx` UI, but failed to register the route in `main.tsx`, leading to `404 Not Found` when users clicked email links.
   - *Fix*: Traced application routing tree and properly linked `<Route path="/verify-email" element={<VerifyEmail />} />`.
3. **Dynamic Database State vs. Hardcoded `.env`**:
   - *Problem*: AI suggested binding budget alerts to a static global environment variable (`MONTHLY_BUDGET_LIMIT=5000`).
   - *Fix*: Refactored to dynamic database budget models per category/user, hooking transaction creation directly into user-defined SQL budget constraints.

#### 📝 Resume Bullet Points (Copy & Paste Ready)
- Built a smart financial ledger app using **FastAPI**, **React 19**, **PostgreSQL**, and **Redis**, implementing dynamic Redis caching to reduce database read load for high-frequency dashboard analytics.
- Developed an intelligent anomaly detection engine that identifies transaction spikes ($\ge 3\times$ daily average) and triggers automated HTML email notifications via **Brevo SMTP** and **Jinja2 templates**.
- Designed a custom, framework-free responsive CSS design system featuring dark mode and glassmorphism, achieving a minimal JavaScript bundle size and strict linting compliance using **Biome** and **Ruff**.
- Resolved complex network and auth traps including CORS preflight redirect issues (`307` handling) and JWT route linkage in React Router to ensure seamless production reliability.

---

### Project 3: KnowIT (`knowIT`)
> **Tagline**: Production-inspired RAG knowledge management SaaS enabling document upload, collection isolation, semantic vector search, and contextual AI conversations.

#### 🎯 System Purpose & Core Features
- **Async RAG Processing Pipeline**: Responsive upload flow where documents (PDF, DOCX, TXT, MD) are stored in AWS S3, returning immediate responses while background jobs handle text extraction, chunking, embedding generation, and vector indexing.
- **Collection-Isolated Document Vector Search**: Group documents into collections to constrain retrieval boundaries and minimize context hallucination.
- **Semantic Vector Querying (PGVector)**: Converts chat queries to embeddings, executes similarity searches against PostgreSQL PGVector, and constructs enriched prompts for the Groq LLM.
- **Provider-Agnostic LLM & Embedding Layer**: Abstracted interfaces allowing seamless swapping between Groq (`llama-3.3-70b-versatile`), OpenAI, Gemini, or custom embedding providers without modifying business logic.
- **Production Observability**: Fully structured `structlog` JSON logs tagged with correlation IDs, tracked in Grafana via Loki and Promtail.

#### 💻 Technical Stack
- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, TanStack Query v5, React Hook Form, Zod.
- **Backend**: FastAPI, Async SQLAlchemy 2.0, Alembic, `uv` package manager.
- **AI & Vector DB**: PostgreSQL 17 with `PGVector` extension, Groq LLM API (`llama-3.3-70b-versatile`), Swappable Embedding Abstraction.
- **Storage & Infrastructure**: AWS S3, Brevo SMTP, Docker Compose, Traefik, `structlog`, Promtail, Loki, Grafana.

#### 💡 Key System Design Highlights
1. **Non-Blocking Background Ingestion**: Offloaded text parsing and embedding generation from HTTP worker threads to async background queues, maintaining sub-100ms API response times during document ingestion.
2. **Collection-Based Context Scoping**: Reduced semantic search noise and vector comparison overhead by filtering PGVector similarity queries strictly within user-defined collection IDs.
3. **Structured JSON Telemetry**: Standardized `structlog` formatting across backend services, enabling real-time Grafana monitoring of LLM token usage, retrieval latency, and background task statuses.

#### 📝 Resume Bullet Points (Copy & Paste Ready)
- Developed a production-grade RAG knowledge platform using **FastAPI**, **React 19**, **PostgreSQL + PGVector**, and **AWS S3**, enabling contextual AI chat over multi-format documents (PDF, DOCX, MD).
- Architected an async document processing pipeline to store uploaded files in AWS S3 and execute chunking, vector embedding generation, and similarity indexing in background tasks.
- Implemented a provider-agnostic LLM and embedding abstraction layer supporting **Groq** (`llama-3.3-70b`), facilitating seamless provider switching with zero impact on core business logic.
- Built structured logging telemetry with **structlog**, **Loki**, **Promtail**, and **Grafana**, capturing correlation IDs, retrieval latencies, and LLM usage metrics.

---

### Project 4: Orbit / Productivity Hub (`resource-hub`)
> **Tagline**: Unified full-stack SaaS suite combining daily task planning, calendar scheduling, career job application tracking, and searchable resource bookmarking.

#### 🎯 System Purpose & Core Features
- **Daily Planner Module**: Multi-priority todo management (Low, Medium, High, Urgent), start/due dates, drag-and-drop ordering, rich markdown notes, completion progress rings, and interactive calendar views.
- **Career Application Suite**: Pipeline board tracking job applications across stages (**Applied**, **Shortlisted**, **Assessments**, **Technical**, **HR**, **Offer**, **Rejection**) with contact info, salary metrics, resume version tracking, and follow-up reminders.
- **Searchable Resource Vault**: Centralized bookmarking system for system design resources, GitHub repos, AI tools, and documentation with category tags and favorite toggles.
- **Next.js 16 App Router Architecture**: Full-stack Next.js 16 implementation utilizing Server Components for fast initial renders and Client Components for rich UI interactions.

#### 💻 Technical Stack
- **Framework**: Next.js 16 (App Router), TypeScript, React 19.
- **Database & ORM**: PostgreSQL, Prisma ORM (Migrations, Schema validation, Custom seeding scripts).
- **Auth & Security**: NextAuth.js v5 (Credentials Provider), password hashing, secure session tokens.
- **UI & Styling**: Tailwind CSS v4, Glassmorphism design tokens, Radix UI primitives, Lucide Icons, Sonner Toasts.
- **DevOps**: Docker containerization (`Dockerfile`).

#### 💡 Key System Design Highlights
1. **Server vs. Client Component Boundaries**: Optimized page hydration by fetching resource catalogs and task schedules inside Next.js Server Components, rendering interactive forms via client modules.
2. **Unified Data Schema with Prisma**: Designed relational schema in PostgreSQL modeling complex user workflows across daily tasks, career pipelines, and resource bookmarks within a single ORM layer.

#### 📝 Resume Bullet Points (Copy & Paste Ready)
- Architected a unified productivity SaaS application using **Next.js 16 (App Router)**, **TypeScript**, **PostgreSQL**, and **Prisma ORM**, consolidating daily planning, resource bookmarking, and job search management.
- Built a career application tracker with dynamic stage progression (**Applied** $\rightarrow$ **Offer**), salary metrics, contact management, and automated follow-up reminder alerts.
- Implemented secure user authentication using **NextAuth.js v5** with credential validation, server-side session management, and protected API routes.
- Designed a polished glassmorphism UI leveraging **Tailwind CSS v4** and **Radix UI**, delivering a responsive, accessible interface with low bundle footprint.

---

### Project 5: Personal Portfolio (`portfolio`)
> **Tagline**: High-performance, zero-JS island developer portfolio engineered with Astro SSG and Vanilla CSS for maximum speed and SEO efficiency.

#### 🎯 System Purpose & Core Features
- **Zero-JS Island Architecture**: High-speed static generation serving minimal client-side JavaScript by default.
- **Native Scroll & Active Link Tracking**: Intersection Observer API implementation powering smooth scrolling and dynamic navigation highlights without heavy UI dependencies.
- **Component-Driven Layout**: Modular Astro component architecture (`CardExperience.astro`, `CardSystemDesign.astro`, `CardContact.astro`) promoting high maintainability.
- **Direct Asset Delivery**: Optimized public directory serving architecture diagrams and PDF assets directly without execution overhead.

#### 💻 Technical Stack
- **Framework**: Astro (Static Site Generation / SSG).
- **Styling**: Pure Vanilla CSS (`styles/card.css`), zero CSS-in-JS preprocessors.
- **Scripting**: Native Browser JavaScript (Intersection Observer API).

#### 📝 Resume Bullet Points (Copy & Paste Ready)
- Created a high-performance personal portfolio using **Astro**, **TypeScript**, and **Vanilla CSS**, utilizing static site generation (SSG) and island architecture for minimal JavaScript execution.
- Implemented lightweight navigation scrolling and section tracking using the native browser **Intersection Observer API**, eliminating third-party JS library overhead.
- Engineered a modular component design system ensuring crisp typography, accessible color contrast, fast load times, and responsive mobile rendering.

---

## 🎯 3. Role-Based Resume Summary Snippets

### For Senior Full-Stack Engineer / Technical Lead Roles
> *"Full-Stack Software Engineer with expertise in building enterprise web applications, AI platforms, and distributed systems using React 19, Next.js, FastAPI, Python, PostgreSQL, and Docker. Proven track record of designing production RAG pipelines (PGVector, Groq LLM), implementing micro-caching strategies (Redis), engineering RBAC security models, and orchestrating containerized deployments via Traefik and GitHub Actions."*

### For Backend / Systems Engineer Roles
> *"Backend Engineer specializing in Python (FastAPI, Async SQLAlchemy 2.0), PostgreSQL (PGVector, Relational Modeling), Redis caching, and async data pipelines. Experienced in constructing provider-agnostic LLM abstractions, async document processing architectures with AWS S3, structured JSON logging (structlog, Grafana/Loki), and microservices deployment with Docker and Traefik."*

### For Frontend / UI-UX Engineer Roles
> *"Frontend Engineer with deep skill in React 19, TypeScript, Next.js 16 (App Router), Astro, and modern styling architectures (Tailwind CSS v4, Custom Vanilla CSS, Shadcn UI). Adept at building responsive high-density interfaces, optimistic state management with TanStack Query v5, accessible components, and zero-JS static sites utilizing browser native APIs."*

---

## 💬 4. Interview Talking Points & System Design Scenarios

### Q1: How do you handle database caching and cache invalidation?
- **Talking Point (from TrackIT & DOit)**: *"In TrackIT, I used Redis to cache heavy analytical read queries like all-time daily spending averages. To prevent stale data, I implemented event-driven cache invalidation: whenever a write operation occurs (POST/PUT/DELETE transaction), the cache key is explicitly purged. In DOit, TanStack Query v5 mutation hooks handle client-side query key invalidation upon successful API responses, keeping UI state instantly in sync with PostgreSQL."*

### Q2: How do you design an AI Retrieval-Augmented Generation (RAG) backend?
- **Talking Point (from KnowIT)**: *"In KnowIT, I built an async RAG pipeline using FastAPI, AWS S3, and PGVector. Document uploads return immediately while background tasks parse text, generate vector embeddings, and store chunks in PostgreSQL. Queries perform similarity search filtered by Collection ID to isolate context, which is injected into Groq's LLM (`llama-3.3-70b`). The LLM and embedding layers are wrapped in provider-agnostic interfaces so underlying providers can be swapped with zero changes to business logic."*

### Q3: How do you ensure production security and multi-tenancy?
- **Talking Point (from DOit)**: *"In DOit, I designed a multi-tenant workspace architecture with explicit Role-Based Access Control (RBAC: Owner, Admin, Member). Authorization is checked at both workspace and project boundaries. Security protocols include OAuth2 JWT validation, password hashing, environment secret isolation, automated Let's Encrypt SSL via Traefik, and CORS preflight verification."*

### Q4: How do you evaluate when to use heavy frameworks vs lightweight/native tools?
- **Talking Point (from Portfolio & TrackIT)**: *"Framework selection must match requirements. For the portfolio, I chose Astro and Vanilla CSS with native Intersection Observer to achieve zero-JS SSG speed. For TrackIT, I built a zero-dependency custom CSS design system to keep bundle size light. In contrast, for DOit and Orbit, where rapid state changes and complex user interactions dominate, React 19, Next.js 16 App Router, and Tailwind CSS v4 provided maximum developer velocity and maintainability."*
