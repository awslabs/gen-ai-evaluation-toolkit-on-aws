"""EventBridge Scheduler trigger handler.

Invoked by EventBridge Scheduler on cron. Receives a job template payload
and submits the appropriate job type (FULL, SCORE, or APP_INVOKE) via _submit_job.

Idempotency: EventBridge may retry on failure (up to 3 times). We derive a
deterministic job_id from the schedule name + invocation time so that retries
hit the same SF execution (ExecutionAlreadyExists) and DDB items rather than
creating duplicate jobs.
"""

import hashlib
from logging import getLogger
from typing import Any, Optional

from awssolutions_gen_ai_evaluation_toolkit_python_client.models import (
    JobType,
    ScorerConfig,
    TestDataSource,
)
from pydantic import BaseModel, model_validator

logger = getLogger(__name__)


def _deterministic_id(schedule_name: str, invocation_time: str) -> str:
    """Derive a deterministic ID from schedule name + invocation time.

    Returns a 32-char hex string suitable for use as job_id/report_id.
    Same inputs always produce the same output, making retries idempotent.
    """
    key = f"{schedule_name}:{invocation_time}"
    return hashlib.sha256(key.encode()).hexdigest()[:32]


class SchedulerEvent(BaseModel):
    """Pydantic model for the EventBridge Scheduler payload."""

    scheduleName: str
    time: str
    jobType: JobType
    evaluatorName: str
    testCases: Optional[dict[str, Any]] = None
    scorers: Optional[dict[str, Any]] = None
    app: Optional[dict[str, Any]] = None
    sourceReportId: Optional[str] = None
    testResults: Optional[list[dict[str, Any]]] = None
    experimentName: Optional[str] = None

    @model_validator(mode="after")
    def validate_job_requirements(self) -> "SchedulerEvent":
        if self.jobType == JobType.SCORE and not self.sourceReportId and not self.testResults:
            raise ValueError("SCORE job requires sourceReportId or testResults")
        if self.jobType == JobType.FULL and (not self.testCases or not self.scorers):
            raise ValueError("FULL job requires testCases and scorers")
        if self.jobType == JobType.APP_INVOKE and not self.testCases:
            raise ValueError("APP_INVOKE job requires testCases")
        return self


def handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """Handle scheduled job trigger.

    Expected event payload (stored as EventBridge Scheduler Target Input):
    {
        "jobType": "FULL" | "SCORE" | "APP_INVOKE",
        "evaluatorName": "builtin",
        "testCases": { "inline": [...] } | { "dataset": { "datasetId": "..." } },
        "scorers": { "ragas": { "scores": { "faithfulness": null } } },
        "app": { "name": "...", "params": { ... } },
        "sourceReportId": "...",
        "testResults": [...],
        "experimentName": "my-experiment",
        "scheduleName": "my-schedule"
    }

    Idempotency: job_id and report_id are derived deterministically from
    scheduleName + event time, so EventBridge retries produce the same IDs
    and hit ExecutionAlreadyExists in Step Functions.
    """
    from evaluator_api.routes.evaluator_jobs import _submit_job

    try:
        payload = SchedulerEvent.model_validate(event)
        # Parse typed models (validated early so malformed nested data fails fast)
        test_data = TestDataSource.from_dict(payload.testCases) if payload.testCases else None
        scorers = (
            {k: ScorerConfig.from_dict(v) if v else None for k, v in payload.scorers.items()}
            if payload.scorers
            else None
        )
    except Exception as e:
        logger.error("Invalid scheduler payload: %s", e)
        return {"statusCode": 400, "error": str(e)}

    logger.info("Scheduler trigger: jobType=%s evaluator=%s experiment=%s",
                payload.jobType.value, payload.evaluatorName, payload.experimentName)

    # Derive deterministic IDs for idempotent retries
    schedule_name = payload.scheduleName
    invocation_time = payload.time
    job_id = _deterministic_id(schedule_name, invocation_time)
    report_id = _deterministic_id(schedule_name, f"{invocation_time}:report")

    # Handle inline test results for SCORE jobs
    if payload.testResults and payload.jobType == JobType.SCORE:
        from awssolutions_gen_ai_evaluation_toolkit_python_client.models import InlineTestResult

        from evaluator_api.routes.evaluator_jobs import _write_inline_results_to_report

        try:
            inline_results = [InlineTestResult.from_dict(r) for r in payload.testResults]
        except Exception as e:
            logger.error("Invalid testResults in scheduler payload: %s", e)
            return {"statusCode": 400, "error": f"Invalid testResults: {e}"}
        _write_inline_results_to_report(report_id, inline_results)

        submitted = _submit_job(
            evaluator_name=payload.evaluatorName,
            job_type=payload.jobType,
            job_id=job_id,
            report_id=report_id,
            create_report=False,
            scorers=scorers,
            app_config=payload.app,
            experiment_name=payload.experimentName,
            continue_buffer_ms=60000,
            heartbeat_seconds=300,
        )
    else:
        submitted = _submit_job(
            evaluator_name=payload.evaluatorName,
            job_type=payload.jobType,
            job_id=job_id,
            report_id=report_id,
            create_report=True,
            test_data=test_data,
            scorers=scorers,
            app_config=payload.app,
            source_report_id=payload.sourceReportId,
            experiment_name=payload.experimentName,
            continue_buffer_ms=60000,
            heartbeat_seconds=300,
        )

    logger.info("Scheduler submitted job %s (report=%s)", submitted.job_id, submitted.report_id)
    return {
        "statusCode": 200,
        "jobId": submitted.job_id,
        "reportId": submitted.report_id,
    }
