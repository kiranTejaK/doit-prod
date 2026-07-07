
import os
import shutil
import uuid
from pathlib import Path
from typing import Any

from fastapi import APIRouter, File, HTTPException, UploadFile
from sqlalchemy import func, select

from app.api.deps import CurrentUser, SessionDep
from app.core import s3
from app.models import Attachment, Project, ProjectMember, Task
from app.schemas import AttachmentPublic, AttachmentsPublic, Message

router = APIRouter(prefix="/attachments", tags=["attachments"])

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


@router.get("/", response_model=AttachmentsPublic)
def read_attachments(
    session: SessionDep,
    current_user: CurrentUser,
    task_id: uuid.UUID,
    skip: int = 0,
    limit: int = 100,
) -> Any:
    """
    Retrieve attachments for a task.
    """
    task = session.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    # Check permissions
    project = session.get(Project, task.project_id)
    if not current_user.is_superuser:
        if project.owner_id != current_user.id:
            member = session.get(ProjectMember, (project.id, current_user.id))
            if not member and project.is_private:
                raise HTTPException(status_code=400, detail="Not enough permissions")

    statement = select(Attachment).where(Attachment.task_id == task_id).order_by(Attachment.created_at.desc())
    count_statement = select(func.count()).select_from(statement.subquery())
    count = session.execute(count_statement).scalar_one()
    statement = statement.offset(skip).limit(limit)
    attachments = session.execute(statement).scalars().all()

    return AttachmentsPublic(data=attachments, count=count)


@router.post("/", response_model=AttachmentPublic)
def create_attachment(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    task_id: uuid.UUID,
    comment_id: uuid.UUID | None = None,
    file: UploadFile = File(...)
) -> Any:
    """
    Upload an attachment file.
    """
    task = session.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    # Check permissions
    project = session.get(Project, task.project_id)
    if not current_user.is_superuser:
        if project.owner_id != current_user.id:
           member = session.get(ProjectMember, (project.id, current_user.id))
           if not member:
               raise HTTPException(status_code=400, detail="Not enough permissions")

    # Save file
    file_id = uuid.uuid4()
    file_ext = os.path.splitext(file.filename)[1]
    safe_filename = f"{file_id}{file_ext}"

    # Try S3 upload first if configured
    if s3.get_s3_client():
        s3_key = f"attachments/{safe_filename}"
        if s3.upload_file_to_s3(file.file, s3_key, file.content_type):
             file_path_str = s3_key
             # Get size from file object if possible, or 0
             file_size = file.size or 0
        else:
             raise HTTPException(status_code=500, detail="Failed to upload to S3")
    else:
        # Fallback to local
        file_path = UPLOAD_DIR / safe_filename
        try:
            with file_path.open("wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
            file_path_str = str(file_path)
            file_size = file_path.stat().st_size
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Could not save file: {str(e)}")

    attachment = Attachment(
        task_id=task_id,
        comment_id=comment_id,
        user_id=current_user.id,
        file_name=file.filename,
        file_path=file_path_str,
        file_type=file.content_type or "application/octet-stream",
        file_size=file_size or 0
    )

    session.add(attachment)
    session.commit()
    session.refresh(attachment)

    return attachment


@router.delete("/{id}", response_model=Message)
def delete_attachment(
    session: SessionDep, current_user: CurrentUser, id: uuid.UUID
) -> Any:
    """
    Delete an attachment.
    """
    attachment = session.get(Attachment, id)
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")

    if not current_user.is_superuser and attachment.user_id != current_user.id:
         # Or project owner?
         raise HTTPException(status_code=400, detail="Not enough permissions")

    # Delete file
    if s3.get_s3_client() and not attachment.file_path.startswith(str(UPLOAD_DIR)):
         # Assume S3 key
         s3.delete_file_from_s3(attachment.file_path)
    else:
        # Local file
        file_path = Path(attachment.file_path)
        if file_path.exists():
            try:
                file_path.unlink()
            except Exception:
                pass # Warn?

    session.delete(attachment)
    session.commit()
    return Message(message="Attachment deleted successfully")

@router.get("/{id}/url", response_model=Message)
def get_attachment_url(
    session: SessionDep, current_user: CurrentUser, id: uuid.UUID
) -> Any:
    """
    Get a download/view URL for the attachment.
    """
    attachment = session.get(Attachment, id)
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")

    # Check permissions (same as read)
    project = session.get(Project, attachment.task.project_id)
    if not current_user.is_superuser:
         if project.owner_id != current_user.id:
            member = session.get(ProjectMember, (project.id, current_user.id))
            if not member and project.is_private:
                raise HTTPException(status_code=400, detail="Not enough permissions")

    if s3.get_s3_client() and not attachment.file_path.startswith("uploads"):
         url = s3.get_presigned_url(attachment.file_path)
         if not url:
             raise HTTPException(status_code=500, detail="Could not generate URL")
         return Message(message=url)
    else:
        # Local file - return a static path if we were serving static files,
        # or implement a stream response. For now, assuming direct file serving isn't fully set up.
        # But let's return a relative path that Frontend might use if we mount static.
        # We did not see StaticFiles mounted in main.py for 'uploads'.
        # We might need to add that.
        # For now, return the path.
        return Message(message=f"/uploads/{os.path.basename(attachment.file_path)}")
