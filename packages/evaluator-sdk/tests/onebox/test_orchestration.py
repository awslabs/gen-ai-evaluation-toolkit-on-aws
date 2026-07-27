"""End-to-end onebox tests: MockSF + real evaluators + moto DDB.

Tests the full orchestration flow: submit job → SFN dispatches via
MockEventRouter → real evaluator handlers process → complete_task
callbacks resume SFN → post-processing → final status.

Coverage matrix (topology × outcome):

| Topology                    | Happy | Failure        | CONTINUE |
|-----------------------------|-------|----------------|----------|
| Single FULL                 |  ✓    | ✓ (FAILURE)    | ✓        |
| Multi APP_INVOKE + scorers  |  ✓    | ✓ (PARTIAL)    | ✓ invoke |
| APP_INVOKE only             |  ✓    | ✓ (FAILURE)    | ✓        |
| Score-from-source           |  ✓    | ✓ (FAILURE)    | ✓ scorer |
| Score-in-place              |  ✓    | ✓ (FAILURE)    | ✓ scorer |
"""

import json
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Callable, Generator

from awssolutions_gen_ai_evaluation_toolkit_python_client.api import DefaultApi
from awssolutions_gen_ai_evaluation_toolkit_python_client.models import (
    BatchCreateResultsRequestContent,
    BatchResultInput,
    CreateReportRequestContent,
    JobStatus,
    SubmitAppInvocationJobRequestContent,
    SubmitEvaluationJobRequestContent,
    SubmitScoringJobRequestContent,
    TestDataSource,
)
from evaluator_api.sfn import reset_sfn_client, set_sfn_client
from evaluator_api.task_lifecycle import complete_task

from evaluator_sdk import Evaluator, TestResult

from ..helpers import exact_match_scorer, simple_app
from .mock_step_functions import MockEventRouter, MockStepFunctions
from .test_evaluator_handler import SAMPLE_TESTCASES

_REPO = Path(__file__).resolve().parent.parent.parent.parent.parent
ASL_PATH = _REPO / "packages" / "cdk" / "src" / "evaluator" / "orchestration-asl.json"

MANY_TESTCASES = [
    {"input": {"question": f"Q{i}"}, "expected": {"answer": f"A{i}"}}
    for i in range(60)
]

LARGE_TESTCASES = [
    {"input": {"question": f"Q{i}"}, "expected": {"answer": f"A{i}"}}
    for i in range(50)
]


# ---------------------------------------------------------------------------
# Shared infrastructure
# ---------------------------------------------------------------------------


def _load_asl() -> dict[str, Any]:
    with open(ASL_PATH) as f:
        return json.load(f)


@contextmanager
def orchestration(router: MockEventRouter) -> Generator[MockStepFunctions, None, None]:
    """Context manager: create MockSF, inject as SFN client, cleanup on exit."""
    sfn = MockStepFunctions(asl=_load_asl(), router=router)
    set_sfn_client(sfn)
    try:
        yield sfn
    finally:
        reset_sfn_client()


class _TimeoutContext:
    """Mock Lambda context that triggers CONTINUE after ``safe_calls`` checks."""

    def __init__(self, safe_calls: int = 2) -> None:
        self._safe_calls = safe_calls
        self._calls = 0

    def get_remaining_time_in_millis(self) -> int:
        self._calls += 1
        return 120_000 if self._calls <= self._safe_calls else 10_000


def _handler(evaluator: Evaluator, context: Any = None) -> Callable[[dict[str, Any]], None]:
    """Wrap evaluator.evaluator_handler for the MockEventRouter."""
    def fn(detail: dict[str, Any]) -> None:
        evaluator.evaluator_handler({"detail": detail}, context)
    return fn


def _failing_handler(detail: dict[str, Any]) -> None:
    """Simulate a handler that calls complete_task(FAILED)."""
    complete_task(
        detail["jobId"], detail["taskKey"], "FAILED",
        task_token=detail.get("taskToken"), error="Simulated failure",
    )


def _post_process(detail: dict[str, Any]) -> None:
    """Run post-processing + complete_task."""
    from evaluator_api.experiment import run_post_processing
    from evaluator_api.routes import get_job_dao, get_report_dao, get_result_dao

    job_id = detail["jobId"]
    try:
        run_post_processing(
            job_dao=get_job_dao(), result_dao=get_result_dao(),
            report_dao=get_report_dao(), job_id=job_id,
        )
        complete_task(job_id, detail.get("taskKey", "post_process"),
                      "COMPLETED", detail.get("taskToken"))
    except Exception as e:
        complete_task(job_id, detail.get("taskKey", "post_process"),
                      "FAILED", detail.get("taskToken"), error=str(e))


def _post_process_with_continue(detail: dict[str, Any]) -> None:
    """Post-processing handler that forces CONTINUE after each page."""
    from evaluator_api.experiment import run_post_processing
    from evaluator_api.routes import get_job_dao, get_report_dao, get_result_dao

    class _AlwaysContinueContext:
        """Forces CONTINUE check to fire after every page."""
        def get_remaining_time_in_millis(self) -> int:
            return 1  # always < any buffer → triggers CONTINUE

    job_id = detail["jobId"]
    task_key = detail.get("taskKey", "post_process")
    task_token = detail.get("taskToken")
    checkpoint = detail.get("checkpoint")

    try:
        result = run_post_processing(
            job_dao=get_job_dao(), result_dao=get_result_dao(),
            report_dao=get_report_dao(), job_id=job_id,
            checkpoint=checkpoint, context=_AlwaysContinueContext(),
            task_token=task_token, task_key=task_key,
        )
        if result == "CONTINUE":
            return  # SFN handles re-dispatch via checkpoint_task
        complete_task(job_id, task_key, "COMPLETED", task_token)
    except Exception as e:
        complete_task(job_id, task_key, "FAILED", task_token, error=str(e))


def _copy_results(detail: dict[str, Any]) -> None:
    """Run copy_results + complete_task."""
    from evaluator_api.routes.evaluator_jobs import _copy_results_from_source

    job_id = detail["jobId"]
    try:
        _copy_results_from_source(detail["sourceReportId"], detail["reportId"])
        complete_task(job_id, detail.get("taskKey", "copy_results"),
                      "COMPLETED", detail.get("taskToken"))
    except Exception as e:
        complete_task(job_id, detail.get("taskKey", "copy_results"),
                      "FAILED", detail.get("taskToken"), error=str(e))


def _make_source_report(client: DefaultApi, testcases: list[dict[str, Any]] | None = None) -> str:
    """Create a report with results. Returns source report ID."""
    tcs = testcases or SAMPLE_TESTCASES
    resp = client.create_report(CreateReportRequestContent(name="source"))
    # Batch in chunks of 25
    for i in range(0, len(tcs), 25):
        client.batch_create_results(
            resp.report.report_id,
            BatchCreateResultsRequestContent(results=[
                BatchResultInput(input=tc["input"], output=tc["expected"], expected=tc["expected"])
                for tc in tcs[i:i+25]
            ]),
        )
    return resp.report.report_id


def _inline(testcases: list[dict[str, Any]]) -> TestDataSource:
    return TestDataSource.from_dict({"inline": testcases})


def _counting_handler(
    evaluator: Evaluator, counter: list[int], timeout_on_call: int | None = None,
) -> Callable[[dict[str, Any]], None]:
    """Handler that counts invocations. Optionally triggers CONTINUE on a specific call."""
    def fn(detail: dict[str, Any]) -> None:
        counter[0] += 1
        if timeout_on_call is not None and counter[0] == timeout_on_call:
            ctx = _TimeoutContext(safe_calls=0)
        else:
            ctx = None
        evaluator.evaluator_handler({"detail": detail}, ctx)
    return fn


# ---------------------------------------------------------------------------
# Single evaluator FULL
# ---------------------------------------------------------------------------


class TestSingleFull:

    def test_happy_path(
        self, evaluator_factory: Callable[..., Evaluator], client: DefaultApi,
    ) -> None:
        evaluator = evaluator_factory()
        router = MockEventRouter()
        router.add_rule({"evaluatorName": ["test-eval"]}, _handler(evaluator))
        router.add_rule({"jobType": ["POST_PROCESS"]}, _post_process)

        with orchestration(router) as sfn:
            resp = client.submit_evaluation_job(
                "test-eval",
                SubmitEvaluationJobRequestContent(
                    testCases=_inline(SAMPLE_TESTCASES),
                    scorers={"exact_match_scorer": None},
                ),
            )
            sfn.run()

            assert client.get_evaluator_job(resp.job_id).status == JobStatus.SUCCESS
            results = client.list_test_results(resp.report_id)
            assert len(results.test_results) == len(SAMPLE_TESTCASES)
            for tr in results.test_results:
                assert "exact_match_scorer" in tr.scores

    def test_failure(
        self, evaluator_factory: Callable[..., Evaluator], client: DefaultApi,
    ) -> None:
        router = MockEventRouter()
        router.add_rule({"evaluatorName": ["test-eval"]}, _failing_handler)
        router.add_rule({"jobType": ["POST_PROCESS"]}, _post_process)

        with orchestration(router) as sfn:
            resp = client.submit_evaluation_job(
                "test-eval",
                SubmitEvaluationJobRequestContent(
                    testCases=_inline(SAMPLE_TESTCASES),
                    scorers={"exact_match_scorer": None},
                ),
            )
            sfn.run()
            assert client.get_evaluator_job(resp.job_id).status == JobStatus.FAILURE

    def test_continue(
        self, evaluator_factory: Callable[..., Evaluator], client: DefaultApi,
    ) -> None:
        evaluator = evaluator_factory()
        counter = [0]
        router = MockEventRouter()
        router.add_rule({"evaluatorName": ["test-eval"]},
                        _counting_handler(evaluator, counter, timeout_on_call=1))
        router.add_rule({"jobType": ["POST_PROCESS"]}, _post_process)

        with orchestration(router) as sfn:
            resp = client.submit_evaluation_job(
                "test-eval",
                SubmitEvaluationJobRequestContent(
                    testCases=_inline(MANY_TESTCASES),
                    scorers={"exact_match_scorer": None},
                ),
            )
            sfn.run()

            assert counter[0] >= 2
            assert client.get_evaluator_job(resp.job_id).status == JobStatus.SUCCESS


# ---------------------------------------------------------------------------
# Multi-evaluator: APP_INVOKE + parallel scorers
# ---------------------------------------------------------------------------


class TestMultiEvaluator:

    def _length_scorer(self, *, test_result: TestResult) -> float:
        return min(len(str((test_result.output or {}).get("answer", ""))) / 10.0, 1.0)

    def test_happy_path(
        self, evaluator_factory: Callable[..., Evaluator], client: DefaultApi,
    ) -> None:
        invoke_eval = evaluator_factory(app_invoke=simple_app, scorers=[], name="invoker")
        scorer_a = evaluator_factory(app_invoke=None, scorers=[exact_match_scorer], name="scorer-a")
        scorer_b = evaluator_factory(app_invoke=None, scorers=[self._length_scorer], name="scorer-b")

        router = MockEventRouter()
        router.add_rule({"evaluatorName": ["invoker"]}, _handler(invoke_eval))
        router.add_rule({"evaluatorName": ["scorer-a"]}, _handler(scorer_a))
        router.add_rule({"evaluatorName": ["scorer-b"]}, _handler(scorer_b))
        router.add_rule({"jobType": ["POST_PROCESS"]}, _post_process)

        with orchestration(router) as sfn:
            resp = client.submit_evaluation_job(
                "invoker",
                SubmitEvaluationJobRequestContent(
                    testCases=_inline(SAMPLE_TESTCASES),
                    scorers={
                        "exact_match_scorer": {"evaluatorName": "scorer-a"},
                        "_length_scorer": {"evaluatorName": "scorer-b"},
                    },
                ),
            )
            sfn.run()

            assert client.get_evaluator_job(resp.job_id).status == JobStatus.SUCCESS
            for tr in client.list_test_results(resp.report_id).test_results:
                assert "exact_match_scorer" in tr.scores
                assert "_length_scorer" in tr.scores

    def test_scorer_failure_partial(
        self, evaluator_factory: Callable[..., Evaluator], client: DefaultApi,
    ) -> None:
        invoke_eval = evaluator_factory(app_invoke=simple_app, scorers=[], name="invoker")
        good_eval = evaluator_factory(app_invoke=None, scorers=[exact_match_scorer], name="good")

        router = MockEventRouter()
        router.add_rule({"evaluatorName": ["invoker"]}, _handler(invoke_eval))
        router.add_rule({"evaluatorName": ["good"]}, _handler(good_eval))
        router.add_rule({"evaluatorName": ["bad"]}, _failing_handler)
        router.add_rule({"jobType": ["POST_PROCESS"]}, _post_process)

        with orchestration(router) as sfn:
            resp = client.submit_evaluation_job(
                "invoker",
                SubmitEvaluationJobRequestContent(
                    testCases=_inline(SAMPLE_TESTCASES),
                    scorers={
                        "exact_match_scorer": {"evaluatorName": "good"},
                        "bad_scorer": {"evaluatorName": "bad"},
                    },
                ),
            )
            sfn.run()
            assert client.get_evaluator_job(resp.job_id).status == JobStatus.PARTIAL_FAILURE

    def test_continue_on_invoker(
        self, evaluator_factory: Callable[..., Evaluator], client: DefaultApi,
    ) -> None:
        invoke_eval = evaluator_factory(app_invoke=simple_app, scorers=[], name="invoker")
        scorer_eval = evaluator_factory(app_invoke=None, scorers=[exact_match_scorer], name="scorer")
        counter = [0]

        router = MockEventRouter()
        router.add_rule({"evaluatorName": ["invoker"]},
                        _counting_handler(invoke_eval, counter, timeout_on_call=1))
        router.add_rule({"evaluatorName": ["scorer"]}, _handler(scorer_eval))
        router.add_rule({"jobType": ["POST_PROCESS"]}, _post_process)

        with orchestration(router) as sfn:
            resp = client.submit_evaluation_job(
                "invoker",
                SubmitEvaluationJobRequestContent(
                    testCases=_inline(MANY_TESTCASES),
                    scorers={"exact_match_scorer": {"evaluatorName": "scorer"}},
                ),
            )
            sfn.run()

            assert counter[0] >= 2
            assert client.get_evaluator_job(resp.job_id).status == JobStatus.SUCCESS
            for tr in client.list_test_results(resp.report_id).test_results:
                assert "exact_match_scorer" in tr.scores


# ---------------------------------------------------------------------------
# APP_INVOKE only
# ---------------------------------------------------------------------------


class TestAppInvokeOnly:

    def test_happy_path(
        self, evaluator_factory: Callable[..., Evaluator], client: DefaultApi,
    ) -> None:
        evaluator = evaluator_factory(scorers=[])
        router = MockEventRouter()
        router.add_rule({"evaluatorName": ["test-eval"]}, _handler(evaluator))
        router.add_rule({"jobType": ["POST_PROCESS"]}, _post_process)

        with orchestration(router) as sfn:
            resp = client.submit_app_invocation_job(
                "test-eval",
                SubmitAppInvocationJobRequestContent(testCases=_inline(SAMPLE_TESTCASES)),
            )
            sfn.run()

            assert client.get_evaluator_job(resp.job_id).status == JobStatus.SUCCESS
            for tr in client.list_test_results(resp.report_id).test_results:
                assert tr.output is not None

    def test_failure(
        self, evaluator_factory: Callable[..., Evaluator], client: DefaultApi,
    ) -> None:
        router = MockEventRouter()
        router.add_rule({"evaluatorName": ["test-eval"]}, _failing_handler)
        router.add_rule({"jobType": ["POST_PROCESS"]}, _post_process)

        with orchestration(router) as sfn:
            resp = client.submit_app_invocation_job(
                "test-eval",
                SubmitAppInvocationJobRequestContent(testCases=_inline(SAMPLE_TESTCASES)),
            )
            sfn.run()
            assert client.get_evaluator_job(resp.job_id).status == JobStatus.FAILURE

    def test_continue(
        self, evaluator_factory: Callable[..., Evaluator], client: DefaultApi,
    ) -> None:
        evaluator = evaluator_factory(scorers=[])
        counter = [0]
        router = MockEventRouter()
        router.add_rule({"evaluatorName": ["test-eval"]},
                        _counting_handler(evaluator, counter, timeout_on_call=1))
        router.add_rule({"jobType": ["POST_PROCESS"]}, _post_process)

        with orchestration(router) as sfn:
            resp = client.submit_app_invocation_job(
                "test-eval",
                SubmitAppInvocationJobRequestContent(testCases=_inline(MANY_TESTCASES)),
            )
            sfn.run()

            assert counter[0] >= 2
            assert client.get_evaluator_job(resp.job_id).status == JobStatus.SUCCESS


# ---------------------------------------------------------------------------
# Score-from-source
# ---------------------------------------------------------------------------


class TestScoreFromSource:

    def test_happy_path(
        self, evaluator_factory: Callable[..., Evaluator], client: DefaultApi,
    ) -> None:
        scorer_eval = evaluator_factory(app_invoke=None, scorers=[exact_match_scorer], name="scorer")
        source_id = _make_source_report(client)

        router = MockEventRouter()
        router.add_rule({"evaluatorName": ["scorer"]}, _handler(scorer_eval))
        router.add_rule({"jobType": ["COPY_RESULTS"]}, _copy_results)
        router.add_rule({"jobType": ["POST_PROCESS"]}, _post_process)

        with orchestration(router) as sfn:
            resp = client.submit_scoring_job(
                "scorer",
                SubmitScoringJobRequestContent(
                    sourceReportId=source_id, scorers={"exact_match_scorer": None},
                ),
            )
            sfn.run()

            assert client.get_evaluator_job(resp.job_id).status == JobStatus.SUCCESS
            for tr in client.list_test_results(resp.report_id).test_results:
                assert "exact_match_scorer" in tr.scores

    def test_scorer_failure(
        self, evaluator_factory: Callable[..., Evaluator], client: DefaultApi,
    ) -> None:
        source_id = _make_source_report(client)

        router = MockEventRouter()
        router.add_rule({"evaluatorName": ["scorer"]}, _failing_handler)
        router.add_rule({"jobType": ["COPY_RESULTS"]}, _copy_results)
        router.add_rule({"jobType": ["POST_PROCESS"]}, _post_process)

        with orchestration(router) as sfn:
            resp = client.submit_scoring_job(
                "scorer",
                SubmitScoringJobRequestContent(
                    sourceReportId=source_id, scorers={"my_scorer": None},
                ),
            )
            sfn.run()
            assert client.get_evaluator_job(resp.job_id).status == JobStatus.FAILURE

    def test_continue_on_scorer(
        self, evaluator_factory: Callable[..., Evaluator], client: DefaultApi,
    ) -> None:
        scorer_eval = evaluator_factory(app_invoke=None, scorers=[exact_match_scorer], name="scorer")
        # Need enough results to span multiple pages (page_size=5)
        source_id = _make_source_report(client, MANY_TESTCASES)
        counter = [0]

        router = MockEventRouter()
        router.add_rule({"evaluatorName": ["scorer"]},
                        _counting_handler(scorer_eval, counter, timeout_on_call=1))
        router.add_rule({"jobType": ["COPY_RESULTS"]}, _copy_results)
        router.add_rule({"jobType": ["POST_PROCESS"]}, _post_process)

        with orchestration(router) as sfn:
            resp = client.submit_scoring_job(
                "scorer",
                SubmitScoringJobRequestContent(
                    sourceReportId=source_id, scorers={"exact_match_scorer": None},
                ),
            )
            sfn.run()

            assert counter[0] >= 2
            assert client.get_evaluator_job(resp.job_id).status == JobStatus.SUCCESS


# ---------------------------------------------------------------------------
# Score-in-place (multi-evaluator: APP_INVOKE → SCORE on same report)
# ---------------------------------------------------------------------------


class TestScoreInPlace:

    def test_happy_path(
        self, evaluator_factory: Callable[..., Evaluator], client: DefaultApi,
    ) -> None:
        invoke_eval = evaluator_factory(app_invoke=simple_app, scorers=[], name="invoker")
        scorer_eval = evaluator_factory(app_invoke=None, scorers=[exact_match_scorer], name="scorer")

        router = MockEventRouter()
        router.add_rule({"evaluatorName": ["invoker"]}, _handler(invoke_eval))
        router.add_rule({"evaluatorName": ["scorer"]}, _handler(scorer_eval))
        router.add_rule({"jobType": ["POST_PROCESS"]}, _post_process)

        with orchestration(router) as sfn:
            resp = client.submit_evaluation_job(
                "invoker",
                SubmitEvaluationJobRequestContent(
                    testCases=_inline(SAMPLE_TESTCASES),
                    scorers={"exact_match_scorer": {"evaluatorName": "scorer"}},
                ),
            )
            sfn.run()

            assert client.get_evaluator_job(resp.job_id).status == JobStatus.SUCCESS
            for tr in client.list_test_results(resp.report_id).test_results:
                assert "exact_match_scorer" in tr.scores

    def test_scorer_failure(
        self, evaluator_factory: Callable[..., Evaluator], client: DefaultApi,
    ) -> None:
        invoke_eval = evaluator_factory(app_invoke=simple_app, scorers=[], name="invoker")

        router = MockEventRouter()
        router.add_rule({"evaluatorName": ["invoker"]}, _handler(invoke_eval))
        router.add_rule({"evaluatorName": ["scorer"]}, _failing_handler)
        router.add_rule({"jobType": ["POST_PROCESS"]}, _post_process)

        with orchestration(router) as sfn:
            resp = client.submit_evaluation_job(
                "invoker",
                SubmitEvaluationJobRequestContent(
                    testCases=_inline(SAMPLE_TESTCASES),
                    scorers={"exact_match_scorer": {"evaluatorName": "scorer"}},
                ),
            )
            sfn.run()
            # All scorers failed → FAILURE
            assert client.get_evaluator_job(resp.job_id).status == JobStatus.FAILURE

    def test_continue_on_scorer(
        self, evaluator_factory: Callable[..., Evaluator], client: DefaultApi,
    ) -> None:
        invoke_eval = evaluator_factory(app_invoke=simple_app, scorers=[], name="invoker")
        scorer_eval = evaluator_factory(app_invoke=None, scorers=[exact_match_scorer], name="scorer")
        counter = [0]

        router = MockEventRouter()
        router.add_rule({"evaluatorName": ["invoker"]}, _handler(invoke_eval))
        router.add_rule({"evaluatorName": ["scorer"]},
                        _counting_handler(scorer_eval, counter, timeout_on_call=1))
        router.add_rule({"jobType": ["POST_PROCESS"]}, _post_process)

        with orchestration(router) as sfn:
            resp = client.submit_evaluation_job(
                "invoker",
                SubmitEvaluationJobRequestContent(
                    testCases=_inline(MANY_TESTCASES),
                    scorers={"exact_match_scorer": {"evaluatorName": "scorer"}},
                ),
            )
            sfn.run()

            assert counter[0] >= 2
            assert client.get_evaluator_job(resp.job_id).status == JobStatus.SUCCESS
            for tr in client.list_test_results(resp.report_id).test_results:
                assert "exact_match_scorer" in tr.scores


# ---------------------------------------------------------------------------
# Post-processing CONTINUE with real orchestration + Welford verification
# ---------------------------------------------------------------------------


class TestPostProcessContinue:
    """Post-processing CONTINUE through MockSF with real run_post_processing.

    Uses _post_process_with_continue which forces CONTINUE after every page,
    verifying that Welford accumulators survive across CONTINUEs and produce
    correct final aggregated metrics.
    """

    def test_pp_continue_produces_correct_aggregation(
        self, evaluator_factory: Callable[..., Evaluator], client: DefaultApi,
    ) -> None:
        """50 testcases -> PP CONTINUEs across pages -> correct Welford aggregation."""
        evaluator = evaluator_factory()

        router = MockEventRouter()
        router.add_rule({"evaluatorName": ["test-eval"]}, _handler(evaluator))
        router.add_rule({"jobType": ["POST_PROCESS"]}, _post_process_with_continue)

        with orchestration(router) as sfn:
            resp = client.submit_evaluation_job(
                "test-eval",
                SubmitEvaluationJobRequestContent(
                    testCases=_inline(LARGE_TESTCASES),
                    scorers={"exact_match_scorer": None},
                ),
            )
            sfn.run()

            job = client.get_evaluator_job(resp.job_id)
            assert job.status == JobStatus.SUCCESS

            # Verify all results exist with scores
            all_results = []
            next_token = None
            while True:
                page = client.list_test_results(resp.report_id, max_results=200, next_token=next_token)
                all_results.extend(page.test_results)
                next_token = page.next_token
                if not next_token:
                    break

            assert len(all_results) == len(LARGE_TESTCASES)
            for tr in all_results:
                assert "exact_match_scorer" in tr.scores

            # Verify aggregated metrics on report
            from evaluator_api.routes import get_report_dao
            report = get_report_dao().get(resp.report_id)
            assert report is not None
            assert report.aggregated_metrics is not None
            assert "exact_match_scorer" in report.aggregated_metrics

            agg = report.aggregated_metrics["exact_match_scorer"]
            assert int(agg["count"]) == len(LARGE_TESTCASES)

            # Compute expected mean manually and verify Welford accuracy
            score_values = [
                float(tr.scores["exact_match_scorer"].value)
                for tr in all_results
                if tr.scores["exact_match_scorer"].value is not None
            ]
            if score_values:
                expected_mean = sum(score_values) / len(score_values)
                assert abs(float(agg["mean"]) - expected_mean) < 1e-6, (
                    f"Welford mean {agg['mean']} != expected {expected_mean}"
                )
                expected_min = min(score_values)
                expected_max = max(score_values)
                assert float(agg["min"]) == expected_min
                assert float(agg["max"]) == expected_max


class TestScorerPaginatesAllResults:
    """Verify scorer processes ALL pages, not just the first."""

    def test_all_results_scored_across_pages(
        self, evaluator_factory: Callable[..., Evaluator], client: DefaultApi,
    ) -> None:
        """Score 10 results (2 pages of 5) — all must have scores."""
        scorer_eval = evaluator_factory(app_invoke=None, scorers=[exact_match_scorer], name="scorer")
        source_id = _make_source_report(client, MANY_TESTCASES)

        router = MockEventRouter()
        router.add_rule({"evaluatorName": ["scorer"]}, _handler(scorer_eval))
        router.add_rule({"jobType": ["COPY_RESULTS"]}, _copy_results)
        router.add_rule({"jobType": ["POST_PROCESS"]}, _post_process)

        with orchestration(router) as sfn:
            resp = client.submit_scoring_job(
                "scorer",
                SubmitScoringJobRequestContent(
                    sourceReportId=source_id, scorers={"exact_match_scorer": None},
                ),
            )
            sfn.run()

            assert client.get_evaluator_job(resp.job_id).status == JobStatus.SUCCESS

            all_results = []
            next_token = None
            while True:
                page = client.list_test_results(resp.report_id, max_results=200, next_token=next_token)
                all_results.extend(page.test_results)
                next_token = page.next_token
                if not next_token:
                    break

            assert len(all_results) == len(MANY_TESTCASES)
            for tr in all_results:
                assert "exact_match_scorer" in tr.scores, (
                    f"Result {tr.result_id} missing scores — scorer stopped after first page"
                )
