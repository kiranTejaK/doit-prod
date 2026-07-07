
import uuid
from typing import Any

from fastapi import APIRouter, HTTPException
from sqlalchemy import func, select

from app.api.deps import CurrentUser, SessionDep
from app.models import Project, ProjectMember, Task, User, Workspace
from app.schemas import (
    Message,
    TaskCreate,
    TaskPublic,
    TaskPublicWithProject,
    TasksPublicWithProject,
    TaskUpdate,
)
from app.utils import generate_task_assignment_email, send_email

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.get("/", response_model=TasksPublicWithProject)
def read_tasks(
    session: SessionDep,
    current_user: CurrentUser,
    project_id: uuid.UUID | None = None,
    assignee_id: uuid.UUID | None = None,
    skip: int = 0,
    limit: int = 100
) -> Any:
    """
    Retrieve tasks. Option filters by project_id.
    """
    if current_user.is_superuser:
        statement = select(Task, Project).join(Project, Task.project_id == Project.id)
        if project_id:
            statement = statement.where(Task.project_id == project_id)
        if assignee_id:
            statement = statement.where(Task.assignee_id == assignee_id)

        count_statement = select(func.count()).select_from(statement.subquery())
        count = session.execute(count_statement).scalar_one()
        statement = statement.offset(skip).limit(limit)
        results = session.execute(statement).all()

        tasks_data = []
        for task, project in results:
            # Manually construct dict from attributes
            task_dict = {c.name: getattr(task, c.name) for c in task.__table__.columns}
            task_dict["project_name"] = project.name
            task_dict["project_color"] = project.color
            tasks_data.append(TaskPublicWithProject(**task_dict))

    else:
        # Access Control:
        # User must be a member of the project to see tasks in it.
        # If no project_id, shows tasks from all projects user is member of.

        if project_id:
             # Check project membership
            project = session.get(Project, project_id)
            if not project:
                  raise HTTPException(status_code=404, detail="Project not found")

            if project.owner_id != current_user.id:
                 member = session.get(ProjectMember, (project_id, current_user.id))
                 if not member and project.is_private:
                      # If public project in workspace user is member of... complicated.
                      # Sticking to explicit project membership or ownership for now safe default.
                      # TODO: Expand to Workspace members if project is Public
                      raise HTTPException(status_code=400, detail="Not a member of this project")

            statement = select(Task, Project).join(Project, Task.project_id == Project.id)
            statement = statement.where(Task.project_id == project_id)
        else:
             # Filter by projects user is member/owner of
             # SELECT * FROM task JOIN project ...
             # Simplified: JOIN ProjectMember
             statement = (
                 select(Task, Project)
                 .join(Project, Task.project_id == Project.id)
                 .join(ProjectMember, Project.id == ProjectMember.project_id, isouter=True)
                 .where(
                     (Project.owner_id == current_user.id) |
                     (ProjectMember.user_id == current_user.id)
                 )
                 .distinct()
             )

        # Apply filters
        if assignee_id:
             statement = statement.where(Task.assignee_id == assignee_id)

        count_statement = select(func.count()).select_from(statement.subquery())
        # count = session.execute(count_statement).scalar_one() # Error with distinct sometimes?

        # Simple count
        results = session.execute(statement).all()
        count = len(results)

        results_page = results[skip : skip + limit]

        tasks_data = []
        for task, project in results_page:
            task_dict = {c.name: getattr(task, c.name) for c in task.__table__.columns}
            task_dict["project_name"] = project.name
            task_dict["project_color"] = project.color
            tasks_data.append(TaskPublicWithProject(**task_dict))

    return TasksPublicWithProject(data=tasks_data, count=count)


@router.get("/{id}", response_model=TaskPublic)
def read_task(session: SessionDep, current_user: CurrentUser, id: uuid.UUID) -> Any:
    """
    Get task by ID.
    """
    task = session.get(Task, id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    # Permission check
    if not current_user.is_superuser:
        project = session.get(Project, task.project_id)
        if project.owner_id != current_user.id:
             member = session.get(ProjectMember, (project.id, current_user.id))
             if not member:
                  raise HTTPException(status_code=400, detail="Not enough permissions")

    return task


@router.post("/", response_model=TaskPublic)
def create_task(
    *, session: SessionDep, current_user: CurrentUser, task_in: TaskCreate
) -> Any:
    """
    Create new task.
    """
    # Verify project membership
    project = session.get(Project, task_in.project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if not current_user.is_superuser:
        if project.owner_id != current_user.id:
            member = session.get(ProjectMember, (project.id, current_user.id))
            if not member:
                 raise HTTPException(status_code=400, detail="Not a member of this project")

    task = Task(**task_in.model_dump(), owner_id= current_user.id)

    # Validate assignee membership
    if task.assignee_id:
        # Assignee must be member of project
        pm = session.get(ProjectMember, (task.project_id, task.assignee_id))
        if not pm:
             # Check if assignee is owner?
             target_project = session.get(Project, task.project_id)
             if target_project.owner_id != task.assignee_id:
                  raise HTTPException(status_code=400, detail="Assignee is not a member of this project")

    session.add(task)
    session.commit()
    session.refresh(task)

    if task.assignee_id:
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
            send_email(
                email_to=assignee.email,
                subject=email_data.subject,
                html_content=email_data.html_content,
            )

    return task


@router.put("/{id}", response_model=TaskPublic)
def update_task(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    id: uuid.UUID,
    task_in: TaskUpdate,
) -> Any:
    """
    Update a task.
    """
    task = session.get(Task, id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    # Check permissions (Member of project can update? Or only Assignee/Owner?)
    # For now, any project member can update tasks (Collaboration)
    if not current_user.is_superuser:
         project = session.get(Project, task.project_id)
         if project.owner_id != current_user.id:
             member = session.get(ProjectMember, (project.id, current_user.id))
             if not member:
                  raise HTTPException(status_code=400, detail="Not enough permissions")

    # Capture old assignee before update
    old_assignee_id = task.assignee_id

    update_dict = task_in.model_dump(exclude_unset=True)
    for key, value in update_dict.items():
        setattr(task, key, value)

    # Validate new assignee membership
    if task.assignee_id and task.assignee_id != old_assignee_id:
        pm = session.get(ProjectMember, (task.project_id, task.assignee_id))
        if not pm:
             target_project = session.get(Project, task.project_id)
             if target_project.owner_id != task.assignee_id:
                  raise HTTPException(status_code=400, detail="Assignee is not a member of this project")

    session.add(task)
    session.commit()
    session.refresh(task)

    if task.assignee_id and task.assignee_id != old_assignee_id:
        assignee = session.get(User, task.assignee_id)
        if assignee:
            project = session.get(Project, task.project_id)
            workspace = session.get(Workspace, project.workspace_id)
            workspace_name = workspace.name if workspace else "Unknown Workspace"
            email_data = generate_task_assignment_email(
                email_to=assignee.email,
                task_title=task.title,
                project_name=project.name,
                workspace_name=workspace_name,
                assignee_name=assignee.full_name or assignee.email,
            )
            send_email(
                email_to=assignee.email,
                subject=email_data.subject,
                html_content=email_data.html_content,
            )

    return task


@router.delete("/{id}", response_model=Message)
def delete_task(
    session: SessionDep, current_user: CurrentUser, id: uuid.UUID
) -> Any:
    """
    Delete a task.
    """
    task = session.get(Task, id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if not current_user.is_superuser:
         # Only Project Owner or Task Creator (Owner) can delete?
         if task.owner_id != current_user.id:
              project = session.get(Project, task.project_id)
              if project.owner_id != current_user.id:
                  raise HTTPException(status_code=400, detail="Not enough permissions")

    session.delete(task)
    session.commit()
    return Message(message="Task deleted successfully")
