import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import structlog
from fastapi import APIRouter, HTTPException
from sqlmodel import select

from app.api import deps
from app.core.config import settings
from app.models import Invitation, User, Workspace, WorkspaceMember
from app.schemas import InvitationCreate, InvitationPublic, Message
from app.utils import generate_workspace_invitation_email, send_email

router = APIRouter()
logger = structlog.get_logger()

@router.post("/", response_model=InvitationPublic)
def create_invitation(
    *,
    session: deps.SessionDep,
    current_user: deps.CurrentUser,
    invitation_in: InvitationCreate,
) -> Any:
    """
    Create an invitation for a user to join a workspace.
    """
    # Check if workspace exists
    workspace = session.get(Workspace, invitation_in.workspace_id)
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")

    # Check permission (inviter must be a member of the workspace)
    member = session.execute(
        select(WorkspaceMember)
        .where(WorkspaceMember.workspace_id == invitation_in.workspace_id)
        .where(WorkspaceMember.user_id == current_user.id)
    ).scalars().first()

    if not member:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    # Check if user is already a member
    # Find user by email
    user_by_email = session.execute(select(User).where(User.email == invitation_in.email)).scalars().first()
    if user_by_email:
        existing_member = session.execute(
            select(WorkspaceMember)
            .where(WorkspaceMember.workspace_id == invitation_in.workspace_id)
            .where(WorkspaceMember.user_id == user_by_email.id)
        ).scalars().first()
        if existing_member:
            raise HTTPException(status_code=400, detail="User is already a member of this workspace")

    # Check if pending invitation exists
    existing_invitation = session.execute(
        select(Invitation)
        .where(Invitation.workspace_id == invitation_in.workspace_id)
        .where(Invitation.email == invitation_in.email)
        .where(Invitation.status == "pending")
    ).scalars().first()

    if existing_invitation:
        # Check if expired, if so, delete it or re-send?
        if existing_invitation.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
             session.delete(existing_invitation)
             session.commit()
        else:
             raise HTTPException(status_code=400, detail="Invitation already sent")

    # Create invitation
    token = str(uuid.uuid4())
    expires_at = datetime.now(timezone.utc) + timedelta(days=7) # 7 days expiry

    invitation = Invitation(
        **invitation_in.model_dump(),
        token=token,
        expires_at=expires_at,
        inviter_id=current_user.id
    )
    session.add(invitation)
    session.commit()
    session.refresh(invitation)

    # Send email
    if settings.emails_enabled:
        invite_link = f"{settings.FRONTEND_HOST}/accept-invite?token={token}"
        email_data = generate_workspace_invitation_email(
            workspace_name=workspace.name,
            inviter_name=current_user.full_name or current_user.email,
            inviter_email=current_user.email,
            link=invite_link
        )
        send_email(
            email_to=invitation.email,
            subject=email_data.subject,
            html_content=email_data.html_content
        )

    return invitation


@router.get("/{token}", response_model=InvitationPublic)
def get_invitation(
    *,
    session: deps.SessionDep,
    token: str,
) -> Any:
    """
    Get invitation details by token.
    """
    invitation = session.execute(select(Invitation).where(Invitation.token == token)).scalars().first()
    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found")

    if invitation.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Invitation expired")

    if invitation.status != "pending":
         raise HTTPException(status_code=400, detail="Invitation already accepted or invalid")

    return invitation


@router.post("/accept", response_model=Message)
def accept_invitation(
    *,
    session: deps.SessionDep,
    current_user: deps.CurrentUser,
    token: str,
) -> Any:
    """
    Accept an invitation.
    """
    invitation = session.execute(select(Invitation).where(Invitation.token == token)).scalars().first()
    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found")

    if invitation.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Invitation expired")

    if invitation.status != "pending":
         raise HTTPException(status_code=400, detail="Invitation already accepted")

    # Update invitation status
    invitation.status = "accepted"
    session.add(invitation)

    # Add user to workspace
    # Check if already member (double check)
    existing_member = session.execute(
        select(WorkspaceMember)
        .where(WorkspaceMember.workspace_id == invitation.workspace_id)
        .where(WorkspaceMember.user_id == current_user.id)
    ).scalars().first()

    if not existing_member:
        member = WorkspaceMember(
            workspace_id=invitation.workspace_id,
            user_id=current_user.id,
            role=invitation.role
        )
        session.add(member)

    session.commit()

    return Message(message="Invitation accepted successfully")
