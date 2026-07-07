# Stage 1: Build stage
FROM python:3.12-slim AS build-stage

ENV PYTHONUNBUFFERED=1
ENV UV_COMPILE_BYTECODE=1
ENV UV_LINK_MODE=copy

WORKDIR /app/

# Install uv
COPY --from=ghcr.io/astral-sh/uv:0.5.11 /uv /uvx /bin/

# Install ONLY production dependencies using --no-dev
RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    uv sync --frozen --no-install-project --no-dev

# Copy application files (excluding tests/ thanks to .dockerignore)
COPY ./pyproject.toml ./uv.lock ./alembic.ini /app/
COPY ./scripts /app/scripts
COPY ./app /app/app

# Sync the project, stripping dev dependencies
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev


# Stage 2: Production stage
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1
# Place executables in the environment at the front of the path
ENV PATH="/app/.venv/bin:$PATH"
ENV PYTHONPATH=/app

WORKDIR /app/

# Create a non-root user for better security
RUN useradd -m appuser && chown -R appuser /app
USER appuser

# Copy virtual environment and app code from build stage
COPY --from=build-stage --chown=appuser:appuser /app /app

CMD ["fastapi", "run", "app/main.py"]
