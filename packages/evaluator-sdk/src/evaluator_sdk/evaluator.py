"""Evaluator SDK - main Evaluator class and EtkClient factory."""

import inspect
import logging
import time
import uuid
from collections.abc import Iterable
from typing import Any, Callable, TypedDict

from awssolutions_gen_ai_evaluation_toolkit_python_client import ApiClient
from awssolutions_gen_ai_evaluation_toolkit_python_client.api import DefaultApi  # type: ignore[attr-defined]
from awssolutions_gen_ai_evaluation_toolkit_python_client.models import (  # type: ignore[attr-defined]
    AnnotationConditionExpression,
    AppConfig,
    BatchResultInput,
    BatchScoreItem,
    CreateReportRequestContent,
    GetTestCaseResponseContent,
    InlineTestCase,
    InlineTestResult,
    JobError,
    JobStatus,
    ListTestCasesRequestContent,
    ListTestCasesResponseContent,
    ListTestResultsResponseContent,
    OrchestrationContext,
    ScoreInput,
    ScorerConfig,
    SubmitAppInvocationJobRequestContent,
    SubmitEvaluationJobRequestContent,
    SubmitScoringJobRequestContent,
    TaskStatus,
    TestCaseReference,
    TestDataSource,
    UpdateEvaluatorJobStatusRequestContent,
)
from awssolutions_gen_ai_evaluation_toolkit_python_client.models import (  # type: ignore[attr-defined]
    TestResult as ApiTestResult,
)

from evaluator_sdk.batching import _BatchFlusher, _ResultCollector
from evaluator_sdk.log_context import clear_job_context, job_log_context, set_job_context
from evaluator_sdk.models import (
    AppInvokeFn,
    EvaluationResponse,
    EvaluationResult,
    EvaluatorError,
    ScoreResult,
    ScorerFn,
    TestCase,
    TestResult,
)
from evaluator_sdk.scorer import Scorer, _scorer_name, _to_score_result

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Typed dicts for structured data that flows through handler code
# ---------------------------------------------------------------------------


class DatasetInfo(TypedDict):
    dataset_id: str
    version: str
    annotation_filter: dict[str, Any] | None


class HandlerResult(TypedDict, total=False):
    status: str
    jobId: str
    reportId: str
    error: str
    reason: str


def _should_continue(context: Any, buffer_ms: int) -> bool:
    """Check if we're approaching Lambda timeout and should CONTINUE."""
    return (
        context is not None
        and hasattr(context, "get_remaining_time_in_millis")
        and context.get_remaining_time_in_millis() < buffer_ms
    )


# Terminal job statuses returned by the API's computed job status.
_TERMINAL_JOB_STATUSES = frozenset(
    {JobStatus.SUCCESS, JobStatus.FAILURE, JobStatus.PARTIAL_FAILURE}
)

# Poll settings for the remote (server-orchestrated) path. The timeout is
# progress-based (see _wait_for_job): we tolerate this many seconds of NO
# observable progress before giving up, but reset the window whenever the job
# advances — so a healthy long-running job is never abandoned, while a stalled
# one is still bounded. The window is a multiple of the heartbeat interval so it
# comfortably exceeds the server's own per-task liveness bound.
_REMOTE_POLL_INTERVAL_S = 5.0
_REMOTE_POLL_CEILING_MULTIPLE = 4  # stall window = heartbeat_seconds * this
_DEFAULT_HEARTBEAT_SECONDS = 300  # matches the server-side default


def _is_remote(config: dict[str, Any] | None) -> bool:
    """A task is remote iff its config carries an evaluatorName."""
    return config is not None and bool(config.get("evaluatorName"))


def _to_score_input(sr: ScoreResult) -> ScoreInput:
    """Map a ScoreResult to the API's ScoreInput, preserving value, error, reason, and context."""
    return ScoreInput(value=sr.value, error=sr.error, reason=sr.reason, context=sr.context)


def EtkClient(  # noqa: N802 — function named as class for public API convenience
    api_endpoint: str | None = None,
    region: str = "us-east-1",
) -> DefaultApi:
    """Create an ETK API client that can be shared across Evaluator instances."""
    return DefaultApi(ApiClient(etk_api_endpoint=api_endpoint, aws_region=region))


class Evaluator:
    """Simple evaluator that processes evaluation jobs.

    Uses the generated DefaultApi client for API calls.
    """

    def __init__(
        self,
        name: str,
        api_endpoint: str | None = None,
        app_invoke: AppInvokeFn | list[AppInvokeFn] | None = None,
        scorers: list[ScorerFn | type[Scorer]] | None = None,
        region: str = "us-east-1",
        batch_size: int = 20,
        local_only: bool = False,
        client: DefaultApi | None = None,
    ) -> None:
        if batch_size < 1:
            raise ValueError(f"batch_size must be >= 1, got {batch_size}")

        self.name = name

        # Normalize app_invoke to a dict (like scorers)
        self.app_invokes: dict[str, AppInvokeFn] = {}
        if app_invoke is not None:
            fns = app_invoke if isinstance(app_invoke, list) else [app_invoke]
            for fn in fns:
                fn_name = getattr(fn, "__name__", None) or str(fn)
                if fn_name in self.app_invokes:
                    raise EvaluatorError(f"Duplicate app_invoke name '{fn_name}'")
                self.app_invokes[fn_name] = fn
        self.scorers: dict[str, ScorerFn | Scorer] = {}
        for raw in scorers or []:
            sname = _scorer_name(raw)
            if sname in self.scorers:
                raise EvaluatorError(
                    f"Duplicate scorer name '{sname}'. "
                    f"Use the 'name' attribute on Scorer subclasses to disambiguate."
                )
            # Instantiate Scorer classes
            if isinstance(raw, type) and issubclass(raw, Scorer):
                self.scorers[sname] = raw()
            else:
                self.scorers[sname] = raw
        self.batch_size = batch_size
        self.local_only = local_only
        self._client: DefaultApi | None = None

        if local_only:
            pass
        elif client is not None:
            self._client = client
        else:
            self._client = DefaultApi(
                ApiClient(etk_api_endpoint=api_endpoint, aws_region=region)
            )

    @property
    def app_invoke(self) -> AppInvokeFn | None:
        """The default app_invoke function, or None if none registered.
        When multiple are registered, returns the first. Use _resolve_app_invoke(name)
        to select a specific one.
        """
        if not self.app_invokes:
            return None
        return next(iter(self.app_invokes.values()))

    def _resolve_app_invoke(self, app_invoke_name: str | None = None) -> AppInvokeFn:
        """Resolve the app_invoke function by name. Raises EvaluatorError if not found."""
        if not self.app_invokes:
            raise EvaluatorError("No app_invoke functions registered")
        if app_invoke_name:
            fn = self.app_invokes.get(app_invoke_name)
            if fn is None:
                raise EvaluatorError(
                    f"app_invoke '{app_invoke_name}' not registered. "
                    f"Available: {list(self.app_invokes)}"
                )
            return fn
        if len(self.app_invokes) == 1:
            return next(iter(self.app_invokes.values()))
        raise EvaluatorError(
            f"Multiple app_invoke functions registered ({list(self.app_invokes)}). "
            f"Specify app_invoke_name to select one."
        )

    @property
    def client(self) -> DefaultApi:
        """API client. Raises if accessed in local_only mode."""
        if self._client is None:
            raise EvaluatorError("client not available in local_only mode")
        return self._client

    def _update_job_status(
        self,
        job_id: str,
        status: TaskStatus,
        *,
        error: JobError | None = None,
        result: Any = None,
        task_token: str | None = None,
        task_key: str | None = None,
        checkpoint: dict[str, Any] | None = None,
    ) -> None:
        if self.local_only:
            return
        logger.info("Updating job %s status → %s", job_id, status.value)
        orchestration = None
        if task_token and task_key:
            orchestration = OrchestrationContext(
                taskToken=task_token, taskKey=task_key,
            )
        self.client.update_evaluator_job_status(
            job_id=job_id,
            update_evaluator_job_status_request_content=(
                UpdateEvaluatorJobStatusRequestContent(
                    status=status, error=error, result=result,
                    checkpoint=checkpoint, orchestration=orchestration,
                )
            ),
        )

    def _resolve_scorer_config(
        self, scorers_config: dict[str, dict[str, Any] | None] | None
    ) -> dict[str, dict[str, Any] | None]:
        """Resolve scorer config using the evaluatorName-first partition rule.

        - A scorer whose config carries ``evaluatorName`` runs remotely; the name
          need not be locally registered.
        - A scorer with no ``evaluatorName`` runs locally and must be registered.

        Returns dict of scorer_name → config (None = defaults).
        """
        if scorers_config is None:
            return dict.fromkeys(self.scorers, None)

        for name, config in scorers_config.items():
            if _is_remote(config):
                continue  # remote — routed by evaluatorName, no local impl needed
            if name not in self.scorers:
                raise EvaluatorError(
                    f"Scorer '{name}' is not registered and has no evaluatorName. "
                    f"Either register it on the Evaluator, or set evaluatorName to "
                    f"run it on a remote worker. Registered: {list(self.scorers.keys())}"
                )

        return scorers_config

    @staticmethod
    def _to_scorer_configs(
        scorer_configs: dict[str, dict[str, Any] | None] | None,
    ) -> dict[str, ScorerConfig | None] | None:
        """Convert resolved scorer config dicts to wire ScorerConfig objects."""
        if not scorer_configs:
            return None
        return {
            name: (ScorerConfig.from_dict(cfg) if cfg else None)
            for name, cfg in scorer_configs.items()
        }

    def _classify_execution(
        self,
        scorer_configs: dict[str, dict[str, Any] | None] | None,
        app: dict[str, Any] | None,
    ) -> bool:
        """Decide whether a call runs remotely, and reject mixed local/remote.

        Returns True if the call is fully remote (every task carries an
        evaluatorName), False if fully local. Raises EvaluatorError if the call
        mixes local and remote tasks — hybrid execution is not yet supported.
        """
        remote: list[str] = []
        local: list[str] = []
        for name, config in (scorer_configs or {}).items():
            (remote if _is_remote(config) else local).append(f"scorer '{name}'")
        if app is not None:
            (remote if _is_remote(app) else local).append("app_invoke")

        if remote and local:
            raise EvaluatorError(
                "Cannot mix local and remote tasks in a single call: "
                f"{', '.join(local)} run in-process, {', '.join(remote)} run on a "
                "remote worker. Run them in separate calls (hybrid execution is not "
                "yet supported)."
            )
        if remote and self.local_only:
            raise EvaluatorError(
                "local_only mode cannot run remote tasks "
                f"({', '.join(remote)} set an evaluatorName). "
                "Construct the Evaluator with an api_endpoint to use remote workers."
            )
        return bool(remote)

    @staticmethod
    def _build_filter_body(annotation_filter: dict[str, Any] | None) -> Any:
        """Build ListTestCasesRequestContent with filter, or None if no filter."""
        if not annotation_filter:
            return None
        return ListTestCasesRequestContent(
            filter=AnnotationConditionExpression.from_dict(annotation_filter)
        )

    def _iter_dataset(
        self,
        dataset_id: str,
        version: str,
        annotation_filter: dict[str, Any] | None = None,
    ) -> Iterable[TestCase]:
        """Lazily page through dataset test cases via the API."""
        next_token: str | None = None
        body = self._build_filter_body(annotation_filter)
        while True:
            resp: ListTestCasesResponseContent = self.client.list_test_cases(
                dataset_id=dataset_id,
                version=version,
                max_results=200,
                next_token=next_token,
                list_test_cases_request_content=body,
            )
            refs: list[TestCaseReference] = resp.test_cases
            for ref in refs:
                tc_resp: GetTestCaseResponseContent = self.client.get_test_case(
                    dataset_id=dataset_id,
                    version=version,
                    test_case_id=ref.id,
                )
                yield TestCase(
                    input=tc_resp.input,
                    expected=tc_resp.expected,
                    context=tc_resp.context,
                    metadata=tc_resp.metadata,
                )
            next_token = resp.next_token
            if not next_token:
                break

    def _resolve_testcases(
        self,
        testcases: list[InlineTestCase | dict[str, Any]] | None,
        dataset_id: str | None,
        dataset_version: str | None,
        annotation_filter: dict[str, Any] | None = None,
    ) -> tuple[Iterable[TestCase], TestDataSource]:
        """Coerce inputs into a testcase iterable and TestDataSource.

        Returns (testcases, test_data) tuple.  For dataset sources the
        iterable is a lazy generator that pages through the API.
        """
        if testcases is not None and dataset_id is not None:
            raise EvaluatorError("Cannot specify both testcases and dataset_id")

        if testcases is not None:
            if annotation_filter:
                logger.warning(
                    "annotation_filter is ignored when inline testcases are provided "
                    "(filter only applies to dataset references)"
                )
            coerced: list[TestCase] = [
                tc if isinstance(tc, TestCase)
                else TestCase.model_validate(
                    tc if isinstance(tc, dict) else tc.model_dump()
                )
                for tc in testcases
            ]
            test_data = TestDataSource.from_dict({
                "inline": [
                    {
                        "input": tc.input, "expected": tc.expected,
                        "context": tc.context, "metadata": tc.metadata,
                    }
                    for tc in coerced
                ]
            })
            return coerced, test_data

        if dataset_id is not None:
            version = dataset_version or "head"
            ds_ref: dict[str, Any] = {"datasetId": dataset_id}
            if dataset_version is not None:
                ds_ref["datasetVersion"] = dataset_version
            if annotation_filter is not None:
                ds_ref["filter"] = annotation_filter
            test_data = TestDataSource.from_dict({"dataset": ds_ref})
            return self._iter_dataset(dataset_id, version, annotation_filter), test_data

        raise EvaluatorError("Must provide either testcases or dataset_id")

    def _run_scorer(
        self,
        name: str,
        impl: ScorerFn | Scorer,
        *,
        test_result: TestResult,
        config: dict[str, Any] | None,
    ) -> dict[str, ScoreResult]:
        """Run a single scorer. Returns dict of score name → ScoreResult."""
        results: dict[str, ScoreResult] = {}

        if isinstance(impl, Scorer):
            params: dict[str, Any] | None = None
            sub_scores: dict[str, dict[str, Any] | None] | None = None
            if isinstance(config, dict):
                params = config.get("params")
                sub_scores = config.get("scores")
            try:
                raw = impl.score(
                    test_result=test_result, scores=sub_scores, params=params,
                )
                for k, v in raw.items():
                    results[f"{name}.{k}"] = _to_score_result(v)
            except Exception as e:
                logger.exception("Scorer %s failed", name)
                score_keys = (
                    list(impl.available_scores.keys())
                    if impl.available_scores else [name]
                )
                for key in score_keys:
                    results[f"{name}.{key}"] = ScoreResult(error=str(e))
        else:
            # Simple function scorer — only pass kwargs it accepts
            fn_params: dict[str, Any] | None = None
            if isinstance(config, dict):
                fn_params = config.get(
                    "params",
                    config
                    if "params" not in config and "scores" not in config
                    else None,
                )
            kwargs: dict[str, Any] = {
                "test_result": test_result,
                "params": fn_params,
            }
            sig = inspect.signature(impl)
            accepted = set(sig.parameters.keys())
            kwargs = {k: v for k, v in kwargs.items() if k in accepted}
            try:
                raw_value = impl(**kwargs)
                results[name] = _to_score_result(raw_value)
            except Exception as e:
                logger.exception("Scorer %s failed", name)
                results[name] = ScoreResult(error=str(e))

        return results

    def _build_result(
        self,
        *,
        input_data: dict[str, Any],
        output: dict[str, Any] | None,
        expected: dict[str, Any] | None,
        all_scores: dict[str, ScoreResult],
        error: str | None,
        context: dict[str, Any] | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> tuple[EvaluationResult, BatchResultInput, dict[str, ScoreInput]]:
        """Build local result, batch input, and API scores from processed data."""
        api_scores: dict[str, ScoreInput] = {}
        for sname, sr in all_scores.items():
            api_scores[sname] = _to_score_input(sr)

        result = EvaluationResult(
            input_data=input_data,
            output=output,
            expected=expected,
            context=context,
            scores=all_scores,
            error=error,
            metadata=metadata,
        )
        result_id = uuid.uuid4().hex
        batch_input = BatchResultInput(
            input=input_data,
            output=output,
            expected=expected,
            context=context,
            error=error,
            metadata=metadata,
            result_id=result_id,  # type: ignore[call-arg]
        )
        return result, batch_input, api_scores

    def _call_app_fn(
        self,
        app_fn: AppInvokeFn,
        input_data: dict[str, Any],
        params: dict[str, Any] | None = None,
    ) -> Any:
        """Call app_fn, passing params only if the function declares it.

        Supports both signatures:
          def my_app(input_data: dict) -> dict
          def my_app(input_data: dict, params: dict | None) -> dict
        """
        sig = inspect.signature(app_fn)
        accepted = set(sig.parameters.keys())
        if "params" in accepted:
            return app_fn(input_data, params=params)
        return app_fn(input_data)

    def _process_testcase(
        self,
        testcase: InlineTestCase,
        scorer_configs: dict[str, dict[str, Any] | None],
        app_invoke_name: str | None = None,
        app_params: dict[str, Any] | None = None,
    ) -> tuple[EvaluationResult, BatchResultInput, dict[str, ScoreInput]]:
        """Run app_invoke + scorers for a single testcase.

        Returns (local_result, batch_input, score_inputs).
        """
        input_data = testcase.input or {}
        expected = testcase.expected
        context = testcase.context
        output: dict[str, Any] | None = None
        error: str | None = None

        app_fn = self._resolve_app_invoke(app_invoke_name)
        try:
            output = self._call_app_fn(app_fn, input_data, app_params)
        except Exception as e:
            error = str(e)
            logger.exception("app_invoke failed")

        metadata = testcase.metadata
        all_scores: dict[str, ScoreResult] = {}
        if output is not None and error is None:
            test_result = TestResult(
                input=input_data, output=output, expected=expected,
                context=context, metadata=metadata,
            )
            for scorer_name, config in scorer_configs.items():
                impl = self.scorers[scorer_name]
                scorer_results = self._run_scorer(
                    scorer_name, impl,
                    test_result=test_result, config=config,
                )
                all_scores.update(scorer_results)

        return self._build_result(
            input_data=input_data, output=output, expected=expected,
            context=context, all_scores=all_scores, error=error, metadata=metadata,
        )

    def _process_invoke_only(
        self,
        testcase: InlineTestCase,
        app_invoke_name: str | None = None,
        app_params: dict[str, Any] | None = None,
    ) -> tuple[EvaluationResult, BatchResultInput, dict[str, ScoreInput]]:
        """Run app_invoke only — no scoring.

        Returns (local_result, batch_input, empty_scores).
        """
        input_data = testcase.input or {}
        expected = testcase.expected
        output: dict[str, Any] | None = None
        error: str | None = None

        app_fn = self._resolve_app_invoke(app_invoke_name)
        try:
            output = self._call_app_fn(app_fn, input_data, app_params)
        except Exception as e:
            error = str(e)
            logger.exception("app_invoke failed")

        return self._build_result(
            input_data=input_data, output=output, expected=expected,
            context=testcase.context, all_scores={}, error=error, metadata=testcase.metadata,
        )

    def _process_score_only(
        self,
        *,
        input_data: dict[str, Any],
        output: dict[str, Any],
        expected: dict[str, Any] | None,
        scorer_configs: dict[str, dict[str, Any] | None],
        context: dict[str, Any] | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> tuple[EvaluationResult, BatchResultInput, dict[str, ScoreInput]]:
        """Run scorers on pre-existing output — no app_invoke.

        Returns (local_result, batch_input, score_inputs).
        """
        test_result = TestResult(
            input=input_data, output=output, expected=expected,
            context=context, metadata=metadata,
        )
        all_scores: dict[str, ScoreResult] = {}
        for scorer_name, config in scorer_configs.items():
            impl = self.scorers[scorer_name]
            scorer_results = self._run_scorer(
                scorer_name, impl,
                test_result=test_result, config=config,
            )
            all_scores.update(scorer_results)

        return self._build_result(
            input_data=input_data, output=output, expected=expected,
            context=context, all_scores=all_scores, error=None, metadata=metadata,
        )

    def _run_from_testcases(
        self,
        resolved: Iterable[TestCase],
        test_data: TestDataSource,
        experiment_name: str | None,
        process_fn: Callable[
            [TestCase, int],
            tuple[EvaluationResult, BatchResultInput, dict[str, ScoreInput]],
        ],
        *,
        submit_fn: Callable[[str], Any],  # receives report_id
        return_results: bool = True,
    ) -> EvaluationResponse:
        """Shared pipeline: create report, submit job, process testcases, flush.

        Callers must validate before calling this method.
        *submit_fn* receives a report_id and returns a response with ``job_id``.
        *return_results* controls whether local results are accumulated; when
        False, ``EvaluationResponse.results`` will be ``None``.
        When ``local_only`` is True, skips all API calls but runs the same
        processing logic.
        """
        # Short-circuit: no testcases means no API resources needed
        if isinstance(resolved, list) and len(resolved) == 0:
            return EvaluationResponse(
                report_id="", job_id="", results=[] if return_results else None,
            )

        if self.local_only:
            report_id = ""
            job_id = ""
        else:
            report_name = experiment_name or f"eval-{uuid.uuid4().hex[:8]}"
            create_resp = self.client.create_report(
                CreateReportRequestContent(name=report_name),
            )
            report_id = create_resp.report.report_id
            job_resp = submit_fn(report_id)
            job_id = job_resp.job_id
            logger.info("Created report=%s, job=%s", report_id, job_id)

        set_job_context(job_id=job_id, evaluator_name=self.name)
        self._update_job_status(job_id, TaskStatus.RUNNING)

        collector = _ResultCollector(
            self._client, report_id, self.batch_size,
            return_results=return_results, local_only=self.local_only,
        )

        try:
            for idx, testcase in enumerate(resolved):
                result, batch_input, score_inputs = process_fn(testcase, idx)
                collector.add_result(result, batch_input, score_inputs)

            collector.flush()

            if collector.error_count > 0:
                logger.warning(
                    "Job %s completed with %d results (%d failed to persist)",
                    job_id, collector.count, collector.error_count,
                )
                self._update_job_status(
                    job_id, TaskStatus.COMPLETED,
                    error=JobError(
                        code="PARTIAL_FAILURE",
                        message=(
                            f"{collector.error_count} of {collector.count} "
                            f"results failed to persist"
                        ),
                    ),
                )
            else:
                logger.info(
                    "Job %s completed with %d results", job_id, collector.count,
                )
                self._update_job_status(job_id, TaskStatus.COMPLETED)

            return EvaluationResponse(
                report_id=report_id, job_id=job_id, results=collector.results,
            )

        except Exception as e:
            logger.exception("Job %s failed", job_id)
            self._update_job_status(
                job_id, TaskStatus.FAILED,
                error=JobError(code="JOB_FAILED", message=str(e)),
            )
            raise EvaluatorError(f"Job {job_id} failed: {e}") from e
        finally:
            clear_job_context()

    def evaluate(
        self,
        testcases: list[InlineTestCase | dict[str, Any]] | None = None,
        dataset_id: str | None = None,
        dataset_version: str | None = None,
        scorers: dict[str, dict[str, Any] | None] | None = None,
        app: dict[str, Any] | None = None,
        experiment_name: str | None = None,
        return_results: bool = True,
        app_invoke_name: str | None = None,
        annotation_filter: dict[str, Any] | None = None,
    ) -> EvaluationResponse:
        """Run a full evaluation: app_invoke + scoring.

        Local execution (default). ``app_invoke`` must be set and at least one
        scorer registered. Use ``app`` to select which app_invoke function to
        call and pass runtime parameters::

            evaluator.evaluate(
                testcases=...,
                app={"name": "my_fn", "params": {"agent_arn": "arn:..."}},
                scorers={"ragas": {"scores": {"faithfulness": None}}},
            )

        Remote execution. Add an ``evaluatorName`` to a task's config to run it
        on a deployed evaluator worker instead of in-process — for the ``app``
        (app invocation) and/or individual scorers. A task with ``evaluatorName``
        runs remotely (its name need not be registered locally); without one it
        runs locally and must be registered. For a fully-remote evaluation, route
        BOTH the app and every scorer::

            evaluator.evaluate(
                testcases=...,
                app={"evaluatorName": "my-worker", "name": "my_fn", "params": {...}},
                scorers={"ragas": {"evaluatorName": "builtin",
                                   "scores": {"faithfulness": None}}},
            )

        The call blocks until the remote job finishes and returns the results the
        workers wrote. Mixing local and remote tasks in one call is not yet
        supported (raises ``EvaluatorError``); route everything one way or the
        other. See :meth:`score` for scoring pre-existing outputs remotely.

        Use ``annotation_filter`` with ``dataset_id`` to evaluate only test
        cases matching the annotation condition::

            evaluator.evaluate(
                dataset_id="ds-123",
                annotation_filter={
                    "condition": {"stringEnumCondition": {
                        "name": "SENTIMENT", "value": "NEGATIVE", "comparator": "=",
                    }}
                },
                scorers={"llm_as_judge": None},
            )
        """
        if not self.scorers and not scorers:
            raise EvaluatorError("evaluate() requires at least one scorer")
        scorer_configs = self._resolve_scorer_config(scorers)
        is_remote = self._classify_execution(scorer_configs, app)

        resolved, test_data = self._resolve_testcases(
            testcases, dataset_id, dataset_version, annotation_filter,
        )

        if is_remote:
            app_config = AppConfig.from_dict(app) if app else None

            def submit_remote() -> Any:
                return self.client.submit_evaluation_job(
                    self.name,
                    SubmitEvaluationJobRequestContent(
                        testCases=test_data,
                        experimentName=experiment_name,
                        scorers=self._to_scorer_configs(scorer_configs),
                        app=app_config,
                        processLocally=False,
                    ),
                )

            return self._run_remote(
                submit_remote,
                heartbeat_seconds=_DEFAULT_HEARTBEAT_SECONDS,
                return_results=return_results,
            )

        # Local path — app_invoke must be registered and runnable in-process.
        if not self.app_invokes:
            raise EvaluatorError("evaluate() requires app_invoke to be set")
        resolved_app_name = (app or {}).get("name") or app_invoke_name
        app_params = (app or {}).get("params")
        self._resolve_app_invoke(resolved_app_name)

        def submit(report_id: str) -> Any:
            return self.client.submit_evaluation_job(
                self.name,
                SubmitEvaluationJobRequestContent(
                    testCases=test_data,
                    reportId=report_id,
                    experimentName=experiment_name,
                    processLocally=True,
                ),
            )

        def process_fn(
            tc: TestCase, _idx: int,
        ) -> tuple[EvaluationResult, BatchResultInput, dict[str, ScoreInput]]:
            return self._process_testcase(tc, scorer_configs, resolved_app_name, app_params)

        return self._run_from_testcases(
            resolved, test_data, experiment_name, process_fn,
            submit_fn=submit, return_results=return_results,
        )

    def _iter_results(self, report_id: str) -> Iterable[ApiTestResult]:
        """Lazily page through test results for a report."""
        next_token: str | None = None
        while True:
            resp: ListTestResultsResponseContent = self.client.list_test_results(
                report_id=report_id,
                max_results=200,
                next_token=next_token,
            )
            yield from resp.test_results
            next_token = resp.next_token
            if not next_token:
                break

    def _wait_for_job(self, job_id: str, heartbeat_seconds: int) -> Any:
        """Poll GET /jobs/{id} until the job reaches a terminal status.

        Returns the terminal job response (carries ``status`` and any job-level
        ``error``).

        The timeout is *progress-based*: we allow ``heartbeat_seconds *
        _REMOTE_POLL_CEILING_MULTIPLE`` of no observable progress before giving
        up, but reset that window whenever the job advances (its ``updatedAt``
        moves, or its status changes). This mirrors the server's own liveness
        model — a job that keeps heartbeating is never abandoned, however long it
        runs — while a genuinely stalled job is still bounded. Raises
        EvaluatorError only when the job makes no progress for a full window.
        """
        stall_window_s = heartbeat_seconds * _REMOTE_POLL_CEILING_MULTIPLE
        last_progress_t = time.monotonic()
        last_marker: tuple[Any, Any] | None = None

        while True:
            job_resp = self.client.get_evaluator_job(job_id=job_id)
            status = job_resp.status
            if status in _TERMINAL_JOB_STATUSES:
                logger.info("Job %s reached terminal status %s", job_id, status.value)
                return job_resp

            # Progress = status change or updatedAt advancing. Reset the stall clock.
            marker = (status, getattr(job_resp, "updated_at", None))
            if marker != last_marker:
                last_marker = marker
                last_progress_t = time.monotonic()
            elif time.monotonic() - last_progress_t >= stall_window_s:
                raise EvaluatorError(
                    f"Job {job_id} made no progress for {stall_window_s:.0f}s "
                    f"(last status: {status.value}); giving up. The job may still be "
                    f"running server-side — check its status via the API."
                )
            time.sleep(_REMOTE_POLL_INTERVAL_S)

    def _results_from_report(self, report_id: str) -> list[EvaluationResult]:
        """Read all test results from a report and map them to EvaluationResults."""
        results: list[EvaluationResult] = []
        for tr in self._iter_results(report_id):
            scores: dict[str, ScoreResult] = {}
            for sname, so in (tr.scores or {}).items():
                scores[sname] = ScoreResult(
                    value=so.value, error=so.error, reason=so.reason,
                    context=getattr(so, "context", None),
                )
            results.append(EvaluationResult(
                input_data=tr.input if tr.input is not None else {},
                output=tr.output, expected=tr.expected,
                scores=scores, error=tr.error, metadata=tr.metadata,
            ))
        return results

    def _run_remote(
        self,
        submit_fn: Callable[[], Any],
        *,
        heartbeat_seconds: int,
        return_results: bool,
    ) -> EvaluationResponse:
        """Thin remote path: submit a server-orchestrated job, wait for it to
        finish, then return the results the workers wrote.

        This does NOT run any scoring or app_invoke in-process — the server
        dispatches to the deployed evaluator worker(s).

        Failure handling mirrors the local path: a job that finishes FAILURE
        raises EvaluatorError; PARTIAL_FAILURE logs a warning and returns the
        (partial) results. This failure signalling is independent of
        ``return_results`` so a submit-and-forget caller still sees failures.
        """
        submit_resp = submit_fn()
        report_id: str = submit_resp.report_id
        job_id: str = submit_resp.job_id
        logger.info("Submitted remote job=%s report=%s", job_id, report_id)

        job_resp = self._wait_for_job(job_id, heartbeat_seconds)
        status = job_resp.status
        job_error = getattr(job_resp, "error", None)

        if status == JobStatus.FAILURE:
            detail = f": {job_error.message}" if job_error else ""
            raise EvaluatorError(f"Remote job {job_id} failed{detail}")
        if status == JobStatus.PARTIAL_FAILURE:
            detail = f" ({job_error.message})" if job_error else ""
            logger.warning("Remote job %s completed with partial failure%s", job_id, detail)

        results = self._results_from_report(report_id) if return_results else None
        return EvaluationResponse(report_id=report_id, job_id=job_id, results=results)

    def _score_from_source(
        self,
        source_report_id: str,
        scorer_configs: dict[str, dict[str, Any] | None],
        experiment_name: str | None,
        return_results: bool,
    ) -> EvaluationResponse:
        """Score results from an existing report via source_report_id."""
        submit_resp = self.client.submit_scoring_job(
            self.name,
            SubmitScoringJobRequestContent(
                sourceReportId=source_report_id,
                experimentName=experiment_name,
                processLocally=True,
            ),
        )
        report_id: str = submit_resp.report_id
        job_id: str = submit_resp.job_id

        set_job_context(job_id=job_id, evaluator_name=self.name)
        self._update_job_status(job_id, TaskStatus.RUNNING)

        try:
            results: list[EvaluationResult] | None = [] if return_results else None
            flusher = _BatchFlusher(self.client, report_id, self.batch_size)

            for result in self._iter_results(report_id):
                input_data = result.input or {}
                output = result.output
                expected = result.expected
                context = result.context
                metadata = result.metadata
                result_id = result.result_id

                if output is None:
                    if results is not None:
                        results.append(EvaluationResult(
                            input_data=input_data, output=None,
                            expected=expected, context=context,
                            error="No output to score", metadata=metadata,
                        ))
                    continue

                test_result = TestResult(
                    input=input_data, output=output, expected=expected,
                    context=context, metadata=metadata,
                )
                all_scores: dict[str, ScoreResult] = {}
                for scorer_name, config in scorer_configs.items():
                    impl = self.scorers[scorer_name]
                    scorer_results = self._run_scorer(
                        scorer_name, impl,
                        test_result=test_result, config=config,
                    )
                    all_scores.update(scorer_results)

                api_scores: dict[str, ScoreInput] = {
                    sname: _to_score_input(sr)
                    for sname, sr in all_scores.items()
                }

                if api_scores and result_id:
                    flusher.add_scores([
                        BatchScoreItem(  # type: ignore[call-arg]
                            result_id=result_id, scores=api_scores,
                        ),
                    ])

                if results is not None:
                    results.append(EvaluationResult(
                        input_data=input_data, output=output,
                        expected=expected, context=context,
                        scores=all_scores, metadata=metadata,
                    ))

            flusher.flush()

            if flusher.error_count > 0:
                logger.warning(
                    "Job %s completed with %d score updates (%d failed)",
                    job_id, flusher.score_count, flusher.error_count,
                )
                self._update_job_status(
                    job_id, TaskStatus.COMPLETED,
                    error=JobError(
                        code="PARTIAL_FAILURE",
                        message=(
                            f"{flusher.error_count} of {flusher.score_count} "
                            f"score updates failed to persist"
                        ),
                    ),
                )
            else:
                logger.info("Job %s completed with %d score updates", job_id, flusher.score_count)
                self._update_job_status(job_id, TaskStatus.COMPLETED)

            return EvaluationResponse(
                report_id=report_id, job_id=job_id, results=results,
            )

        except Exception as e:
            logger.exception("Job %s failed", job_id)
            self._update_job_status(
                job_id, TaskStatus.FAILED,
                error=JobError(code="JOB_FAILED", message=str(e)),
            )
            raise EvaluatorError(f"Job {job_id} failed: {e}") from e
        finally:
            clear_job_context()

    def score(
        self,
        testcases: list[dict[str, Any]] | None = None,
        source_report_id: str | None = None,
        scorers: dict[str, dict[str, Any] | None] | None = None,
        experiment_name: str | None = None,
        return_results: bool = True,
    ) -> EvaluationResponse:
        """Score pre-existing outputs — no app_invoke.

        Provide either *testcases* (dicts with ``input`` and ``output`` keys)
        or *source_report_id* (an existing report whose results will be copied
        and scored).

        Local scoring (default) runs registered scorers in-process::

            evaluator.score(testcases=[...], scorers={"exact_match": None})

        Remote scoring. Add an ``evaluatorName`` to a scorer's config to run it
        on a deployed evaluator worker. This is how remote-only evaluators such
        as ``agent-as-judge`` are driven through the SDK — the scorer need not be
        registered locally::

            evaluator.score(
                testcases=[{"input": {...}, "output": {...}}],
                scorers={"agent_as_judge": {"evaluatorName": "agent-as-judge",
                                            "scores": {"correctness": None}}},
            )

            # or score results already in a report:
            evaluator.score(
                source_report_id="report-123",
                scorers={"agent_as_judge": {"evaluatorName": "agent-as-judge",
                                            "scores": {"correctness": None}}},
            )

        The call blocks until the remote job completes and returns the scored
        results. Scorers may route to multiple different evaluators (they fan out
        in parallel). At least one scorer must be registered locally or carry an
        ``evaluatorName``.
        """
        # Require a scorer only when the caller passed none and none are
        # registered. If a scorers dict is provided, _resolve_scorer_config
        # raises the precise per-scorer error (registered vs evaluatorName).
        if not self.scorers and not scorers:
            raise EvaluatorError("score() requires at least one scorer")
        scorer_configs = self._resolve_scorer_config(scorers)

        if testcases is not None and source_report_id is not None:
            raise EvaluatorError("Cannot specify both testcases and source_report_id")
        if testcases is None and source_report_id is None:
            raise EvaluatorError("Must provide either testcases or source_report_id")

        is_remote = self._classify_execution(scorer_configs, None)

        if source_report_id is not None:
            if self.local_only:
                raise EvaluatorError("source_report_id requires API access (not supported in local_only mode)")
            if is_remote:
                def submit_remote_src() -> Any:
                    return self.client.submit_scoring_job(
                        self.name,
                        SubmitScoringJobRequestContent(
                            sourceReportId=source_report_id,
                            experimentName=experiment_name,
                            scorers=self._to_scorer_configs(scorer_configs),
                            processLocally=False,
                        ),
                    )

                return self._run_remote(
                    submit_remote_src,
                    heartbeat_seconds=_DEFAULT_HEARTBEAT_SECONDS,
                    return_results=return_results,
                )
            return self._score_from_source(
                source_report_id, scorer_configs, experiment_name,
                return_results,
            )

        assert testcases is not None  # guaranteed by validation above

        if is_remote:
            inline_results = [
                InlineTestResult(
                    input=tc.get("input", {}),
                    output=tc.get("output"),
                    expected=tc.get("expected"),
                    metadata=tc.get("metadata"),
                )
                for tc in testcases
            ]

            def submit_remote_tc() -> Any:
                return self.client.submit_scoring_job(
                    self.name,
                    SubmitScoringJobRequestContent(
                        testResults=inline_results,
                        experimentName=experiment_name,
                        scorers=self._to_scorer_configs(scorer_configs),
                        processLocally=False,
                    ),
                )

            return self._run_remote(
                submit_remote_tc,
                heartbeat_seconds=_DEFAULT_HEARTBEAT_SECONDS,
                return_results=return_results,
            )

        cases: list[TestCase] = [
            TestCase(
                input=tc.get("input", {}), expected=tc.get("expected"),
                context=tc.get("context"), metadata=tc.get("metadata"),
            )
            for tc in testcases
        ]

        # Build InlineTestResult list for the API (includes output)
        inline_results = [
            InlineTestResult(
                input=tc.get("input", {}),
                output=tc.get("output"),
                expected=tc.get("expected"),
                context=tc.get("context"),
                metadata=tc.get("metadata"),
            )
            for tc in testcases
        ]

        # Also build TestDataSource for the internal event detail (handler reads from it)
        test_data = TestDataSource.from_dict({
            "inline": [
                {
                    "input": tc.get("input", {}), "expected": tc.get("expected"),
                    "output": tc.get("output"), "context": tc.get("context"),
                    "metadata": tc.get("metadata"),
                }
                for tc in testcases
            ]
        })

        def submit(report_id: str) -> Any:
            return self.client.submit_scoring_job(
                self.name,
                SubmitScoringJobRequestContent(
                    testResults=inline_results,
                    reportId=report_id,
                    experimentName=experiment_name,
                    processLocally=True,
                ),
            )

        def process_fn(
            tc: TestCase, idx: int,
        ) -> tuple[EvaluationResult, BatchResultInput, dict[str, ScoreInput]]:
            raw = testcases[idx]
            input_data = raw.get("input")
            output = raw.get("output")

            if input_data is None or output is None:
                missing = [k for k in ("input", "output") if k not in raw]
                error = f"Testcase at index {idx} missing required key(s): {', '.join(missing)}"
                logger.warning(error)
                return self._build_result(
                    input_data=input_data or {},
                    output=None,
                    expected=raw.get("expected"),
                    context=raw.get("context"),
                    all_scores={},
                    error=error,
                    metadata=raw.get("metadata"),
                )

            return self._process_score_only(
                input_data=input_data,
                output=output,
                expected=tc.expected,
                scorer_configs=scorer_configs,
                context=tc.context,
                metadata=raw.get("metadata"),
            )

        return self._run_from_testcases(
            cases, test_data, experiment_name, process_fn,
            submit_fn=submit, return_results=return_results,
        )

    def invoke(
        self,
        testcases: list[InlineTestCase | dict[str, Any]] | None = None,
        dataset_id: str | None = None,
        dataset_version: str | None = None,
        app: dict[str, Any] | None = None,
        experiment_name: str | None = None,
        return_results: bool = True,
        app_invoke_name: str | None = None,
        annotation_filter: dict[str, Any] | None = None,
    ) -> EvaluationResponse:
        """Run app_invoke only — no scoring.

        Local execution (default) requires ``app_invoke`` to be set; use ``app``
        to select which function to call and pass runtime parameters::

            evaluator.invoke(
                testcases=...,
                app={"name": "my_fn", "params": {"agent_arn": "arn:..."}},
            )

        Remote execution. Add an ``evaluatorName`` to the ``app`` config to run
        app invocation on a deployed evaluator worker instead of in-process
        (``name`` then selects the worker's app-invoke function)::

            evaluator.invoke(
                testcases=...,
                app={"evaluatorName": "my-worker", "name": "my_fn",
                     "params": {...}},
            )

        The call blocks until the remote job completes and returns the results.

        Use ``annotation_filter`` with ``dataset_id`` to invoke only on
        test cases matching the annotation condition::

            evaluator.invoke(
                dataset_id="ds-123",
                annotation_filter={"condition": {
                    "stringEnumCondition": {
                        "name": "TIER", "value": "HIGH", "comparator": "=",
                    }
                }},
            )
        """
        is_remote = self._classify_execution(None, app)

        resolved, test_data = self._resolve_testcases(
            testcases, dataset_id, dataset_version, annotation_filter,
        )

        if is_remote:
            app_config = AppConfig.from_dict(app) if app else None

            def submit_remote() -> Any:
                return self.client.submit_app_invocation_job(
                    self.name,
                    SubmitAppInvocationJobRequestContent(
                        testCases=test_data,
                        experimentName=experiment_name,
                        app=app_config,
                        processLocally=False,
                    ),
                )

            return self._run_remote(
                submit_remote,
                heartbeat_seconds=_DEFAULT_HEARTBEAT_SECONDS,
                return_results=return_results,
            )

        # Local path — app_invoke must be registered and runnable in-process.
        if not self.app_invokes:
            raise EvaluatorError("invoke() requires app_invoke to be set")
        resolved_app_name = (app or {}).get("name") or app_invoke_name
        app_params = (app or {}).get("params")
        self._resolve_app_invoke(resolved_app_name)  # validate early

        def submit(report_id: str) -> Any:
            return self.client.submit_app_invocation_job(
                self.name,
                SubmitAppInvocationJobRequestContent(
                    testCases=test_data, reportId=report_id,
                    experimentName=experiment_name, processLocally=True,
                ),
            )

        def process_fn(
            tc: TestCase, _idx: int,
        ) -> tuple[EvaluationResult, BatchResultInput, dict[str, ScoreInput]]:
            return self._process_invoke_only(tc, resolved_app_name, app_params)

        return self._run_from_testcases(
            resolved, test_data, experiment_name, process_fn,
            submit_fn=submit, return_results=return_results,
        )

    # ------------------------------------------------------------------
    # Remote handler — Lambda entry point for EventBridge-triggered jobs
    # ------------------------------------------------------------------

    def _resolve_handler_testcases(
        self, detail: dict[str, Any],
    ) -> Iterable[TestCase]:
        """Resolve testcases from an evaluator_handler event detail."""
        test_data = detail.get("testCases")
        source_report_id = detail.get("sourceReportId")

        if source_report_id is not None:
            return []  # handled separately by _score_existing_results

        if test_data is None:
            raise EvaluatorError("Event must contain testData or sourceReportId")

        parsed = TestDataSource.from_dict(test_data)
        instance: Any = getattr(parsed, "actual_instance", None)

        # Inline testcases
        if instance is not None and hasattr(instance, "inline"):
            raw_inline = instance.inline
            if not raw_inline:
                return []

            def _get(obj: Any, attr: str, key: str) -> Any:
                return getattr(obj, attr, None) or (
                    obj.get(key) if isinstance(obj, dict) else None
                )

            return [
                TestCase(
                    input=_get(tc, "input", "input"),
                    expected=_get(tc, "expected", "expected"),
                    context=_get(tc, "context", "context"),
                    metadata=_get(tc, "metadata", "metadata"),
                )
                for tc in raw_inline
            ]

        # Dataset reference
        if instance is not None and hasattr(instance, "dataset"):
            ds: Any = instance.dataset
            dataset_id: str | None = (
                getattr(ds, "dataset_id", None)
                or (ds.get("datasetId") if isinstance(ds, dict) else None)
            )
            if not dataset_id:
                raise EvaluatorError("Invalid dataset reference: missing datasetId")
            version: str = (
                getattr(ds, "dataset_version", None)
                or (ds.get("datasetVersion") if isinstance(ds, dict) else None)
                or "head"
            )
            # Extract annotation filter from dataset reference if present
            annotation_filter: dict[str, Any] | None = (
                getattr(ds, "filter", None)
                or (ds.get("filter") if isinstance(ds, dict) else None)
            )
            return self._iter_dataset(dataset_id, version, annotation_filter)

        raise EvaluatorError("test_data must contain either inline testcases or a dataset reference")

    @staticmethod
    def _extract_dataset_info(detail: dict[str, Any]) -> DatasetInfo:
        """Extract dataset_id, version, and annotation filter from event detail testData."""
        test_data = detail.get("testCases", {})
        ds = test_data.get("dataset", {})
        return DatasetInfo(
            dataset_id=ds.get("datasetId", ""),
            version=ds.get("datasetVersion") or "head",
            annotation_filter=ds.get("filter"),
        )

    def _report_completion(
        self,
        job_id: str,
        report_id: str,
        collector_or_flusher: Any,
        task_token: str | None,
        task_key: str | None,
    ) -> HandlerResult:
        """Report job completion, with PARTIAL_FAILURE if some writes failed."""
        error_count = getattr(collector_or_flusher, "error_count", 0)
        total_count = getattr(collector_or_flusher, "count", 0) or getattr(collector_or_flusher, "score_count", 0)

        if error_count > 0:
            logger.warning("Job %s completed with %d items (%d failed)", job_id, total_count, error_count)
            self._update_job_status(
                job_id, TaskStatus.COMPLETED,
                error=JobError(
                    code="PARTIAL_FAILURE",
                    message=f"{error_count} of {total_count} items failed to persist",
                ),
                task_token=task_token, task_key=task_key,
            )
        else:
            logger.info("Job %s completed with %d items", job_id, total_count)
            self._update_job_status(
                job_id, TaskStatus.COMPLETED,
                task_token=task_token, task_key=task_key,
            )

        return {"status": "COMPLETED", "jobId": job_id, "reportId": report_id}

    def _score_single_result(
        self,
        result: Any,
        scorer_configs: dict[str, dict[str, Any] | None],
    ) -> dict[str, ScoreInput] | None:
        """Run all scorers on one result. Returns API scores or None if skipped."""
        output = result.output
        if output is None:
            return None

        all_scores: dict[str, ScoreResult] = {}
        test_result = TestResult(
            input=result.input or {}, output=output, expected=result.expected,
            context=getattr(result, "context", None), metadata=result.metadata,
        )
        for scorer_name, config in scorer_configs.items():
            impl = self.scorers[scorer_name]
            scorer_results = self._run_scorer(
                scorer_name, impl,
                test_result=test_result, config=config,
            )
            all_scores.update(scorer_results)

        return {
            sname: _to_score_input(sr)
            for sname, sr in all_scores.items()
        }

    def _score_existing_results(
        self,
        *,
        job_id: str,
        report_id: str,
        scorer_configs: dict[str, dict[str, Any] | None],
        task_token: str | None = None,
        task_key: str | None = None,
        checkpoint: dict[str, Any] | None = None,
        context: Any = None,
        continue_buffer_ms: int | None = None,
    ) -> HandlerResult:
        """Score results already present in a report.

        Used for both score-from-source (results copied by COPY_RESULTS task)
        and score-in-place (results written by app_invoke task). The worker
        doesn't care how results got there — it iterates and scores them.

        Supports checkpoint resume via ``last_evaluated_key`` and CONTINUE
        signalling when approaching Lambda timeout.
        """
        if not checkpoint:
            self._update_job_status(
                job_id, TaskStatus.RUNNING,
                task_token=task_token, task_key=task_key,
            )

        last_key: str | None = checkpoint.get("last_evaluated_key") if checkpoint else None
        last_heartbeat_t = time.monotonic()
        heartbeat_interval_s = 60
        effective_buffer_ms = continue_buffer_ms or 30_000

        try:
            flusher = _BatchFlusher(self.client, report_id, self.batch_size)

            while True:
                resp = self.client.list_test_results(
                    report_id=report_id, max_results=50, next_token=last_key,
                )

                for result in resp.test_results:
                    api_scores = self._score_single_result(result, scorer_configs)
                    if api_scores and result.result_id:
                        flusher.add_scores([
                            BatchScoreItem(result_id=result.result_id, scores=api_scores),  # type: ignore[call-arg]
                        ])

                    # Heartbeat per result (scoring is slow — Bedrock calls)
                    if task_token and time.monotonic() - last_heartbeat_t > heartbeat_interval_s:
                        self._update_job_status(
                            job_id, TaskStatus.RUNNING,
                            task_token=task_token, task_key=task_key,
                        )
                        last_heartbeat_t = time.monotonic()

                flusher.flush()
                last_key = resp.next_token

                if not last_key:
                    break

                if _should_continue(context, effective_buffer_ms):
                    cp = {"last_evaluated_key": last_key}
                    self._update_job_status(
                        job_id, TaskStatus.RUNNING,
                        checkpoint=cp, task_token=task_token, task_key=task_key,
                    )
                    logger.info("Job %s CONTINUE at page token %s", job_id, last_key)
                    return {"status": "CONTINUE", "jobId": job_id, "reportId": report_id}

            return self._report_completion(job_id, report_id, flusher, task_token, task_key)

        except Exception as e:
            logger.exception("Job %s failed", job_id)
            # Best-effort flush: persist any scores computed before the failure.
            # If flush itself fails (e.g. DDB throttle), we still want to report
            # the original error, not mask it with a flush error.
            try:
                flusher.flush()
            except Exception:
                logger.error("Flush on error also failed for job %s", job_id, exc_info=True)
            self._update_job_status(
                job_id, TaskStatus.FAILED,
                error=JobError(code="JOB_FAILED", message=str(e)),
                task_token=task_token, task_key=task_key,
            )
            return {"status": "FAILED", "jobId": job_id, "reportId": report_id, "error": str(e)}

    def evaluator_handler(self, event: dict[str, Any], context: Any) -> HandlerResult:
        """Lambda handler for remotely-triggered evaluation jobs.

        Receives an EventBridge event with job details in ``event["detail"]``.
        The job and report must already exist (created by the submission API).

        Supports three job types:
        - ``FULL``: app_invoke + scoring (requires app_invoke and scorers)
        - ``APP_INVOKE``: app_invoke only (requires app_invoke)
        - ``SCORE``: scoring only (requires scorers)
        """
        if self.local_only:
            raise EvaluatorError("evaluator_handler requires API access (not supported in local_only mode)")

        detail = event.get("detail", {})
        try:
            job_id: str = detail["jobId"]
            report_id: str = detail["reportId"]
            job_type: str = detail["jobType"]
        except KeyError as e:
            logger.error("Invalid event detail — missing required field: %s", e)
            return {"status": "FAILED", "error": f"Missing required field in event detail: {e}"}
        evaluator_name: str = detail.get("evaluatorName", "")
        task_key: str = detail.get("taskKey", "")

        # Inject job context into all log records for cross-service tracing
        with job_log_context(job_id=job_id, job_type=job_type, evaluator_name=self.name):
            request_id = getattr(context, "aws_request_id", None) if context else None
            logger.info(
                "Handler START — task=%s evaluator=%s request_id=%s",
                task_key or job_type, self.name, request_id,
            )
            result = self._run_handler(event, detail, job_id, report_id, job_type, evaluator_name, context)
            logger.info(
                "Handler END — task=%s status=%s request_id=%s",
                task_key or job_type, result.get("status"), request_id,
            )
            return result

    def _check_dedup(
        self, job_id: str, task_key: str | None,
    ) -> HandlerResult | None:
        """Return a SKIPPED result if the job or task is already terminal, else None."""
        job_resp = self.client.get_evaluator_job(job_id=job_id)

        if job_resp.status.value in ("SUCCESS", "FAILURE", "PARTIAL_FAILURE"):
            logger.warning("Skipping job %s: already %s", job_id, job_resp.status.value)
            return {"status": "SKIPPED", "jobId": job_id, "reason": f"job already {job_resp.status.value}"}

        if task_key and job_resp.tasks:
            task_state = job_resp.tasks.get(task_key)
            if task_state and task_state.status.value in ("COMPLETED", "FAILED"):
                logger.warning("Skipping task %s/%s: already %s", job_id, task_key, task_state.status.value)
                return {"status": "SKIPPED", "jobId": job_id, "reason": f"task already {task_state.status.value}"}

        return None

    def _validate_job_type(
        self, job_type: str, scorers_config: dict[str, Any] | None,
    ) -> dict[str, dict[str, Any] | None]:
        """Validate job type requirements and resolve scorer config. Raises EvaluatorError."""
        if job_type == "FULL":
            if not self.app_invokes:
                raise EvaluatorError("FULL job requires app_invoke to be set")
            if not self.scorers:
                raise EvaluatorError("FULL job requires at least one scorer")
            return self._resolve_scorer_config(scorers_config)
        if job_type == "APP_INVOKE":
            if not self.app_invokes:
                raise EvaluatorError("APP_INVOKE job requires app_invoke to be set")
            return {}
        if job_type == "SCORE":
            if not self.scorers:
                raise EvaluatorError("SCORE job requires at least one scorer")
            return self._resolve_scorer_config(scorers_config)
        raise EvaluatorError(f"Unknown job_type: {job_type}")

    def _build_process_fn(
        self,
        job_type: str,
        resolved_scorers: dict[str, dict[str, Any] | None],
        detail: dict[str, Any],
        app_invoke_name: str | None = None,
        app_params: dict[str, Any] | None = None,
    ) -> Callable[[TestCase, int], tuple[EvaluationResult, BatchResultInput, dict[str, ScoreInput]]]:
        """Build the per-testcase processing function for the given job type.

        Only called for FULL and APP_INVOKE jobs. SCORE jobs use
        _score_existing_results (results are already in the report).
        """
        if job_type == "FULL":
            return lambda tc, _idx: self._process_testcase(tc, resolved_scorers, app_invoke_name, app_params)
        if job_type == "APP_INVOKE":
            return lambda tc, _idx: self._process_invoke_only(tc, app_invoke_name, app_params)

        raise EvaluatorError(f"_build_process_fn called with unexpected job_type: {job_type}")

    def _execute_inline(
        self,
        *,
        testcases: list[TestCase],
        process_fn: Callable[..., Any],
        collector: _ResultCollector,
        job_id: str,
        report_id: str,
        checkpoint: dict[str, Any] | None,
        context: Any,
        task_token: str | None,
        task_key: str | None,
        effective_buffer_ms: int,
    ) -> HandlerResult | None:
        """Process inline testcases with index-based checkpoint. Returns CONTINUE result or None."""
        start_idx = 0
        if checkpoint and checkpoint.get("inline_testcase_index") is not None:
            start_idx = checkpoint["inline_testcase_index"]
            logger.info("Resuming job %s from inline index %d", job_id, start_idx)

        last_heartbeat_t = time.monotonic()
        for idx, testcase in enumerate(testcases):
            if idx < start_idx:
                continue

            result, batch_input, score_inputs = process_fn(testcase, idx)
            collector.add_result(result, batch_input, score_inputs)

            if task_token and time.monotonic() - last_heartbeat_t > 60:
                self._update_job_status(job_id, TaskStatus.RUNNING, task_token=task_token, task_key=task_key)
                last_heartbeat_t = time.monotonic()

            if _should_continue(context, effective_buffer_ms):
                collector.flush()
                self._update_job_status(
                    job_id, TaskStatus.RUNNING,
                    checkpoint={"inline_testcase_index": idx + 1},
                    task_token=task_token, task_key=task_key,
                )
                logger.info("Job %s CONTINUE at inline index %d", job_id, idx + 1)
                return {"status": "CONTINUE", "jobId": job_id, "reportId": report_id}

        return None  # all items processed

    def _execute_dataset(
        self,
        *,
        detail: dict[str, Any],
        process_fn: Callable[..., Any],
        collector: _ResultCollector,
        job_id: str,
        report_id: str,
        checkpoint: dict[str, Any] | None,
        context: Any,
        task_token: str | None,
        task_key: str | None,
        effective_buffer_ms: int,
    ) -> HandlerResult | None:
        """Process dataset testcases with token-based checkpoint. Returns CONTINUE result or None."""
        ds_info = self._extract_dataset_info(detail)
        page_token: str | None = checkpoint.get("dataset_next_token") if checkpoint else None
        if page_token:
            logger.info("Resuming job %s from dataset token=%s", job_id, page_token)

        body = self._build_filter_body(ds_info.get("annotation_filter"))

        last_heartbeat_t = time.monotonic()
        global_idx = 0

        while True:
            resp = self.client.list_test_cases(
                dataset_id=ds_info["dataset_id"], version=ds_info["version"],
                max_results=40, next_token=page_token,
                list_test_cases_request_content=body,
            )

            for ref in resp.test_cases:
                tc_resp = self.client.get_test_case(
                    dataset_id=ds_info["dataset_id"],
                    version=ds_info["version"],
                    test_case_id=ref.id,
                )
                testcase = TestCase(
                    input=tc_resp.input, expected=tc_resp.expected,
                    context=tc_resp.context, metadata=tc_resp.metadata,
                )
                result, batch_input, score_inputs = process_fn(testcase, global_idx)
                collector.add_result(result, batch_input, score_inputs)
                global_idx += 1

            if task_token and time.monotonic() - last_heartbeat_t > 60:
                self._update_job_status(job_id, TaskStatus.RUNNING, task_token=task_token, task_key=task_key)
                last_heartbeat_t = time.monotonic()

            page_token = resp.next_token
            if not page_token:
                break

            if _should_continue(context, effective_buffer_ms):
                collector.flush()
                self._update_job_status(
                    job_id, TaskStatus.RUNNING,
                    checkpoint={"dataset_next_token": page_token},
                    task_token=task_token, task_key=task_key,
                )
                logger.info("Job %s CONTINUE at dataset token %s", job_id, page_token)
                return {"status": "CONTINUE", "jobId": job_id, "reportId": report_id}

        return None  # all pages processed

    def _run_handler(
        self,
        event: dict[str, Any],
        detail: dict[str, Any],
        job_id: str,
        report_id: str,
        job_type: str,
        evaluator_name: str,
        context: Any = None,
    ) -> HandlerResult:
        """Inner handler logic — separated so evaluator_handler can wrap with log context."""
        task_token: str | None = detail.get("taskToken")
        task_key: str | None = detail.get("taskKey")
        checkpoint: dict[str, Any] | None = detail.get("checkpoint")
        continue_buffer_ms: int | None = detail.get("continueBufferMs")
        # Resolve app config from detail (new) or legacy appInvokeName field
        app_config: dict[str, Any] | None = detail.get("app")
        app_invoke_name: str | None = (app_config or {}).get("name") or detail.get("appInvokeName")
        app_params: dict[str, Any] | None = (app_config or {}).get("params")

        # Fail fast if event was misrouted — evaluatorName must match
        if evaluator_name and evaluator_name != self.name:
            raise EvaluatorError(
                f"evaluatorName mismatch: event has '{evaluator_name}' but this "
                f"evaluator is '{self.name}'. Check EventBridge rule configuration."
            )

        skip = self._check_dedup(job_id, task_key)
        if skip:
            return skip

        # Validate job type + resolve scorers
        try:
            resolved_scorers = self._validate_job_type(job_type, detail.get("scorers"))
        except EvaluatorError as e:
            logger.error("Validation failed: %s", e)
            self._update_job_status(
                job_id, TaskStatus.FAILED,
                error=JobError(code="VALIDATION_ERROR", message=str(e)),
                task_token=task_token, task_key=task_key,
            )
            return {"status": "FAILED", "jobId": job_id, "reportId": report_id, "error": str(e)}

        logger.info(
            "Processing job type=%s report=%s scorers=%s",
            job_type, report_id, list(resolved_scorers),
        )

        # Score existing results in the report. Covers three scenarios:
        # 1. sourceReportId set → results copied from another report
        # 2. inline testResults → API pre-wrote them to this report at submission time
        # 3. score-in-place → results already exist from a prior job
        # All three just need us to iterate the report and add scores.
        source_report_id = detail.get("sourceReportId")
        test_data_detail = detail.get("testCases")
        if job_type == "SCORE" and (source_report_id is not None or not test_data_detail):
            return self._score_existing_results(
                job_id=job_id, report_id=report_id,
                scorer_configs=resolved_scorers,
                task_token=task_token, task_key=task_key,
                checkpoint=checkpoint, context=context,
                continue_buffer_ms=continue_buffer_ms,
            )

        # Resolve testcases
        try:
            resolved = self._resolve_handler_testcases(detail)
        except EvaluatorError as e:
            logger.error("Job %s failed to resolve testcases: %s", job_id, e)
            self._update_job_status(
                job_id, TaskStatus.FAILED,
                error=JobError(code="VALIDATION_ERROR", message=str(e)),
                task_token=task_token, task_key=task_key,
            )
            return {"status": "FAILED", "jobId": job_id, "reportId": report_id, "error": str(e)}

        process_fn = self._build_process_fn(job_type, resolved_scorers, detail, app_invoke_name, app_params)

        if not checkpoint:
            self._update_job_status(job_id, TaskStatus.RUNNING, task_token=task_token, task_key=task_key)

        collector = _ResultCollector(self.client, report_id, self.batch_size, return_results=False)
        effective_buffer_ms = continue_buffer_ms or 60_000
        exec_kwargs: dict[str, Any] = {
            "process_fn": process_fn, "collector": collector,
            "job_id": job_id, "report_id": report_id,
            "checkpoint": checkpoint, "context": context,
            "task_token": task_token, "task_key": task_key,
            "effective_buffer_ms": effective_buffer_ms,
        }

        try:
            if isinstance(resolved, list):
                result = self._execute_inline(testcases=resolved, **exec_kwargs)
            else:
                result = self._execute_dataset(detail=detail, **exec_kwargs)

            if result:  # CONTINUE
                return result

            collector.flush()
            return self._report_completion(job_id, report_id, collector, task_token, task_key)

        except Exception as e:
            logger.exception("Job %s failed", job_id)
            # Best-effort flush: persist any results computed before the failure.
            try:
                collector.flush()
            except Exception:
                logger.error("Flush on error also failed for job %s", job_id, exc_info=True)
            self._update_job_status(
                job_id, TaskStatus.FAILED,
                error=JobError(code="JOB_FAILED", message=str(e)),
                task_token=task_token, task_key=task_key,
            )
            return {"status": "FAILED", "jobId": job_id, "reportId": report_id, "error": str(e)}
