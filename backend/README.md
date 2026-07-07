# DOit Project - Backend

The backend of DOit is built with FastAPI, SQLModel, and PostgreSQL.

## Requirements

* [Docker](https://www.docker.com/).
* Python 3.10+ and standard package management (`pip` or `uv`).

## Local Development

Start the local development environment with Docker Compose from the root directory:

```bash
docker compose up -d
```

### Virtual Environment

If developing locally outside the container, you can install the dependencies and activate a virtual environment:

```console
$ cd backend
$ python -m venv .venv
$ source .venv/bin/activate
$ pip install -e ".[dev]"
```

Modify or add SQLModel models in `app/models.py`, API endpoints in `app/api/`, and CRUD utilities in `app/crud.py`.

## Backend Tests

Tests are written using Pytest. You can run them locally or execute them within the running Docker container.

To run tests against the running stack:
```bash
docker compose exec backend pytest tests/unit
```

If you use GitHub Actions, the tests will run automatically on push to the `main` branch.

## Migrations

During local development, your app directory is mounted as a volume inside the container. You can run migrations using `alembic` commands inside the container, and the migration code will map directly to your local files to be committed.

* Start an interactive session in the backend container:

```console
$ docker compose exec backend bash
```

* After changing a model (for example, adding a column), create a revision:

```console
$ alembic revision --autogenerate -m "Add column last_name to User model"
```

* Run the migration in the database:

```console
$ alembic upgrade head
```

Commit the generated files in the `alembic/versions` directory to your git repository.

## Email Templates

The email templates are located in `./app/email-templates/`. There are two directories: `build` and `src`. The `src` directory contains the source files (MJML) used to build the final templates. The `build` directory contains the final HTML templates used by the application.

If editing templates, you can use the MJML extension in VS Code to export `.mjml` to `.html` and save them in the `build` directory.
