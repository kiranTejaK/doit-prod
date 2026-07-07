# Understanding CI/CD in DOit

This guide explains how the DOit project automatically tests, builds, and deploys your code using GitHub Actions.

## 🚀 What is CI/CD?

*   **CI (Continuous Integration):** Automatically running tests and checks every time you push code. It ensures your changes don't break the existing application.
*   **CD (Continuous Deployment):** Automatically deploying your application to your production server once the tests pass and a version is ready.

---

## 🛠️ The Pipeline: `deploy-remote.yml`

We use **GitHub Actions**. The entire automation pipeline is stored in `.github/workflows/deploy-remote.yml`.

**When does it run?** 
Every time you push code to the `main` branch.

**What does it do?**
The pipeline is split into three main jobs:

### 1. `test-and-lint` (Backend Checks)
- **Sets up Python**: Prepares the environment.
- **Installs Dependencies**: Installs `pytest`, `ruff`, and the backend requirements.
- **Lints Code**: Runs `ruff check .` to ensure Python code style is consistent.
- **Runs Tests**: Executes backend unit tests to ensure API logic is sound.

### 2. `test-and-lint-frontend` (Frontend Checks)
- **Sets up Node**: Prepares the Node.js environment.
- **Installs Dependencies**: Runs `npm install` for the React application.
- **Lints Code**: Runs `npm run lint` (using Biome) to check for syntax and style issues.
- **Builds**: Runs `npm run build` which invokes the TypeScript compiler (`tsc`) to catch any type errors before production.

### 3. `build-and-push` (Deployment)
*This job only runs if the first two jobs pass successfully.*

- **Builds Images**: Compiles the backend and frontend code into production-ready Docker images.
- **Pushes to DockerHub**: Uploads the new images securely to your DockerHub registry.
- **Connects to VPS**: Logs into your production server via SSH.
- **Deploys**: Copies the `docker-compose.prod.yml` configuration and runs `docker compose pull` and `docker compose up -d` to restart the services with the new images.
- **Automated Rollback**: The script runs a health check on the newly deployed containers. If they fail to start correctly, it automatically reverts to the previous working version (`TAG`) stored in the `.env` backup, ensuring zero permanent downtime.

---

## ❓ How to see it in action?

1. Go to your project on **GitHub**.
2. Click the **"Actions"** tab at the top.
3. You will see a list of recent "workflow runs." Click on any of them to see the step-by-step logs for your deployments.
