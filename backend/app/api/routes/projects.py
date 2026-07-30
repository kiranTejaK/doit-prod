import uuid
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

from app.api.deps import CurrentUser, SessionDep
from app.core.redis_client import query_key_generator, redis_cache
from app.schemas import (
    Message,
    ProjectCreate,
    ProjectPublic,
    ProjectsPublic,
    ProjectUpdate,
)
from app.services import project_service

router = APIRouter(prefix="/projects", tags=["projects"])


class ProjectMemberCreate(BaseModel):
    user_id: uuid.UUID
    role: str = "member"


@router.get("/", response_model=ProjectsPublic)
@redis_cache(query_key_generator, module="projects", resource="projects")
def read_projects(
    session: SessionDep,
    current_user: CurrentUser,
    workspace_id: uuid.UUID | None = None,
    skip: int = 0,
    limit: int = 100,
) -> Any:
    """Retrieve projects with automatic Redis caching."""
    return project_service.get_projects(
        session=session,
        current_user=current_user,
        workspace_id=workspace_id,
        skip=skip,
        limit=limit,
    )


@router.get("/{id}", response_model=ProjectPublic)
def read_project(session: SessionDep, current_user: CurrentUser, id: uuid.UUID) -> Any:
    """Get project by ID."""
    return project_service.get_project(session, current_user, id)


@router.post("/", response_model=ProjectPublic)
def create_project(
    *, session: SessionDep, current_user: CurrentUser, project_in: ProjectCreate
) -> Any:
    """Create new project."""
    return project_service.create_project(session, current_user, project_in)


@router.put("/{id}", response_model=ProjectPublic)
def update_project(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    id: uuid.UUID,
    project_in: ProjectUpdate,
) -> Any:
    """Update a project."""
    return project_service.update_project(session, current_user, id, project_in)


@router.post("/{id}/members", response_model=Message)
def add_project_member(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    id: uuid.UUID,
    member_in: ProjectMemberCreate,
) -> Any:
    """Add a member to a project."""
    return project_service.add_project_member(session, current_user, id, member_in)


@router.get("/{id}/members", response_model=Any)
def read_project_members(
    *, session: SessionDep, current_user: CurrentUser, id: uuid.UUID
) -> Any:
    """Get project members."""
    return project_service.get_project_members(session, current_user, id)


@router.delete("/{id}", response_model=Message)
def delete_project(
    session: SessionDep, current_user: CurrentUser, id: uuid.UUID
) -> Any:
    """Delete a project."""
    return project_service.delete_project(session, current_user, id)
