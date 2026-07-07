from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app import crud
from app.core.config import settings
from app.models import User
from app.schemas import UserCreate

engine = create_engine(str(settings.SQLALCHEMY_DATABASE_URI))


# make sure all models are imported (app.models) before initializing DB
# otherwise, it might fail to initialize relationships properly
# for more details: https://github.com/fastapi/full-stack-fastapi-template/issues/28


def init_db(session: Session) -> None:
    # Tables should be created with Alembic migrations
    # But if you don't want to use migrations, create
    # the tables un-commenting the next lines
    # from app.models import Base
    # Base.metadata.create_all(engine)

    user = session.execute(
        select(User).where(User.email == settings.FIRST_SUPERUSER)
    ).scalars().first()
    if not user:
        user_in = UserCreate(
            email=settings.FIRST_SUPERUSER,
            password=settings.FIRST_SUPERUSER_PASSWORD,
            is_superuser=True,
        )
        user = crud.create_user(session=session, user_create=user_in)
