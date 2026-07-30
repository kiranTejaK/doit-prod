import uuid
from typing import Any, List, Tuple
from fastapi import HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.core.config import settings
from app.core.redis_client import clear_cache
from app.models import Project, ProjectMember, User, Workspace, WorkspaceMember
from app.schemas import (
    Message,
    ProjectCreate,
    ProjectPublicWithWorkspace,
    ProjectsPublic,
    ProjectUpdate,
)

class ProjectMemberCreate(BaseModel):
    user_id: uuid.UUID
    role: str = "member"
from app.services.auth_policy import verify_project_access, verify_workspace_membership


def get_projects(
    session: Session,
    current_user: User,
    workspace_id: uuid.UUID | None = None,
    skip: int = 0,
    limit: int = 100,
) -> ProjectsPublic:
    """
    Retrieve projects with N+1 avoidance using joinedload for workspace data.
    """
    if current_user.is_superuser:
        statement = select(Project).options(joinedload(Project.workspace))
        if workspace_id:
            statement = statement.where(Project.workspace_id == workspace_id)
        
        count_statement = select(func.count()).select_from(statement.subquery())
        count = session.execute(count_statement).scalar_one()
        
        statement = statement.offset(skip).limit(limit)
        projects = session.execute(statement).scalars().all()
    else:
        if workspace_id:
            verify_workspace_membership(session, workspace_id, current_user)
            statement = select(Project).options(joinedload(Project.workspace)).where(Project.workspace_id == workspace_id)
            all_projects = session.execute(statement).scalars().all()

            visible_projects = []
            for p in all_projects:
                if not p.is_private:
                    visible_projects.append(p)
                else:
                    pm = session.get(ProjectMember, (p.id, current_user.id))
                    if pm or p.owner_id == current_user.id:
                        visible_projects.append(p)

            projects = visible_projects[skip : skip + limit]
            count = len(visible_projects)
        else:
            statement = (
                select(Project)
                .options(joinedload(Project.workspace))
                .join(ProjectMember, Project.id == ProjectMember.project_id, isouter=True)
                .where(
                    (Project.owner_id == current_user.id) |
                    (ProjectMember.user_id == current_user.id)
                )
                .distinct()
            )
            
            count_statement = select(func.count()).select_from(statement.subquery())
            count = session.execute(count_statement).scalar_one()
            
            statement = statement.offset(skip).limit(limit)
            projects = session.execute(statement).scalars().all()

    # Populate ProjectPublicWithWorkspace efficiently (workspace relationship pre-loaded via joinedload)
    final_projects = []
    for p in projects:
        ws_name = p.workspace.name if p.workspace else "Unknown"
        p_dict = {c.name: getattr(p, c.name) for c in p.__table__.columns}
        p_dict["workspace_name"] = ws_name
        final_projects.append(ProjectPublicWithWorkspace(**p_dict))

    return ProjectsPublic(data=final_projects, count=count)


def get_project(session: Session, current_user: User, project_id: uuid.UUID) -> Project:
    """Get project by ID with authorization check."""
    return verify_project_access(session, project_id, current_user)


def create_project(
    session: Session, current_user: User, project_in: ProjectCreate
) -> Project:
    """Create a new project and add the creator as owner member."""
    verify_workspace_membership(session, project_in.workspace_id, current_user)

    project = Project(**project_in.model_dump(), owner_id=current_user.id)
    session.add(project)
    session.commit()
    session.refresh(project)

    member = ProjectMember(project_id=project.id, user_id=current_user.id, role="owner")
    session.add(member)
    session.commit()

    clear_cache(f"{settings.APP_PREFIX}:{settings.CACHE_VERSION}:projects:*")
    return project


def update_project(
    session: Session, current_user: User, project_id: uuid.UUID, project_in: ProjectUpdate
) -> Project:
    """Update a project (requires ownership or superuser)."""
    project = verify_project_access(session, project_id, current_user, require_owner=True)

    update_dict = project_in.model_dump(exclude_unset=True)
    for key, value in update_dict.items():
        setattr(project, key, value)

    session.add(project)
    session.commit()
    session.refresh(project)

    clear_cache(f"{settings.APP_PREFIX}:{settings.CACHE_VERSION}:projects:*")
    return project


def delete_project(session: Session, current_user: User, project_id: uuid.UUID) -> Message:
    """Delete a project (requires ownership or superuser)."""
    project = verify_project_access(session, project_id, current_user, require_owner=True)

    session.delete(project)
    session.commit()

    clear_cache(f"{settings.APP_PREFIX}:{settings.CACHE_VERSION}:projects:*")
    return Message(message="Project deleted successfully")


def add_project_member(
    session: Session, current_user: User, project_id: uuid.UUID, member_in: ProjectMemberCreate
) -> Message:
    """Add a member to a project."""
    project = verify_project_access(session, project_id, current_user, require_owner=True)

    user = session.get(User, member_in.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    wm = session.get(WorkspaceMember, (project.workspace_id, member_in.user_id))
    if not wm:
        raise HTTPException(status_code=400, detail="User must be a member of the workspace first")

    pm = session.get(ProjectMember, (project_id, member_in.user_id))
    if pm:
        raise HTTPException(status_code=400, detail="User already in project")

    member = ProjectMember(project_id=project_id, user_id=member_in.user_id, role=member_in.role)
    session.add(member)
    session.commit()

    return Message(message="Member added successfully")


def get_project_members(
    session: Session, current_user: User, project_id: uuid.UUID
) -> dict:
    """Get project members."""
    verify_project_access(session, project_id, current_user)

    statement = (
        select(ProjectMember, User)
        .join(User, ProjectMember.user_id == User.id)
        .where(ProjectMember.project_id == project_id)
    )
    members = []
    for pm, user in session.execute(statement).all():
        members.append({
            "id": user.id,
            "full_name": user.full_name,
            "email": user.email,
            "avatar_url": user.avatar_url,
            "role": pm.role,
            "project_id": pm.project_id
        })

    return {"data": members, "count": len(members)}
