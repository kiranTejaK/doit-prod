# Observability & Monitoring Setup (Loki + Promtail + Grafana)

This document details the centralized log aggregation and visualization setup implemented in `doit-prod`, inspired by the pattern in `knowIT`.

---

## 1. Architecture Overview

The observability stack consists of three containerized services running alongside the application:

```mermaid
graph TD
    subgraph DOit Stack Containers
        Backend[Backend FastAPI Container\nStructlog JSON -> /app/logs/app.log]
        Containers[Other Stack Containers\n(DB, Redis, Proxy, Frontend)]
    end

    subgraph Observability Stack
        Promtail[Promtail Scraper Container]
        Loki[Loki Log Aggregator Container]
        Grafana[Grafana Dashboard Container]
    end

    Backend -->|Shared Volume: backend_logs| Promtail
    Containers -->|/var/run/docker.sock| Promtail
    Promtail -->|HTTP Push :3100| Loki
    Grafana -->|Loki Datasource Proxy| Loki
```

### Stack Components:
1. **FastAPI Backend (Structlog)**: Formats all application logs as structured JSON containing timestamp, severity level, module name, `correlation_id`, request `path`, `method`, and execution latency.
2. **Promtail**: A lightweight log collector agent that:
   - Scrapes JSON log files from `/var/log/doit/*.log` (mounted from `backend_logs` volume).
   - Scrapes stdout/stderr logs directly from the Docker daemon socket (`/var/run/docker.sock`), adding container name metadata (`container`).
3. **Loki**: Horizontally scalable log storage database optimized for indexing log labels without indexing full log text.
4. **Grafana**: Web interface for viewing, filtering, alerting, and building visual metrics from log streams.

---

## 2. Quickstart: Accessing Grafana & Dashboards

### Local Development:
1. Start the stack using Docker Compose:
   ```bash
   docker compose up -d
   ```
2. Open Grafana in your web browser:
   - **URL**: `http://localhost:3000`
   - **Default Username**: `admin`
   - **Default Password**: `admin`
3. Navigate to **Dashboards** -> **DOit Observability** -> **DOit System Overview**.

### Production:
- Grafana is accessible securely via Traefik at `https://grafana.yourdomain.com`.
- Change default admin password by setting `GF_SECURITY_ADMIN_PASSWORD` in your production `.env` file.

---

## 3. Pre-Provisioned Resources

### 3.1 Datasource
Grafana is automatically provisioned with Loki as the default datasource (`http://loki:3100`).
Configuration file: [`docker/grafana/provisioning/datasources/datasources.yml`](file:///c:/Users/kiran/Desktop/doit-prod/docker/grafana/provisioning/datasources/datasources.yml)

### 3.2 Provisioned Dashboard
The **DOit System Overview** dashboard is pre-loaded on container startup.
Configuration file: [`docker/grafana/provisioning/dashboards/definitions/doit-overview.json`](file:///c:/Users/kiran/Desktop/doit-prod/docker/grafana/provisioning/dashboards/definitions/doit-overview.json)

Features:
- **Backend Application Logs**: Displays formatted JSON logs emitted by FastAPI.
- **Docker Containers Log Stream**: Real-time log streams from all containers (`backend`, `db`, `redis`, `frontend`, `proxy`), filterable by container dropdown.

---

## 4. Useful LogQL Queries

You can run these queries directly in Grafana's **Explore** view:

### 1. View all Backend JSON Logs:
```logql
{job="doit-backend"} | json
```

### 2. Filter Backend Logs by Error Level:
```logql
{job="doit-backend"} |= "ERROR"
```

### 3. Filter Logs by Request Correlation ID:
```logql
{job="doit-backend"} | json | correlation_id="<YOUR-CORRELATION-ID-HERE>"
```

### 4. Count Log Errors over 5-minute intervals:
```logql
sum(count_over_time({job="doit-backend"} |= "ERROR" [5m]))
```

### 5. View Specific Container Logs:
```logql
{container="doit-prod-backend-1"}
```

---

## 5. File Structure Reference

```text
docker/
├── loki/
│   └── loki-config.yml               # Loki server ports & storage retention schema
├── promtail/
│   └── promtail-config.yml           # Log scraping definitions (backend file + docker.sock)
└── grafana/
    └── provisioning/
        ├── datasources/
        │   └── datasources.yml       # Auto-configures Loki as default datasource
        └── dashboards/
            ├── dashboards.yml        # Configures auto-import folder
            └── definitions/
                └── doit-overview.json # Pre-built dashboard
```
