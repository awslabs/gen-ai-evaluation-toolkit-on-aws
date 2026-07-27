"""Shared test scenarios that run against both mock and onebox backends.

Each test method receives an ``evaluator_factory`` callable (provided by the
backend-specific conftest) and asserts only on the returned ``EvaluationResponse``
— never on mock call args or DB state.
"""

from typing import Any, Callable

import pytest
from awssolutions_gen_ai_evaluation_toolkit_python_client.models import (  # type: ignore[attr-defined]
    InlineTestCase,
)

from evaluator_sdk import (
    EvaluationResponse,
    Evaluator,
    EvaluatorError,
    Scorer,
    ScoreResult,
    TestResult,
    scorer,
)

from .helpers import failing_app, failing_scorer, make_sample_testcases

EvaluatorFactory = Callable[..., Evaluator]


# ============================================================================
# evaluate() — full flow
# ============================================================================


class EvaluatorScenarios:
    """Shared scenarios exercised by both mock and onebox test suites."""

    # --- evaluate: full flow ---

    def test_evaluate_full_flow(self, evaluator_factory: EvaluatorFactory) -> None:
        """App + scorers, verify results count, output values, score values."""
        evaluator = evaluator_factory()
        testcases = make_sample_testcases()

        resp = evaluator.evaluate(testcases=testcases)

        assert isinstance(resp, EvaluationResponse)
        assert resp.report_id is not None
        assert resp.job_id is not None
        assert len(resp.results) == 2
        assert resp.results[0].output == {"answer": "4"}
        assert resp.results[0].scores["exact_match_scorer"].value == 1.0
        assert resp.results[1].output == {"answer": "4"}
        assert resp.results[1].scores["exact_match_scorer"].value == 0.0

    def test_evaluate_with_dict_testcases(self, evaluator_factory: EvaluatorFactory) -> None:
        """Dict input accepted as testcases."""
        evaluator = evaluator_factory()

        resp = evaluator.evaluate(
            testcases=[{"input": {"q": "1"}, "expected": {"a": "1"}}],
        )

        assert len(resp.results) == 1

    def test_evaluate_empty_testcases(self, evaluator_factory: EvaluatorFactory) -> None:
        """Empty results, no error."""
        evaluator = evaluator_factory()

        resp = evaluator.evaluate(testcases=[])

        assert resp.results == []

    def test_evaluate_no_testcases_or_dataset_raises(
        self, evaluator_factory: EvaluatorFactory,
    ) -> None:
        evaluator = evaluator_factory()

        with pytest.raises(EvaluatorError, match="Must provide"):
            evaluator.evaluate()

    def test_evaluate_both_testcases_and_dataset_raises(
        self, evaluator_factory: EvaluatorFactory,
    ) -> None:
        evaluator = evaluator_factory()

        with pytest.raises(EvaluatorError, match="Cannot specify both"):
            evaluator.evaluate(
                testcases=[InlineTestCase(input={"q": "1"}, expected={"a": "1"})],
                dataset_id="ds-1",
            )

    # --- evaluate: validation errors ---

    def test_evaluate_no_app_invoke_raises(self, evaluator_factory: EvaluatorFactory) -> None:
        """EvaluatorError raised when app_invoke is None."""
        evaluator = evaluator_factory(app_invoke=None)

        with pytest.raises(EvaluatorError, match="app_invoke"):
            evaluator.evaluate(
                testcases=[InlineTestCase(input={"q": "1"}, expected={"a": "1"})],
            )

    def test_evaluate_no_scorers_raises(self, evaluator_factory: EvaluatorFactory) -> None:
        evaluator = evaluator_factory(scorers=[])

        with pytest.raises(EvaluatorError, match="scorer"):
            evaluator.evaluate(
                testcases=[InlineTestCase(input={"q": "1"})],
            )

    def test_evaluate_unregistered_scorer_raises(
        self, evaluator_factory: EvaluatorFactory,
    ) -> None:
        evaluator = evaluator_factory()

        with pytest.raises(EvaluatorError, match="not registered"):
            evaluator.evaluate(
                testcases=[InlineTestCase(input={"q": "1"})],
                scorers={"nonexistent": None},
            )

    # --- evaluate: scorer config ---

    def test_evaluate_scorers_config_filters_to_subset(
        self, evaluator_factory: EvaluatorFactory,
    ) -> None:
        def scorer_a(*, test_result: TestResult) -> float:
            return 1.0

        def scorer_b(*, test_result: TestResult) -> float:
            return 0.5

        evaluator = evaluator_factory(scorers=[scorer_a, scorer_b])

        resp = evaluator.evaluate(
            testcases=[InlineTestCase(input={"q": "1"})],
            scorers={"scorer_a": None},
        )

        assert "scorer_a" in resp.results[0].scores
        assert "scorer_b" not in resp.results[0].scores

    # --- evaluate: app invoke errors ---

    def test_app_invoke_error_captured(self, evaluator_factory: EvaluatorFactory) -> None:
        """Error field set, output None, scores empty when app raises."""
        evaluator = evaluator_factory(app_invoke=failing_app)

        resp = evaluator.evaluate(
            testcases=[InlineTestCase(input={"q": "test"}, expected={"a": "answer"})],
        )

        assert len(resp.results) == 1
        assert resp.results[0].error == "App failed!"
        assert resp.results[0].output is None
        assert resp.results[0].scores == {}

    def test_app_invoke_different_exception_types(
        self, evaluator_factory: EvaluatorFactory,
    ) -> None:
        call_count = [0]

        def varying_failure_app(input_data: dict[str, Any]) -> dict[str, Any]:
            call_count[0] += 1
            if call_count[0] == 1:
                raise ValueError("ValueError message")
            elif call_count[0] == 2:
                raise RuntimeError("RuntimeError message")
            else:
                raise Exception("Generic exception")

        def always_pass(*, test_result: TestResult) -> float:
            return 1.0

        evaluator = evaluator_factory(
            app_invoke=varying_failure_app,
            scorers=[always_pass],
        )

        testcases = [
            InlineTestCase(input={"id": 1}),
            InlineTestCase(input={"id": 2}),
            InlineTestCase(input={"id": 3}),
        ]
        resp = evaluator.evaluate(testcases=testcases)

        assert len(resp.results) == 3
        assert resp.results[0].error == "ValueError message"
        assert resp.results[1].error == "RuntimeError message"
        assert resp.results[2].error == "Generic exception"

        for result in resp.results:
            assert result.output is None
            assert result.scores == {}

    def test_app_invoke_error_contains_only_message(
        self, evaluator_factory: EvaluatorFactory,
    ) -> None:
        def timeout_app(input_data: dict[str, Any]) -> dict[str, Any]:
            raise ValueError("Connection timeout after 30s")

        evaluator = evaluator_factory(app_invoke=timeout_app, scorers=[])

        testcases = [InlineTestCase(input={"test": True})]
        resp = evaluator.invoke(testcases=testcases)

        assert resp.results[0].error == "Connection timeout after 30s"
        assert "Traceback" not in (resp.results[0].error or "")

    def test_mixed_testcases_app_failures(
        self, evaluator_factory: EvaluatorFactory,
    ) -> None:
        """Some testcases succeed, some fail."""
        call_count = [0]

        def sometimes_failing_app(input_data: dict[str, Any]) -> dict[str, Any]:
            call_count[0] += 1
            if call_count[0] == 2:
                raise ValueError("App failed on second testcase")
            return {"result": f"success-{call_count[0]}"}

        def always_pass(*, test_result: TestResult) -> float:
            return 1.0

        evaluator = evaluator_factory(
            app_invoke=sometimes_failing_app,
            scorers=[always_pass],
        )

        testcases = [
            InlineTestCase(input={"id": 1}),
            InlineTestCase(input={"id": 2}),
            InlineTestCase(input={"id": 3}),
        ]
        resp = evaluator.evaluate(testcases=testcases)

        assert resp.results[0].output == {"result": "success-1"}
        assert resp.results[0].error is None
        assert resp.results[0].scores["always_pass"].value == 1.0

        assert resp.results[1].output is None
        assert resp.results[1].error == "App failed on second testcase"
        assert resp.results[1].scores == {}

        assert resp.results[2].output == {"result": "success-3"}
        assert resp.results[2].error is None
        assert resp.results[2].scores["always_pass"].value == 1.0

    def test_app_invoke_returns_none(self, evaluator_factory: EvaluatorFactory) -> None:
        def none_returning_app(input_data: dict[str, Any]) -> dict[str, Any]:
            return None  # type: ignore

        evaluator = evaluator_factory(app_invoke=none_returning_app, scorers=[])

        testcases = [InlineTestCase(input={"test": True})]
        resp = evaluator.invoke(testcases=testcases)

        assert resp.results[0].output is None
        assert resp.results[0].scores == {}

    # --- evaluate: scorer errors ---

    def test_scorer_error_recorded(self, evaluator_factory: EvaluatorFactory) -> None:
        """Score.error set, score.value None when scorer raises."""
        evaluator = evaluator_factory(scorers=[failing_scorer])

        resp = evaluator.evaluate(
            testcases=[InlineTestCase(input={"q": "test"}, expected={"a": "4"})],
        )

        assert len(resp.results) == 1
        assert resp.results[0].output == {"answer": "4"}
        sr = resp.results[0].scores["failing_scorer"]
        assert sr.value is None
        assert sr.error == "Scorer exploded!"

    def test_multiple_scorers_one_fails_others_continue(
        self, evaluator_factory: EvaluatorFactory,
    ) -> None:
        def always_pass(*, test_result: TestResult) -> float:
            return 1.0

        def returns_zero(*, test_result: TestResult) -> float:
            return 0.0

        evaluator = evaluator_factory(
            scorers=[always_pass, failing_scorer, returns_zero],
        )

        resp = evaluator.evaluate(
            testcases=[InlineTestCase(input={"test": True})],
        )

        assert resp.results[0].scores["always_pass"].value == 1.0
        assert resp.results[0].scores["always_pass"].error is None
        assert resp.results[0].scores["returns_zero"].value == 0.0
        assert resp.results[0].scores["returns_zero"].error is None
        assert resp.results[0].scores["failing_scorer"].value is None
        assert resp.results[0].scores["failing_scorer"].error == "Scorer exploded!"

    def test_multiple_scorer_exceptions_each_independent(
        self, evaluator_factory: EvaluatorFactory,
    ) -> None:
        def failing_1(*, test_result: TestResult) -> float:
            raise ValueError("Scorer 1 failed")

        def always_pass(*, test_result: TestResult) -> float:
            return 1.0

        def failing_2(*, test_result: TestResult) -> float:
            raise RuntimeError("Scorer 2 failed")

        evaluator = evaluator_factory(
            scorers=[failing_1, always_pass, failing_2],
        )

        resp = evaluator.evaluate(
            testcases=[InlineTestCase(input={"test": True})],
        )

        assert len(resp.results[0].scores) == 3
        assert resp.results[0].scores["always_pass"].value == 1.0
        assert resp.results[0].scores["failing_1"].value is None
        assert resp.results[0].scores["failing_1"].error == "Scorer 1 failed"
        assert resp.results[0].scores["failing_2"].value is None
        assert resp.results[0].scores["failing_2"].error == "Scorer 2 failed"

    def test_zero_score_is_valid_not_error(self, evaluator_factory: EvaluatorFactory) -> None:
        def returns_zero(*, test_result: TestResult) -> float:
            return 0.0

        evaluator = evaluator_factory(scorers=[returns_zero])

        resp = evaluator.evaluate(
            testcases=[InlineTestCase(input={"test": True})],
        )

        sr = resp.results[0].scores["returns_zero"]
        assert sr.value == 0.0
        assert sr.error is None
        assert resp.results[0].error is None

    def test_conditional_scorer_fails_on_specific_input(
        self, evaluator_factory: EvaluatorFactory,
    ) -> None:
        def conditional(*, test_result: TestResult) -> float:
            if (test_result.input or {}).get("fail_scorer"):
                raise ValueError("Conditional failure!")
            return 0.5

        evaluator = evaluator_factory(scorers=[conditional])

        testcases = [
            InlineTestCase(input={"fail_scorer": False}),
            InlineTestCase(input={"fail_scorer": True}),
        ]
        resp = evaluator.evaluate(testcases=testcases)

        assert resp.results[0].scores["conditional"].value == 0.5
        assert resp.results[0].scores["conditional"].error is None
        assert resp.results[1].scores["conditional"].value is None
        assert resp.results[1].scores["conditional"].error == "Conditional failure!"

    # --- Scorer ABC ---

    def test_scorer_subclass_runs_in_evaluate(
        self, evaluator_factory: EvaluatorFactory,
    ) -> None:
        class ConstScorer(Scorer):
            available_scores = {"metric_a": None}

            def score(
                self, test_result: TestResult,
                scores: dict[str, dict[str, Any] | None] | None = None,
                params: dict[str, Any] | None = None,
            ) -> dict[str, float]:
                return {"metric_a": 0.75}

        evaluator = evaluator_factory(scorers=[ConstScorer])

        resp = evaluator.evaluate(
            testcases=[InlineTestCase(input={"q": "test"}, expected={"a": "4"})],
        )

        assert len(resp.results) == 1
        assert resp.results[0].scores["ConstScorer.metric_a"].value == 0.75

    def test_scorer_receives_params_and_scores(
        self, evaluator_factory: EvaluatorFactory,
    ) -> None:
        received: dict[str, Any] = {}

        class CapturingScorer(Scorer):
            available_scores = {"f": None}

            def score(
                self, test_result: TestResult,
                scores: dict[str, dict[str, Any] | None] | None = None,
                params: dict[str, Any] | None = None,
            ) -> dict[str, float]:
                received["params"] = params
                received["scores"] = scores
                return {"f": 1.0}

        evaluator = evaluator_factory(scorers=[CapturingScorer])

        resp = evaluator.evaluate(
            testcases=[InlineTestCase(input={"q": "x"})],
            scorers={"CapturingScorer": {"params": {"model_id": "nova"}, "scores": {"f": None}}},
        )

        assert received["params"] == {"model_id": "nova"}
        assert received["scores"] == {"f": None}
        # Sub-scores are namespaced with the class name
        assert "CapturingScorer.f" in resp.results[0].scores

    def test_score_receives_per_score_params(
        self, evaluator_factory: EvaluatorFactory,
    ) -> None:
        """Per-score config from scores dict is passed as score_params to @scorer methods."""
        received: dict[str, Any] = {}

        class ConfigurableScorer(Scorer):
            @scorer
            def metric_a(self, test_result: TestResult, score_params: dict[str, Any] | None = None) -> float:
                received["metric_a_score_params"] = score_params
                mode = (score_params or {}).get("mode", "default")
                return 1.0 if mode == "precision" else 0.5

            @scorer
            def metric_b(self, test_result: TestResult) -> float:
                return 0.75

        evaluator = evaluator_factory(scorers=[ConfigurableScorer])

        resp = evaluator.evaluate(
            testcases=[InlineTestCase(input={"q": "x"})],
            scorers={"ConfigurableScorer": {
                "scores": {"metric_a": {"mode": "precision"}, "metric_b": None},
            }},
        )

        assert received["metric_a_score_params"] == {"mode": "precision"}
        assert resp.results[0].scores["ConfigurableScorer.metric_a"].value == 1.0
        assert resp.results[0].scores["ConfigurableScorer.metric_b"].value == 0.75

    def test_scorer_receives_metadata(
        self, evaluator_factory: EvaluatorFactory,
    ) -> None:
        """Metadata from the test case is passed to function scorers."""
        received_metadata: list[Any] = []

        def metadata_scorer(*, test_result: TestResult) -> float:
            received_metadata.append(test_result.metadata)
            return 1.0

        evaluator = evaluator_factory(scorers=[metadata_scorer])

        evaluator.evaluate(testcases=[
            InlineTestCase(input={"q": "1"}, metadata={"source": "unit-test", "priority": "high"}),
            InlineTestCase(input={"q": "2"}),
        ])

        assert received_metadata[0] == {"source": "unit-test", "priority": "high"}
        assert received_metadata[1] is None

    def test_scorer_class_receives_metadata(
        self, evaluator_factory: EvaluatorFactory,
    ) -> None:
        """Metadata from the test case is passed to Scorer subclasses."""
        received_metadata: list[Any] = []

        class MetaScorer(Scorer):
            available_scores = {"m": None}

            def score(
                self, test_result: TestResult,
                scores: dict[str, dict[str, Any] | None] | None = None,
                params: dict[str, Any] | None = None,
            ) -> dict[str, float]:
                received_metadata.append(test_result.metadata)
                return {"m": 1.0}

        evaluator = evaluator_factory(scorers=[MetaScorer])

        resp = evaluator.evaluate(testcases=[
            InlineTestCase(input={"q": "1"}, metadata={"env": "prod"}),
        ])

        assert received_metadata[0] == {"env": "prod"}
        assert "MetaScorer.m" in resp.results[0].scores

    def test_scorer_can_return_score_result_with_reason(
        self, evaluator_factory: EvaluatorFactory,
    ) -> None:
        class ReasonScorer(Scorer):
            available_scores = {"quality": None}

            def score(
                self, test_result: TestResult,
                scores: dict[str, dict[str, Any] | None] | None = None,
                params: dict[str, Any] | None = None,
            ) -> dict[str, float | ScoreResult]:
                return {
                    "quality": ScoreResult(value=0.8, reason="Output is mostly correct"),
                }

        evaluator = evaluator_factory(scorers=[ReasonScorer])

        resp = evaluator.evaluate(
            testcases=[InlineTestCase(input={"q": "test"})],
        )

        sr = resp.results[0].scores["ReasonScorer.quality"]
        assert sr.value == 0.8
        assert sr.reason == "Output is mostly correct"
        assert sr.error is None

    def test_function_scorer_can_return_score_result(
        self, evaluator_factory: EvaluatorFactory,
    ) -> None:
        def reasoning_scorer(*, test_result: TestResult) -> ScoreResult:
            return ScoreResult(value=0.9, reason="Looks good")

        evaluator = evaluator_factory(scorers=[reasoning_scorer])

        resp = evaluator.evaluate(
            testcases=[InlineTestCase(input={"q": "test"})],
        )

        sr = resp.results[0].scores["reasoning_scorer"]
        assert sr.value == 0.9
        assert sr.reason == "Looks good"
        assert sr.error is None

    # --- invoke() — app-invoke only flow ---

    def test_invoke_runs_app_no_scoring(self, evaluator_factory: EvaluatorFactory) -> None:
        evaluator = evaluator_factory()

        resp = evaluator.invoke(
            testcases=[InlineTestCase(input={"q": "1"}, expected={"answer": "4"})],
        )

        assert len(resp.results) == 1
        assert resp.results[0].output == {"answer": "4"}
        assert resp.results[0].scores == {}

    def test_invoke_without_app_invoke_raises(
        self, evaluator_factory: EvaluatorFactory,
    ) -> None:
        evaluator = evaluator_factory(app_invoke=None)

        with pytest.raises(EvaluatorError, match="app_invoke"):
            evaluator.invoke(
                testcases=[InlineTestCase(input={"q": "1"})],
            )

    def test_invoke_captures_app_error(self, evaluator_factory: EvaluatorFactory) -> None:
        evaluator = evaluator_factory(app_invoke=failing_app, scorers=[])

        resp = evaluator.invoke(
            testcases=[InlineTestCase(input={"q": "test"})],
        )

        assert resp.results[0].error == "App failed!"
        assert resp.results[0].output is None
        assert resp.results[0].scores == {}

    def test_invoke_accepts_dict_testcases(self, evaluator_factory: EvaluatorFactory) -> None:
        evaluator = evaluator_factory(scorers=[])

        resp = evaluator.invoke(
            testcases=[{"input": {"q": "1"}, "expected": {"answer": "4"}}],
        )

        assert len(resp.results) == 1
        assert resp.results[0].output == {"answer": "4"}

    def test_invoke_no_testcases_raises(self, evaluator_factory: EvaluatorFactory) -> None:
        evaluator = evaluator_factory()

        with pytest.raises(EvaluatorError, match="Must provide"):
            evaluator.invoke()

    def test_invoke_empty_testcases(self, evaluator_factory: EvaluatorFactory) -> None:
        evaluator = evaluator_factory(scorers=[])

        resp = evaluator.invoke(testcases=[])

        assert resp.results == []

    def test_invoke_no_scorers_still_creates_result(
        self, evaluator_factory: EvaluatorFactory,
    ) -> None:
        evaluator = evaluator_factory(scorers=[])

        resp = evaluator.invoke(
            testcases=[InlineTestCase(input={"test": True})],
        )

        assert len(resp.results) == 1
        assert resp.results[0].output == {"answer": "4"}
        assert resp.results[0].scores == {}


class ScoreOnlyScenarios:
    """Tests for score() — score-only flow.

    Separated from EvaluatorScenarios because the real handler's submit_scoring_job
    endpoint validates that the report has existing results, which conflicts with
    the SDK's score() flow that creates a fresh report. These only run against mock.
    """

    def test_score_runs_scorers_on_provided_output(
        self, evaluator_factory: EvaluatorFactory,
    ) -> None:
        evaluator = evaluator_factory()

        resp = evaluator.score(testcases=[
            {"input": {"q": "1"}, "output": {"answer": "4"}, "expected": {"answer": "4"}},
            {"input": {"q": "2"}, "output": {"answer": "5"}, "expected": {"answer": "4"}},
        ])

        assert len(resp.results) == 2
        assert resp.results[0].scores["exact_match_scorer"].value == 1.0
        assert resp.results[1].scores["exact_match_scorer"].value == 0.0
        assert resp.results[0].output == {"answer": "4"}
        assert resp.results[1].output == {"answer": "5"}

    def test_score_without_scorers_raises(self, evaluator_factory: EvaluatorFactory) -> None:
        evaluator = evaluator_factory(scorers=[])

        with pytest.raises(EvaluatorError, match="scorer"):
            evaluator.score(testcases=[
                {"input": {"q": "1"}, "output": {"a": "1"}},
            ])

    def test_score_missing_input_records_error(
        self, evaluator_factory: EvaluatorFactory,
    ) -> None:
        evaluator = evaluator_factory()

        resp = evaluator.score(testcases=[{"output": {"a": "1"}}])

        assert len(resp.results) == 1
        assert "missing required key" in resp.results[0].error
        assert "input" in resp.results[0].error
        assert resp.results[0].scores == {}

    def test_score_missing_output_records_error(
        self, evaluator_factory: EvaluatorFactory,
    ) -> None:
        evaluator = evaluator_factory()

        resp = evaluator.score(testcases=[{"input": {"q": "1"}}])

        assert len(resp.results) == 1
        assert "missing required key" in resp.results[0].error
        assert "output" in resp.results[0].error
        assert resp.results[0].scores == {}

    def test_score_without_expected(self, evaluator_factory: EvaluatorFactory) -> None:
        evaluator = evaluator_factory()

        resp = evaluator.score(testcases=[
            {"input": {"q": "1"}, "output": {"answer": "4"}},
        ])

        assert len(resp.results) == 1
        assert resp.results[0].expected is None

    def test_score_does_not_call_app_invoke(
        self, evaluator_factory: EvaluatorFactory,
    ) -> None:
        app_called: list[bool] = []

        def tracking_app(input_data: dict[str, Any]) -> dict[str, Any]:
            app_called.append(True)
            return {"answer": "from_app"}

        evaluator = evaluator_factory(app_invoke=tracking_app)

        resp = evaluator.score(testcases=[
            {"input": {"q": "1"}, "output": {"answer": "4"}, "expected": {"answer": "4"}},
        ])

        assert app_called == [], "app_invoke should not be called in score()"
        assert resp.results[0].output == {"answer": "4"}

    def test_score_with_scorer_config(self, evaluator_factory: EvaluatorFactory) -> None:
        def scorer_a(*, test_result: TestResult) -> float:
            return 1.0

        def scorer_b(*, test_result: TestResult) -> float:
            return 0.5

        evaluator = evaluator_factory(scorers=[scorer_a, scorer_b])

        resp = evaluator.score(
            testcases=[{"input": {"q": "1"}, "output": {"a": "1"}}],
            scorers={"scorer_a": None},
        )

        assert "scorer_a" in resp.results[0].scores
        assert "scorer_b" not in resp.results[0].scores
