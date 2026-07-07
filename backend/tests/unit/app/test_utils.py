import jwt

from app import utils
from app.core import security
from app.core.config import settings


def test_generate_password_reset_token():
    email = "test@example.com"
    token = utils.generate_password_reset_token(email)
    assert isinstance(token, str)

    decoded_token = jwt.decode(
        token, settings.SECRET_KEY, algorithms=[security.ALGORITHM]
    )
    assert decoded_token["sub"] == email

def test_verify_password_reset_token():
    email = "test@example.com"
    token = utils.generate_password_reset_token(email)
    verified_email = utils.verify_password_reset_token(token)
    assert verified_email == email

def test_verify_password_reset_token_invalid():
    assert utils.verify_password_reset_token("invalid-token") is None

def test_generate_verification_token():
    email = "test@example.com"
    token = utils.generate_verification_token(email)
    assert isinstance(token, str)

    decoded_token = jwt.decode(
        token, settings.SECRET_KEY, algorithms=[security.ALGORITHM]
    )
    assert decoded_token["sub"] == email
    assert decoded_token["type"] == "verification"

def test_verify_verification_token():
    email = "test@example.com"
    token = utils.generate_verification_token(email)
    verified_email = utils.verify_verification_token(token)
    assert verified_email == email

def test_verify_verification_token_invalid():
    assert utils.verify_verification_token("invalid-token") is None

def test_verify_verification_token_wrong_type():
    email = "test@example.com"
    token = utils.generate_password_reset_token(email) # Wrong type
    assert utils.verify_verification_token(token) is None
