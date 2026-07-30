import uuid
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models import Project, ProjectMember, User, Workspace, WorkspaceMember


def verify_workspace_membership(session: Session, workspace_id: uuid.UUID, user: User) -> WorkspaceMember:
    """Ensure user is a member of the workspace or a superuser."""
    if user.is_superuser:
        return WorkspaceMember(workspace_id=workspace_id, user_id=user.id, role="admin")

    member = session.get(WorkspaceMember, (workspace_id, user.id))
    if not member:
        raise HTTPException(status_code=400, detail="Not a member of this workspace")
    return member


def get_project_or_404(session: Session, project_id: uuid.UUID) -> Project:
    """Fetch project or raise 404."""
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


def verify_project_access(
    session: Session,
    project_id: uuid.UUID,
    user: User,
    require_owner: bool = False
) -> Project:
    """
    Verify user access to a project.
    If require_owner is True, enforces that the user is project owner, workspace admin/owner, or superuser.
    Access to view/edit project data requires explicit Project Membership or workspace owner/admin privileges.
    """
    project = get_project_or_404(session, project_id)

    if user.is_superuser or project.owner_id == user.id:
        return project

    # Workspace owners and admins also have management access to projects in their workspace
    wm = session.get(WorkspaceMember, (project.workspace_id, user.id))
    if wm and wm.role in ["owner", "admin"]:
        return project

    if require_owner:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    # Check explicit project membership
    pm = session.get(ProjectMember, (project_id, user.id))
    if pm:
        return project

    raise HTTPException(
        status_code=403,
        detail="Access denied. You are not a member of this project."
    )

