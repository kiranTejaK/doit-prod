import uuid
from typing import Any

from fastapi import APIRouter, HTTPException
from sqlalchemy import func, select

from app.api.deps import CurrentUser, SessionDep
from app.models import Workspace, WorkspaceMember
from app.schemas import (
    Message,
    WorkspaceCreate,
    WorkspaceMemberPublic,
    WorkspaceMembersPublic,
    WorkspacePublic,
    WorkspacesPublic,
    WorkspaceUpdate,
)

router = APIRouter(prefix="/workspaces", tags=["workspaces"])


@router.get("/", response_model=WorkspacesPublic)
def read_workspaces(
    session: SessionDep, current_user: CurrentUser, skip: int = 0, limit: int = 100
) -> Any:
    """
    Retrieve workspaces.
    """
    # TODO: Filter by current_user membership
    # For now, just return all if superuser, or owned if normal?
    # Better: Join with WorkspaceMember to find workspaces the user belongs to.

    if current_user.is_superuser:
        count_statement = select(func.count()).select_from(Workspace)
        count = session.execute(count_statement).scalar_one()
        statement = select(Workspace).offset(skip).limit(limit)
        workspaces = session.execute(statement).scalars().all()
    else:
        # User's workspaces
        statement = (
            select(Workspace)
            .join(WorkspaceMember, Workspace.id == WorkspaceMember.workspace_id)
            .where(WorkspaceMember.user_id == current_user.id)
            .offset(skip)
            .limit(limit)
        )
        # Note: Count might be complex with join, doing simple count for now
        # Actually count only matches
        count_statement = (
             select(func.count())
             .select_from(Workspace)
             .join(WorkspaceMember, Workspace.id == WorkspaceMember.workspace_id)
             .where(WorkspaceMember.user_id == current_user.id)
        )
        count = session.execute(count_statement).scalar_one()
        workspaces = session.execute(statement).scalars().all()

    return WorkspacesPublic(data=workspaces, count=count)


@router.get("/{id}", response_model=WorkspacePublic)
def read_workspace(session: SessionDep, current_user: CurrentUser, id: uuid.UUID) -> Any:
    """
    Get workspace by ID.
    """
    workspace = session.get(Workspace, id)
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")

    if not current_user.is_superuser:
        # Check membership
        member = session.get(WorkspaceMember, (id, current_user.id))
        if not member:
             raise HTTPException(status_code=400, detail="Not enough permissions")

    return workspace


@router.post("/", response_model=WorkspacePublic)
def create_workspace(
    *, session: SessionDep, current_user: CurrentUser, workspace_in: WorkspaceCreate
) -> Any:
    """
    Create new workspace.
    """
    workspace = Workspace(**workspace_in.model_dump(), owner_id= current_user.id)
    session.add(workspace)
    session.commit()
    session.refresh(workspace)

    # Add creator as member (owner relation is separate, but usually creator is also a member)
    member = WorkspaceMember(workspace_id=workspace.id, user_id=current_user.id, role="owner")
    session.add(member)
    session.commit()

    return workspace


@router.put("/{id}", response_model=WorkspacePublic)
def update_workspace(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    id: uuid.UUID,
    workspace_in: WorkspaceUpdate,
) -> Any:
    """
    Update a workspace.
    """
    workspace = session.get(Workspace, id)
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")

    if not current_user.is_superuser:
        if workspace.owner_id != current_user.id:
             # Or check if admin role in member?
             raise HTTPException(status_code=400, detail="Not enough permissions")

    update_dict = workspace_in.model_dump(exclude_unset=True)
    for key, value in update_dict.items():
        setattr(workspace, key, value)
    session.add(workspace)
    session.commit()
    session.refresh(workspace)
    return workspace


@router.delete("/{id}", response_model=Message)
def delete_workspace(
    session: SessionDep, current_user: CurrentUser, id: uuid.UUID
) -> Any:
    """
    Delete a workspace.
    """
    workspace = session.get(Workspace, id)
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")

    if not current_user.is_superuser:
         if workspace.owner_id != current_user.id:
            raise HTTPException(status_code=400, detail="Not enough permissions")

    session.delete(workspace)
    session.commit()
    return Message(message="Workspace deleted successfully")


@router.get("/{id}/members", response_model=WorkspaceMembersPublic)
def read_workspace_members(
    session: SessionDep, current_user: CurrentUser, id: uuid.UUID, skip: int = 0, limit: int = 100
) -> Any:
    """
    Retrieve members of a workspace with roles.
    """
    workspace = session.get(Workspace, id)
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")

    # Check if current user is member
    if not current_user.is_superuser:
        member = session.get(WorkspaceMember, (id, current_user.id))
        if not member:
             raise HTTPException(status_code=403, detail="Not enough permissions")

    from app.models import User  # Import inside to avoid circular deps if any

    count_statement = (
        select(func.count())
        .select_from(User)
        .join(WorkspaceMember, User.id == WorkspaceMember.user_id)
        .where(WorkspaceMember.workspace_id == id)
    )
    count = session.execute(count_statement).scalar_one()

    # Select User and WorkspaceMember.role
    statement = (
        select(User, WorkspaceMember.role)
        .join(WorkspaceMember, User.id == WorkspaceMember.user_id)
        .where(WorkspaceMember.workspace_id == id)
        .offset(skip)
        .limit(limit)
    )
    results = session.execute(statement).scalars().all()

    # Transform to WorkspaceMemberPublic
    members_data = []
    for user, role in results:
        # We need a dict to pass to the Pydantic schema
        member_dict = {c.name: getattr(user, c.name) for c in user.__table__.columns}
        member_dict["role"] = role
        members_data.append(WorkspaceMemberPublic(**member_dict))

    return WorkspaceMembersPublic(data=members_data, count=count)
