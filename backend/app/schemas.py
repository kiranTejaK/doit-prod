import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class BaseSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

# User Schemas
class UserBase(BaseSchema):
    email: EmailStr = Field(max_length=255)
    is_active: bool = True
    is_superuser: bool = False
    full_name: str | None = Field(default=None, max_length=255)
    job_title: str | None = Field(default=None, max_length=255)
    avatar_url: str | None = Field(default=None, max_length=512)

class UserCreate(UserBase):
    password: str = Field(min_length=8, max_length=128)

class UserRegister(BaseSchema):
    email: EmailStr = Field(max_length=255)
    password: str = Field(min_length=8, max_length=128)
    full_name: str | None = Field(default=None, max_length=255)

class UserUpdate(UserBase):
    email: EmailStr | None = Field(default=None, max_length=255)
    password: str | None = Field(default=None, min_length=8, max_length=128)

class UserUpdateMe(BaseSchema):
    full_name: str | None = Field(default=None, max_length=255)
    email: EmailStr | None = Field(default=None, max_length=255)
    job_title: str | None = Field(default=None, max_length=255)
    avatar_url: str | None = Field(default=None, max_length=512)

class UpdatePassword(BaseSchema):
    current_password: str = Field(min_length=8, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)

class UserPublic(UserBase):
    id: uuid.UUID
    job_title: str | None = None
    avatar_url: str | None = None

class UsersPublic(BaseSchema):
    data: list[UserPublic]
    count: int

# Workspace Member Schemas
class WorkspaceMemberPublic(UserPublic):
    role: str

class WorkspaceMembersPublic(BaseSchema):
    data: list[WorkspaceMemberPublic]
    count: int

# Item Schemas
class ItemBase(BaseSchema):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=255)

class ItemCreate(ItemBase):
    pass

class ItemUpdate(ItemBase):
    title: str | None = Field(default=None, min_length=1, max_length=255)

class ItemPublic(ItemBase):
    id: uuid.UUID
    owner_id: uuid.UUID

class ItemsPublic(BaseSchema):
    data: list[ItemPublic]
    count: int

# Workspace Schemas
class WorkspaceBase(BaseSchema):
    name: str = Field(max_length=255)
    description: str | None = Field(default=None, max_length=255)

class WorkspaceCreate(WorkspaceBase):
    pass

class WorkspaceUpdate(WorkspaceBase):
    name: str | None = Field(default=None, max_length=255)

class WorkspacePublic(WorkspaceBase):
    id: uuid.UUID
    owner_id: uuid.UUID

class WorkspacesPublic(BaseSchema):
    data: list[WorkspacePublic]
    count: int

# Project Schemas
class ProjectBase(BaseSchema):
    name: str = Field(max_length=255)
    description: str | None = Field(default=None, max_length=255)
    color: str | None = Field(default="#000000", max_length=7)
    icon: str | None = Field(default=None, max_length=50)
    is_private: bool = Field(default=False)

class ProjectCreate(ProjectBase):
    workspace_id: uuid.UUID

class ProjectUpdate(ProjectBase):
    name: str | None = Field(default=None, max_length=255)
    is_private: bool | None = Field(default=None)

class ProjectPublic(ProjectBase):
    id: uuid.UUID
    workspace_id: uuid.UUID
    owner_id: uuid.UUID

class ProjectPublicWithWorkspace(ProjectPublic):
    workspace_name: str

class ProjectsPublic(BaseSchema):
    data: list[ProjectPublicWithWorkspace]
    count: int

# Section Schemas
class SectionBase(BaseSchema):
    title: str = Field(max_length=255)
    order: float = Field(default=0.0)

class SectionCreate(SectionBase):
    project_id: uuid.UUID

class SectionUpdate(SectionBase):
    title: str | None = Field(default=None, max_length=255)
    order: float | None = Field(default=None)

class SectionPublic(SectionBase):
    id: uuid.UUID
    project_id: uuid.UUID

class SectionsPublic(BaseSchema):
    data: list[SectionPublic]
    count: int

# Task Schemas
class TaskBase(BaseSchema):
    title: str = Field(max_length=255)
    description: str | None = Field(default=None, max_length=255)
    status: str = Field(default="todo")
    priority: str = Field(default="medium")
    due_date: str | None = Field(default=None)

class TaskCreate(TaskBase):
    project_id: uuid.UUID
    section_id: uuid.UUID | None = None
    assignee_id: uuid.UUID | None = None

class TaskUpdate(TaskBase):
    title: str | None = Field(default=None, max_length=255)
    status: str | None = Field(default=None)
    priority: str | None = Field(default=None)
    section_id: uuid.UUID | None = Field(default=None)

class TaskPublic(TaskBase):
    id: uuid.UUID
    project_id: uuid.UUID
    section_id: uuid.UUID | None
    owner_id: uuid.UUID
    assignee_id: uuid.UUID | None

class TasksPublic(BaseSchema):
    data: list[TaskPublic]
    count: int

class TaskPublicWithProject(TaskPublic):
    project_name: str
    project_color: str | None = None

class TasksPublicWithProject(BaseSchema):
    data: list[TaskPublicWithProject]
    count: int

# Comment Schemas
class CommentBase(BaseSchema):
    content: str

class CommentCreate(CommentBase):
    task_id: uuid.UUID
    attachment_ids: list[uuid.UUID] | None = None

class CommentUpdate(CommentBase):
    content: str | None = Field(default=None)

class CommentPublic(CommentBase):
    id: uuid.UUID
    task_id: uuid.UUID
    user_id: uuid.UUID
    created_at: datetime
    user_full_name: str | None = None

class CommentsPublic(BaseSchema):
    data: list[CommentPublic]
    count: int

# Activity Log Schemas
class ActivityLogBase(BaseSchema):
    action: str
    details: str | None = None

class ActivityLogPublic(ActivityLogBase):
    id: uuid.UUID
    task_id: uuid.UUID
    user_id: uuid.UUID
    created_at: datetime

class ActivityLogsPublic(BaseSchema):
    data: list[ActivityLogPublic]
    count: int

# Attachment Schemas
class AttachmentBase(BaseSchema):
    file_name: str
    file_path: str
    file_type: str
    file_size: int

class AttachmentPublic(AttachmentBase):
    id: uuid.UUID
    task_id: uuid.UUID
    user_id: uuid.UUID
    comment_id: uuid.UUID | None = None
    created_at: datetime

class AttachmentsPublic(BaseSchema):
    data: list[AttachmentPublic]
    count: int

# Invitation Schemas
class InvitationBase(BaseSchema):
    email: EmailStr = Field(max_length=255)
    role: str = Field(default="member")
    status: str = Field(default="pending")

class InvitationCreate(InvitationBase):
    workspace_id: uuid.UUID

class InvitationPublic(InvitationBase):
    id: uuid.UUID
    workspace_id: uuid.UUID
    inviter_id: uuid.UUID
    expires_at: datetime
    created_at: datetime

# Misc Schemas
class Message(BaseSchema):
    message: str

class Token(BaseSchema):
    access_token: str
    token_type: str = "bearer"

class TokenPayload(BaseSchema):
    sub: str | None = None

class NewPassword(BaseSchema):
    token: str
    new_password: str = Field(min_length=8, max_length=128)

class VerifyEmail(BaseSchema):
    token: str
