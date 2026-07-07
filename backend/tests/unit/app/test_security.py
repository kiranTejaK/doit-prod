from datetime import timedelta

from app.core import security


def test_get_password_hash():
    password = "testpassword"
    hashed_password = security.get_password_hash(password)
    assert hashed_password != password
    assert security.verify_password(password, hashed_password)

def test_verify_password():
    password = "testpassword"
    hashed_password = security.get_password_hash(password)
    assert security.verify_password(password, hashed_password) is True
    assert security.verify_password("wrongpassword", hashed_password) is False

def test_create_access_token():
    subject = "testuser@example.com"
    expires_delta = timedelta(minutes=15)
    token = security.create_access_token(subject, expires_delta)
    assert isinstance(token, str)
    assert len(token) > 0
