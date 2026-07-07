
import uuid
from typing import Any

from fastapi import APIRouter, HTTPException
from sqlalchemy import func, select

from app.api.deps import CurrentUser, SessionDep
from app.models import Project, ProjectMember, Section
from app.schemas import (
    Message,
    SectionCreate,
    SectionPublic,
    SectionsPublic,
    SectionUpdate,
)

router = APIRouter(prefix="/sections", tags=["sections"])


@router.get("/", response_model=SectionsPublic)
def read_sections(
    session: SessionDep,
    current_user: CurrentUser,
    project_id: uuid.UUID,
    skip: int = 0,
    limit: int = 100
) -> Any:
    """
    Retrieve sections for a project. Project ID is required.
    """
    # Check project existence and permissions
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if not current_user.is_superuser:
        if project.owner_id != current_user.id:
             member = session.get(ProjectMember, (project_id, current_user.id))
             # If project is private and user is not member -> 400/404
             if not member and project.is_private:
                  raise HTTPException(status_code=400, detail="Not a member of this project")
             # If public, minimal access allowed? For now sections are part of project structure, so likely read access is fine for public projects.

    statement = select(Section).where(Section.project_id == project_id).order_by(Section.order)
    count_statement = select(func.count()).select_from(statement.subquery())
    count = session.execute(count_statement).scalar_one()
    statement = statement.offset(skip).limit(limit)
    sections = session.execute(statement).scalars().all()

    return SectionsPublic(data=sections, count=count)


@router.post("/", response_model=SectionPublic)
def create_section(
    *, session: SessionDep, current_user: CurrentUser, section_in: SectionCreate
) -> Any:
    """
    Create new section.
    """
    project = session.get(Project, section_in.project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if not current_user.is_superuser:
        if project.owner_id != current_user.id:
            member = session.get(ProjectMember, (project.id, current_user.id))
            if not member:
                 raise HTTPException(status_code=400, detail="Not a member of this project")
            # Maybe restrict section creation to Editor/Admin role? For now all members.

    section = Section.model_validate(section_in)
    session.add(section)
    session.commit()
    session.refresh(section)
    return section


@router.put("/{id}", response_model=SectionPublic)
def update_section(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    id: uuid.UUID,
    section_in: SectionUpdate,
) -> Any:
    """
    Update a section.
    """
    section = session.get(Section, id)
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")

    if not current_user.is_superuser:
         project = session.get(Project, section.project_id)
         if project.owner_id != current_user.id:
             member = session.get(ProjectMember, (project.id, current_user.id))
             if not member:
                  raise HTTPException(status_code=400, detail="Not enough permissions")

    update_dict = section_in.model_dump(exclude_unset=True)
    for key, value in update_dict.items():
        setattr(section, key, value)
    session.add(section)
    session.commit()
    session.refresh(section)
    return section


@router.delete("/{id}", response_model=Message)
def delete_section(
    session: SessionDep, current_user: CurrentUser, id: uuid.UUID
) -> Any:
    """
    Delete a section.
    """
    section = session.get(Section, id)
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")

    if not current_user.is_superuser:
         project = session.get(Project, section.project_id)
         if project.owner_id != current_user.id:
              # Only Project Owner can delete sections? Or maybe Admin role?
              raise HTTPException(status_code=400, detail="Not enough permissions")

    session.delete(section)
    session.commit()
    return Message(message="Section deleted successfully")
