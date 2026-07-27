"""Onebox tests for evaluator_handler — remote evaluation via EventBridge events.

evaluator_handler() is the Lambda entry point for remotely-triggered evaluation jobs.
It receives an EventBridge event containing job details (job_id, report_id, job_type,
test data, scorer config) and runs the same evaluation logic as the local methods.

The key difference from local flow: the job and report already exist in DDB (created
by the submission API). The handler picks up the PENDING job, runs it, and updates
status to COMPLETED/FAILED.
"""

from typing import Any, Callable

import pytest
from awssolutions_gen_ai_evaluation_toolkit_python_client.api import DefaultApi  # type: ignore[attr-defined]
from awssolutions_gen_ai_evaluation_toolkit_python_client.models import (  # type: ignore[attr-defined]
    InlineTestCase,
    InlineTestResult,
    JobStatus,
    SubmitAppInvocationJobRequestContent,
    SubmitEvaluationJobRequestContent,
    SubmitScoringJobRequestContent,
    TestDataSource,
)

from evaluator_sdk import Evaluator, Scorer, ScoreResult, TestResult, scorer

from ..helpers import exact_match_scorer, failing_app, failing_scorer

# ---
# Helpers
# ---


def _inline_test_data(testcases: list[dict[str, Any]]) -> dict[str, Any]:
    """Build a TestDataSource-compatible dict from inline testcases."""
    return {"inline": testcases}


def _make_event(
    *,
    evaluator_name: str,
    job_id: str,
    report_id: str,
    job_type: str,
    test_data: dict[str, Any] | None = None,
    scorers: dict[str, Any | None] | None = None,
    source_report_id: str | None = None,
    task_token: str | None = None,
    task_key: str | None = None,
) -> dict[str, Any]:
    """Build a mock EventBridge event for evaluator_handler."""
    detail: dict[str, Any] = {
        "evaluatorName": evaluator_name,
        "jobId": job_id,
        "reportId": report_id,
        "jobType": job_type,
    }
    if test_data is not None:
        detail["testCases"] = test_data
    if scorers is not None:
        detail["scorers"] = scorers
    if source_report_id is not None:
        detail["sourceReportId"] = source_report_id
    if task_token is not None:
        detail["taskToken"] = task_token
    if task_key is not None:
        detail["taskKey"] = task_key
    return {"detail": detail}


def _submit_evaluation_job(
    client: DefaultApi,
    evaluator_name: str,
    testcases: list[dict[str, Any]],
    scorers: dict[str, Any | None] | None = None,
) -> dict[str, str]:
    """Submit a FULL evaluation job via the API. Returns {job_id, report_id}."""
    test_data = TestDataSource.from_dict(_inline_test_data(testcases))
    resp = client.submit_evaluation_job(
        evaluator_name,
        SubmitEvaluationJobRequestContent(testCases=test_data, scorers=scorers),
    )
    return {"jobId": resp.job_id, "reportId": resp.report_id}


def _submit_invoke_job(
    client: DefaultApi,
    evaluator_name: str,
    testcases: list[dict[str, Any]],
) -> dict[str, str]:
    """Submit an APP_INVOKE job via the API. Returns {job_id, report_id}."""
    test_data = TestDataSource.from_dict(_inline_test_data(testcases))
    resp = client.submit_app_invocation_job(
        evaluator_name,
        SubmitAppInvocationJobRequestContent(testCases=test_data),
    )
    return {"jobId": resp.job_id, "reportId": resp.report_id}


def _submit_scoring_job(
    client: DefaultApi,
    evaluator_name: str,
    source_report_id: str,
    scorers: dict[str, Any | None] | None = None,
) -> dict[str, str]:
    """Submit a SCORE job via the API. Returns {job_id, report_id}."""
    resp = client.submit_scoring_job(
        evaluator_name,
        SubmitScoringJobRequestContent(sourceReportId=source_report_id, scorers=scorers),
    )
    return {"jobId": resp.job_id, "reportId": resp.report_id}


def _submit_scoring_job_with_results(
    client: DefaultApi,
    evaluator_name: str,
    test_results: list[dict[str, Any]],
    scorers: dict[str, Any | None] | None = None,
) -> dict[str, str]:
    """Submit a SCORE job with inline test results. Returns {job_id, report_id}."""
    inline = [
        InlineTestResult.from_dict(r) for r in test_results
    ]
    resp = client.submit_scoring_job(
        evaluator_name,
        SubmitScoringJobRequestContent(testResults=inline, scorers=scorers),
    )
    return {"jobId": resp.job_id, "reportId": resp.report_id}


SAMPLE_TESTCASES = [
    {"input": {"question": "What is 2+2?"}, "expected": {"answer": "4"}},
    {"input": {"question": "What is 3+3?"}, "expected": {"answer": "6"}},
]


# ---
# Full evaluation (FULL job type)
# ---


class TestHandlerFullEvaluation:
    """evaluator_handler processes FULL jobs: app_invoke + scoring."""

    def test_full_evaluation_scorer_subset(
        self, evaluator_factory: Callable[..., Evaluator], client: DefaultApi,
    ) -> None:
        """Handler only runs scorers specified in the event, not all registered."""

        def always_one(*, test_result: TestResult) -> float:
            return 1.0

        evaluator = evaluator_factory(scorers=[exact_match_scorer, always_one])

        submitted = _submit_evaluation_job(
            client, "test-eval", SAMPLE_TESTCASES,
            scorers={"exact_match_scorer": None},
        )

        event = _make_event(
            evaluator_name="test-eval",
            job_id=submitted["jobId"],
            report_id=submitted["reportId"],
            job_type="FULL",
            test_data=_inline_test_data(SAMPLE_TESTCASES),
            scorers={"exact_match_scorer": None},  # only this one
        )
        evaluator.evaluator_handler(event, None)

        results_resp = client.list_test_results(report_id=submitted["reportId"])
        for tr in results_resp.test_results:
            assert "exact_match_scorer" in tr.scores
            assert "always_one" not in tr.scores

    def test_full_evaluation_all_scorers_when_none(
        self, evaluator_factory: Callable[..., Evaluator], client: DefaultApi,
    ) -> None:
        """When scorers=None in event, handler runs all registered scorers."""
        evaluator = evaluator_factory()

        submitted = _submit_evaluation_job(client, "test-eval", SAMPLE_TESTCASES)

        event = _make_event(
            evaluator_name="test-eval",
            job_id=submitted["jobId"],
            report_id=submitted["reportId"],
            job_type="FULL",
            test_data=_inline_test_data(SAMPLE_TESTCASES),
            # scorers not specified → None → all registered
        )
        evaluator.evaluator_handler(event, None)

        results_resp = client.list_test_results(report_id=submitted["reportId"])
        for tr in results_resp.test_results:
            assert "exact_match_scorer" in tr.scores


# ---
# Invoke-only (APP_INVOKE job type)
# ---


# ---
# Score-only (SCORE job type)
# ---


class TestHandlerScore:
    """evaluator_handler processes SCORE jobs: scoring only."""

    def test_score_with_scorer_class(
        self, evaluator_factory: Callable[..., Evaluator], client: DefaultApi,
    ) -> None:
        """Handler works with Scorer ABC subclasses for multi-score plugins."""

        class QualityScorer(Scorer):
            @scorer
            def length_check(self, test_result: TestResult) -> float:
                return 1.0 if len(str((test_result.output or {}).get("answer", ""))) > 0 else 0.0

            @scorer
            def has_answer(self, test_result: TestResult) -> ScoreResult:
                has_it = "answer" in (test_result.output or {})
                return ScoreResult(value=1.0 if has_it else 0.0, reason=f"has_answer={has_it}")

        evaluator = evaluator_factory(scorers=[QualityScorer])

        # Invoke first to populate results
        invoke_resp = evaluator.invoke(testcases=[
            InlineTestCase(input={"question": "What is 2+2?"}, expected={"answer": "4"}),
        ])

        # Submit scoring job
        submitted = _submit_scoring_job(
            client, "test-eval", invoke_resp.report_id,
            scorers={"QualityScorer": None},
        )

        event = _make_event(
            evaluator_name="test-eval",
            job_id=submitted["jobId"],
            report_id=submitted["reportId"],
            job_type="SCORE",
            source_report_id=invoke_resp.report_id,
            scorers={"QualityScorer": None},
        )
        result = evaluator.evaluator_handler(event, None)

        assert result["status"] == "COMPLETED"


# ---
# Validation
# ---


class TestHandlerValidation:
    """evaluator_handler validates configuration before processing."""

    def test_full_job_requires_app_invoke(
        self, evaluator_factory: Callable[..., Evaluator], client: DefaultApi,
    ) -> None:
        """FULL job fails if evaluator has no app_invoke configured."""
        evaluator = evaluator_factory(app_invoke=None)

        submitted = _submit_evaluation_job(client, "test-eval", SAMPLE_TESTCASES)

        event = _make_event(
            evaluator_name="test-eval",
            job_id=submitted["jobId"],
            report_id=submitted["reportId"],
            job_type="FULL",
            test_data=_inline_test_data(SAMPLE_TESTCASES),
        )
        result = evaluator.evaluator_handler(event, None)

        assert result["status"] == "FAILED"
        assert "app_invoke" in result["error"].lower()

        # Verify job marked FAILED in DDB
        job_resp = client.get_evaluator_job(
            job_id=submitted["jobId"],
        )
        assert job_resp.status == JobStatus.FAILURE

    def test_full_job_requires_scorers(
        self, evaluator_factory: Callable[..., Evaluator], client: DefaultApi,
    ) -> None:
        """FULL job fails if evaluator has no scorers registered."""
        evaluator = evaluator_factory(scorers=[])

        submitted = _submit_evaluation_job(client, "test-eval", SAMPLE_TESTCASES)

        event = _make_event(
            evaluator_name="test-eval",
            job_id=submitted["jobId"],
            report_id=submitted["reportId"],
            job_type="FULL",
            test_data=_inline_test_data(SAMPLE_TESTCASES),
        )
        result = evaluator.evaluator_handler(event, None)

        assert result["status"] == "FAILED"
        assert "scorer" in result["error"].lower()

    def test_invoke_job_requires_app_invoke(
        self, evaluator_factory: Callable[..., Evaluator], client: DefaultApi,
    ) -> None:
        """APP_INVOKE job fails if evaluator has no app_invoke configured."""
        evaluator = evaluator_factory(app_invoke=None)

        submitted = _submit_invoke_job(client, "test-eval", SAMPLE_TESTCASES)

        event = _make_event(
            evaluator_name="test-eval",
            job_id=submitted["jobId"],
            report_id=submitted["reportId"],
            job_type="APP_INVOKE",
            test_data=_inline_test_data(SAMPLE_TESTCASES),
        )
        result = evaluator.evaluator_handler(event, None)

        assert result["status"] == "FAILED"
        assert "app_invoke" in result["error"].lower()

    def test_score_job_requires_scorers(
        self, evaluator_factory: Callable[..., Evaluator], client: DefaultApi,
    ) -> None:
        """SCORE job fails if evaluator has no scorers registered."""
        evaluator = evaluator_factory(scorers=[])

        # Need results to score — invoke first
        invoker = evaluator_factory(scorers=[])
        invoke_resp = invoker.invoke(testcases=[
            InlineTestCase(input={"q": "test"}),
        ])

        submitted = _submit_scoring_job(
            client, "test-eval", invoke_resp.report_id,
        )

        event = _make_event(
            evaluator_name="test-eval",
            job_id=submitted["jobId"],
            report_id=submitted["reportId"],
            job_type="SCORE",
            source_report_id=invoke_resp.report_id,
        )
        result = evaluator.evaluator_handler(event, None)

        assert result["status"] == "FAILED"
        assert "scorer" in result["error"].lower()

    def test_unknown_scorer_in_event(
        self, evaluator_factory: Callable[..., Evaluator], client: DefaultApi,
    ) -> None:
        """Handler fails when event requests a scorer not registered on the evaluator."""
        evaluator = evaluator_factory()  # has exact_match_scorer

        submitted = _submit_evaluation_job(
            client, "test-eval", SAMPLE_TESTCASES,
            scorers={"nonexistent_scorer": None},
        )

        event = _make_event(
            evaluator_name="test-eval",
            job_id=submitted["jobId"],
            report_id=submitted["reportId"],
            job_type="FULL",
            test_data=_inline_test_data(SAMPLE_TESTCASES),
            scorers={"nonexistent_scorer": None},
        )
        result = evaluator.evaluator_handler(event, None)

        assert result["status"] == "FAILED"
        assert "nonexistent_scorer" in result["error"]

    def test_evaluator_name_mismatch_raises(
        self, evaluator_factory: Callable[..., Evaluator], client: DefaultApi,
    ) -> None:
        """Handler raises on events meant for a different evaluator."""
        from evaluator_sdk.models import EvaluatorError

        evaluator = evaluator_factory()

        submitted = _submit_evaluation_job(client, "other-eval", SAMPLE_TESTCASES)

        event = _make_event(
            evaluator_name="other-eval",
            job_id=submitted["jobId"],
            report_id=submitted["reportId"],
            job_type="FULL",
            test_data=_inline_test_data(SAMPLE_TESTCASES),
        )
        with pytest.raises(EvaluatorError, match="evaluatorName mismatch"):
            evaluator.evaluator_handler(event, None)


# ---
# Error handling
# ---


class TestHandlerErrors:
    """evaluator_handler handles errors gracefully."""

    def test_app_invoke_error_records_per_result(
        self, evaluator_factory: Callable[..., Evaluator], client: DefaultApi,
    ) -> None:
        """App invoke errors are recorded per-result; job still COMPLETED."""
        evaluator = evaluator_factory(app_invoke=failing_app)

        submitted = _submit_evaluation_job(client, "test-eval", SAMPLE_TESTCASES)

        event = _make_event(
            evaluator_name="test-eval",
            job_id=submitted["jobId"],
            report_id=submitted["reportId"],
            job_type="FULL",
            test_data=_inline_test_data(SAMPLE_TESTCASES),
        )
        result = evaluator.evaluator_handler(event, None)

        # Job completes even though all app_invoke calls failed
        assert result["status"] == "COMPLETED"

        # Verify errors persisted
        results_resp = client.list_test_results(report_id=submitted["reportId"])
        assert len(results_resp.test_results) == 2
        for tr in results_resp.test_results:
            assert tr.error is not None
            assert "App failed" in tr.error

        # Job is SUCCESS (per-result errors don't fail the job, post-processing ran inline)
        job_resp = client.get_evaluator_job(
            job_id=submitted["jobId"],
        )
        assert job_resp.status == JobStatus.SUCCESS

    def test_scorer_error_records_per_score(
        self, evaluator_factory: Callable[..., Evaluator], client: DefaultApi,
    ) -> None:
        """Scorer errors are recorded per-score; job still COMPLETED."""
        evaluator = evaluator_factory(scorers=[failing_scorer])

        submitted = _submit_evaluation_job(
            client, "test-eval", SAMPLE_TESTCASES,
            scorers={"failing_scorer": None},
        )

        event = _make_event(
            evaluator_name="test-eval",
            job_id=submitted["jobId"],
            report_id=submitted["reportId"],
            job_type="FULL",
            test_data=_inline_test_data(SAMPLE_TESTCASES),
            scorers={"failing_scorer": None},
        )
        result = evaluator.evaluator_handler(event, None)

        assert result["status"] == "COMPLETED"

        results_resp = client.list_test_results(report_id=submitted["reportId"])
        assert len(results_resp.test_results) == 2
        for tr in results_resp.test_results:
            assert "failing_scorer" in tr.scores
            score = tr.scores["failing_scorer"]
            assert score.error is not None
            assert "Scorer exploded" in score.error


# ---
# Observability
# ---


class TestHandlerLogging:
    """evaluator_handler emits structured log messages for tracing."""

    def test_full_job_logs_lifecycle(
        self, evaluator_factory: Callable[..., Evaluator], client: DefaultApi,
        caplog: Any,
    ) -> None:
        """FULL job logs: config summary, status transitions, batch ops, completion."""
        import logging

        evaluator = evaluator_factory()

        submitted = _submit_evaluation_job(
            client, "test-eval", SAMPLE_TESTCASES,
            scorers={"exact_match_scorer": None},
        )

        event = _make_event(
            evaluator_name="test-eval",
            job_id=submitted["jobId"],
            report_id=submitted["reportId"],
            job_type="FULL",
            test_data=_inline_test_data(SAMPLE_TESTCASES),
            scorers={"exact_match_scorer": None},
        )

        with caplog.at_level(logging.INFO):
            result = evaluator.evaluator_handler(event, None)

        assert result["status"] == "COMPLETED"

        messages = [r.message for r in caplog.records]

        # Job config summary at start
        assert any("Processing job" in m and "exact_match_scorer" in m for m in messages)

        # Status transitions
        assert any("RUNNING" in m for m in messages)
        assert any("COMPLETED" in m for m in messages)

        # Batch operations
        assert any("Flushing" in m and "results" in m for m in messages)
        assert any("Flushing" in m and "score" in m for m in messages)

        # Job context on records (from log_context factory)
        info_records = [r for r in caplog.records if r.levelno >= logging.INFO]
        for r in info_records:
            if "evaluator_sdk" in r.name:
                assert hasattr(r, "job_id")
                assert r.job_id == submitted["jobId"]  # type: ignore[attr-defined]
                break


# ---
# Score-only with inline test results
# ---


class TestHandlerScoreOnlyInlineResults:
    """SubmitScoringJob with inline testResults: API pre-writes to report, scorer scores in place."""

    def test_inline_test_results_output_preserved(
        self, evaluator_factory: Callable[..., Evaluator], client: DefaultApi,
    ) -> None:
        """Outputs from inline testResults survive through to scoring.

        The API pre-writes testResults to the report at submission time.
        The scorer task receives no testResults in its event — it reads
        existing results from the report and adds scores.
        """
        evaluator = evaluator_factory(scorers=[exact_match_scorer])

        test_results = [
            {"input": {"question": "2+2?"}, "output": {"answer": "4"}, "expected": {"answer": "4"}},
            {"input": {"question": "3+3?"}, "output": {"answer": "7"}, "expected": {"answer": "6"}},
        ]
        submitted = _submit_scoring_job_with_results(
            client, "test-eval", test_results,
            scorers={"exact_match_scorer": None},
        )

        # Scorer event has no testResults — it reads from the report directly
        event = _make_event(
            evaluator_name="test-eval",
            job_id=submitted["jobId"],
            report_id=submitted["reportId"],
            job_type="SCORE",
            scorers={"exact_match_scorer": None},
            task_token="tok-1",
            task_key="score:exact_match_scorer",
        )
        result = evaluator.evaluator_handler(event, None)
        assert result["status"] == "COMPLETED"

        results_resp = client.list_test_results(report_id=submitted["reportId"])
        results = results_resp.test_results
        assert len(results) == 2, "Both inline test results should be present"

        # Order-independent lookup by output value
        by_output = {str(r.output): r for r in results}

        match = by_output[str({"answer": "4"})]
        assert match.scores["exact_match_scorer"].value == 1.0, "Matching output should score 1.0"

        mismatch = by_output[str({"answer": "7"})]
        assert mismatch.scores["exact_match_scorer"].value == 0.0, "Non-matching output should score 0.0"
