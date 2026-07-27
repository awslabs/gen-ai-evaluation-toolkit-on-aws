"""EventBridge-triggered Lambda handler for post-processing.

Invoked by SFN via EventBridge when a job's scoring phase completes.
Runs aggregation + MLflow logging via complete_task lifecycle.
"""

import contextvars
import json
import logging
import os
import sys
from contextlib import contextmanager
from typing import Any, Generator, Optional

from pydantic import BaseModel, ValidationError

from evaluator_api._aws import boto3_resource
from evaluator_api.ddb import JobDao, ReportDao, ResultDao
from evaluator_api.ddb.common import EVALUATOR_TABLE_NAME
from evaluator_api.experiment import run_post_processing
from evaluator_api.task_lifecycle import complete_task

# --- Structured JSON logging with job context ---
# Self-contained (no SDK dependency). Same pattern as evaluator_sdk.log_context.

_EMPTY_CTX: dict[str, str] = {}
_job_context: contextvars.ContextVar[dict[str, str]] = contextvars.ContextVar(
    "post_processing_job_context", default=_EMPTY_CTX,
)


class _JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        ctx = _job_context.get()
        entry: dict[str, str] = {
            "level": record.levelname,
            "service": os.environ.get("POWERTOOLS_SERVICE_NAME", "evaluator-post-processing"),
            "logger": record.name,
            "message": record.getMessage(),
        }
        for key in ("job_id", "evaluator_name"):
            val = ctx.get(key, "")
            if val:
                entry[key] = val
        if record.exc_info and record.exc_info[1]:
            entry["exception"] = self.formatException(record.exc_info)
        return json.dumps(entry, default=str)


# Replace Lambda's LambdaLoggerHandler (ignores custom formatters) with our own.
_root = logging.getLogger()
_root.setLevel(logging.INFO)
_root.handlers.clear()
_root.addHandler(logging.StreamHandler(sys.stdout))
_root.handlers[0].setFormatter(_JsonFormatter())

for _noisy in ("botocore", "urllib3", "httpcore"):
    logging.getLogger(_noisy).setLevel(logging.WARNING)

logger = logging.getLogger(__name__)


@contextmanager
def _job_log_context(job_id: str, evaluator_name: str = "") -> Generator[None, None, None]:
    token = _job_context.set({"job_id": job_id, "evaluator_name": evaluator_name})
    try:
        yield
    finally:
        _job_context.reset(token)


# --- Lambda handler ---

_ddb: Any = None
_job_dao: JobDao | None = None
_result_dao: ResultDao | None = None
_report_dao: ReportDao | None = None


class ScoringCompleteDetail(BaseModel):
    """Expected shape of the EventBridge event detail."""

    jobId: str
    evaluatorName: Optional[str] = None
    reportId: Optional[str] = None
    taskToken: Optional[str] = None
    taskKey: Optional[str] = "post_process"
    checkpoint: Optional[dict[str, Any]] = None
    continueBufferMs: Optional[int] = None


def _get_daos() -> tuple[JobDao, ResultDao, ReportDao]:
    global _ddb, _job_dao, _result_dao, _report_dao
    if _job_dao is None:
        _ddb = boto3_resource("dynamodb")
        table = _ddb.Table(EVALUATOR_TABLE_NAME)
        _job_dao = JobDao(table)
        _result_dao = ResultDao(table)
        _report_dao = ReportDao(table)
    if _job_dao is None or _result_dao is None or _report_dao is None:
        raise RuntimeError("Failed to initialize DAOs")
    return _job_dao, _result_dao, _report_dao


def handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """EventBridge event handler for post-processing."""
    try:
        detail = ScoringCompleteDetail.model_validate(event.get("detail", {}))
    except ValidationError as e:
        logger.error("Invalid event detail: %s", e)
        return {"statusCode": 400, "body": f"Invalid event: {e}"}

    with _job_log_context(job_id=detail.jobId, evaluator_name=detail.evaluatorName or ""):
        logger.info("Post-processing triggered")

        job_dao, result_dao, report_dao = _get_daos()

        task_key = detail.taskKey or "post_process"
        try:
            result = run_post_processing(
                job_dao=job_dao,
                result_dao=result_dao,
                report_dao=report_dao,
                job_id=detail.jobId,
                checkpoint=detail.checkpoint,
                context=context,
                task_token=detail.taskToken,
                task_key=task_key,
                continue_buffer_ms=detail.continueBufferMs,
            )
            if result == "CONTINUE":
                return {"statusCode": 200, "body": "CONTINUE"}
            complete_task(detail.jobId, task_key, "COMPLETED", detail.taskToken)
        except Exception as e:
            logger.exception("Post-processing failed")
            complete_task(detail.jobId, task_key, "FAILED", detail.taskToken, error=str(e))

        return {"statusCode": 200, "body": f"Post-processing complete for job {detail.jobId}"}
