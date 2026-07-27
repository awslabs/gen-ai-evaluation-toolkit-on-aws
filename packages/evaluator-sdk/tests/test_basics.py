"""Basic SDK usage tests — start here to understand the evaluator-sdk.

These tests show the simplest happy-path usage of the three main methods:
  - evaluate()  — run your app + score the results
  - invoke()    — run your app only (no scoring)
  - score()     — score pre-existing outputs (no app invocation)

Each test is self-contained and uses minimal setup so you can read them
top-to-bottom as a quick introduction.
"""

from typing import Any
from unittest.mock import Mock

from evaluator_sdk import (
    EvaluationResponse,
    Evaluator,
    ScoreResult,
    TestResult,
)

# ---------------------------------------------------------------------------
# A tiny app and scorer used by the tests below
# ---------------------------------------------------------------------------

def my_app(input_data: dict[str, Any]) -> dict[str, Any]:
    """Simulate an LLM app that answers math questions."""
    return {"answer": "4"}


def my_scorer(*, test_result: TestResult) -> float:
    """Return 1.0 if output matches expected, else 0.0."""
    if test_result.expected is None:
        return 0.0
    return 1.0 if test_result.output == test_result.expected else 0.0


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestEvaluateBasics:
    """evaluate() runs your app, then scores the output."""

    def test_evaluate_happy_path(self, mock_api: Mock) -> None:
        evaluator = Evaluator(
            name="my-evaluator",
            app_invoke=my_app,
            scorers=[my_scorer],
            client=mock_api,
        )

        resp = evaluator.evaluate(testcases=[
            {"input": {"question": "2+2"}, "expected": {"answer": "4"}},
            {"input": {"question": "3+3"}, "expected": {"answer": "6"}},
        ])

        assert isinstance(resp, EvaluationResponse)
        assert resp.report_id is not None
        assert resp.job_id is not None
        assert len(resp.results) == 2

        # First testcase: app returns {"answer": "4"} which matches expected
        assert resp.results[0].output == {"answer": "4"}
        assert resp.results[0].scores["my_scorer"].value == 1.0

        # Second testcase: app returns {"answer": "4"} but expected is {"answer": "6"}
        assert resp.results[1].output == {"answer": "4"}
        assert resp.results[1].scores["my_scorer"].value == 0.0

    def test_evaluate_with_metadata(self, mock_api: Mock) -> None:
        evaluator = Evaluator(
            name="my-evaluator",
            app_invoke=my_app,
            scorers=[my_scorer],
            client=mock_api,
        )

        resp = evaluator.evaluate(testcases=[
            {"input": {"question": "2+2"}, "expected": {"answer": "4"}, "metadata": {"source": "unit-test"}},
            {"input": {"question": "3+3"}, "expected": {"answer": "6"}},
        ])

        assert resp.results[0].metadata == {"source": "unit-test"}
        assert resp.results[1].metadata is None


class TestInvokeBasics:
    """invoke() runs your app but does NOT score — useful for collecting outputs."""

    def test_invoke_happy_path(self, mock_api: Mock) -> None:
        evaluator = Evaluator(
            name="my-evaluator",
            app_invoke=my_app,
            client=mock_api,
        )

        resp = evaluator.invoke(testcases=[
            {"input": {"question": "2+2"}},
        ])

        assert len(resp.results) == 1
        assert resp.results[0].output == {"answer": "4"}
        assert resp.results[0].scores == {}  # no scoring


class TestScoreBasics:
    """score() scores pre-existing outputs — no app invocation."""

    def test_score_happy_path(self, mock_api: Mock) -> None:
        evaluator = Evaluator(
            name="my-evaluator",
            scorers=[my_scorer],
            client=mock_api,
        )

        resp = evaluator.score(testcases=[
            {"input": {"q": "2+2"}, "output": {"answer": "4"}, "expected": {"answer": "4"}},
            {"input": {"q": "3+3"}, "output": {"answer": "4"}, "expected": {"answer": "6"}},
        ])

        assert len(resp.results) == 2
        assert resp.results[0].scores["my_scorer"].value == 1.0
        assert resp.results[1].scores["my_scorer"].value == 0.0


class TestScorerReturningScoreResult:
    """Scorers can return a ScoreResult with a reason (not just a float)."""

    def test_score_result_with_reason(self, mock_api: Mock) -> None:
        def reasoning_scorer(*, test_result: TestResult) -> ScoreResult:
            if test_result.output == test_result.expected:
                return ScoreResult(value=1.0, reason="Exact match")
            return ScoreResult(value=0.0, reason="Output did not match expected")

        evaluator = Evaluator(
            name="my-evaluator",
            app_invoke=my_app,
            scorers=[reasoning_scorer],
            client=mock_api,
        )

        resp = evaluator.evaluate(testcases=[
            {"input": {"q": "2+2"}, "expected": {"answer": "4"}},
        ])

        sr = resp.results[0].scores["reasoning_scorer"]
        assert sr.value == 1.0
        assert sr.reason == "Exact match"
        assert sr.error is None

        # The reason must also be persisted to the API (not just kept locally) —
        # it should reach batch_update_scores as part of the ScoreInput.
        assert mock_api.batch_update_scores.called
        _, kwargs = mock_api.batch_update_scores.call_args
        score_items = kwargs["batch_update_scores_request_content"].items
        persisted = score_items[0].scores["reasoning_scorer"]
        assert persisted.reason == "Exact match"
