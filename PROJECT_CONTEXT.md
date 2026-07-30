# DOit Project Context and Understanding

## Introduction
DOit is a modern, fully dockerized Task Management Platform designed for teams and individuals to organize projects, tasks, and workspaces. It is built with a focus on performance, scalability, and security.

## Technology Stack & Architecture
The application follows a containerized client-server architecture, orchestrated with Docker and Docker Compose.

- **Frontend:** A Single Page Application (SPA) built using **React**, **TypeScript**, and **Vite**. It handles routing with React Router and provides a responsive dashboard with Dark Mode support.
- **Backend:** A RESTful API built with **Python** and **FastAPI**. It handles authentication (JWT), data validation (Pydantic), and database interactions.
- **Database Layer:** 
  - **PostgreSQL** is the primary relational database storing core entities.
  - **Redis** is used as an in-memory data store for caching, session management, and potentially background queues.
- **Infrastructure & Reverse Proxy:** **Traefik** acts as the reverse proxy handling incoming traffic, routing requests to frontend/backend, and automatically managing SSL/TLS certificates via Let's Encrypt.
- **CI/CD:** Automated via GitHub Actions for testing, linting, building, and deploying to a VPS via SSH.

## Domain Entities
The core of the application revolves around the following hierarchy and entities:
- **User:** Can own or belong to workspaces and projects, and be assigned tasks. Features JWT-based login.
- **Workspace:** The highest level of organization, containing projects and managing member invitations.
- **Project:** Resides within a workspace, organizing tasks into logical groupings. Can be private or public.
- **Section:** Groups tasks within a project (e.g., "To Do", "In Progress", "Done").
- **Task:** The fundamental unit of work, containing status, priority, due dates, assignments, comments, attachments, and an activity log.

## Data Flow Lifecycle
1. **User Request:** Traffic hits the Traefik reverse proxy (e.g., `dashboard.yourdomain.com`).
2. **Frontend Routing:** Traefik routes the request to the React container.
3. **API Interaction:** The React app makes background API calls to `api.yourdomain.com`.
4. **Backend Processing:** Traefik routes API calls to the FastAPI container, which queries PostgreSQL/Redis and responds with JSON data.

## Local Development
To run the project locally:
1. Ensure Docker and Docker Compose are installed.
2. Configure your `.env` file (ensure `SECRET_KEY`, `FIRST_SUPERUSER_PASSWORD`, and `POSTGRES_PASSWORD` are set).
3. Run: `docker compose up -d --build`
4. Access:
   - Dashboard: `http://dashboard.localhost`
   - API: `http://api.localhost`
   - Swagger Docs: `http://api.localhost/docs`
