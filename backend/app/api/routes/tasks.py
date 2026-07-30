import uuid
from typing import Any
from fastapi import APIRouter, BackgroundTasks

from app.api.deps import CurrentUser, SessionDep
from app.schemas import (
    Message,
    TaskCreate,
    TaskPublic,
    TasksPublicWithProject,
    TaskUpdate,
)
from app.services import task_service

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.get("/", response_model=TasksPublicWithProject)
def read_tasks(
    session: SessionDep,
    current_user: CurrentUser,
    project_id: uuid.UUID | None = None,
    assignee_id: uuid.UUID | None = None,
    skip: int = 0,
    limit: int = 100,
) -> Any:
    """Retrieve tasks."""
    return task_service.get_tasks(
        session=session,
        current_user=current_user,
        project_id=project_id,
        assignee_id=assignee_id,
        skip=skip,
        limit=limit,
    )


@router.get("/{id}", response_model=TaskPublic)
def read_task(session: SessionDep, current_user: CurrentUser, id: uuid.UUID) -> Any:
    """Get task by ID."""
    return task_service.get_task(session, current_user, id)


@router.post("/", response_model=TaskPublic)
def create_task(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    task_in: TaskCreate,
    background_tasks: BackgroundTasks,
) -> Any:
    """Create new task."""
    return task_service.create_task(session, current_user, task_in, background_tasks)


@router.put("/{id}", response_model=TaskPublic)
def update_task(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    id: uuid.UUID,
    task_in: TaskUpdate,
    background_tasks: BackgroundTasks,
) -> Any:
    """Update a task."""
    return task_service.update_task(session, current_user, id, task_in, background_tasks)


@router.delete("/{id}", response_model=Message)
def delete_task(
    session: SessionDep, current_user: CurrentUser, id: uuid.UUID
) -> Any:
    """Delete a task."""
    return task_service.delete_task(session, current_user, id)
