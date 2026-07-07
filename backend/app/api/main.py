from fastapi import APIRouter

from app.api.routes import (
    attachments,
    comments,
    invitations,
    items,
    login,
    private,
    projects,
    sections,
    tasks,
    users,
    utils,
    workspaces,
)
from app.core.config import settings

api_router = APIRouter()
api_router.include_router(login.router, tags=["login"])
api_router.include_router(users.router, tags=["users"])
api_router.include_router(utils.router, tags=["utils"])
api_router.include_router(items.router, tags=["items"])
api_router.include_router(workspaces.router, tags=["workspaces"])
api_router.include_router(projects.router, tags=["projects"])
api_router.include_router(sections.router, tags=["sections"])
api_router.include_router(tasks.router, tags=["tasks"])
api_router.include_router(comments.router, tags=["comments"])
api_router.include_router(attachments.router, tags=["attachments"])
api_router.include_router(invitations.router, prefix="/invitations", tags=["invitations"])


if settings.ENVIRONMENT == "local":
    api_router.include_router(private.router)
