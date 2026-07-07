import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass

class WorkspaceMember(Base):
    __tablename__ = "workspacemember"
    workspace_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workspace.id"), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user.id"), primary_key=True)
    role: Mapped[str] = mapped_column(String, default="member")

class ProjectMember(Base):
    __tablename__ = "projectmember"
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("project.id"), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user.id"), primary_key=True)
    role: Mapped[str] = mapped_column(String, default="viewer")

class User(Base):
    __tablename__ = "user"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_superuser: Mapped[bool] = mapped_column(Boolean, default=False)
    full_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    job_title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(String(512), nullable=True)

    items: Mapped[list["Item"]] = relationship(back_populates="owner", cascade="all, delete-orphan")
    workspaces: Mapped[list["Workspace"]] = relationship(secondary="workspacemember", back_populates="members")
    projects: Mapped[list["Project"]] = relationship(secondary="projectmember", back_populates="members")

class Item(Base):
    __tablename__ = "item"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user.id", ondelete="CASCADE"))

    owner: Mapped[Optional["User"]] = relationship(back_populates="items")

class Workspace(Base):
    __tablename__ = "workspace"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user.id"))

    members: Mapped[list["User"]] = relationship(secondary="workspacemember", back_populates="workspaces")
    projects: Mapped[list["Project"]] = relationship(back_populates="workspace", cascade="all, delete-orphan")

class Project(Base):
    __tablename__ = "project"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    color: Mapped[str | None] = mapped_column(String(7), default="#000000")
    icon: Mapped[str | None] = mapped_column(String(50), nullable=True)
    is_private: Mapped[bool] = mapped_column(Boolean, default=False)
    workspace_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workspace.id"))
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user.id"))

    workspace: Mapped["Workspace"] = relationship(back_populates="projects")
    members: Mapped[list["User"]] = relationship(secondary="projectmember", back_populates="projects")
    tasks: Mapped[list["Task"]] = relationship(back_populates="project", cascade="all, delete-orphan")
    sections: Mapped[list["Section"]] = relationship(back_populates="project", cascade="all, delete-orphan")

class Section(Base):
    __tablename__ = "section"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(255))
    order: Mapped[float] = mapped_column(Float, default=0.0)
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("project.id"))

    project: Mapped["Project"] = relationship(back_populates="sections")
    tasks: Mapped[list["Task"]] = relationship(back_populates="section")

class Task(Base):
    __tablename__ = "task"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String, default="todo")
    priority: Mapped[str] = mapped_column(String, default="medium")
    due_date: Mapped[str | None] = mapped_column(String, nullable=True)

    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("project.id"))
    section_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("section.id"), nullable=True)
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user.id"))
    assignee_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("user.id"), nullable=True)

    project: Mapped["Project"] = relationship(back_populates="tasks")
    section: Mapped[Optional["Section"]] = relationship(back_populates="tasks")
    comments: Mapped[list["Comment"]] = relationship(back_populates="task", cascade="all, delete-orphan")
    activity_logs: Mapped[list["ActivityLog"]] = relationship(back_populates="task", cascade="all, delete-orphan")
    attachments: Mapped[list["Attachment"]] = relationship(back_populates="task", cascade="all, delete-orphan")

class Comment(Base):
    __tablename__ = "comment"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    content: Mapped[str] = mapped_column(String)
    task_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("task.id"))
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    task: Mapped["Task"] = relationship(back_populates="comments")
    attachments: Mapped[list["Attachment"]] = relationship(back_populates="comment", cascade="all, delete-orphan")

class ActivityLog(Base):
    __tablename__ = "activitylog"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    action: Mapped[str] = mapped_column(String)
    details: Mapped[str | None] = mapped_column(String, nullable=True)
    task_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("task.id"))
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    task: Mapped["Task"] = relationship(back_populates="activity_logs")

class Attachment(Base):
    __tablename__ = "attachment"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    file_name: Mapped[str] = mapped_column(String)
    file_path: Mapped[str] = mapped_column(String)
    file_type: Mapped[str] = mapped_column(String)
    file_size: Mapped[int] = mapped_column(Integer)

    task_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("task.id"))
    comment_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("comment.id"), nullable=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    task: Mapped["Task"] = relationship(back_populates="attachments")
    comment: Mapped[Optional["Comment"]] = relationship(back_populates="attachments")

class Invitation(Base):
    __tablename__ = "invitation"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), index=True)
    role: Mapped[str] = mapped_column(String, default="member")
    status: Mapped[str] = mapped_column(String, default="pending")
    token: Mapped[str] = mapped_column(String, unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    workspace_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workspace.id"))
    inviter_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user.id"))

    workspace: Mapped["Workspace"] = relationship()
    inviter: Mapped["User"] = relationship()
