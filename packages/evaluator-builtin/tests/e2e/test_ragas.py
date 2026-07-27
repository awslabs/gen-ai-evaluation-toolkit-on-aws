"""E2E integration tests for RAGAS scorer using real Bedrock.

These mirror the TypeScript long-running tests in packages/tests-ts but run
locally via the SDK's local_only mode, hitting real Bedrock for RAGAS evaluation.

Requires valid AWS credentials with Bedrock access.
Run with: uv run pytest -m e2e

Scenarios ported from packages/tests-ts/test/longRunningTests/eval/eval.test.ts:
  1. RAG evaluation — single-turn metrics (answer_relevancy, faithfulness, etc.)
  2. Agentic evaluation — multi-turn metrics (topic_adherence, tool_call_accuracy, etc.)
  3. Varied score params (model_id, embeddings_id, model_args)
"""

from typing import Any

import pytest
from evaluator_sdk import EvaluationResponse, Evaluator

from evaluator_builtin.scorers.ragas import RagasScorer

pytestmark = pytest.mark.e2e


# -- Test data ----------------------------------------------------------------

SINGLE_TURN_TEST_CASES: list[dict[str, Any]] = [
    {
        "input": {
            "user_input": "What is the capital of France?",
            "retrieved_contexts": [
                "Paris is the capital and most populous city of France.",
                "France is a country in Western Europe.",
            ],
        },
        "output": {"response": "The capital of France is Paris."},
        "expected": {"reference": "Paris"},
    },
    {
        "input": {
            "user_input": "What is photosynthesis?",
            "retrieved_contexts": [
                "Photosynthesis is the process by which green plants use sunlight to synthesize nutrients.",
            ],
        },
        "output": {"response": "Photosynthesis is the process by which plants convert sunlight into energy."},
        "expected": {
            "reference": "Photosynthesis is the process plants use to convert light energy into chemical energy."
        },
    },
]

MULTI_TURN_TEST_CASES: list[dict[str, Any]] = [
    {
        "input": {
            "messages": [
                {"type": "human", "content": "What's the weather in London?"},
            ],
        },
        "output": {
            "messages": [
                {
                    "type": "ai",
                    "content": "I'll check the weather for you.",
                    "toolCalls": [{"name": "get_weather", "args": {"city": "London"}}],
                },
                {"type": "tool", "content": "Temperature: 15°C, Conditions: Cloudy"},
                {"type": "ai", "content": "The weather in London is 15°C and cloudy."},
            ],
        },
        "expected": {
            "reference": "The weather in London is 15°C and cloudy.",
            "reference_tool_calls": [{"name": "get_weather", "args": {"city": "London"}}],
            "reference_topics": ["weather", "London"],
        },
    },
]


def _make_evaluator() -> Evaluator:
    return Evaluator(
        name="ragas-e2e",
        scorers=[RagasScorer],
        local_only=True,
    )


def _assert_scores_valid(resp: EvaluationResponse, expected_count: int, score_names: list[str]) -> None:
    assert isinstance(resp, EvaluationResponse)
    assert len(resp.results) == expected_count
    for result in resp.results:
        for name in score_names:
            full_name = f"ragas.{name}"
            assert full_name in result.scores, f"Missing score: {full_name}. Got: {list(result.scores.keys())}"
            sr = result.scores[full_name]
            assert sr.value is not None, f"Score {full_name} has no value (error: {sr.error})"
            assert 0.0 <= sr.value <= 1.0, f"Score {full_name} out of range: {sr.value}"


# -- Scenario 1: Single-turn RAG metrics -------------------------------------


class TestSingleTurnRAG:
    """Mirrors TS test: RAGAS > RAG."""

    def test_answer_relevancy(self) -> None:
        evaluator = _make_evaluator()

        resp = evaluator.score(
            testcases=SINGLE_TURN_TEST_CASES[:1],
            scorers={
                "ragas": {
                    "params": {"model_id": "amazon.nova-micro-v1:0"},
                    "scores": {"answer_relevancy": None},
                },
            },
            return_results=True,
        )

        _assert_scores_valid(resp, 1, ["answer_relevancy"])

    def test_answer_accuracy(self) -> None:
        evaluator = _make_evaluator()

        resp = evaluator.score(
            testcases=SINGLE_TURN_TEST_CASES[:1],
            scorers={
                "ragas": {
                    "scores": {"answer_accuracy": None},
                },
            },
            return_results=True,
        )

        _assert_scores_valid(resp, 1, ["answer_accuracy"])

    def test_faithfulness(self) -> None:
        evaluator = _make_evaluator()

        resp = evaluator.score(
            testcases=SINGLE_TURN_TEST_CASES[:1],
            scorers={
                "ragas": {
                    "scores": {"faithfulness": None},
                },
            },
            return_results=True,
        )

        _assert_scores_valid(resp, 1, ["faithfulness"])

    def test_multiple_metrics(self) -> None:
        evaluator = _make_evaluator()

        resp = evaluator.score(
            testcases=SINGLE_TURN_TEST_CASES[:1],
            scorers={
                "ragas": {
                    "scores": {
                        "answer_relevancy": None,
                        "answer_accuracy": None,
                    },
                },
            },
            return_results=True,
        )

        _assert_scores_valid(resp, 1, ["answer_relevancy", "answer_accuracy"])

    def test_multiple_testcases(self) -> None:
        evaluator = _make_evaluator()

        resp = evaluator.score(
            testcases=SINGLE_TURN_TEST_CASES,
            scorers={
                "ragas": {
                    "scores": {"answer_relevancy": None},
                },
            },
            return_results=True,
        )

        _assert_scores_valid(resp, 2, ["answer_relevancy"])


# -- Scenario 2: Multi-turn agentic metrics ----------------------------------


class TestMultiTurnAgentic:
    """Mirrors TS test: RAGAS > Agentic evaluation."""

    def test_topic_adherence(self) -> None:
        evaluator = _make_evaluator()

        resp = evaluator.score(
            testcases=MULTI_TURN_TEST_CASES,
            scorers={
                "ragas": {
                    "scores": {"topic_adherence": None},
                },
            },
            return_results=True,
        )

        _assert_scores_valid(resp, 1, ["topic_adherence"])

    def test_topic_adherence_with_precision_mode(self) -> None:
        """Mirrors TS test: topic_adherence with mode: precision."""
        evaluator = _make_evaluator()

        resp = evaluator.score(
            testcases=MULTI_TURN_TEST_CASES,
            scorers={
                "ragas": {
                    "scores": {"topic_adherence": {"mode": "precision"}},
                },
            },
            return_results=True,
        )

        _assert_scores_valid(resp, 1, ["topic_adherence"])

    def test_tool_call_accuracy(self) -> None:
        evaluator = _make_evaluator()

        resp = evaluator.score(
            testcases=MULTI_TURN_TEST_CASES,
            scorers={
                "ragas": {
                    "scores": {"tool_call_accuracy": None},
                },
            },
            return_results=True,
        )

        _assert_scores_valid(resp, 1, ["tool_call_accuracy"])

    def test_agent_goal_accuracy_with_reference(self) -> None:
        evaluator = _make_evaluator()

        resp = evaluator.score(
            testcases=MULTI_TURN_TEST_CASES,
            scorers={
                "ragas": {
                    "scores": {"agent_goal_accuracy_with_reference": None},
                },
            },
            return_results=True,
        )

        _assert_scores_valid(resp, 1, ["agent_goal_accuracy_with_reference"])


# -- Scenario 3: Varied score params -----------------------------------------


class TestVariedScoreParams:
    def test_explicit_model_id(self) -> None:
        evaluator = _make_evaluator()

        resp = evaluator.score(
            testcases=SINGLE_TURN_TEST_CASES[:1],
            scorers={
                "ragas": {
                    "params": {"model_id": "amazon.nova-micro-v1:0"},
                    "scores": {"answer_relevancy": None},
                },
            },
            return_results=True,
        )

        _assert_scores_valid(resp, 1, ["answer_relevancy"])

    def test_model_args_temperature(self) -> None:
        evaluator = _make_evaluator()

        resp = evaluator.score(
            testcases=SINGLE_TURN_TEST_CASES[:1],
            scorers={
                "ragas": {
                    "params": {"model_args": {"temperature": 0.1}},
                    "scores": {"answer_relevancy": None},
                },
            },
            return_results=True,
        )

        _assert_scores_valid(resp, 1, ["answer_relevancy"])

    def test_standard_field_names(self) -> None:
        """Fields use standard RAGAS names directly — no remapping needed."""
        evaluator = _make_evaluator()

        testcases = [
            {
                "input": {
                    "user_input": "What is X?",
                    "retrieved_contexts": ["X is a concept."],
                },
                "output": {"response": "X is a thing"},
                "expected": {"reference": "X is a concept"},
            }
        ]

        resp = evaluator.score(
            testcases=testcases,
            scorers={"ragas": {"scores": {"answer_relevancy": None}}},
            return_results=True,
        )

        _assert_scores_valid(resp, 1, ["answer_relevancy"])


# -- Scenario 4: Error handling -----------------------------------------------


class TestErrorHandling:
    def test_unknown_metric_returns_error(self) -> None:
        evaluator = _make_evaluator()

        resp = evaluator.score(
            testcases=[{
                "input": {"user_input": "hi"},
                "output": {"response": "hello"},
            }],
            scorers={
                "ragas": {
                    "scores": {"nonexistent_metric": None},
                },
            },
            return_results=True,
        )

        assert len(resp.results) == 1
        score = resp.results[0].scores["ragas.nonexistent_metric"]
        assert score.error is not None
        assert "Unknown RAGAS metric" in score.error
