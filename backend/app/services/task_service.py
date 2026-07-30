import uuid

from fastapi import BackgroundTasks, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Project, ProjectMember, Task, User, Workspace
from app.schemas import (
    Message,
    TaskCreate,
    TaskPublicWithProject,
    TasksPublicWithProject,
    TaskUpdate,
)
from app.services.auth_policy import verify_project_access
from app.utils import generate_task_assignment_email, run_with_retries, send_email


def get_tasks(
    session: Session,
    current_user: User,
    project_id: uuid.UUID | None = None,
    assignee_id: uuid.UUID | None = None,
    skip: int = 0,
    limit: int = 100,
) -> TasksPublicWithProject:
    """
    Retrieve tasks with efficient database counting and eager-loaded project relationship.
    """
    if current_user.is_superuser:
        statement = select(Task, Project).join(Project, Task.project_id == Project.id)
        if project_id:
            statement = statement.where(Task.project_id == project_id)
        if assignee_id:
            statement = statement.where(Task.assignee_id == assignee_id)

        count_statement = select(func.count(Task.id)).select_from(statement.subquery())
        count = session.execute(count_statement).scalar_one()

        statement = statement.offset(skip).limit(limit)
        results = session.execute(statement).all()
    else:
        if project_id:
            verify_project_access(session, project_id, current_user)
            statement = (
                select(Task, Project)
                .join(Project, Task.project_id == Project.id)
                .where(Task.project_id == project_id)
            )
        else:
            statement = (
                select(Task, Project)
                .join(Project, Task.project_id == Project.id)
                .join(
                    ProjectMember, Project.id == ProjectMember.project_id, isouter=True
                )
                .where(
                    (Project.owner_id == current_user.id)
                    | (ProjectMember.user_id == current_user.id)
                )
                .distinct()
            )

        if assignee_id:
            statement = statement.where(Task.assignee_id == assignee_id)

        count_statement = select(func.count(Task.id)).select_from(statement.subquery())
        count = session.execute(count_statement).scalar_one()

        statement = statement.offset(skip).limit(limit)
        results = session.execute(statement).all()

    tasks_data = []
    for task, project in results:
        task_dict = {c.name: getattr(task, c.name) for c in task.__table__.columns}
        task_dict["project_name"] = project.name
        task_dict["project_color"] = project.color
        tasks_data.append(TaskPublicWithProject(**task_dict))

    return TasksPublicWithProject(data=tasks_data, count=count)


def get_task(session: Session, current_user: User, task_id: uuid.UUID) -> Task:
    """Get a task by ID with authorization check."""
    task = session.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    verify_project_access(session, task.project_id, current_user)
    return task


def _queue_assignment_email(
    background_tasks: BackgroundTasks,
    session: Session,
    task: Task,
    project: Project,
) -> None:
    """Helper to prepare and queue assignment email with retry wrapper."""
    if not task.assignee_id:
        return

    assignee = session.get(User, task.assignee_id)
    if assignee:
        workspace = session.get(Workspace, project.workspace_id)
        workspace_name = workspace.name if workspace else "Unknown Workspace"
        email_data = generate_task_assignment_email(
            email_to=assignee.email,
            task_title=task.title,
            project_name=project.name,
            workspace_name=workspace_name,
            assignee_name=assignee.full_name or assignee.email,
        )

        background_tasks.add_task(
            run_with_retries,
            send_email,
            max_retries=3,
            base_delay=2.0,
            email_to=assignee.email,
            subject=email_data.subject,
            html_content=email_data.html_content,
        )


def create_task(
    session: Session,
    current_user: User,
    task_in: TaskCreate,
    background_tasks: BackgroundTasks,
) -> Task:
    """Create a new task and non-blockingly queue assignment emails."""
    project = verify_project_access(session, task_in.project_id, current_user)

    if not task_in.assignee_id:
        raise HTTPException(
            status_code=400, detail="An assignee is required for all tasks"
        )

    pm = session.get(ProjectMember, (task_in.project_id, task_in.assignee_id))
    if not pm and project.owner_id != task_in.assignee_id:
        raise HTTPException(
            status_code=400, detail="Assignee is not a member of this project"
        )

    task = Task(**task_in.model_dump(), owner_id=current_user.id)

    session.add(task)
    session.commit()
    session.refresh(task)

    _queue_assignment_email(background_tasks, session, task, project)

    return task


def update_task(
    session: Session,
    current_user: User,
    task_id: uuid.UUID,
    task_in: TaskUpdate,
    background_tasks: BackgroundTasks,
) -> Task:
    """Update a task and non-blockingly queue assignment emails if assignee changed."""
    task = session.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    project = verify_project_access(session, task.project_id, current_user)

    old_assignee_id = task.assignee_id

    update_dict = task_in.model_dump(exclude_unset=True)
    for key, value in update_dict.items():
        setattr(task, key, value)

    if task.assignee_id and task.assignee_id != old_assignee_id:
        pm = session.get(ProjectMember, (task.project_id, task.assignee_id))
        if not pm and project.owner_id != task.assignee_id:
            raise HTTPException(
                status_code=400, detail="Assignee is not a member of this project"
            )

    session.add(task)
    session.commit()
    session.refresh(task)

    if task.assignee_id and task.assignee_id != old_assignee_id:
        _queue_assignment_email(background_tasks, session, task, project)

    return task


def delete_task(session: Session, current_user: User, task_id: uuid.UUID) -> Message:
    """Delete a task (requires project owner, task owner, or superuser)."""
    task = session.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if not current_user.is_superuser and task.owner_id != current_user.id:
        verify_project_access(
            session, task.project_id, current_user, require_owner=True
        )

    session.delete(task)
    session.commit()
    return Message(message="Task deleted successfully")
