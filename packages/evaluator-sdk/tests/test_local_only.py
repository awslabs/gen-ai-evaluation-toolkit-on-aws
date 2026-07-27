"""Tests for local_only mode — runs app + scorers without any API calls."""

from typing import Any

from awssolutions_gen_ai_evaluation_toolkit_python_client.models import (  # type: ignore[attr-defined]
    InlineTestCase,
)

from evaluator_sdk import (
    EvaluationResponse,
    Evaluator,
    Scorer,
    TestResult,
    scorer,
)

from .helpers import exact_match_scorer, failing_app, failing_scorer, simple_app


class TestLocalOnlyEvaluate:
    """evaluate() in local_only mode — no API, no mock needed."""

    def test_evaluate_returns_results(self) -> None:
        evaluator = Evaluator(
            name="test-eval",
            app_invoke=simple_app,
            scorers=[exact_match_scorer],
            local_only=True,
        )

        resp = evaluator.evaluate(testcases=[
            InlineTestCase(input={"q": "2+2"}, expected={"answer": "4"}),
            InlineTestCase(input={"q": "3+3"}, expected={"answer": "6"}),
        ])

        assert isinstance(resp, EvaluationResponse)
        assert resp.report_id == ""
        assert resp.job_id == ""
        assert len(resp.results) == 2
        assert resp.results[0].output == {"answer": "4"}
        assert resp.results[0].scores["exact_match_scorer"].value == 1.0
        assert resp.results[1].scores["exact_match_scorer"].value == 0.0

    def test_evaluate_empty_testcases(self) -> None:
        evaluator = Evaluator(
            name="test-eval",
            app_invoke=simple_app,
            scorers=[exact_match_scorer],
            local_only=True,
        )

        resp = evaluator.evaluate(testcases=[])

        assert resp.results == []

    def test_evaluate_captures_app_error(self) -> None:
        evaluator = Evaluator(
            name="test-eval",
            app_invoke=failing_app,
            scorers=[exact_match_scorer],
            local_only=True,
        )

        resp = evaluator.evaluate(testcases=[
            InlineTestCase(input={"q": "test"}, expected={"a": "4"}),
        ])

        assert len(resp.results) == 1
        assert resp.results[0].error == "App failed!"
        assert resp.results[0].output is None
        assert resp.results[0].scores == {}

    def test_evaluate_captures_scorer_error(self) -> None:
        evaluator = Evaluator(
            name="test-eval",
            app_invoke=simple_app,
            scorers=[failing_scorer],
            local_only=True,
        )

        resp = evaluator.evaluate(testcases=[
            InlineTestCase(input={"q": "test"}),
        ])

        assert len(resp.results) == 1
        assert resp.results[0].scores["failing_scorer"].error == "Scorer exploded!"
        assert resp.results[0].scores["failing_scorer"].value is None

    def test_evaluate_return_results_false(self) -> None:
        evaluator = Evaluator(
            name="test-eval",
            app_invoke=simple_app,
            scorers=[exact_match_scorer],
            local_only=True,
        )

        resp = evaluator.evaluate(
            testcases=[InlineTestCase(input={"q": "1"}, expected={"answer": "4"})],
            return_results=False,
        )

        assert resp.results is None


class TestLocalOnlyInvoke:
    """invoke() in local_only mode."""

    def test_invoke_returns_results(self) -> None:
        evaluator = Evaluator(
            name="test-eval",
            app_invoke=simple_app,
            local_only=True,
        )

        resp = evaluator.invoke(testcases=[
            InlineTestCase(input={"q": "2+2"}),
        ])

        assert len(resp.results) == 1
        assert resp.results[0].output == {"answer": "4"}
        assert resp.results[0].scores == {}


class TestLocalOnlyScore:
    """score() in local_only mode."""

    def test_score_returns_results(self) -> None:
        evaluator = Evaluator(
            name="test-eval",
            scorers=[exact_match_scorer],
            local_only=True,
        )

        resp = evaluator.score(testcases=[
            {"input": {"q": "1"}, "output": {"answer": "4"}, "expected": {"answer": "4"}},
            {"input": {"q": "2"}, "output": {"answer": "5"}, "expected": {"answer": "4"}},
        ])

        assert len(resp.results) == 2
        assert resp.results[0].scores["exact_match_scorer"].value == 1.0
        assert resp.results[1].scores["exact_match_scorer"].value == 0.0


class TestLocalOnlyDynamicScorer:
    """Tests for @scorer(dynamic=True) dispatch through Evaluator(local_only=True).score()."""

    def test_dynamic_only_scorer(self) -> None:
        """A Scorer with only @scorer(dynamic=True) dispatches all score names to the handler."""
        received_calls: list[dict[str, Any]] = []

        class DynamicOnlyScorer(Scorer):
            @scorer(dynamic=True)
            def handle(
                self, score_name: str, score_params: dict[str, Any] | None,
                test_result: TestResult,
            ) -> float:
                received_calls.append({
                    "score_name": score_name,
                    "score_params": score_params,
                })
                return 0.5 if score_name == "alpha" else 0.9

        evaluator = Evaluator(
            name="test-eval",
            scorers=[DynamicOnlyScorer],
            local_only=True,
        )

        resp = evaluator.score(
            testcases=[{"input": {"q": "1"}, "output": {"answer": "4"}}],
            scorers={"DynamicOnlyScorer": {
                "scores": {"alpha": {"threshold": 0.5}, "beta": None},
            }},
        )

        assert len(resp.results) == 1
        assert resp.results[0].scores["DynamicOnlyScorer.alpha"].value == 0.5
        assert resp.results[0].scores["DynamicOnlyScorer.beta"].value == 0.9

    def test_static_takes_precedence_over_dynamic(self) -> None:
        """When both static @scorer and @scorer(dynamic=True) exist, static wins for matching names."""
        dynamic_calls: list[str] = []

        class MixedScorer(Scorer):
            @scorer
            def exact(self, test_result: TestResult) -> float:
                return 1.0

            @scorer(dynamic=True)
            def fallback(
                self, score_name: str, score_params: dict[str, Any] | None,
                test_result: TestResult,
            ) -> float:
                dynamic_calls.append(score_name)
                return 0.0

        evaluator = Evaluator(
            name="test-eval",
            scorers=[MixedScorer],
            local_only=True,
        )

        resp = evaluator.score(
            testcases=[{"input": {"q": "1"}, "output": {"text": "hello"}}],
            scorers={"MixedScorer": {
                "scores": {"exact": None, "novelty": None},
            }},
        )

        # Static method handles "exact"
        assert resp.results[0].scores["MixedScorer.exact"].value == 1.0
        # Dynamic handler handles "novelty" (no static method for it)
        assert resp.results[0].scores["MixedScorer.novelty"].value == 0.0
        # Dynamic handler was only called for "novelty", not "exact"
        assert dynamic_calls == ["novelty"]

    def test_dynamic_receives_score_name_and_score_params(self) -> None:
        """Verify score_name and score_params are correctly passed to the dynamic handler."""
        received: list[dict[str, Any]] = []

        class ParamCapturingScorer(Scorer):
            @scorer(dynamic=True)
            def handle(
                self, score_name: str, score_params: dict[str, Any] | None,
                test_result: TestResult,
            ) -> float:
                received.append({
                    "score_name": score_name,
                    "score_params": score_params,
                    "input": test_result.input,
                    "output": test_result.output,
                })
                return 1.0

        evaluator = Evaluator(
            name="test-eval",
            scorers=[ParamCapturingScorer],
            local_only=True,
        )

        resp = evaluator.score(
            testcases=[{"input": {"q": "hello"}, "output": {"text": "world"}}],
            scorers={"ParamCapturingScorer": {
                "scores": {
                    "metric_x": {"model": "nova", "temperature": 0.7},
                    "metric_y": None,
                },
            }},
        )

        assert len(received) == 2
        # Find the calls by score_name (order is dict iteration order)
        by_name = {r["score_name"]: r for r in received}

        assert "metric_x" in by_name
        assert by_name["metric_x"]["score_params"] == {"model": "nova", "temperature": 0.7}
        assert by_name["metric_x"]["input"] == {"q": "hello"}
        assert by_name["metric_x"]["output"] == {"text": "world"}

        assert "metric_y" in by_name
        assert by_name["metric_y"]["score_params"] is None

        assert resp.results[0].scores["ParamCapturingScorer.metric_x"].value == 1.0
        assert resp.results[0].scores["ParamCapturingScorer.metric_y"].value == 1.0


class TestLocalOnlyNoApiRequired:
    """local_only=True should not require api_endpoint or any API setup."""

    def test_no_api_endpoint_needed(self) -> None:
        evaluator = Evaluator(
            name="test-eval",
            app_invoke=simple_app,
            scorers=[exact_match_scorer],
            local_only=True,
        )

        assert not hasattr(evaluator, "_api")

    def test_dict_testcases_work(self) -> None:
        evaluator = Evaluator(
            name="test-eval",
            app_invoke=simple_app,
            local_only=True,
        )

        resp = evaluator.invoke(
            testcases=[{"input": {"q": "1"}, "expected": {"answer": "4"}}],
        )

        assert len(resp.results) == 1
        assert resp.results[0].output == {"answer": "4"}
