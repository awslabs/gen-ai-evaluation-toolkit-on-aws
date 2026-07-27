"""Tests for Evaluator initialization, Scorer registration, and TestCase alias."""

from typing import Any
from unittest.mock import Mock

import pytest
from awssolutions_gen_ai_evaluation_toolkit_python_client.models import (  # type: ignore[attr-defined]
    InlineTestCase,
)

from evaluator_sdk import Evaluator, Scorer, TestCase, TestResult

from .conftest import exact_match_scorer


class TestEvaluatorInit:
    """Tests for Evaluator initialization."""

    def test_init_with_injected_mock(self, mock_api: Mock) -> None:
        evaluator = Evaluator(
            name="test-eval",
            api_endpoint="https://api.example.com",
            client=mock_api,
        )
        assert evaluator.name == "test-eval"
        assert evaluator.client == mock_api
        assert evaluator.scorers == {}

    def test_init_with_no_scorers(self, mock_api: Mock) -> None:
        evaluator = Evaluator(
            name="test-eval",
            api_endpoint="https://api.example.com",
            scorers=[],
            client=mock_api,
        )
        assert evaluator.scorers == {}

    def test_init_creates_api_client(self) -> None:
        evaluator = Evaluator(
            name="test-eval",
            api_endpoint="https://api.example.com",
        )
        assert evaluator.name == "test-eval"
        assert evaluator.client is not None

    def test_init_with_scorers_list(self, mock_api: Mock) -> None:
        evaluator = Evaluator(
            name="test-eval",
            api_endpoint="https://api.example.com",
            scorers=[exact_match_scorer],
            client=mock_api,
        )
        assert "exact_match_scorer" in evaluator.scorers
        assert evaluator.scorers["exact_match_scorer"] is exact_match_scorer

    def test_init_invalid_batch_size_raises(self, mock_api: Mock) -> None:
        with pytest.raises(ValueError, match="batch_size must be >= 1"):
            Evaluator(name="test-eval", batch_size=0, client=mock_api)

        with pytest.raises(ValueError, match="batch_size must be >= 1"):
            Evaluator(name="test-eval", batch_size=-1, client=mock_api)

    def test_init_with_region(self, mock_api: Mock) -> None:
        evaluator = Evaluator(
            name="test-eval",
            api_endpoint="https://api.example.com",
            region="eu-west-1",
            client=mock_api,
        )
        assert evaluator.name == "test-eval"


class TestScorerABCRegistration:
    """Test Scorer subclass registration (constructor only, no evaluate)."""

    def test_scorer_subclass_can_be_registered(self, mock_api: Mock) -> None:
        class MyScorer(Scorer):
            available_scores = {"sub_a": None, "sub_b": {"mode": "strict"}}

            def score(
                self, test_result: TestResult,
                scores: dict[str, dict[str, Any] | None] | None = None,
                params: dict[str, Any] | None = None,
            ) -> dict[str, float]:
                return {"sub_a": 1.0, "sub_b": 0.5}

        evaluator = Evaluator(
            name="test-eval",
            scorers=[MyScorer],
            client=mock_api,
        )
        assert isinstance(evaluator.scorers["MyScorer"], Scorer)


class TestTestCase:
    """Tests for the TestCase type alias."""

    def test_testcase_is_inline_testcase(self) -> None:
        assert TestCase is InlineTestCase

    def test_testcase_from_dict(self) -> None:
        tc = TestCase.model_validate({"input": {"q": "1"}})
        assert tc.input == {"q": "1"}
