import logging
import smtplib
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path
from typing import Any

# import emails  # type: ignore
import jwt
from jinja2 import Template
from jwt.exceptions import InvalidTokenError

from app.core import security
from app.core.config import settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@dataclass
class EmailData:
    html_content: str
    subject: str


def render_email_template(*, template_name: str, context: dict[str, Any]) -> str:
    template_str = (
        Path(__file__).parent / "email-templates" / "build" / template_name
    ).read_text(encoding="utf-8")
    html_content = Template(template_str).render(context)
    return html_content


def send_email(
    *,
    email_to: str,
    subject: str = "",
    html_content: str = "",
) -> None:
    assert settings.emails_enabled, "no provided configuration for email variables"

    # OLD ERROR-PRONE CODE (COMMENTED OUT)
    # message = emails.Message(
    #     subject=subject,
    #     html=html_content,
    #     mail_from=(settings.EMAILS_FROM_NAME, settings.EMAILS_FROM_EMAIL),
    # )
    # smtp_options = {"host": settings.SMTP_HOST, "port": settings.SMTP_PORT}
    # if settings.SMTP_TLS:
    #     smtp_options["tls"] = True
    # elif settings.SMTP_SSL:
    #     smtp_options["ssl"] = True
    # if settings.SMTP_USER:
    #     smtp_options["user"] = settings.SMTP_USER
    #     smtp_options["password"] = settings.SMTP_PASSWORD
    # response = message.send(to=email_to, smtp=smtp_options)
    # logger.info(f"send email result: {response}")

    # NEW IMPLEMENTATION USING SMTPLIB
    try:
        logger.info(f"Preparing to send email to {email_to}")
        logger.info(f"SMTP Config: Host={settings.SMTP_HOST}, Port={settings.SMTP_PORT}, TLS={settings.SMTP_TLS}, User={settings.SMTP_USER}")

        msg = MIMEMultipart()
        msg['From'] = f"{settings.EMAILS_FROM_NAME} <{settings.EMAILS_FROM_EMAIL}>"
        msg['To'] = email_to
        msg['Subject'] = subject
        msg.attach(MIMEText(html_content, 'html'))

        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
            server.set_debuglevel(1) # Enable verbose SMTP logging (will show in docker logs)
            logger.info("Connected to SMTP server")
            server.ehlo()

            if settings.SMTP_TLS:
                logger.info("Starting TLS")
                server.starttls()
                server.ehlo()
            else:
                logger.info("Skipping TLS")

            if settings.SMTP_USER and settings.SMTP_PASSWORD:
                logger.info("Attempting login")
                server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)

            server.send_message(msg)
            logger.info("Email sent successfully")

    except Exception as e:
        logger.error(f"Failed to send email: {e}")
        import traceback
        logger.error(traceback.format_exc())


def generate_test_email(email_to: str) -> EmailData:
    project_name = settings.PROJECT_NAME
    subject = f"{project_name} - Test email"
    html_content = render_email_template(
        template_name="test_email.html",
        context={"project_name": settings.PROJECT_NAME, "email": email_to},
    )
    return EmailData(html_content=html_content, subject=subject)


def generate_reset_password_email(email_to: str, email: str, token: str) -> EmailData:
    project_name = settings.PROJECT_NAME
    subject = f"{project_name} - Password recovery for user {email}"
    link = f"{settings.FRONTEND_HOST}/reset-password?token={token}"
    html_content = render_email_template(
        template_name="reset_password.html",
        context={
            "project_name": settings.PROJECT_NAME,
            "username": email,
            "email": email_to,
            "valid_hours": settings.EMAIL_RESET_TOKEN_EXPIRE_HOURS,
            "link": link,
        },
    )
    return EmailData(html_content=html_content, subject=subject)


def generate_new_account_email(
    email_to: str, username: str, password: str
) -> EmailData:
    project_name = settings.PROJECT_NAME
    subject = f"{project_name} - New account for user {username}"
    html_content = render_email_template(
        template_name="new_account.html",
        context={
            "project_name": settings.PROJECT_NAME,
            "username": username,
            "password": password,
            "email": email_to,
            "link": settings.FRONTEND_HOST,
        },
    )
    return EmailData(html_content=html_content, subject=subject)


def generate_task_assignment_email(
    email_to: str, task_title: str, project_name: str, workspace_name: str, assignee_name: str
) -> EmailData:
    subject = f"[{project_name}] You have been assigned to: {task_title}"
    context = {
        "project_name": project_name,
        "workspace_name": workspace_name,
        "task_title": task_title,
        "assignee_name": assignee_name,
        "email": email_to,
    }
    logger.info(f"Generating task assignment email with context: {context}")
    html_content = render_email_template(
        template_name="task_assignment.html",
        context=context,
    )
    return EmailData(html_content=html_content, subject=subject)


def generate_password_reset_token(email: str) -> str:
    delta = timedelta(hours=settings.EMAIL_RESET_TOKEN_EXPIRE_HOURS)
    now = datetime.now(timezone.utc)
    expires = now + delta
    exp = expires.timestamp()
    encoded_jwt = jwt.encode(
        {"exp": exp, "nbf": now, "sub": email},
        settings.SECRET_KEY,
        algorithm=security.ALGORITHM,
    )
    return encoded_jwt


def verify_password_reset_token(token: str) -> str | None:
    try:
        decoded_token = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[security.ALGORITHM]
        )
        return str(decoded_token["sub"])
    except InvalidTokenError:
        return None


def generate_verification_token(email: str) -> str:
    delta = timedelta(hours=settings.EMAIL_RESET_TOKEN_EXPIRE_HOURS)
    now = datetime.now(timezone.utc)
    expires = now + delta
    exp = expires.timestamp()
    encoded_jwt = jwt.encode(
        {"exp": exp, "nbf": now, "sub": email, "type": "verification"},
        settings.SECRET_KEY,
        algorithm=security.ALGORITHM,
    )
    return encoded_jwt


def verify_verification_token(token: str) -> str | None:
    try:
        decoded_token = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[security.ALGORITHM]
        )
        if decoded_token.get("type") != "verification":
            return None
        return str(decoded_token["sub"])
    except InvalidTokenError:
        return None


def generate_account_verification_email(email_to: str, username: str, token: str) -> EmailData:
    project_name = settings.PROJECT_NAME
    subject = f"{project_name} - Verify your account"
    link = f"{settings.FRONTEND_HOST}/verify-email?token={token}"
    html_content = render_email_template(
        template_name="account_verification.html",
        context={
            "project_name": settings.PROJECT_NAME,
            "username": username,
            "email": email_to,
            "valid_hours": settings.EMAIL_RESET_TOKEN_EXPIRE_HOURS,
            "link": link,
            "year": datetime.now().year,
        },
    )
    return EmailData(html_content=html_content, subject=subject)

def generate_workspace_invitation_email(
    workspace_name: str,
    inviter_name: str,
    inviter_email: str,
    link: str,
) -> EmailData:
    project_name = settings.PROJECT_NAME
    subject = f"Invitation to join {workspace_name} on {project_name}"
    html_content = render_email_template(
        template_name="workspace_invitation.html",
        context={
            "project_name": settings.PROJECT_NAME,
            "workspace_name": workspace_name,
            "inviter_name": inviter_name,
            "inviter_email": inviter_email,
            "link": link,
            "valid_days": 7,
            "year": datetime.now().year,
        },
    )
    return EmailData(html_content=html_content, subject=subject)
