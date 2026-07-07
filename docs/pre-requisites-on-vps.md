# VPS Pre-requisites for Deployment

Before triggering your GitHub Actions CI/CD pipeline on a fresh VPS (like an AWS EC2 instance, DigitalOcean Droplet, or similar), you must ensure that Docker is installed, your user has the correct permissions, and the firewall is configured correctly.

Follow these exact steps sequentially on your server.

## 1. Connect to your VPS
SSH into your server using your username and IP address:
```bash
ssh ubuntu@<YOUR_VPS_IP>
```

## 2. Update System Packages
Always start by ensuring your server's package list is up-to-date:
```bash
sudo apt-get update && sudo apt-get upgrade -y
```

## 3. Install Docker and Docker Compose
Use the official Docker convenience script. This automatically installs the latest Docker Engine and the `docker compose` plugin:
```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
```

## 4. Grant Docker Permissions to Your User
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

## 5. Enable Docker to Start on Boot
Ensure that Docker automatically restarts if your server reboots:
```bash
sudo systemctl enable docker
sudo systemctl start docker
```

## 6. Configure the Firewall
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

### You're all set! 🚀
Once these steps are completed, your VPS is fully prepared. You can now safely trigger your GitHub Actions deployment script.
