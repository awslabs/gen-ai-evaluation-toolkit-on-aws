"""Internal EventBridge-triggered handlers for multi-evaluator orchestration.

These handlers are routed by jobType or detailType (not evaluatorName) and use
the shared complete_task lifecycle function.

Handlers:
  - copy_results_handler: Copy results from source report (COPY_RESULTS task)
  - timeout_handler: Mark timed-out tasks FAILED (EvaluatorTaskTimedOut)
  - lambda_failure_handler: Mark crashed Lambda tasks FAILED + resume SFN
"""

from logging import getLogger
from typing import Any

from evaluator_api.task_lifecycle import complete_task

logger = getLogger(__name__)


def handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """Dispatch handler — routes EventBridge events to the appropriate internal handler.

    Routing:
      - source=lambda → lambda_failure_handler (on-failure destination)
      - detailType=EvaluatorTaskTimedOut → timeout_handler
      - detail.jobType=COPY_RESULTS → copy_results_handler
    """
    source = event.get("source", "")
    detail_type = event.get("detail-type", "")
    job_type = event.get("detail", {}).get("jobType", "")

    if source == "lambda":
        return lambda_failure_handler(event, context)
    if detail_type == "EvaluatorTaskTimedOut":
        return timeout_handler(event, context)
    if job_type == "COPY_RESULTS":
        return copy_results_handler(event, context)

    logger.warning("Unrecognized event: source=%s detailType=%s jobType=%s", source, detail_type, job_type)
    return {"statusCode": 400, "body": "Unrecognized event"}


def copy_results_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """Handle COPY_RESULTS task: copy results from source report.

    Expected event detail:
        {
            "jobId": "abc123",
            "taskToken": "...",
            "taskKey": "copy_results",
            "sourceReportId": "source-report-id",
            "reportId": "target-report-id"
        }
    """
    detail = event.get("detail", {})
    job_id = detail["jobId"]
    source_report_id = detail["sourceReportId"]
    target_report_id = detail["reportId"]
    task_token = detail.get("taskToken")
    task_key = detail.get("taskKey", "copy_results")

    logger.info("Copy results: job=%s source=%s target=%s",
                job_id, source_report_id, target_report_id)

    try:
        from evaluator_api.routes.evaluator_jobs import _copy_results_from_source

        _copy_results_from_source(source_report_id, target_report_id)
        complete_task(job_id, task_key, "COMPLETED", task_token)
    except Exception as e:
        logger.exception("Copy results failed for job %s", job_id)
        complete_task(job_id, task_key, "FAILED", task_token, error=str(e))

    return {"statusCode": 200}


def timeout_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """Handle EvaluatorTaskTimedOut: mark task FAILED in DDB.

    Triggered by SFN when HeartbeatSeconds expires. No SFN callback needed —
    SFN already moved on via Catch block.

    Expected event detail:
        {"jobId": "abc123", "taskKey": "app_invoke"}
    """
    detail = event.get("detail", {})
    job_id = detail.get("jobId", "")
    task_key = detail.get("taskKey", "")

    logger.warning("Task timed out: job=%s task=%s", job_id, task_key)

    complete_task(
        job_id, task_key, "FAILED",
        task_token=None,  # No SFN callback — SFN already moved on
        error="Task timed out (no heartbeat received)",
        only_if_non_terminal=True,
    )

    return {"statusCode": 200}


def lambda_failure_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """Handle Lambda on-failure destination events.

    Triggered when a Lambda worker crashes, OOMs, or hard-times-out.
    Extracts the original request payload (with taskToken) to resume SFN.

    Expected event detail:
        {
            "requestPayload": {
                "detail": {"jobId": "...", "taskKey": "...", "taskToken": "..."}
            },
            "responseContext": {"errorMessage": "..."}
        }
    """
    detail = event.get("detail", {})
    original = detail.get("requestPayload", {}).get("detail", {})
    error_msg = (
        detail.get("responseContext", {}).get("errorMessage")
        or "Lambda invocation failed"
    )

    job_id = original.get("jobId", "")
    task_key = original.get("taskKey", "")
    task_token = original.get("taskToken")

    logger.error(
        "Lambda failure: job=%s task=%s error=%s",
        job_id, task_key, error_msg,
    )

    try:
        complete_task(
            job_id, task_key, "FAILED",
            task_token=task_token, error=error_msg,
            only_if_non_terminal=True,
        )
    except Exception:
        # taskToken may be invalid if HeartbeatTimeout already fired
        logger.exception("Failed with task_token, retrying without")
        complete_task(
            job_id, task_key, "FAILED",
            task_token=None, error=error_msg,
            only_if_non_terminal=True,
        )

    return {"statusCode": 200}
