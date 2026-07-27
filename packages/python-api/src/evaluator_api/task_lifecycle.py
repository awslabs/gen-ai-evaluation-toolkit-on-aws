"""Shared task lifecycle functions for multi-evaluator orchestration.

All task handlers — workers (via API bridge) and ETK infra (direct import) —
use these functions to update DDB and bridge to Step Functions.
"""

from __future__ import annotations

import json
from logging import getLogger
from typing import TYPE_CHECKING, Any, Optional

from botocore.exceptions import ClientError
from pydantic import BaseModel

from evaluator_api.sfn import get_sfn_client

if TYPE_CHECKING:
    from evaluator_api.ddb.dao import JobDao
    from evaluator_api.ddb.models import TaskEntry


def _get_job_dao() -> JobDao:
    """Lazy import to avoid circular dependency (task_lifecycle ↔ routes)."""
    from evaluator_api.routes import get_job_dao
    return get_job_dao()

logger = getLogger(__name__)


class TaskCheckpoint(BaseModel):
    """Resume state for a task. Stored in DDB and passed through SFN on CONTINUE."""

    inline_testcase_index: Optional[int] = None
    last_evaluated_key: Optional[str] = None
    dataset_next_token: Optional[str] = None
    welford: Optional[dict[str, dict[str, Any]]] = None


def compute_job_status(tasks: dict[str, TaskEntry]) -> str:
    """Compute job status from task states. Pure function on DDB data.

    Returns a JobStatus string: PENDING, RUNNING, SUCCESS, PARTIAL_FAILURE, FAILURE.
    """
    if not tasks:
        return "PENDING"

    statuses = {k: v.status for k, v in tasks.items()}
    terminal = {"COMPLETED", "FAILED"}

    if not all(s in terminal for s in statuses.values()):
        if any(s != "PENDING" for s in statuses.values()):
            return "RUNNING"
        return "PENDING"

    # All terminal — compute outcome
    primary_keys = [
        k for k in statuses
        if k not in ("post_process",) and not k.startswith("score:")
    ]
    for pk in primary_keys:
        if statuses[pk] == "FAILED":
            return "FAILURE"

    score_statuses = [s for k, s in statuses.items() if k.startswith("score:")]
    if score_statuses:
        if all(s == "FAILED" for s in score_statuses):
            return "FAILURE"
        if any(s == "FAILED" for s in score_statuses):
            return "PARTIAL_FAILURE"

    if statuses.get("post_process") == "FAILED":
        return "PARTIAL_FAILURE"

    return "SUCCESS"


def complete_task(
    job_id: str,
    task_key: str,
    status: str,
    task_token: Optional[str] = None,
    error: Optional[str] = None,
    only_if_non_terminal: bool = False,
) -> None:
    """Update task status in DDB + bridge to SFN.

    When only_if_non_terminal=True (used by timeout/failure handlers),
    the DDB update is conditional — it won't overwrite a task that
    already reached COMPLETED or FAILED.
    """
    job_dao = _get_job_dao()
    try:
        job_dao.update_task_status(
            job_id, task_key, status,
            error=error, only_if_non_terminal=only_if_non_terminal,
        )
    except ClientError as e:
        if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
            logger.info(
                "Task %s/%s already terminal — skipping update",
                job_id, task_key,
            )
            return
        raise

    _send_sf_callback(task_token, task_key, status, error)


def checkpoint_task(
    job_id: str,
    task_key: str,
    checkpoint: TaskCheckpoint | dict[str, Any],
    task_token: Optional[str] = None,
) -> None:
    """Store checkpoint in DDB + optionally signal CONTINUE to SFN."""
    cp_dict = checkpoint.model_dump() if isinstance(checkpoint, TaskCheckpoint) else checkpoint
    job_dao = _get_job_dao()
    job_dao.update_task_checkpoint(job_id, task_key, cp_dict)

    if task_token:
        sfn = get_sfn_client()
        _sf_call(sfn.send_task_success,
                 taskToken=task_token,
                 output=json.dumps({
                     "status": "CONTINUE",
                     "checkpoint": cp_dict,
                     "taskKey": task_key,
                 }))


def _sf_call(fn: Any, **kwargs: Any) -> None:
    """Call an SFN API method. Swallow 'token already consumed' errors (idempotent retry)
    but let all other errors propagate so SFN stays the source of truth.
    """
    try:
        fn(**kwargs)
    except ClientError as e:
        code = e.response["Error"]["Code"]
        if code in ("TaskDoesNotExist", "TaskTimedOut", "InvalidToken"):
            logger.warning("SFN callback idempotent skip (%s) — token already consumed", code)
            return
        raise


def _send_sf_callback(
    task_token: Optional[str],
    task_key: str,
    status: str,
    error: Optional[str] = None,
) -> None:
    """Send SFN callback. Idempotent — swallows 'token already consumed' errors."""
    if not task_token:
        return
    sfn = get_sfn_client()
    if status == "FAILED":
        _sf_call(sfn.send_task_failure,
                 taskToken=task_token,
                 error="TaskFailed",
                 cause=error or "Unknown")
    else:
        _sf_call(sfn.send_task_success,
                 taskToken=task_token,
                 output=json.dumps({
                     "status": "COMPLETED", "taskKey": task_key,
                 }))


def start_task(
    job_id: str,
    task_key: str,
    task_token: Optional[str] = None,
) -> None:
    """Mark task RUNNING, or send heartbeat if already RUNNING."""
    job_dao = _get_job_dao()
    job = job_dao.get(job_id)
    if not job:
        return

    task = (job.tasks or {}).get(task_key)
    if not task or task.status != "RUNNING":
        job_dao.update_task_status(job_id, task_key, "RUNNING")
        handle_running(job)
    elif task_token:
        try:
            get_sfn_client().send_task_heartbeat(taskToken=task_token)
        except Exception:
            pass  # token may be invalid if task already completed


def handle_running(job: Any) -> None:
    """Pre-processing on RUNNING: create MLflow experiment and run."""
    if not job.experiment_name:
        return

    from evaluator_api.experiment import start_experiment_run
    from evaluator_api.routes import get_report_dao

    report_dao = get_report_dao()
    report = report_dao.get(job.report_id) if job.report_id else None
    try:
        start_experiment_run(job, report)
    except Exception:
        logger.exception(
            "Pre-processing failed for job %s — continuing", job.job_id,
        )
