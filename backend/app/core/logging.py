import logging
import os
from logging.handlers import RotatingFileHandler

import structlog

from app.core.config import settings

# ── Global Guard ─────────────────────────────────────────────────────────
# Prevent duplicate handlers on re-import (common during testing)
_CONFIGURED = False
# ── Setup Function ─────────────────────────────────────────────────────────


def setup_logging() -> None:
    # 1. Initialization Guard: Prevents the setup from running multiple times
    # if this module is imported in multiple places, avoiding duplicate log lines.
    global _CONFIGURED
    if _CONFIGURED:
        return
    _CONFIGURED = True
    os.makedirs(settings.LOG_DIR, exist_ok=True)

    # 2. Standard Library Root Logger Setup
    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO))
    # Take full control (prevents weird duplication issues with default handlers)
    root_logger.handlers.clear()
    root_logger.propagate = False

    # 3. Structlog Processor Pipeline
    # These processors run in order to enrich the log event dictionary before rendering.
    processors = [
        structlog.contextvars.merge_contextvars,  # Merges thread-local/task-local context (like correlation IDs)
        structlog.stdlib.add_log_level,  # Adds the severity level (INFO, ERROR, etc.)
        structlog.stdlib.add_logger_name,  # Adds the name of the module that emitted the log
        structlog.processors.TimeStamper(fmt="iso"),  # Adds an ISO-8601 timestamp
        structlog.processors.StackInfoRenderer(),  # Formats stack traces if 'stack_info=True' is passed
        structlog.processors.format_exc_info,  # Formats exception tracebacks if 'exc_info=True' is passed
    ]

    # 4. Renderer & Formatter Configuration
    # Uses JSON renderer for machine-readable production logs, or a colorful console renderer for local development.
    renderer = (
        structlog.processors.JSONRenderer()
        if settings.LOG_JSON
        else structlog.dev.ConsoleRenderer()
    )
    # The formatter bridges structlog and standard library logging, ensuring stdlib logs pass through structlog processors.
    formatter = structlog.stdlib.ProcessorFormatter(
        processor=renderer, foreign_pre_chain=processors
    )

    # 5. Structlog Global Configuration
    structlog.configure(
        processors=processors + [renderer],
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),  # Tells structlog to route final output through stdlib logging
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    # 6. Stdlib Handler Configuration
    # Console logging (stdout)
    if settings.ENABLE_CONSOLE_LOGGING:
        console_handler = logging.StreamHandler()
        console_handler.setFormatter(formatter)
        console_handler.setLevel(root_logger.level)
        root_logger.addHandler(console_handler)
    # File logging (rotating log files to prevent filling up the disk)
    if settings.ENABLE_FILE_LOGGING:
        log_path = os.path.join(settings.LOG_DIR, "app.log")
        file_handler = RotatingFileHandler(
            log_path,
            maxBytes=settings.LOG_MAX_BYTES,
            backupCount=settings.LOG_BACKUP_COUNT,
        )
        file_handler.setFormatter(formatter)
        file_handler.setLevel(root_logger.level)
        root_logger.addHandler(file_handler)
    # Fallback to prevent "No handlers could be found" warnings if both are disabled
    if not root_logger.handlers:
        root_logger.addHandler(logging.NullHandler())


setup_logging()
logger = structlog.get_logger()

"""
Logging Configuration Breakdown:
1. Initialization Guard (_CONFIGURED)
   This ensures setup_logging() only runs once. If it runs multiple times, you'd attach multiple handlers to the logger, resulting in duplicate log entries (e.g., seeing the exact same log printed 2, 3, or 4 times).
2. Standard Library Root Logger Setup
   This grabs the base Python root_logger, sets the logging level (like INFO or DEBUG), and completely clears out any existing handlers to give us a fresh start. propagate = False stops logs from bubbling up unexpectedly.
3. Structlog Processor Pipeline (processors)
   This is the core of structlog. It acts like an assembly line. Every log message passes through these steps in order to get "enriched" before being printed. It adds context (like correlation IDs from the middleware), the log level, the module name, an ISO timestamp, and formats any exceptions/crashes nicely.
4. Renderer & Formatter Configuration
   This decides the final output format. If LOG_JSON is True in your environment, it outputs machine-readable JSON (great for Datadog/CloudWatch). If False, it uses a colorful console renderer (great for local development). The formatter then packages it up so the standard Python logging module can understand it.
5. Structlog Global Configuration
   This applies the settings. The crucial part is logger_factory=structlog.stdlib.LoggerFactory(), which wires structlog directly into Python's built-in logging. This means even if 3rd-party libraries (like SQLAlchemy or FastAPI) use standard logging, they will still be intercepted and formatted beautifully by structlog.
6. Stdlib Handler Configuration
   This tells Python *where* to send the finished logs:
   - Console Handler: Sends logs to the terminal/stdout if enabled.
   - File Handler: Uses RotatingFileHandler to save logs to logs/app.log. It automatically rotates (creates new files and archives old ones) when the file gets too big, preventing your server's disk from filling up.
   - NullHandler (Fallback): If both console and file logging are disabled, this safely swallows the logs so Python doesn't throw a "No handlers could be found" error.
"""
