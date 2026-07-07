from unittest.mock import patch

from app import utils
from app.core.config import settings


def test_render_email_template():
    # This tests that render_email_template can at least run and find a template
    # We use a real template but it's more like an integration test for the template file existence
    # but since it doesn't need a DB, it's fine here.
    html = utils.render_email_template(
        template_name="test_email.html",
        context={"project_name": "Test project", "email": "test@example.com"}
    )
    assert "Test project" in html
    assert "test@example.com" in html

def test_generate_test_email():
    email_to = "test@example.com"
    email_data = utils.generate_test_email(email_to)
    assert email_data.subject == f"{settings.PROJECT_NAME} - Test email"
    assert "test@example.com" in email_data.html_content

def test_generate_reset_password_email():
    email_to = "test@example.com"
    email = "user@example.com"
    token = "test-token"
    email_data = utils.generate_reset_password_email(email_to, email, token)
    assert email in email_data.html_content
    assert token in email_data.html_content
    assert "Password recovery" in email_data.subject

@patch("smtplib.SMTP")
def test_send_email(mock_smtp):
    instance = mock_smtp.return_value.__enter__.return_value

    utils.send_email(
        email_to="test@example.com",
        subject="Test Subject",
        html_content="<h1>Test</h1>"
    )

    assert mock_smtp.called
    assert instance.send_message.called
    # Check that it was called with some message
    args, kwargs = instance.send_message.call_args
    msg = args[0]
    assert msg["To"] == "test@example.com"
    assert msg["Subject"] == "Test Subject"
