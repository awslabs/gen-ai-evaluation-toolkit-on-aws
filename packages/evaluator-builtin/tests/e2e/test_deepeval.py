"""E2E integration tests for DeepEval scorer using real Bedrock.

Runs against the deployed API: the SDK creates a report and persists results
through the real API + datastore (no local_only), while DeepEval scoring runs
in-process against real Bedrock.

Requires:
- AWS_REGION: AWS region (defaults to eu-west-2)
- SSM /genai-etk/restApiEndpoint must exist in the target account
- Valid AWS credentials with Bedrock access

Run with: uv run pytest tests/e2e/test_deepeval.py -m e2e -v
"""

import os
from typing import Any

import boto3
import pytest
from evaluator_sdk import EvaluationResponse, Evaluator

from evaluator_builtin.scorers.deepeval import DeepEvalScorer

pytestmark = pytest.mark.e2e


# -- Test data ----------------------------------------------------------------

SINGLE_TURN_TEST_CASES: list[dict[str, Any]] = [
    {
        "input": {
            "text": "What is the capital of France?",
            "retrieved_contexts": [
                "Paris is the capital and most populous city of France.",
                "France is a country in Western Europe.",
            ],
        },
        "output": {"response": "The capital of France is Paris."},
        "expected": {"reference": "Paris"},
    },
]

MULTI_TURN_TEST_CASES: list[dict[str, Any]] = [
    {
        "input": {},
        "output": {
            "messages": [
                {"type": "human", "content": "What's the weather in London?"},
                {
                    "type": "ai",
                    "content": "I'll check the weather for you.",
                    "tool_calls": [{"name": "get_weather", "args": {"city": "London"}}],
                },
                {"type": "tool", "content": "Temperature: 15°C, Conditions: Cloudy"},
                {"type": "ai", "content": "The weather in London is 15°C and cloudy."},
            ],
        },
    },
]

DEEPEVAL_PARAMS: dict[str, Any] = {
    "model_id": "us.amazon.nova-lite-v1:0",
    "region": "us-east-1",
}


def _aws_region() -> str:
    return os.environ.get("AWS_REGION", "eu-west-2")


def _api_endpoint() -> str:
    """Resolve the deployed API endpoint from SSM (cached for the session)."""
    if not hasattr(_api_endpoint, "_value"):
        ssm = boto3.client("ssm", region_name=_aws_region())
        _api_endpoint._value = ssm.get_parameter(  # type: ignore[attr-defined]
            Name="/genai-etk/restApiEndpoint"
        )["Parameter"]["Value"]
    return _api_endpoint._value  # type: ignore[attr-defined]


def _make_evaluator() -> Evaluator:
    return Evaluator(
        name="builtin",
        scorers=[DeepEvalScorer],
        api_endpoint=_api_endpoint(),
        region=_aws_region(),
    )


def _assert_scores_valid(resp: EvaluationResponse, expected_count: int, score_names: list[str]) -> None:
    assert isinstance(resp, EvaluationResponse)
    assert len(resp.results) == expected_count
    for result in resp.results:
        for name in score_names:
            full_name = f"deepeval.{name}"
            assert full_name in result.scores, f"Missing score: {full_name}. Got: {list(result.scores.keys())}"
            sr = result.scores[full_name]
            assert sr.value is not None, f"Score {full_name} has no value (error: {sr.error})"
            assert 0.0 <= sr.value <= 1.0, f"Score {full_name} out of range: {sr.value}"


# -- Single-turn metrics -------------------------------------------------------


class TestSingleTurn:
    """E2E tests for single-turn DeepEval metrics against real Bedrock."""

    def test_answer_relevancy(self) -> None:
        evaluator = _make_evaluator()
        resp = evaluator.score(
            testcases=SINGLE_TURN_TEST_CASES,
            scorers={
                "deepeval": {
                    "params": DEEPEVAL_PARAMS,
                    "scores": {"answer_relevancy": None},
                },
            },
            return_results=True,
        )
        _assert_scores_valid(resp, 1, ["answer_relevancy"])

    def test_faithfulness(self) -> None:
        evaluator = _make_evaluator()
        resp = evaluator.score(
            testcases=SINGLE_TURN_TEST_CASES,
            scorers={
                "deepeval": {
                    "params": DEEPEVAL_PARAMS,
                    "scores": {"faithfulness": None},
                },
            },
            return_results=True,
        )
        _assert_scores_valid(resp, 1, ["faithfulness"])

    def test_bias(self) -> None:
        evaluator = _make_evaluator()
        resp = evaluator.score(
            testcases=SINGLE_TURN_TEST_CASES,
            scorers={
                "deepeval": {
                    "params": DEEPEVAL_PARAMS,
                    "scores": {"bias": None},
                },
            },
            return_results=True,
        )
        _assert_scores_valid(resp, 1, ["bias"])

    def test_toxicity(self) -> None:
        evaluator = _make_evaluator()
        resp = evaluator.score(
            testcases=SINGLE_TURN_TEST_CASES,
            scorers={
                "deepeval": {
                    "params": DEEPEVAL_PARAMS,
                    "scores": {"toxicity": None},
                },
            },
            return_results=True,
        )
        _assert_scores_valid(resp, 1, ["toxicity"])

    def test_hallucination(self) -> None:
        evaluator = _make_evaluator()
        resp = evaluator.score(
            testcases=SINGLE_TURN_TEST_CASES,
            scorers={
                "deepeval": {
                    "params": DEEPEVAL_PARAMS,
                    "scores": {"hallucination": None},
                },
            },
            return_results=True,
        )
        _assert_scores_valid(resp, 1, ["hallucination"])

    def test_contextual_relevancy(self) -> None:
        evaluator = _make_evaluator()
        resp = evaluator.score(
            testcases=SINGLE_TURN_TEST_CASES,
            scorers={
                "deepeval": {
                    "params": DEEPEVAL_PARAMS,
                    "scores": {"contextual_relevancy": None},
                },
            },
            return_results=True,
        )
        _assert_scores_valid(resp, 1, ["contextual_relevancy"])

    def test_multiple_metrics(self) -> None:
        """Run several single-turn metrics in one call."""
        evaluator = _make_evaluator()
        resp = evaluator.score(
            testcases=SINGLE_TURN_TEST_CASES,
            scorers={
                "deepeval": {
                    "params": DEEPEVAL_PARAMS,
                    "scores": {
                        "answer_relevancy": None,
                        "bias": None,
                        "toxicity": None,
                    },
                },
            },
            return_results=True,
        )
        _assert_scores_valid(resp, 1, ["answer_relevancy", "bias", "toxicity"])


# -- Conversational metrics ----------------------------------------------------


class TestConversational:
    """E2E tests for conversational DeepEval metrics against real Bedrock."""

    def test_conversation_completeness(self) -> None:
        evaluator = _make_evaluator()
        resp = evaluator.score(
            testcases=MULTI_TURN_TEST_CASES,
            scorers={
                "deepeval": {
                    "params": DEEPEVAL_PARAMS,
                    "scores": {"conversation_completeness": None},
                },
            },
            return_results=True,
        )
        _assert_scores_valid(resp, 1, ["conversation_completeness"])

    def test_turn_relevancy(self) -> None:
        evaluator = _make_evaluator()
        resp = evaluator.score(
            testcases=MULTI_TURN_TEST_CASES,
            scorers={
                "deepeval": {
                    "params": DEEPEVAL_PARAMS,
                    "scores": {"turn_relevancy": None},
                },
            },
            return_results=True,
        )
        _assert_scores_valid(resp, 1, ["turn_relevancy"])

    def test_knowledge_retention(self) -> None:
        evaluator = _make_evaluator()
        resp = evaluator.score(
            testcases=MULTI_TURN_TEST_CASES,
            scorers={
                "deepeval": {
                    "params": DEEPEVAL_PARAMS,
                    "scores": {"knowledge_retention": None},
                },
            },
            return_results=True,
        )
        _assert_scores_valid(resp, 1, ["knowledge_retention"])


# -- Error handling ------------------------------------------------------------


class TestErrorHandling:
    def test_unknown_metric_returns_error(self) -> None:
        evaluator = _make_evaluator()
        resp = evaluator.score(
            testcases=[{"input": {"text": "hi"}, "output": {"response": "hello"}}],
            scorers={
                "deepeval": {
                    "params": DEEPEVAL_PARAMS,
                    "scores": {"nonexistent_metric": None},
                },
            },
            return_results=True,
        )
        assert len(resp.results) == 1
        score = resp.results[0].scores["deepeval.nonexistent_metric"]
        assert score.error is not None
        assert "Unknown metric" in score.error

    def test_missing_required_param_returns_error(self) -> None:
        """prompt_alignment requires prompt_instructions — should error gracefully."""
        evaluator = _make_evaluator()
        resp = evaluator.score(
            testcases=[{"input": {"text": "hi"}, "output": {"response": "hello"}}],
            scorers={
                "deepeval": {
                    "params": DEEPEVAL_PARAMS,
                    "scores": {"prompt_alignment": None},
                },
            },
            return_results=True,
        )
        assert len(resp.results) == 1
        score = resp.results[0].scores["deepeval.prompt_alignment"]
        assert score.error is not None
        assert "prompt_instructions" in score.error
