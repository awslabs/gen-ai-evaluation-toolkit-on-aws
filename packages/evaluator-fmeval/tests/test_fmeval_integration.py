"""E2E integration tests for FMEval scorer using real fmeval library.

These require fmeval to be installed (takes 10-20 minutes).
Run with: uv run pytest -m e2e

Algorithms tested (from packages/tests-ts long-running tests):
  - toxicity
  - qa_accuracy
  - factual_knowledge
  - summarization_accuracy
  - classification_accuracy
"""

from typing import Any

import pytest
from evaluator_sdk import EvaluationResponse, Evaluator

from evaluator_fmeval.scorer import FMEvalScorer

pytestmark = pytest.mark.e2e


# -- Test data ----------------------------------------------------------------

TOXICITY_TEST_CASES: list[dict[str, Any]] = [
    {
        "input": {"model_input": "What is the capital of France?"},
        "output": {"model_output": "The capital of France is Paris, a beautiful city known for the Eiffel Tower."},
    },
]

QA_TEST_CASES: list[dict[str, Any]] = [
    {
        "input": {"model_input": "What is the capital of France?"},
        "output": {"model_output": "The capital of France is Paris."},
        "expected": {"target_output": "Paris"},
    },
]

FACTUAL_KNOWLEDGE_TEST_CASES: list[dict[str, Any]] = [
    {
        "input": {"model_input": "What is the capital of France?"},
        "output": {"model_output": "The capital of France is Paris."},
        "expected": {"target_output": "Paris"},
    },
]


def _make_evaluator() -> Evaluator:
    return Evaluator(
        name="fmeval-e2e",
        scorers=[FMEvalScorer],
        local_only=True,
    )


def _assert_scores_present(resp: EvaluationResponse, expected_count: int, score_prefixes: list[str]) -> None:
    assert isinstance(resp, EvaluationResponse)
    assert len(resp.results) == expected_count
    for result in resp.results:
        for prefix in score_prefixes:
            matching = [k for k in result.scores if k.startswith(f"fmeval.{prefix}")]
            assert matching, f"No score starting with 'fmeval.{prefix}'. Got: {list(result.scores.keys())}"
            for key in matching:
                sr = result.scores[key]
                assert sr.value is not None, f"Score {key} has no value (error: {sr.error})"


# -- Tests --------------------------------------------------------------------


class TestToxicity:
    def test_toxicity(self) -> None:
        evaluator = _make_evaluator()

        resp = evaluator.score(
            testcases=TOXICITY_TEST_CASES,
            scorers={
                "fmeval": {
                    "scores": {"toxicity": None},
                },
            },
            return_results=True,
        )

        _assert_scores_present(resp, 1, ["toxicity"])


class TestQAAccuracy:
    def test_qa_accuracy(self) -> None:
        evaluator = _make_evaluator()

        resp = evaluator.score(
            testcases=QA_TEST_CASES,
            scorers={
                "fmeval": {
                    "scores": {"qa_accuracy": None},
                },
            },
            return_results=True,
        )

        _assert_scores_present(resp, 1, ["qa_accuracy"])


class TestFactualKnowledge:
    def test_factual_knowledge(self) -> None:
        evaluator = _make_evaluator()

        resp = evaluator.score(
            testcases=FACTUAL_KNOWLEDGE_TEST_CASES,
            scorers={
                "fmeval": {
                    "scores": {"factual_knowledge": None},
                },
            },
            return_results=True,
        )

        _assert_scores_present(resp, 1, ["factual_knowledge"])


class TestErrorHandling:
    def test_unknown_algorithm_returns_error(self) -> None:
        evaluator = _make_evaluator()

        resp = evaluator.score(
            testcases=[{
                "input": {"model_input": "hi"},
                "output": {"model_output": "hello"},
            }],
            scorers={
                "fmeval": {
                    "scores": {"nonexistent_algo": None},
                },
            },
            return_results=True,
        )

        assert len(resp.results) == 1
        score = resp.results[0].scores["fmeval.nonexistent_algo"]
        assert score.error is not None
        assert "Unknown FMEval algorithm" in score.error


class TestCustomFieldMapping:
    def test_custom_fields(self) -> None:
        evaluator = _make_evaluator()

        resp = evaluator.score(
            testcases=[{
                "input": {"question": "What is the capital of France?"},
                "output": {"answer": "Paris is the capital of France."},
            }],
            scorers={
                "fmeval": {
                    "params": {
                        "data_config": {
                            "model_input_location": "question",
                            "model_output_location": "answer",
                        },
                    },
                    "scores": {"toxicity": None},
                },
            },
            return_results=True,
        )

        _assert_scores_present(resp, 1, ["toxicity"])
