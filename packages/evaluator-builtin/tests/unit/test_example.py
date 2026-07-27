"""Unit tests for the example evaluator components."""

from evaluator_sdk import ScoreResult, TestResult

from evaluator_builtin.example import ExampleTextQualityScorer, example_app, example_exact_match


class TestExampleApp:
    def test_default_behavior(self) -> None:
        assert example_app({"text": "Hello"}) == {"text": "Response: Hello"}

    def test_empty_input(self) -> None:
        assert example_app({}) == {"text": "Response: "}


class TestExampleExactMatch:
    def test_match(self) -> None:
        result = example_exact_match(test_result=TestResult(output={"text": "foo"}, expected={"text": "foo"}))
        assert isinstance(result, ScoreResult)
        assert result.value == 1.0

    def test_mismatch(self) -> None:
        result = example_exact_match(test_result=TestResult(output={"text": "foo"}, expected={"text": "bar"}))
        assert isinstance(result, ScoreResult)
        assert result.value == 0.0

    def test_no_expected(self) -> None:
        result = example_exact_match(test_result=TestResult(output={"text": "foo"}, expected=None))
        assert isinstance(result, ScoreResult)
        assert result.value == 0.0


class TestExampleTextQualityScorer:
    """Tests for the Scorer subclass with @scorer methods."""

    def _score(self, output_text: str, **kwargs):  # type: ignore[no-untyped-def]
        scorer = ExampleTextQualityScorer()
        return scorer.score(
            test_result=TestResult(
                input={"text": "anything"},
                expected=None,
                output={"text": output_text},
            ),
            **kwargs,
        )

    def test_all_scores_by_default(self) -> None:
        results = self._score("Response: Hello")
        assert "length" in results
        assert "prefix" in results

    def test_select_subset_of_scores(self) -> None:
        results = self._score("Response: Hello", scores={"length": None})
        assert "length" in results
        assert "prefix" not in results

    def test_length_nonempty(self) -> None:
        results = self._score("Hello")
        assert results["length"] == 1.0

    def test_length_empty(self) -> None:
        results = self._score("")
        assert results["length"] == 0.0

    def test_length_strict_short(self) -> None:
        results = self._score("Hi", params={"strict": True})
        assert results["length"] == 0.0

    def test_length_strict_long(self) -> None:
        results = self._score("Hello World", params={"strict": True})
        assert results["length"] == 1.0

    def test_prefix_match(self) -> None:
        results = self._score("Response: Hello")
        sr = results["prefix"]
        assert isinstance(sr, ScoreResult)
        assert sr.value == 1.0

    def test_prefix_mismatch(self) -> None:
        results = self._score("Hello")
        sr = results["prefix"]
        assert isinstance(sr, ScoreResult)
        assert sr.value == 0.0

    def test_available_scores_auto_populated(self) -> None:
        scorer = ExampleTextQualityScorer()
        assert "length" in scorer.available_scores
        assert "prefix" in scorer.available_scores
