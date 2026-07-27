"""E2E integration tests for LLM-as-Judge scorer using real Bedrock.

These mirror the TypeScript long-running tests in packages/tests-ts but run
locally via the SDK's local_only mode, hitting real Bedrock for LLM scoring.

Requires valid AWS credentials with Bedrock access.
Run with: uv run pytest -m e2e

Scenarios ported from packages/tests-ts/test/longRunningTests/eval/eval.test.ts:
  1. RAG evaluation with built-in evaluators (sample + toxicity)
  2. Agentic evaluation with built-in evaluators (sample + tool_use)
  3. Custom metrics (sample + custom topic_adherence)
  4. Varied score params (model_id, model_args)
"""

from typing import Any

import pytest
from evaluator_sdk import EvaluationResponse, Evaluator

from evaluator_builtin.scorers.llm_as_judge import LlmAsJudgeScorer

pytestmark = pytest.mark.e2e


# -- Test data ----------------------------------------------------------------

RAG_TEST_CASES: list[dict[str, Any]] = [
    {
        "input": {"question": "What is the capital of France?"},
        "output": {"response": "The capital of France is Paris."},
    },
    {
        "input": {"question": "What is photosynthesis?"},
        "output": {"response": "Photosynthesis is the process by which plants convert sunlight into energy."},
    },
    {
        "input": {"question": "Who wrote Romeo and Juliet?"},
        "output": {"response": "William Shakespeare wrote Romeo and Juliet."},
    },
]

AGENTIC_TEST_CASES: list[dict[str, Any]] = [
    {
        "input": {
            "user_message": "What's the weather in London?",
            "tool_calls": [{"name": "get_weather", "args": {"city": "London"}}],
        },
        "output": {
            "response": "The weather in London is 15°C and cloudy.",
            "tool_results": [{"name": "get_weather", "result": "15°C, cloudy"}],
        },
    },
    {
        "input": {
            "user_message": "Book a flight to Paris",
            "tool_calls": [{"name": "search_flights", "args": {"destination": "Paris"}}],
        },
        "output": {
            "response": "I found flights to Paris. The cheapest is $200.",
            "tool_results": [{"name": "search_flights", "result": "Cheapest: $200"}],
        },
    },
    {
        "input": {
            "user_message": "What time is it in Tokyo?",
            "tool_calls": [{"name": "get_time", "args": {"timezone": "Asia/Tokyo"}}],
        },
        "output": {
            "response": "It is currently 3:00 PM in Tokyo.",
            "tool_results": [{"name": "get_time", "result": "15:00 JST"}],
        },
    },
]

TOXIC_TEST_CASES: list[dict[str, Any]] = [
    {
        "input": {"question": "Tell me about dogs"},
        "output": {"response": "Dogs are loyal and friendly animals that make wonderful companions."},
    },
    {
        "input": {"question": "Tell me a joke"},
        "output": {"response": "You are an absolute idiot and nobody likes you. Go away."},
    },
]


def _make_evaluator() -> Evaluator:
    return Evaluator(
        name="llm-as-judge-e2e",
        scorers=[LlmAsJudgeScorer],
        local_only=True,
    )


def _assert_scores_valid(resp: EvaluationResponse, expected_count: int, score_names: list[str]) -> None:
    """Common assertions for all e2e tests."""
    assert isinstance(resp, EvaluationResponse)
    assert len(resp.results) == expected_count
    for result in resp.results:
        for name in score_names:
            full_name = f"llm_as_judge.{name}"
            assert full_name in result.scores, f"Missing score: {full_name}"
            sr = result.scores[full_name]
            assert sr.value is not None, f"Score {full_name} has no value"
            assert 0.0 <= sr.value <= 1.0, f"Score {full_name} out of range: {sr.value}"


# -- Scenario 1: RAG with built-in evaluators --------------------------------


class TestRAGBuiltInEvaluators:
    """Mirrors TS test: LLM-as-Judge > RAG (sample + toxicity)."""

    def test_rag_sample_and_toxicity(self) -> None:
        evaluator = _make_evaluator()

        resp = evaluator.score(
            testcases=RAG_TEST_CASES,
            scorers={
                "llm_as_judge": {
                    "scores": {
                        "sample": None,
                        "toxicity": None,
                    },
                },
            },
            return_results=True,
        )

        _assert_scores_valid(resp, 3, ["sample", "toxicity"])

        # Sample built-in instructs the LLM to always return 0.75
        for result in resp.results:
            assert result.scores["llm_as_judge.sample"].value == 0.75

        # These benign RAG answers should have low toxicity
        for result in resp.results:
            assert result.scores["llm_as_judge.toxicity"].value <= 0.3

    def test_rag_all_testcases_evaluated(self) -> None:
        """All test cases produce results regardless of count."""
        num_cases = 10
        test_cases = [{"input": {"q": f"Question {i}"}, "output": {"a": f"Answer {i}"}} for i in range(num_cases)]

        evaluator = _make_evaluator()
        resp = evaluator.score(
            testcases=test_cases,
            scorers={"llm_as_judge": {"scores": {"sample": None}}},
            return_results=True,
        )

        assert len(resp.results) == num_cases
        for result in resp.results:
            assert result.scores["llm_as_judge.sample"].value == 0.75


# -- Scenario 2: Agentic with built-in evaluators ----------------------------


class TestAgenticBuiltInEvaluators:
    """Mirrors TS test: LLM-as-Judge > Agentic (sample + tool_use)."""

    def test_agentic_sample_and_tool_use(self) -> None:
        evaluator = _make_evaluator()

        resp = evaluator.score(
            testcases=AGENTIC_TEST_CASES,
            scorers={
                "llm_as_judge": {
                    "scores": {
                        "sample": None,
                        "tool_use": None,
                    },
                },
            },
            return_results=True,
        )

        _assert_scores_valid(resp, 3, ["sample", "tool_use"])

        # These test cases have well-formed tool calls matching the query
        for result in resp.results:
            assert result.scores["llm_as_judge.tool_use"].value >= 0.5


# -- Scenario 3: Custom metrics ----------------------------------------------


class TestCustomMetrics:
    """Mirrors TS test: LLM-as-Judge > Custom metrics."""

    def test_custom_topic_adherence(self) -> None:
        evaluator = _make_evaluator()

        resp = evaluator.score(
            testcases=RAG_TEST_CASES,
            scorers={
                "llm_as_judge": {
                    "scores": {
                        "sample": None,
                        "topic_adherence": {
                            "description": (
                                "AI/LLM must adhere to the topic being discussed by the user. "
                                "Score of 1 means it perfectly adheres to the topic. "
                                "Score of 0 means it never adheres to the topic. "
                                "Score should be between 0 and 1 (inclusive)."
                            ),
                        },
                    },
                },
            },
            return_results=True,
        )

        _assert_scores_valid(resp, 3, ["sample", "topic_adherence"])

        # These RAG answers directly address the question — should score high
        for result in resp.results:
            assert result.scores["llm_as_judge.topic_adherence"].value >= 0.5

    def test_custom_evaluator_only(self) -> None:
        """Custom evaluator without any built-ins."""
        evaluator = _make_evaluator()

        resp = evaluator.score(
            testcases=RAG_TEST_CASES[:1],
            scorers={
                "llm_as_judge": {
                    "scores": {
                        "conciseness": {
                            "description": (
                                "Evaluate how concise the response is. "
                                "Score of 1 means perfectly concise. "
                                "Score of 0 means extremely verbose."
                            ),
                        },
                    },
                },
            },
            return_results=True,
        )

        _assert_scores_valid(resp, 1, ["conciseness"])


# -- Scenario 4: Varied score params -----------------------------------------


class TestVariedScoreParams:
    """Test different model_id and model_args configurations."""

    def test_default_model(self) -> None:
        """Default model produces valid scores."""
        evaluator = _make_evaluator()

        resp = evaluator.score(
            testcases=RAG_TEST_CASES[:1],
            scorers={
                "llm_as_judge": {
                    "scores": {"sample": None},
                },
            },
            return_results=True,
        )

        _assert_scores_valid(resp, 1, ["sample"])

    def test_explicit_model_id(self) -> None:
        """Explicit model via params overrides the default."""
        evaluator = _make_evaluator()

        resp = evaluator.score(
            testcases=RAG_TEST_CASES[:1],
            scorers={
                "llm_as_judge": {
                    "params": {"model_id": "global.anthropic.claude-haiku-4-5-20251001-v1:0"},
                    "scores": {"sample": None},
                },
            },
            return_results=True,
        )

        _assert_scores_valid(resp, 1, ["sample"])

    def test_low_temperature(self) -> None:
        """Low temperature should still produce valid scores."""
        evaluator = _make_evaluator()

        resp = evaluator.score(
            testcases=RAG_TEST_CASES[:1],
            scorers={
                "llm_as_judge": {
                    "params": {
                        "model_args": {"temperature": 0.0},
                    },
                    "scores": {"toxicity": None},
                },
            },
            return_results=True,
        )

        _assert_scores_valid(resp, 1, ["toxicity"])

    def test_high_temperature(self) -> None:
        """High temperature should still produce valid scores within 0-1."""
        evaluator = _make_evaluator()

        resp = evaluator.score(
            testcases=RAG_TEST_CASES[:1],
            scorers={
                "llm_as_judge": {
                    "params": {
                        "model_args": {"temperature": 0.9},
                    },
                    "scores": {"toxicity": None},
                },
            },
            return_results=True,
        )

        _assert_scores_valid(resp, 1, ["toxicity"])

    def test_custom_max_tokens(self) -> None:
        """Custom max_tokens via model_args."""
        evaluator = _make_evaluator()

        resp = evaluator.score(
            testcases=RAG_TEST_CASES[:1],
            scorers={
                "llm_as_judge": {
                    "params": {
                        "model_args": {"max_tokens": 1000},
                    },
                    "scores": {"sample": None},
                },
            },
            return_results=True,
        )

        _assert_scores_valid(resp, 1, ["sample"])

    def test_nova_micro_model(self) -> None:
        """Different model: nova-micro."""
        evaluator = _make_evaluator()

        resp = evaluator.score(
            testcases=RAG_TEST_CASES[:1],
            scorers={
                "llm_as_judge": {
                    "params": {"model_id": "amazon.nova-micro-v1:0"},
                    "scores": {"sample": None},
                },
            },
            return_results=True,
        )

        _assert_scores_valid(resp, 1, ["sample"])

    def test_combined_model_and_args(self) -> None:
        """Model ID + model_args together."""
        evaluator = _make_evaluator()

        resp = evaluator.score(
            testcases=RAG_TEST_CASES[:1],
            scorers={
                "llm_as_judge": {
                    "params": {
                        "model_id": "global.anthropic.claude-haiku-4-5-20251001-v1:0",
                        "model_args": {"temperature": 0.1, "max_tokens": 2000},
                    },
                    "scores": {"sample": None, "toxicity": None},
                },
            },
            return_results=True,
        )

        _assert_scores_valid(resp, 1, ["sample", "toxicity"])


# -- Scenario 5: Toxicity discrimination -------------------------------------


class TestToxicityDiscrimination:
    """Verify the toxicity evaluator can distinguish toxic from benign content."""

    def test_toxic_vs_benign(self) -> None:
        evaluator = _make_evaluator()

        resp = evaluator.score(
            testcases=TOXIC_TEST_CASES,
            scorers={
                "llm_as_judge": {
                    "scores": {"toxicity": None},
                },
            },
            return_results=True,
        )

        _assert_scores_valid(resp, 2, ["toxicity"])

        benign_score = resp.results[0].scores["llm_as_judge.toxicity"].value
        toxic_score = resp.results[1].scores["llm_as_judge.toxicity"].value

        # The toxic response should score higher than the benign one
        assert toxic_score > benign_score


# -- Scenario 6: Error handling -----------------------------------------------


class TestErrorHandling:
    """Scorer errors are captured per-testcase, not raised."""

    def test_unknown_builtin_returns_error_score(self) -> None:
        evaluator = _make_evaluator()

        resp = evaluator.score(
            testcases=[{"input": {"q": "hi"}, "output": {"a": "hello"}}],
            scorers={
                "llm_as_judge": {
                    "scores": {"nonexistent_evaluator": None},
                },
            },
            return_results=True,
        )

        assert len(resp.results) == 1
        score = resp.results[0].scores["llm_as_judge.nonexistent_evaluator"]
        assert score.error is not None
        assert "Unknown built-in" in score.error

    def test_mixed_valid_and_invalid_evaluators(self) -> None:
        """Valid evaluators still score even when mixed with unknown ones."""
        evaluator = _make_evaluator()

        resp = evaluator.score(
            testcases=[{"input": {"q": "hi"}, "output": {"a": "hello"}}],
            scorers={
                "llm_as_judge": {
                    "scores": {
                        "sample": None,
                        "nonexistent": None,
                    },
                },
            },
            return_results=True,
        )

        assert len(resp.results) == 1
        # sample should succeed
        assert resp.results[0].scores["llm_as_judge.sample"].value == 0.75
        # nonexistent should error
        assert resp.results[0].scores["llm_as_judge.nonexistent"].error is not None
