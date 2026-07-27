"""Tests for EvaluationResult serialization, ScoreResult, and return_results flag."""

from typing import Any
from unittest.mock import Mock

from awssolutions_gen_ai_evaluation_toolkit_python_client.models import (  # type: ignore[attr-defined]
    InlineTestCase,
)

from evaluator_sdk import EvaluationResult, Evaluator, ScoreResult, TestResult

from .conftest import exact_match_scorer, simple_app


class TestEvaluationResult:
    """Tests for EvaluationResult and ScoreResult — pure unit tests."""

    def test_to_dict(self) -> None:
        result = EvaluationResult(
            input_data={"question": "test"},
            output={"answer": "42"},
            expected={"answer": "42"},
            scores={"accuracy": ScoreResult(value=1.0)},
            error=None,
        )

        d = result.to_dict()

        assert d["input"] == {"question": "test"}
        assert d["output"] == {"answer": "42"}
        assert d["expected"] == {"answer": "42"}
        assert d["scores"] == {
            "accuracy": {"value": 1.0, "error": None, "reason": None, "context": None},
        }
        assert d["error"] is None

    def test_to_dict_with_score_error(self) -> None:
        result = EvaluationResult(
            input_data={"q": "test"},
            output={"a": "42"},
            scores={
                "good": ScoreResult(value=1.0),
                "bad": ScoreResult(error="Scorer crashed"),
            },
        )

        d = result.to_dict()

        assert d["scores"]["good"]["value"] == 1.0
        assert d["scores"]["good"]["error"] is None
        assert d["scores"]["bad"]["value"] is None
        assert d["scores"]["bad"]["error"] == "Scorer crashed"

    def test_to_dict_with_reason(self) -> None:
        result = EvaluationResult(
            input_data={"q": "test"},
            output={"a": "42"},
            scores={
                "quality": ScoreResult(
                    value=0.8, reason="Mostly correct",
                ),
            },
        )

        d = result.to_dict()

        assert d["scores"]["quality"]["value"] == 0.8
        assert d["scores"]["quality"]["reason"] == "Mostly correct"

    def test_score_result_repr(self) -> None:
        assert "value=1.0" in repr(ScoreResult(value=1.0))
        assert "error=" in repr(ScoreResult(error="fail"))
        assert "reason=" in repr(
            ScoreResult(value=0.5, reason="close enough"),
        )


class TestReturnResultsFalse:
    """When return_results=False — results are None but API calls still happen."""

    def test_evaluate_return_results_false(
        self, mock_api: Any, sample_testcases: list[InlineTestCase],
    ) -> None:
        evaluator = Evaluator(
            name="test-eval",
            app_invoke=simple_app,
            scorers=[exact_match_scorer],
            client=mock_api,
        )
        resp = evaluator.evaluate(
            testcases=sample_testcases, return_results=False,
        )
        assert resp.results is None
        assert resp.report_id is not None
        assert resp.job_id is not None
        mock_api.batch_create_results.assert_called_once()

    def test_score_return_results_false(self, mock_api: Any) -> None:
        evaluator = Evaluator(
            name="test-eval",
            scorers=[exact_match_scorer],
            client=mock_api,
        )
        resp = evaluator.score(
            testcases=[
                {"input": {"q": "a"}, "output": {"answer": "4"}, "expected": {"answer": "4"}},
            ],
            return_results=False,
        )
        assert resp.results is None
        mock_api.batch_create_results.assert_called_once()

    def test_invoke_return_results_false(
        self, mock_api: Any, sample_testcases: list[InlineTestCase],
    ) -> None:
        evaluator = Evaluator(
            name="test-eval",
            app_invoke=simple_app,
            client=mock_api,
        )
        resp = evaluator.invoke(
            testcases=sample_testcases, return_results=False,
        )
        assert resp.results is None
        mock_api.batch_create_results.assert_called_once()

    def test_evaluate_return_results_true_by_default(
        self, mock_api: Any, sample_testcases: list[InlineTestCase],
    ) -> None:
        evaluator = Evaluator(
            name="test-eval",
            app_invoke=simple_app,
            scorers=[exact_match_scorer],
            client=mock_api,
        )
        resp = evaluator.evaluate(testcases=sample_testcases)
        assert resp.results is not None
        assert len(resp.results) == 2


def assert_reason_sent(mock_api: Any, score_name: str, expected_reason: str) -> None:
    """Search every batch_update_scores call for score_name and assert its reason
    was sent to the API. Fails if the score was never sent or the reason differs."""
    for call in mock_api.batch_update_scores.call_args_list:
        req = call.kwargs["batch_update_scores_request_content"]
        for item in req.items:
            if score_name in item.scores:
                assert item.scores[score_name].reason == expected_reason
                return
    raise AssertionError(f"{score_name!r} was never sent to batch_update_scores")


class TestScoreReasonReachesApi:
    """Regression: ScoreResult.reason must survive into the ScoreInput sent to the
    API. It was once dropped at every score-submission site, persisting reason=null.
    Each test drives one real enclosing function."""

    def test_score_testcases_forwards_reason(self, mock_api: Any) -> None:
        """score(testcases=...) -> _process_score_only -> _build_result."""
        def reason_scorer(*, test_result: TestResult) -> ScoreResult:
            return ScoreResult(value=1.0, reason="inline reason")

        evaluator = Evaluator(name="test-eval", scorers=[reason_scorer], client=mock_api)
        evaluator.score(testcases=[{"input": {"q": "a"}, "output": {"answer": "4"}}])

        assert_reason_sent(mock_api, "reason_scorer", "inline reason")

    def test_score_existing_results_forwards_reason(self, mock_api: Any) -> None:
        """_score_existing_results -> _score_single_result (handler path)."""
        def reason_scorer(*, test_result: TestResult) -> ScoreResult:
            return ScoreResult(value=1.0, reason="existing reason")

        evaluator = Evaluator(name="test-eval", scorers=[reason_scorer], client=mock_api)
        mock_api.list_test_results.return_value = Mock(
            test_results=[Mock(
                input={"q": "a"}, output={"answer": "4"}, expected=None,
                metadata=None, result_id="r-1",
            )],
            next_token=None,
        )

        evaluator._score_existing_results(
            job_id="j-1", report_id="rep-1", scorer_configs={"reason_scorer": None},
        )

        assert_reason_sent(mock_api, "reason_scorer", "existing reason")

    def test_score_from_source_forwards_reason(self, mock_api: Any) -> None:
        """score(source_report_id=...) -> _score_from_source."""
        def reason_scorer(*, test_result: TestResult) -> ScoreResult:
            return ScoreResult(value=1.0, reason="source reason")

        evaluator = Evaluator(name="test-eval", scorers=[reason_scorer], client=mock_api)
        mock_api.submit_scoring_job.return_value = Mock(report_id="rep-2", job_id="j-2")
        mock_api.list_test_results.return_value = Mock(
            test_results=[Mock(
                input={"q": "a"}, output={"answer": "4"}, expected=None,
                metadata=None, result_id="r-2",
            )],
            next_token=None,
        )

        evaluator.score(source_report_id="rep-src")

        assert_reason_sent(mock_api, "reason_scorer", "source reason")
