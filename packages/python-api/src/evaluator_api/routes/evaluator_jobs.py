"""Evaluator job routes for the Evaluator API."""

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from logging import getLogger
from typing import Any, Optional

from botocore.exceptions import ClientError

from evaluator_api.ddb import JobErrorItem, JobItem, JobStatus, ReportItem, ResultItem, TaskEntry
from evaluator_api.routes import (
    ResourceNotFoundException,
    ValidationException,
    app,
    generate_id,
    get_job_dao,
    get_report_dao,
    get_result_dao,
)
from evaluator_api.routes.models import (
    DatasetSource,
    EvaluationJob,
    EvaluatorJobSummary,
    GetEvaluatorJobResponseContent,
    Inline,
    JobError,
    JobStage,
    JobType,
    ListJobsResponseContent,
    ScorerConfig,
    SubmitAppInvocationJobRequestContent,
    SubmitAppInvocationJobResponseContent,
    SubmitEvaluationJobRequestContent,
    SubmitEvaluationJobResponseContent,
    SubmitScoringJobRequestContent,
    SubmitScoringJobResponseContent,
    TaskState,
    TestDataSource,
    UpdateEvaluatorJobStatusRequestContent,
    UpdateEvaluatorJobStatusResponseContent,
)
from evaluator_api.routes.models import (
    JobStatus as ApiJobStatus,
)
from evaluator_api.routes.models import (
    TaskStatus as ApiTaskStatus,
)
from evaluator_api.sfn import STATE_MACHINE_ARN, get_sfn_client
from evaluator_api.task_lifecycle import (
    checkpoint_task,
    complete_task,
    compute_job_status,
    handle_running,
    start_task,
)

logger = getLogger(__name__)

## ---------------------------------------------------------------------------
# Internal types
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class _ParsedTestData:
    test_data: TestDataSource
    dataset_id: Optional[str]


@dataclass(frozen=True)
class _PrimaryTask:
    task_key: str
    job_type: str
    evaluator_name: Optional[str]
    source_report_id: Optional[str] = None
    pre_completed: bool = False


@dataclass(frozen=True)
class _ScoreTask:
    task_key: str
    evaluator_name: str
    scorers: dict[str, Any]


@dataclass(frozen=True)
class _SubmittedJob:
    job_id: str
    report_id: str
    job: EvaluationJob
    created_at: datetime
    experiment_name: Optional[str] = None


## ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------



def _validate_test_data(test_data: Optional[TestDataSource]) -> None:
    """Validate that test data is present and non-empty."""
    if not test_data:
        raise ValidationException(
            "testCases is required (either dataset reference or inline test cases)"
        )
    # Check for empty inline test cases
    if isinstance(test_data.actual_instance, Inline):
        if not test_data.actual_instance.inline:
            raise ValidationException("testCases.inline must contain at least one test case")
    # Check for missing datasetId in dataset reference
    if isinstance(test_data.actual_instance, DatasetSource):
        if not test_data.actual_instance.dataset.dataset_id:
            raise ValidationException("testCases.dataset.datasetId is required")


def _validate_report_has_results(report_id: str) -> None:
    """Validate that a report exists and has at least one result."""
    report_dao = get_report_dao()
    result_dao = get_result_dao()

    report = report_dao.get(report_id)
    if not report:
        raise ResourceNotFoundException(f"Report '{report_id}' not found")

    results, _ = result_dao.query_by_report(report_id, max_results=1)
    if not results:
        raise ValidationException(f"Report '{report_id}' has no results to score")


def _parse_test_data() -> _ParsedTestData:
    """Parse testCases union from raw body and extract dataset_id.

    Raises ValidationException if testCases is missing or invalid.
    """
    raw_body = app.current_event.json_body or {}
    test_data: Optional[TestDataSource] = None
    if raw_body.get("testCases"):
        test_data = TestDataSource.from_dict(raw_body["testCases"])

    _validate_test_data(test_data)
    assert test_data is not None  # guaranteed by _validate_test_data

    dataset_id: Optional[str] = None
    if isinstance(test_data.actual_instance, DatasetSource):
        dataset_id = test_data.actual_instance.dataset.dataset_id

    return _ParsedTestData(test_data=test_data, dataset_id=dataset_id)


def _scorers_to_dict(scorers: Optional[dict[str, Optional[ScorerConfig]]]) -> Optional[dict[str, Any]]:
    """Convert client ScorerConfig map to plain dict for DDB storage."""
    if not scorers:
        return None
    return {k: v.to_dict() if v else None for k, v in scorers.items()}


def _build_score_task(
    scorer_name: str,
    config: Optional[dict[str, Any]],
    evaluator_name: str,
) -> _ScoreTask:
    return _ScoreTask(
        task_key=f"score:{scorer_name}",
        evaluator_name=evaluator_name,
        scorers={scorer_name: config},
    )


def _submit_job(
    *,
    evaluator_name: str,
    job_type: JobType,
    job_id: Optional[str] = None,
    report_id: Optional[str] = None,
    create_report: Optional[bool] = None,
    source_report_id: Optional[str] = None,
    test_data: Optional[TestDataSource] = None,
    dataset_id: Optional[str] = None,
    scorers: Optional[dict[str, Optional[ScorerConfig]]] = None,
    app_config: Optional[dict[str, Any]] = None,
    report_name: Optional[str] = None,
    experiment_name: Optional[str] = None,
    process_locally: bool = False,
    continue_buffer_ms: int,
    heartbeat_seconds: int,
) -> _SubmittedJob:
    """Create job, determine topology, store in DDB, start SFN execution."""
    job_dao = get_job_dao()
    report_dao = get_report_dao()

    job_id = job_id or generate_id()
    # Decide whether to create the report:
    # - create_report=True: always create (scheduler path with deterministic IDs)
    # - create_report=False: never create (caller pre-created the report)
    # - create_report=None (default): create only if report_id was not supplied
    should_create_report = create_report if create_report is not None else (report_id is None)
    report_id = report_id or generate_id()
    now = datetime.now(timezone.utc)

    # --- Resolve evaluator topology ---
    app_evaluator = (app_config or {}).get("evaluatorName") or evaluator_name
    scorers_dict = _scorers_to_dict(scorers)

    # Group scorers by resolved evaluatorName
    scorer_groups: dict[str, dict[str, Any]] = {}
    any_explicit_evaluator = False
    for sname, config in (scorers_dict or {}).items():
        explicit = (config or {}).get("evaluatorName")
        if explicit:
            any_explicit_evaluator = True
        eval_name = explicit or evaluator_name
        scorer_groups.setdefault(eval_name, {})[sname] = config

    # Split into separate tasks when scorers explicitly set evaluatorName.
    # This enables multi-evaluator topology even when all scorers resolve to
    # the same Lambda — each scorer gets its own EventBridge dispatch.
    #
    # SCORE jobs (no source_report_id) are special: there is no app to invoke —
    # results are already pre-written — so a normal split would build a spurious
    # APP_INVOKE primary pointed at an evaluator with no deployed worker. Instead:
    #  - a single resolved evaluator runs unsplit as one SCORE primary
    #    (score-in-place); see the JobType.SCORE branch.
    #  - multiple evaluators fan out as parallel score tasks with NO primary
    #    (skip_primary), analogous to how source_report_id uses a pre-completed
    #    COPY_RESULTS primary. The ASL's CheckSkipPrimaryTask jumps straight to
    #    parallel scoring.
    inline_score = job_type == JobType.SCORE and not source_report_id
    multi_score_evaluators = inline_score and len(scorer_groups) > 1
    should_split = not inline_score and (
        any_explicit_evaluator or (
            len(scorer_groups) > 1 or not set(scorer_groups.keys()) <= {app_evaluator}
        )
    )

    # --- Build tasks ---
    primary_task: Optional[_PrimaryTask]
    score_tasks: list[_ScoreTask]
    skip_primary = False

    if source_report_id:
        primary_task = _PrimaryTask(
            task_key="copy_results", job_type="COPY_RESULTS",
            evaluator_name=None, source_report_id=source_report_id,
            pre_completed=True,
        )
        score_tasks = [
            _build_score_task(n, c, e)
            for e, g in scorer_groups.items() for n, c in g.items()
        ]
    elif multi_score_evaluators:
        # No primary — results are already present; scoring fans out to each
        # evaluator as a parallel score task. SFN skips the primary phase.
        primary_task = None
        skip_primary = True
        score_tasks = [
            _build_score_task(n, c, e)
            for e, g in scorer_groups.items() for n, c in g.items()
        ]
    elif should_split:
        primary_task = _PrimaryTask(
            task_key="app_invoke", job_type="APP_INVOKE",
            evaluator_name=app_evaluator,
        )
        score_tasks = [
            _build_score_task(n, c, e)
            for e, g in scorer_groups.items() for n, c in g.items()
        ]
    elif job_type == JobType.APP_INVOKE:
        primary_task = _PrimaryTask(
            task_key="app_invoke", job_type="APP_INVOKE",
            evaluator_name=app_evaluator,
        )
        score_tasks = []
    elif job_type == JobType.SCORE:
        sname = next(iter(scorers_dict)) if scorers_dict else "default"
        # Route scoring to the evaluator the scorers resolved to (the single
        # group when set explicitly), not the path evaluator — the path
        # evaluator may have no deployed worker for a remote-only score.
        score_evaluator = next(iter(scorer_groups)) if scorer_groups else app_evaluator
        primary_task = _PrimaryTask(
            task_key=f"score:{sname}", job_type="SCORE",
            evaluator_name=score_evaluator,
        )
        score_tasks = []
    else:
        primary_task = _PrimaryTask(
            task_key="full", job_type="FULL",
            evaluator_name=app_evaluator,
        )
        score_tasks = []

    # Build tasks map for DDB
    tasks_map: dict[str, TaskEntry] = {}
    if primary_task is not None:
        primary_status = "COMPLETED" if primary_task.pre_completed else "PENDING"
        tasks_map[primary_task.task_key] = TaskEntry(
            status=primary_status, evaluatorName=primary_task.evaluator_name,
        )
    for st in score_tasks:
        tasks_map[st.task_key] = TaskEntry(
            status="PENDING", evaluatorName=st.evaluator_name, scorers=st.scorers,
        )
    tasks_map["post_process"] = TaskEntry(status="PENDING")

    # --- Create report if needed ---
    if should_create_report:
        report_item = ReportItem(
            report_id=report_id,
            created_at=now.isoformat(),
            name=report_name or f"{evaluator_name} - {job_type.value}",
            experiment_name=experiment_name,
        )
        report_dao.put(report_item)

    # --- Create job item ---
    job_item = JobItem(
        evaluator_name=evaluator_name,
        job_id=job_id,
        job_type=job_type.value,
        report_id=report_id,
        source_report_id=source_report_id,
        experiment_name=experiment_name,
        status=JobStatus.PENDING,
        created_at=now.isoformat(),
        dataset_id=dataset_id,
        test_data=test_data.to_dict() if test_data else None,  # type: ignore[arg-type]
        scorers=scorers_dict,
        app=app_config,
        tasks=tasks_map,
    )
    job_dao.put(job_item)

    # Link job to report
    report_dao.append_job_id(report_id, job_id)

    # Start SFN execution (skip when caller processes locally — e.g. SDK evaluate())
    if not process_locally:
        sf_input = {
            "jobId": job_id,
            "reportId": report_id,
            "app": app_config,
            # When skip_primary, the primary phase is bypassed by the ASL and
            # this placeholder is never dispatched — but the field must exist.
            "primaryTask": {
                "taskKey": primary_task.task_key, "jobType": primary_task.job_type,
                "evaluatorName": primary_task.evaluator_name,
                "sourceReportId": primary_task.source_report_id,
            } if primary_task is not None else None,
            "scoreTasks": [
                {"taskKey": st.task_key, "evaluatorName": st.evaluator_name,
                 "scorers": st.scorers}
                for st in score_tasks
            ],
            "postProcessTask": {"taskKey": "post_process", "jobType": "POST_PROCESS"},
            "postProcessCheckpoint": None,
            "testCases": test_data.to_dict() if test_data else None,
            "scorers": scorers_dict,
            "experimentName": experiment_name,
            "checkpoint": None,
            "skipToPostProcess": False,
            "skipPrimaryTask": skip_primary,
            "continueBufferMs": continue_buffer_ms,
            "heartbeatSeconds": heartbeat_seconds,
        }
        try:
            get_sfn_client().start_execution(
                stateMachineArn=STATE_MACHINE_ARN(),
                name=job_id,
                input=json.dumps(sf_input, default=str),
            )
        except ClientError as e:
            if e.response["Error"]["Code"] == "ExecutionAlreadyExists":
                # Idempotent retry — execution is already running, nothing to do
                logger.info("SFN execution already exists for job %s (idempotent retry)", job_id)
            else:
                logger.exception("Failed to start SFN execution for job %s", job_id)
                for tk in tasks_map:
                    try:
                        job_dao.update_task_status(job_id, tk, "FAILED",
                                                   error="Failed to start orchestration")
                    except Exception:
                        pass
                raise
        except Exception:
            logger.exception("Failed to start SFN execution for job %s", job_id)
            for tk in tasks_map:
                try:
                    job_dao.update_task_status(job_id, tk, "FAILED",
                                               error="Failed to start orchestration")
                except Exception:
                    pass
            raise

    job = EvaluationJob(
        jobId=job_id,
        evaluatorName=evaluator_name,
        jobType=job_type,
        reportId=report_id,
        sourceReportId=source_report_id,
        experimentName=experiment_name,
        scorers=scorers,
        createdAt=now,
    )

    return _SubmittedJob(
        job_id=job_id, report_id=report_id, job=job, created_at=now,
        experiment_name=experiment_name,
    )


def _copy_results_from_source(
    source_report_id: str,
    target_report_id: str,
) -> None:
    """Validate source report, create new report, copy results (scores stripped)."""
    report_dao = get_report_dao()
    result_dao = get_result_dao()

    source_report = report_dao.get(source_report_id)
    if not source_report:
        raise ResourceNotFoundException(f"Source report '{source_report_id}' not found")

    now_iso = datetime.now(timezone.utc).isoformat()
    source_name = source_report.name or source_report_id
    new_report = ReportItem(
        report_id=target_report_id,
        created_at=now_iso,
        name=f"Score: {source_name}",
        metadata={"sourceReportId": source_report_id},
    )
    report_dao.put(new_report)

    # Copy all results from source report (paginate)
    next_token: Optional[str] = None
    while True:
        results, next_token = result_dao.query_by_report(source_report_id, next_token=next_token)
        for result in results:
            copied = ResultItem(
                report_id=target_report_id,
                result_id=result.result_id,
                created_at=now_iso,
                scores={},
                testcase_id=result.testcase_id,
                input=result.input,
                output=result.output,
                expected=result.expected,
                context=result.context,
                app_metrics=result.app_metrics,
            )
            result_dao.put(copied)
        if not next_token:
            break


def _write_inline_results_to_report(
    report_id: str,
    test_results: list[Any],
) -> None:
    """Pre-write inline test results to the report so scorers can score them in place.

    Creates a new report and stores each test result as a ResultItem (with output
    preserved). Scorer tasks then use the standard 'score existing results' path
    to iterate and add scores — no large payload passed through the SFN state machine.
    """
    report_dao = get_report_dao()
    result_dao = get_result_dao()
    now_iso = datetime.now(timezone.utc).isoformat()

    report_dao.put(ReportItem(
        report_id=report_id,
        created_at=now_iso,
    ))

    for r in test_results:
        result_dao.put(ResultItem(
            report_id=report_id,
            result_id=generate_id(),
            created_at=now_iso,
            input=r.input,
            output=r.output,
            expected=r.expected,
            context=getattr(r, "context", None),
            metadata=getattr(r, "metadata", None),
            scores={},
        ))


@app.post("/v2/evaluators/<evaluator_name>/jobs/evaluate")
def submit_evaluation_job(
    evaluator_name: str, body: SubmitEvaluationJobRequestContent
) -> SubmitEvaluationJobResponseContent:
    """Submit a full evaluation job: fetch test data, invoke app, and score."""
    parsed = _parse_test_data()

    submitted = _submit_job(
        evaluator_name=evaluator_name,
        job_type=JobType.FULL,
        report_id=body.report_id,
        test_data=parsed.test_data,
        dataset_id=parsed.dataset_id,
        scorers=body.scorers,
        app_config=body.app.to_dict() if body.app else None,
        report_name=body.report_name,
        experiment_name=body.experiment_name,
        process_locally=bool(body.process_locally),
        continue_buffer_ms=int(body.continue_buffer_ms or 60000),
        heartbeat_seconds=int(body.heartbeat_seconds or 300),
    )

    return SubmitEvaluationJobResponseContent(
        jobId=submitted.job_id, reportId=submitted.report_id, evaluatorName=evaluator_name,
        jobType=JobType.FULL, status=ApiJobStatus.PENDING, createdAt=submitted.created_at,
        experimentName=submitted.experiment_name, job=submitted.job,
    )


@app.post("/v2/evaluators/<evaluator_name>/jobs/score")
def submit_scoring_job(
    evaluator_name: str, body: SubmitScoringJobRequestContent
) -> SubmitScoringJobResponseContent:
    """Submit a scoring-only job: score existing results, or inline test results with outputs."""
    report_id = body.report_id
    source_report_id = body.source_report_id
    has_test_results = body.test_results is not None and len(body.test_results) > 0

    if source_report_id and (report_id or has_test_results):
        raise ValidationException(
            "sourceReportId is mutually exclusive with reportId and testResults"
        )
    if not source_report_id and not report_id and not has_test_results:
        raise ValidationException(
            "Provide at least one of: reportId (score in place), sourceReportId (copy and score), "
            "or testResults (inline results with outputs)"
        )

    if source_report_id:
        _validate_report_has_results(source_report_id)
        report_id = generate_id()
        _copy_results_from_source(source_report_id, report_id)
    elif has_test_results:
        # Pre-write inline test results to the report so scorer tasks can
        # use the standard "score existing results" path. This avoids needing
        # to pass potentially large testResults through the SFN state machine.
        report_id = report_id or generate_id()
        _write_inline_results_to_report(report_id, body.test_results or [])
    elif report_id:
        _validate_report_has_results(report_id)

    submitted = _submit_job(
        evaluator_name=evaluator_name,
        job_type=JobType.SCORE,
        report_id=report_id,
        source_report_id=source_report_id,
        scorers=body.scorers,
        report_name=body.report_name,
        experiment_name=body.experiment_name,
        process_locally=bool(body.process_locally),
        continue_buffer_ms=int(body.continue_buffer_ms or 60000),
        heartbeat_seconds=int(body.heartbeat_seconds or 300),
    )

    return SubmitScoringJobResponseContent(
        jobId=submitted.job_id, reportId=submitted.report_id,
        sourceReportId=source_report_id, evaluatorName=evaluator_name,
        jobType=JobType.SCORE, status=ApiJobStatus.PENDING,
        createdAt=submitted.created_at, experimentName=submitted.experiment_name,
        job=submitted.job,
    )


@app.post("/v2/evaluators/<evaluator_name>/jobs/invoke")
def submit_app_invocation_job(
    evaluator_name: str, body: SubmitAppInvocationJobRequestContent
) -> SubmitAppInvocationJobResponseContent:
    """Submit an app invocation job: invoke app and record results (no scoring)."""
    parsed = _parse_test_data()

    submitted = _submit_job(
        evaluator_name=evaluator_name,
        job_type=JobType.APP_INVOKE,
        report_id=body.report_id,
        test_data=parsed.test_data,
        dataset_id=parsed.dataset_id,
        app_config=body.app.to_dict() if body.app else None,
        report_name=body.report_name,
        experiment_name=body.experiment_name,
        process_locally=bool(body.process_locally),
        continue_buffer_ms=int(body.continue_buffer_ms or 60000),
        heartbeat_seconds=int(body.heartbeat_seconds or 300),
    )

    return SubmitAppInvocationJobResponseContent(
        jobId=submitted.job_id, reportId=submitted.report_id, evaluatorName=evaluator_name,
        jobType=JobType.APP_INVOKE, status=ApiJobStatus.PENDING,
        createdAt=submitted.created_at, experimentName=submitted.experiment_name,
        job=submitted.job,
    )


def _compute_api_status(job: JobItem) -> str:
    if job.tasks:
        return compute_job_status(job.tasks)
    return job.status


def _compute_job_stage(job: JobItem) -> str:
    """Compute job stage from the task map.

    The stored 'stage' field is only written on the local-SDK path. For orchestrated
    jobs, derive stage from which tasks are active/completed.
    """
    if job.tasks:
        statuses = {k: v.status for k, v in job.tasks.items()}
        terminal = {"COMPLETED", "FAILED"}

        # All tasks terminal → COMPLETE
        if all(s in terminal for s in statuses.values()):
            return "COMPLETE"

        # Any score task is RUNNING or COMPLETED → SCORING
        score_tasks = {k: s for k, s in statuses.items() if k.startswith("score:")}
        if score_tasks and any(s in ("RUNNING", "COMPLETED") for s in score_tasks.values()):
            return "SCORING"

        # Primary task (non-score, non-post_process) RUNNING → INVOKING
        primary_keys = [k for k in statuses if k not in ("post_process",) and not k.startswith("score:")]
        if any(statuses[k] == "RUNNING" for k in primary_keys):
            return "INVOKING"

        return "PENDING"

    # Fallback: use stored stage (local-SDK path)
    return job.stage or "PENDING"


def _tasks_to_api(tasks: Optional[dict[str, TaskEntry]]) -> Optional[dict[str, TaskState]]:
    if not tasks:
        return None
    result: dict[str, TaskState] = {}
    for key, val in tasks.items():
        result[key] = TaskState(
            status=ApiTaskStatus(val.status),
            evaluatorName=val.evaluatorName,
            error=val.error,
        )
    return result


@app.get("/v2/jobs/<job_id>")
def get_evaluator_job(job_id: str) -> GetEvaluatorJobResponseContent:
    """Get job details."""
    job_dao = get_job_dao()

    job = job_dao.get(job_id)
    if not job:
        raise ResourceNotFoundException(f"Job '{job_id}' not found")

    created_at = datetime.fromisoformat(job.created_at) if job.created_at else None
    updated_at = datetime.fromisoformat(job.updated_at) if job.updated_at else None

    error: Optional[JobError] = None
    if job.error:
        error = JobError(
            code=job.error.code or "",
            message=job.error.message or "",
            stackTrace=job.error.stackTrace,
        )

    scorers: Optional[dict[str, Optional[ScorerConfig]]] = None
    if job.scorers:
        scorers = {
            k: (ScorerConfig.from_dict(v) or ScorerConfig()) if isinstance(v, dict) else ScorerConfig()
            for k, v in job.scorers.items()
        }

    return GetEvaluatorJobResponseContent(
        jobId=job.job_id,
        evaluatorName=job.evaluator_name,
        jobType=JobType(job.job_type),
        status=ApiJobStatus(_compute_api_status(job)),
        reportId=job.report_id,
        sourceReportId=job.source_report_id,
        scorers=scorers,
        tasks=_tasks_to_api(job.tasks) or {},
        stage=JobStage(_compute_job_stage(job)),
        result=job.result,
        error=error,
        experimentName=job.experiment_name,
        createdAt=created_at,
        updatedAt=updated_at,
    )


@app.get("/v2/jobs")
def list_jobs() -> ListJobsResponseContent:
    """List all jobs (paginated)."""
    job_dao = get_job_dao()

    query_params = app.current_event.query_string_parameters or {}
    max_results_str = query_params.get("maxResults")
    try:
        max_results = int(max_results_str) if max_results_str else None
    except ValueError:
        raise ValidationException(f"maxResults must be an integer, got '{max_results_str}'")  # noqa: B904
    next_token = query_params.get("nextToken")

    items, result_next_token = job_dao.list_all(
        max_results=max_results,
        next_token=next_token,
    )

    jobs = [
        EvaluatorJobSummary(
            jobId=item.job_id,
            jobType=JobType(item.job_type),
            status=ApiJobStatus(_compute_api_status(item)),
            reportId=item.report_id,
            createdAt=datetime.fromisoformat(item.created_at) if item.created_at else None,
            updatedAt=datetime.fromisoformat(item.updated_at) if item.updated_at else None,
        )
        for item in items
    ]

    return ListJobsResponseContent(jobs=jobs, nextToken=result_next_token)


@app.put("/v2/jobs/<job_id>/status")
def update_job_status(
    job_id: str, body: UpdateEvaluatorJobStatusRequestContent
) -> UpdateEvaluatorJobStatusResponseContent:
    """Update job status — dispatches to task lifecycle or legacy path.

    If OrchestrationContext is present (orchestrated task), routes through
    the shared task lifecycle functions: start_task, checkpoint_task, complete_task.
    Otherwise (local SDK evaluate), updates legacy status field directly.
    """
    job_dao = get_job_dao()

    if body.orchestration:
        # --- Orchestrated task: has taskKey + taskToken ---
        orch = body.orchestration
        task_key = orch.task_key
        task_token = orch.task_token

        if body.status == ApiTaskStatus.RUNNING and body.checkpoint:
            # CONTINUE — checkpoint + signal SFN
            checkpoint_task(
                job_id, task_key,
                body.checkpoint if isinstance(body.checkpoint, dict) else {},
                task_token=task_token,
            )
        elif body.status == ApiTaskStatus.RUNNING:
            # First RUNNING or heartbeat
            start_task(job_id, task_key, task_token=task_token)
        elif body.status in (ApiTaskStatus.COMPLETED, ApiTaskStatus.FAILED):
            error_msg = body.error.message if body.error else None
            complete_task(
                job_id, task_key, body.status.value,
                task_token=task_token, error=error_msg,
            )

        updated_at = datetime.now(timezone.utc)
        return UpdateEvaluatorJobStatusResponseContent(
            jobId=job_id, status=body.status, updatedAt=updated_at,
        )

    # --- Local SDK evaluate: no orchestration context ---
    error_item: Optional[JobErrorItem] = None
    if body.error:
        error_item = JobErrorItem(
            code=body.error.code,
            message=body.error.message,
            stackTrace=body.error.stack_trace,
        )

    try:
        updated_at = job_dao.update_status(
            job_id=job_id,
            status=body.status.value,
            stage=body.stage,
            result=body.result,
            error=error_item,
        )
    except ClientError as e:
        if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
            raise ResourceNotFoundException(f"Job '{job_id}' not found") from e
        raise

    # Sync tasks map + pre-processing hook
    job = job_dao.get(job_id)
    if job and job.tasks:
        _sync_tasks_for_non_orchestrated(job_dao, job_id, job.tasks, body)

    if body.status == ApiTaskStatus.RUNNING and job:
        handle_running(job)

    return UpdateEvaluatorJobStatusResponseContent(jobId=job_id, status=body.status, updatedAt=updated_at)


def _find_primary_task_key(tasks: dict[str, TaskEntry]) -> Optional[str]:
    """Find the primary (non-score, non-post-process) task key."""
    for key in tasks:
        if key != "post_process" and not key.startswith("score:"):
            return key
    return None


def _sync_tasks_for_non_orchestrated(
    job_dao: Any, job_id: str,
    tasks: dict[str, TaskEntry],
    body: UpdateEvaluatorJobStatusRequestContent,
) -> None:
    """Sync tasks map for a non-orchestrated status update.

    Non-orchestrated calls apply to the entire job, not individual tasks.
    Dispatches to a handler per status value.
    """
    try:
        if body.status == ApiTaskStatus.RUNNING:
            _sync_running(job_dao, job_id, tasks)
        elif body.status == ApiTaskStatus.COMPLETED:
            _sync_completed(job_dao, job_id, tasks)
        elif body.status == ApiTaskStatus.FAILED:
            error_msg = body.error.message if body.error else None
            _sync_failed(job_dao, job_id, tasks, error_msg)
    except Exception:
        logger.exception("Failed to sync tasks for job %s", job_id)


def _sync_running(job_dao: Any, job_id: str, tasks: dict[str, TaskEntry]) -> None:
    primary_key = _find_primary_task_key(tasks)
    if primary_key:
        job_dao.update_task_status(job_id, primary_key, "RUNNING")


def _sync_completed(job_dao: Any, job_id: str, tasks: dict[str, TaskEntry]) -> None:
    """Mark tasks COMPLETED and trigger inline post-processing if ready."""
    terminal = ("COMPLETED", "FAILED")
    non_pp = {k: v for k, v in tasks.items() if k != "post_process"}

    # Multi-evaluator (distinct evaluator names) → only mark primary task.
    # Single-evaluator → mark all non-PP tasks (handler ran everything).
    evaluator_names = {v.evaluatorName for v in non_pp.values() if v.evaluatorName}
    if len(evaluator_names) > 1:
        primary_key = _find_primary_task_key(tasks)
        if primary_key:
            job_dao.update_task_status(job_id, primary_key, "COMPLETED")
    else:
        for tk, tv in non_pp.items():
            if tv.status not in terminal:
                job_dao.update_task_status(job_id, tk, "COMPLETED")

    # Trigger inline post-processing when ALL non-PP tasks are terminal
    if "post_process" not in tasks:
        return
    updated_job = job_dao.get(job_id)
    if not updated_job or not updated_job.tasks:
        return
    all_done = all(
        t.status in terminal
        for k, t in updated_job.tasks.items()
        if k != "post_process"
    )
    if all_done:
        _start_post_processing_execution(job_dao, job_id)


def _sync_failed(
    job_dao: Any, job_id: str, tasks: dict[str, TaskEntry], error_msg: str | None,
) -> None:
    terminal = ("COMPLETED", "FAILED")
    for tk, tv in tasks.items():
        if tv.status not in terminal:
            job_dao.update_task_status(job_id, tk, "FAILED", error=error_msg)


def _start_post_processing_execution(job_dao: Any, job_id: str) -> None:
    """Start a SFN execution to run post-processing for a non-orchestrated job.

    Uses skipToPostProcess=true so the SFN jumps straight to EmitPostProcessTask.
    The SFN handles the full PP lifecycle including CONTINUE for large datasets.
    """
    job = job_dao.get(job_id)
    if not job:
        return

    sf_input = {
        "jobId": job_id,
        "reportId": job.report_id,
        "primaryTask": {"taskKey": "full", "jobType": "FULL"},
        "scoreTasks": [],
        "postProcessTask": {"taskKey": "post_process", "jobType": "POST_PROCESS"},
        "postProcessCheckpoint": None,
        "skipToPostProcess": True,
        "skipPrimaryTask": False,
        "experimentName": job.experiment_name,
        "continueBufferMs": None,
        "heartbeatSeconds": 300,
        "checkpoint": None,
    }
    try:
        get_sfn_client().start_execution(
            stateMachineArn=STATE_MACHINE_ARN(),
            name=f"{job_id}-pp",
            input=json.dumps(sf_input, default=str),
        )
        logger.info("Started post-processing SFN execution for job %s", job_id)
    except Exception:
        logger.exception("Failed to start post-processing for job %s", job_id)
        job_dao.update_task_status(
            job_id, "post_process", "FAILED",
            error="Failed to start post-processing",
        )


