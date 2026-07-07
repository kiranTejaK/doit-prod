# Deployment Action Plan

This document outlines the deployment strategy for the DOit application based on the current repository configuration.

## Current Configuration: Automated Remote Deployment

The project is configured to use a fully automated deployment pipeline via GitHub Actions, building images, pushing them to DockerHub, and deploying them to a Virtual Private Server (VPS) via SSH.

### How it works:
1. When code is pushed to the `main` branch, the `deploy-remote.yml` workflow is triggered.
2. The workflow lints and tests both the frontend and backend.
3. If successful, it builds the Docker images and pushes them to your configured DockerHub account.
4. It connects securely to your VPS via SSH, transfers the `docker-compose.prod.yml` and `docker-compose.traefik.yml` files, and runs `docker compose up -d` to pull and start the new images.
5. A health check ensures the new backend container comes online successfully. If it fails, the deployment automatically rolls back to the previous tag to ensure zero downtime.

### Actions Required to Setup Deployment:
To ensure this pipeline runs successfully, you must configure the following in your GitHub repository and VPS:

- [ ] **VPS Setup:** Ensure Docker and Docker Compose are installed on your server.
- [ ] **Configure GitHub Secrets:** In GitHub -> **Settings** -> **Secrets and variables** -> **Actions**, add the following required secrets:
  - `DOCKERHUB_USERNAME`: Your DockerHub username.
  - `DOCKERHUB_TOKEN`: An access token from DockerHub.
  - `SERVER_HOST`: The IP address of your VPS.
  - `SERVER_USERNAME`: The SSH username (e.g., `root` or `ubuntu`).
  - `SERVER_SSH_KEY`: The private SSH key authorized to access the VPS.
  - `ENV_FILE_CONTENT`: The complete production `.env` file contents, which the script will securely write to the VPS.
  - `DOMAIN_PRODUCTION`: Your production domain (e.g., `example.com`).
- [ ] **DNS Configuration:** In your domain registrar, point your domain's A-records (e.g., `api.example.com` and `dashboard.example.com`) to your VPS's IP address.
- [ ] **Trigger Deployment:** Push changes to the `main` branch to trigger the pipeline automatically.
