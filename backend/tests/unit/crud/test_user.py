from unittest.mock import MagicMock

from sqlalchemy.orm import Session

from app import crud
from app.models import User
from app.schemas import UserCreate, UserUpdate


def test_create_user():
    mock_session = MagicMock(spec=Session)
    user_in = UserCreate(email="test@example.com", password="testpassword")

    # We need to mock the return value from model_validate if needed,
    # but crud.py just uses it.
    # The session.refresh will be called on the object.

    user = crud.create_user(session=mock_session, user_create=user_in)

    assert user.email == "test@example.com"
    assert mock_session.add.called
    assert mock_session.commit.called
    assert mock_session.refresh.called

def test_get_user_by_email():
    mock_session = MagicMock(spec=Session)
    mock_user = User(email="test@example.com", hashed_password="hashed")

    # session.execute(statement).scalars().first()
    mock_session.execute.return_value.scalars.return_value.first.return_value = mock_user

    user = crud.get_user_by_email(session=mock_session, email="test@example.com")

    assert user == mock_user
    assert mock_session.execute.called

def test_authenticate_success():
    mock_session = MagicMock(spec=Session)
    from app.core.security import get_password_hash
    password = "testpassword"
    hashed_password = get_password_hash(password)
    mock_user = User(email="test@example.com", hashed_password=hashed_password)

    with MagicMock() as mock_get_user:
        crud.get_user_by_email = mock_get_user
        mock_get_user.return_value = mock_user

        user = crud.authenticate(session=mock_session, email="test@example.com", password=password)

        assert user == mock_user

def test_authenticate_fail_wrong_password():
    mock_session = MagicMock(spec=Session)
    from app.core.security import get_password_hash
    # Use a valid hash but for a different password
    hashed_password = get_password_hash("differentpassword")
    mock_user = User(email="test@example.com", hashed_password=hashed_password)

    with MagicMock() as mock_get_user:
        crud.get_user_by_email = mock_get_user
        mock_get_user.return_value = mock_user

        # This should fail because "testpassword" != "differentpassword"
        user = crud.authenticate(session=mock_session, email="test@example.com", password="testpassword")

        assert user is None

def test_update_user():
    mock_session = MagicMock(spec=Session)
    db_user = User(email="old@example.com", hashed_password="old-hashed")
    user_in = UserUpdate(email="new@example.com", password="newpassword")

    updated_user = crud.update_user(session=mock_session, db_user=db_user, user_in=user_in)

    assert updated_user.email == "new@example.com"
    assert mock_session.add.called
    assert mock_session.commit.called
    assert mock_session.refresh.called
