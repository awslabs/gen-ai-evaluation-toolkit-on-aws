"""Tests for multiple app_invoke function support."""

from typing import Any
from unittest.mock import Mock

import pytest

from evaluator_sdk import Evaluator, TestResult
from evaluator_sdk.models import EvaluatorError


def app_a(input_data: dict[str, Any]) -> dict[str, Any]:
    return {"source": "a", "answer": str(input_data)}


def app_b(input_data: dict[str, Any]) -> dict[str, Any]:
    return {"source": "b", "answer": str(input_data)}


def my_scorer(*, test_result: TestResult) -> float:
    return 1.0


class TestMultipleAppInvoke:
    """Multiple app_invoke functions: init, selection, errors."""

    def test_single_fn_works_without_name(self, mock_api: Mock) -> None:
        evaluator = Evaluator(name="t", app_invoke=app_a, scorers=[my_scorer], client=mock_api)
        assert evaluator.app_invoke is app_a
        assert evaluator._resolve_app_invoke() is app_a

    def test_list_of_one_works_without_name(self, mock_api: Mock) -> None:
        evaluator = Evaluator(name="t", app_invoke=[app_a], scorers=[my_scorer], client=mock_api)
        assert evaluator._resolve_app_invoke() is app_a

    def test_multiple_fns_requires_name(self, mock_api: Mock) -> None:
        evaluator = Evaluator(name="t", app_invoke=[app_a, app_b], scorers=[my_scorer], client=mock_api)
        with pytest.raises(EvaluatorError, match="Multiple app_invoke"):
            evaluator._resolve_app_invoke()

    def test_multiple_fns_selects_by_name(self, mock_api: Mock) -> None:
        evaluator = Evaluator(name="t", app_invoke=[app_a, app_b], scorers=[my_scorer], client=mock_api)
        assert evaluator._resolve_app_invoke("app_a") is app_a
        assert evaluator._resolve_app_invoke("app_b") is app_b

    def test_invalid_name_raises(self, mock_api: Mock) -> None:
        evaluator = Evaluator(name="t", app_invoke=[app_a], scorers=[my_scorer], client=mock_api)
        with pytest.raises(EvaluatorError, match="not registered"):
            evaluator._resolve_app_invoke("nonexistent")

    def test_duplicate_names_rejected(self, mock_api: Mock) -> None:
        with pytest.raises(EvaluatorError, match="Duplicate app_invoke"):
            Evaluator(name="t", app_invoke=[app_a, app_a], scorers=[my_scorer], client=mock_api)

    def test_no_app_invoke_raises(self, mock_api: Mock) -> None:
        evaluator = Evaluator(name="t", app_invoke=None, scorers=[my_scorer], client=mock_api)
        with pytest.raises(EvaluatorError, match="No app_invoke"):
            evaluator._resolve_app_invoke()

    def test_evaluate_with_name(self, mock_api: Mock) -> None:
        """evaluate() passes app_invoke_name through to processing."""
        evaluator = Evaluator(name="t", app_invoke=[app_a, app_b], scorers=[my_scorer], client=mock_api)
        resp = evaluator.evaluate(
            testcases=[{"input": {"q": "test"}, "expected": {"a": "1"}}],
            app_invoke_name="app_b",
        )
        # app_b returns {"source": "b", ...}
        assert resp.results[0].output["source"] == "b"

    def test_invoke_with_name(self, mock_api: Mock) -> None:
        """invoke() passes app_invoke_name through to processing."""
        evaluator = Evaluator(name="t", app_invoke=[app_a, app_b], client=mock_api)
        resp = evaluator.invoke(
            testcases=[{"input": {"q": "test"}}],
            app_invoke_name="app_a",
        )
        assert resp.results[0].output["source"] == "a"

    def test_evaluate_without_name_errors_for_multiple(self, mock_api: Mock) -> None:
        evaluator = Evaluator(name="t", app_invoke=[app_a, app_b], scorers=[my_scorer], client=mock_api)
        with pytest.raises(EvaluatorError, match="Multiple app_invoke"):
            evaluator.evaluate(testcases=[{"input": {"q": "test"}, "expected": {"a": "1"}}])

    def test_app_invoke_property_returns_first(self, mock_api: Mock) -> None:
        evaluator = Evaluator(name="t", app_invoke=[app_a, app_b], scorers=[my_scorer], client=mock_api)
        # Property returns first registered (for backward compat in simple cases)
        assert evaluator.app_invoke is app_a
