import pytest
from pydantic import ValidationError

from app.schemas import UserCreate


def test_user_create_valid():
    user_in = UserCreate(email="test@example.com", password="testpassword")
    assert user_in.email == "test@example.com"
    assert user_in.password == "testpassword"

def test_user_create_invalid_email():
    with pytest.raises(ValidationError):
        UserCreate(email="invalid-email", password="testpassword")

def test_user_create_short_password():
    with pytest.raises(ValidationError):
        UserCreate(email="test@example.com", password="short")
