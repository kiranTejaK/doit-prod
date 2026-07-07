
import json
import uuid
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select

from app.api.deps import CurrentUser, SessionDep
from app.core.redis_client import redis_client_sync
from app.models import Project, ProjectMember, User, Workspace, WorkspaceMember
from app.schemas import (
    Message,
    ProjectCreate,
    ProjectPublic,
    ProjectPublicWithWorkspace,
    ProjectsPublic,
    ProjectUpdate,
)

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("/", response_model=ProjectsPublic)
def read_projects(
    session: SessionDep,
    current_user: CurrentUser,
    workspace_id: uuid.UUID | None = None,
    skip: int = 0,
    limit: int = 100
) -> Any:
    """
    Retrieve projects. Option filters by workspace_id.
    """
    # Redis Caching
    try:
        cache_key = f"projects:{current_user.id}:{workspace_id or 'all'}:{skip}:{limit}"
        cached_data = redis_client_sync.get(cache_key)
        if cached_data:
            data = json.loads(cached_data)
            return ProjectsPublic(**data)
    except Exception:
        # Fallback if redis fails
        pass

    if current_user.is_superuser:
        statement = select(Project)
        if workspace_id:
            statement = statement.where(Project.workspace_id == workspace_id)
        count_statement = select(func.count()).select_from(statement.subquery())
        count = session.execute(count_statement).scalar_one()
        statement = statement.offset(skip).limit(limit)
        projects = session.execute(statement).scalars().all()
    else:
        # Complex permission logic
        # 1. User must be a member of the workspace to see public projects in it?
        #    OR User must be a member of the project (if private).
        # For simplicity MVP:
        # Show projects where user is Owner OR Member OR (Project is Public AND User is Workspace Member)

        # This query construction is getting complex for SQLModel direct usage without raw SQL or multiple queries.
        # Let's try simpler logic:
        # Get all projects the user is explicitly a member of
        # UNION
        # Get all public projects in workspaces the user is a member of

        # Simplified for now:
        # If workspace_id provided: check workspace membership, then return all public projects + private ones where user is member.

        if workspace_id:
             # Check workspace membership
            member = session.get(WorkspaceMember, (workspace_id, current_user.id))
            if not member and not current_user.is_superuser:
                 raise HTTPException(status_code=400, detail="Not a member of this workspace")

            # Projects in this workspace
            # Filter: (is_private == False) OR (id IN [user's project memberships])
            # But wait, we need to know if user is project member.

            # Just fetching all for now and filtering in python (inefficient but safe for MVP start)
            statement = select(Project).where(Project.workspace_id == workspace_id)
            all_projects = session.execute(statement).scalars().all()

            visible_projects = []
            for p in all_projects:
                if not p.is_private:
                    visible_projects.append(p)
                else:
                    # Check membership
                    pm = session.get(ProjectMember, (p.id, current_user.id))
                    if pm or p.owner_id == current_user.id:
                        visible_projects.append(p)

            projects = visible_projects[skip : skip + limit]
            count = len(visible_projects)

        else:
             # Global list (e.g. "My Projects")
             # Return all projects where user is owner or member
             statement = (
                 select(Project)
                 .join(ProjectMember, Project.id == ProjectMember.project_id, isouter=True)
                 .where(
                     (Project.owner_id == current_user.id) |
                     (ProjectMember.user_id == current_user.id)
                 )
                 .distinct()
                 .offset(skip).limit(limit)
             )
             projects = session.execute(statement).scalars().all()
             count = len(projects)

    # Populate workspace_name
    final_projects = []
    for p in projects:
        ws = session.get(Workspace, p.workspace_id)
        ws_name = ws.name if ws else "Unknown"
        # Manually construct dict from attributes
        p_dict = {c.name: getattr(p, c.name) for c in p.__table__.columns}
        p_dict["workspace_name"] = ws_name
        final_projects.append(ProjectPublicWithWorkspace(**p_dict))

    result = ProjectsPublic(data=final_projects, count=count)

    # Cache result
    try:
        redis_client_sync.setex(cache_key, 30, result.model_dump_json())
    except Exception:
        pass

    return result


@router.get("/{id}", response_model=ProjectPublic)
def read_project(session: SessionDep, current_user: CurrentUser, id: uuid.UUID) -> Any:
    """
    Get project by ID.
    """
    project = session.get(Project, id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Permission check
    if not current_user.is_superuser:
        # Check if owner
        if project.owner_id == current_user.id:
            pass
        else:
            # Check if project member
            pm = session.get(ProjectMember, (id, current_user.id))
            if pm:
                pass
            else:
                # Check if public and workspace member
                if not project.is_private:
                    wm = session.get(WorkspaceMember, (project.workspace_id, current_user.id))
                    if wm:
                         pass
                    else:
                         raise HTTPException(status_code=400, detail="Not enough permissions")
                else:
                     raise HTTPException(status_code=400, detail="Not enough permissions")

    return project


@router.post("/", response_model=ProjectPublic)
def create_project(
    *, session: SessionDep, current_user: CurrentUser, project_in: ProjectCreate
) -> Any:
    """
    Create new project.
    """
    # Verify workspace membership
    workspace = session.get(Workspace, project_in.workspace_id)
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")

    if not current_user.is_superuser:
        member = session.get(WorkspaceMember, (project_in.workspace_id, current_user.id))
        if not member:
             raise HTTPException(status_code=400, detail="Not a member of this workspace")

    project = Project(**project_in.model_dump(), owner_id= current_user.id)
    session.add(project)
    session.commit()
    session.refresh(project)

    # Add creator as Owner member
    member = ProjectMember(project_id=project.id, user_id=current_user.id, role="owner")
    session.add(member)
    session.commit()

    return project


@router.put("/{id}", response_model=ProjectPublic)
def update_project(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    id: uuid.UUID,
    project_in: ProjectUpdate,
) -> Any:
    """
    Update a project.
    """
    project = session.get(Project, id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if not current_user.is_superuser:
        if project.owner_id != current_user.id:
             # TODO: Allow admins?
             raise HTTPException(status_code=400, detail="Not enough permissions")

    update_dict = project_in.model_dump(exclude_unset=True)
    for key, value in update_dict.items():
        setattr(project, key, value)
    session.add(project)
    session.commit()
    session.refresh(project)
    return project



class ProjectMemberCreate(BaseModel):
    user_id: uuid.UUID
    role: str = "member"

@router.post("/{id}/members", response_model=Message)
def add_project_member(
    *, session: SessionDep, current_user: CurrentUser, id: uuid.UUID, member_in: ProjectMemberCreate
) -> Any:
    """
    Add a member to a project.
    """
    project = session.get(Project, id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Permission check: Only project owner (or admins?) can add members
    if not current_user.is_superuser:
        if project.owner_id != current_user.id:
             raise HTTPException(status_code=400, detail="Not enough permissions")

    # Check if user exists
    user = session.get(User, member_in.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Check if user is in workspace
    wm = session.get(WorkspaceMember, (project.workspace_id, member_in.user_id))
    if not wm:
        raise HTTPException(status_code=400, detail="User must be a member of the workspace first")

    # Check if already member
    pm = session.get(ProjectMember, (id, member_in.user_id))
    if pm:
        raise HTTPException(status_code=400, detail="User already in project")

    member = ProjectMember(project_id=id, user_id=member_in.user_id, role=member_in.role)
    session.add(member)
    session.commit()
    return Message(message="Member added successfully")


@router.get("/{id}/members", response_model=Any) # Using Any/custom helper response for MVP
def read_project_members(
    *, session: SessionDep, current_user: CurrentUser, id: uuid.UUID
) -> Any:
    """
    Get project members.
    """
    project = session.get(Project, id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Permission check
    if not current_user.is_superuser:
         # Members can see other members? Yes.
         # Public project? Yes.
         if project.owner_id != current_user.id:
             pm = session.get(ProjectMember, (id, current_user.id))
             if not pm and project.is_private:
                  raise HTTPException(status_code=400, detail="Not enough permissions")

    statement = (
        select(ProjectMember, User)
        .join(User, ProjectMember.user_id == User.id)
        .where(ProjectMember.project_id == id)
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

@router.delete("/{id}", response_model=Message)
def delete_project(
    session: SessionDep, current_user: CurrentUser, id: uuid.UUID
) -> Any:
    """
    Delete a project.
    """
    project = session.get(Project, id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if not current_user.is_superuser:
         if project.owner_id != current_user.id:
            raise HTTPException(status_code=400, detail="Not enough permissions")

    session.delete(project)
    session.commit()
    return Message(message="Project deleted successfully")
