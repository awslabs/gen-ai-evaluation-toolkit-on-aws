"""Onebox tests for multi-evaluator orchestration scenarios.

These tests simulate the multi-evaluator flow by manually driving
the pipeline: submit → APP_INVOKE handler → SCORE handlers → post-processing.
No real Step Functions — we simulate the dispatch sequence in-process.

Reuses existing fixtures (setup_handler, client, evaluator_factory) and helpers
from test_evaluator_handler.
"""

from typing import Any, Callable

from awssolutions_gen_ai_evaluation_toolkit_python_client.api import DefaultApi  # type: ignore[attr-defined]
from awssolutions_gen_ai_evaluation_toolkit_python_client.models import (  # type: ignore[attr-defined]
    ScorerConfig,
    SubmitEvaluationJobRequestContent,
    TestDataSource,
)

from evaluator_sdk import Evaluator, Scorer, ScoreResult, TestResult, scorer

from ..helpers import exact_match_scorer, simple_app
from .test_evaluator_handler import (
    SAMPLE_TESTCASES,
    _inline_test_data,
    _make_event,
    _submit_scoring_job_with_results,
)

# ---------------------------------------------------------------------------
# Additional scorers for multi-evaluator tests
# ---------------------------------------------------------------------------


def length_scorer(*, test_result: TestResult) -> float:
    """Scores based on answer length."""
    answer = str((test_result.output or {}).get("answer", ""))
    return min(len(answer) / 10.0, 1.0)


class QualityScorer(Scorer):
    """Multi-score scorer for testing parallel scoring."""

    @scorer
    def completeness(self, test_result: TestResult) -> float:
        return 1.0 if (test_result.output or {}).get("answer") else 0.0

    @scorer
    def confidence(self, test_result: TestResult) -> ScoreResult:
        return ScoreResult(value=0.8, reason="test confidence")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _submit_multi_evaluator_job(
    client: DefaultApi,
    evaluator_name: str,
    testcases: list[dict[str, Any]],
    scorer_overrides: dict[str, str],
) -> dict[str, str]:
    """Submit a multi-evaluator job with scorer evaluator overrides.

    scorer_overrides maps scorer_name → evaluator_name, which creates
    separate score:* tasks in the tasks map (multi-evaluator topology).
    """
    test_data = TestDataSource.from_dict(_inline_test_data(testcases))
    scorers = {
        name: ScorerConfig(evaluatorName=eval_name)
        for name, eval_name in scorer_overrides.items()
    }
    resp = client.submit_evaluation_job(
        evaluator_name,
        SubmitEvaluationJobRequestContent(testCases=test_data, scorers=scorers),
    )
    return {"jobId": resp.job_id, "reportId": resp.report_id}


# ---------------------------------------------------------------------------
# Multi-evaluator: APP_INVOKE → parallel SCORE → post-processing
# ---------------------------------------------------------------------------


class TestMultiEvaluatorFlow:
    """Simulate the multi-evaluator pipeline manually."""

    def test_app_invoke_then_scorer_class(
        self, evaluator_factory: Callable[..., Evaluator], client: DefaultApi,
    ) -> None:
        """APP_INVOKE + multi-score Scorer class producing sub-scores."""
        invoke_eval = evaluator_factory(
            app_invoke=simple_app, scorers=[], name="invoker",
        )
        quality_eval = evaluator_factory(
            app_invoke=None, scorers=[QualityScorer], name="quality-scorer",
        )

        submitted = _submit_multi_evaluator_job(
            client, "invoker", SAMPLE_TESTCASES,
            scorer_overrides={"QualityScorer": "quality-scorer"},
        )
        job_id, report_id = submitted["jobId"], submitted["reportId"]

        invoke_eval.evaluator_handler(
            _make_event(
                evaluator_name="invoker", job_id=job_id, report_id=report_id,
                job_type="APP_INVOKE", test_data=_inline_test_data(SAMPLE_TESTCASES),
            ), None,
        )

        quality_eval.evaluator_handler(
            _make_event(
                evaluator_name="quality-scorer", job_id=job_id, report_id=report_id,
                job_type="SCORE", source_report_id=report_id,
                scorers={"QualityScorer": None},
            ), None,
        )

        results_resp = client.list_test_results(report_id=report_id)
        for tr in results_resp.test_results:
            assert "QualityScorer.completeness" in tr.scores
            assert "QualityScorer.confidence" in tr.scores


# ---------------------------------------------------------------------------
# Error handling
# ---------------------------------------------------------------------------


class TestMultiEvaluatorErrors:
    """Error scenarios in multi-evaluator flow."""

    def test_scorer_failure_doesnt_block_other_scorer(
        self, evaluator_factory: Callable[..., Evaluator], client: DefaultApi,
    ) -> None:
        """One scorer fails, other succeeds — good scores preserved."""
        from ..helpers import failing_scorer

        invoke_eval = evaluator_factory(
            app_invoke=simple_app, scorers=[], name="invoker",
        )
        submitted = _submit_multi_evaluator_job(
            client, "invoker", SAMPLE_TESTCASES,
            scorer_overrides={
                "exact_match_scorer": "good-scorer",
                "failing_scorer": "bad-scorer",
            },
        )

        # Create results
        invoke_eval.evaluator_handler(
            _make_event(
                evaluator_name="invoker",
                job_id=submitted["jobId"], report_id=submitted["reportId"],
                job_type="APP_INVOKE", test_data=_inline_test_data(SAMPLE_TESTCASES),
            ), None,
        )

        # Good scorer succeeds
        good_eval = evaluator_factory(
            app_invoke=None, scorers=[exact_match_scorer], name="good-scorer",
        )
        good_eval.evaluator_handler(
            _make_event(
                evaluator_name="good-scorer",
                job_id=submitted["jobId"], report_id=submitted["reportId"],
                job_type="SCORE", source_report_id=submitted["reportId"],
                scorers={"exact_match_scorer": None},
            ), None,
        )

        # Bad scorer fails per-score (handler still completes)
        bad_eval = evaluator_factory(
            app_invoke=None, scorers=[failing_scorer], name="bad-scorer",
        )
        result = bad_eval.evaluator_handler(
            _make_event(
                evaluator_name="bad-scorer",
                job_id=submitted["jobId"], report_id=submitted["reportId"],
                job_type="SCORE", source_report_id=submitted["reportId"],
                scorers={"failing_scorer": None},
            ), None,
        )
        assert result["status"] == "COMPLETED"

        # Good scores preserved, bad scores have errors
        results_resp = client.list_test_results(report_id=submitted["reportId"])
        for tr in results_resp.test_results:
            assert "exact_match_scorer" in tr.scores
            assert "failing_scorer" in tr.scores
            assert tr.scores["failing_scorer"].error is not None


# ---------------------------------------------------------------------------
# Multi-evaluator SCORE with inline testResults
# ---------------------------------------------------------------------------


class TestMultiEvaluatorScoreWithInlineResults:
    """Multi-evaluator score-only: scorer task scores pre-written inline results.

    Simulates the multi-evaluator topology for SubmitScoringJob with testResults:
    - API pre-writes test results (with output) to the report at submission time
    - ASL fans out scorer tasks to different evaluators
    - Each scorer reads existing results from the report and adds scores

    This validates that the pre-write pattern works for scorer tasks that have
    no testCases/testResults in their event detail.
    """

    def test_scorer_task_scores_prewritten_inline_results(
        self, evaluator_factory: Callable[..., Evaluator], client: DefaultApi,
    ) -> None:
        """Scorer task reads pre-written results from report and adds scores."""
        scorer_eval = evaluator_factory(
            app_invoke=None, scorers=[exact_match_scorer], name="scorer-a",
        )

        test_results = [
            {"input": {"question": "2+2?"}, "output": {"answer": "4"}, "expected": {"answer": "4"}},
            {"input": {"question": "3+3?"}, "output": {"answer": "7"}, "expected": {"answer": "6"}},
        ]

        # API pre-writes results to report during submission
        submitted = _submit_scoring_job_with_results(
            client, "scorer-a", test_results,
            scorers={"exact_match_scorer": None},
        )
        job_id, report_id = submitted["jobId"], submitted["reportId"]

        # Scorer task event — mimics what ASL dispatches (no testResults in detail)
        result = scorer_eval.evaluator_handler(
            _make_event(
                evaluator_name="scorer-a",
                job_id=job_id, report_id=report_id,
                job_type="SCORE",
                scorers={"exact_match_scorer": None},
                task_key="score:exact_match_scorer",
                task_token="tok-score",
            ), None,
        )
        assert result["status"] == "COMPLETED"

        results_resp = client.list_test_results(report_id=report_id)
        results = results_resp.test_results
        assert len(results) == 2, "Both pre-written results should be scored"

        by_output = {str(r.output): r for r in results}
        assert by_output[str({"answer": "4"})].scores["exact_match_scorer"].value == 1.0, \
            "Matching output should score 1.0"
        assert by_output[str({"answer": "7"})].scores["exact_match_scorer"].value == 0.0, \
            "Non-matching output should score 0.0"
