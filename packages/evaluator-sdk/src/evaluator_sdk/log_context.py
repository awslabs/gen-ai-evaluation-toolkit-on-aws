"""Job-scoped log context for cross-service tracing.

Injects ``job_id``, ``job_type``, and ``evaluator_name`` into every
``logging.LogRecord`` while a job is being processed.  This makes
CloudWatch Logs Insights queries like ``filter @message like "<job_id>"``
work across all Lambdas (API, Evaluator, Post-Processing) without each
handler manually logging the job ID.

Usage as a context manager::

    from evaluator_sdk.log_context import job_log_context

    with job_log_context(job_id="abc123", job_type="FULL"):
        logger.info("processing")   # record.job_id == "abc123"
    logger.info("outside")          # record.job_id == ""

Usage via set/clear (for non-context-manager flows)::

    from evaluator_sdk.log_context import set_job_context, clear_job_context

    set_job_context(job_id="abc123")
    ...
    clear_job_context()

Implementation uses ``logging.setLogRecordFactory`` to wrap the default
factory.  This guarantees the fields are set on every ``LogRecord``
regardless of which logger emits it or how handlers/filters are configured.

A JSON formatter is also installed on the root logger so the job context
fields appear in CloudWatch ``@message``.  This only takes effect if the
root logger doesn't already have a custom formatter (e.g. Powertools).
"""

import contextvars
import json
import logging
import sys
from contextlib import contextmanager
from typing import Generator

_CONTEXT_KEYS = ("job_id", "job_type", "evaluator_name")

_EMPTY_CONTEXT: dict[str, str] = {}

_job_context: contextvars.ContextVar[dict[str, str]] = contextvars.ContextVar(
    "job_log_context", default=_EMPTY_CONTEXT,
)

# Wrap the log record factory so every record gets the context fields.
_original_factory = logging.getLogRecordFactory()


def _job_context_factory(*args: object, **kwargs: object) -> logging.LogRecord:
    record = _original_factory(*args, **kwargs)
    ctx = _job_context.get()
    for key in _CONTEXT_KEYS:
        setattr(record, key, ctx.get(key, ""))
    return record


logging.setLogRecordFactory(_job_context_factory)


# --- JSON formatter for structured CloudWatch logging ---

class JsonFormatter(logging.Formatter):
    """Structured JSON formatter that includes job context fields.

    Produces one JSON object per log line with level, logger, message,
    and any job context fields set via ``set_job_context`` or ``job_log_context``.
    """

    def __init__(self, service: str = "") -> None:
        super().__init__()
        self._service = service

    def format(self, record: logging.LogRecord) -> str:
        entry: dict[str, str] = {
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if self._service:
            entry["service"] = self._service
        for key in _CONTEXT_KEYS:
            val = getattr(record, key, "")
            if val:
                entry[key] = val
        if record.exc_info and record.exc_info[1]:
            entry["exception"] = self.formatException(record.exc_info)
        return json.dumps(entry, default=str)


def configure_json_logging(service: str = "", level: int = logging.INFO) -> None:
    """Install the JSON formatter on the root logger.

    Safe to call multiple times — only installs once.
    Call this at Lambda module level to get structured logs in CloudWatch.
    Suppresses noisy loggers (botocore, urllib3) to WARNING.
    """
    root = logging.getLogger()
    # Skip if already configured
    for handler in root.handlers:
        if isinstance(handler.formatter, JsonFormatter):
            return
    root.setLevel(level)
    # Replace all existing handlers (including Lambda's LambdaLoggerHandler
    # which ignores custom formatters) with our own StreamHandler.
    root.handlers.clear()
    h = logging.StreamHandler(sys.stdout)
    h.setFormatter(JsonFormatter(service=service))
    root.addHandler(h)

    # Suppress noisy loggers
    for noisy in ("botocore", "urllib3", "httpcore"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


def set_job_context(
    job_id: str,
    job_type: str = "",
    evaluator_name: str = "",
) -> None:
    """Set job context that will appear on all subsequent log records."""
    _job_context.set({
        "job_id": job_id,
        "job_type": job_type,
        "evaluator_name": evaluator_name,
    })


def clear_job_context() -> None:
    """Remove job context from log records."""
    _job_context.set({})


@contextmanager
def job_log_context(
    job_id: str,
    job_type: str = "",
    evaluator_name: str = "",
) -> Generator[None, None, None]:
    """Context manager that sets job log context for the duration of a block."""
    token = _job_context.set({
        "job_id": job_id,
        "job_type": job_type,
        "evaluator_name": evaluator_name,
    })
    try:
        yield
    finally:
        _job_context.reset(token)
