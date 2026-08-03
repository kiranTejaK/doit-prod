# DOit Deployment Guide

This document outlines the deployment strategy, prerequisites, and automated pipeline for the DOit application.

---

## 1. VPS Pre-requisites for Deployment

Before triggering your GitHub Actions CI/CD pipeline on a fresh VPS (like an AWS EC2 instance, DigitalOcean Droplet, or similar), you must ensure that Docker is installed, your user has the correct permissions, and the firewall is configured correctly.

Follow these exact steps sequentially on your server.

### 1.1 Connect to your VPS
SSH into your server using your username and IP address:
```bash
ssh ubuntu@<YOUR_VPS_IP>
```

### 1.2 Update System Packages
Always start by ensuring your server's package list is up-to-date:
```bash
sudo apt-get update && sudo apt-get upgrade -y
```

### 1.3 Install Docker and Docker Compose
Use the official Docker convenience script. This automatically installs the latest Docker Engine and the `docker compose` plugin:
```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
```

### 1.4 Grant Docker Permissions to Your User
By default, Docker requires `root` access (using `sudo`). Since your GitHub Action logs in as a regular user (e.g., `ubuntu`), it will crash with a "Permission Denied" error if it tries to run Docker without `sudo`.

Add your user to the `docker` group:
```bash
sudo usermod -aG docker $USER
```

**Apply the permission change immediately** without having to disconnect:
```bash
newgrp docker
```

*Verify it works by running `docker ps` (it should NOT say "permission denied").*

### 1.5 Enable Docker to Start on Boot
Ensure that Docker automatically restarts if your server reboots:
```bash
sudo systemctl enable docker
sudo systemctl start docker
```

### 1.6 Configure the Firewall
You must ensure that your firewall allows traffic for SSH (so GitHub Actions can connect) and HTTP/HTTPS (so users can access your app).

If you are using **UFW** (Ubuntu's default firewall):
```bash
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
```

If you are using a Cloud Provider (AWS, Azure, Google Cloud, Oracle):
- Go to your instance's **Security Group** or **Firewall Rules** in the web console.
- Add an **Inbound Rule** to allow `Port 22 (SSH)` from `0.0.0.0/0` (Anywhere).
- Add an **Inbound Rule** to allow `Port 80 (HTTP)` from `0.0.0.0/0` (Anywhere).
- Add an **Inbound Rule** to allow `Port 443 (HTTPS)` from `0.0.0.0/0` (Anywhere).

---

## 2. Deployment Action Plan

The project is configured to use a fully automated deployment pipeline via GitHub Actions, building images, pushing them to DockerHub, and deploying them to the Virtual Private Server (VPS) via SSH.

### 2.1 How it works:
1. When code is pushed to the `main` branch, the `deploy-remote.yml` workflow is triggered.
2. The workflow lints and tests both the frontend and backend.
3. If successful, it builds the Docker images and pushes them to your configured DockerHub account.
4. It connects securely to your VPS via SSH, transfers the `docker-compose.prod.yml` and `docker-compose.traefik.yml` files, and runs `docker compose up -d` to pull and start the new images.
5. A health check ensures the new backend container comes online successfully. If it fails, the deployment automatically rolls back to the previous tag to ensure zero downtime.

### 2.2 Actions Required to Setup Deployment:
To ensure this pipeline runs successfully, you must configure the following in your GitHub repository and VPS:

- [ ] **VPS Setup:** Ensure Docker and Docker Compose are installed on your server (see Section 1).
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
