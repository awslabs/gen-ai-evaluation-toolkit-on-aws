"""Integration tests for AgentCoreScorer — calls real Bedrock AgentCore Evaluate API.

Run with: uv run pytest tests/test_agentcore_integration.py -m e2e -v

Requires:
- AWS credentials with bedrock-agentcore access
- Real OTEL trace data in fixtures (from an actual agent execution)
"""

import pytest
from evaluator_sdk import Evaluator, ScoreResult

from evaluator_builtin.scorers.agentcore import AgentCoreScorer
from tests.fixtures.agentcore_traces import load_real_testcase


def _make_evaluator() -> Evaluator:
    return Evaluator(
        name="test-agentcore-e2e",
        scorers=[AgentCoreScorer],
        local_only=True,
    )


def _assert_score_valid(resp, score_key: str) -> None:
    """Assert that a score exists and has a numeric value (no error)."""
    sr = resp.results[0].scores[score_key]
    assert isinstance(sr, ScoreResult), f"{score_key}: expected ScoreResult, got {type(sr)}"
    assert sr.error is None, f"{score_key} has error: {sr.error}"
    assert sr.value is not None, f"{score_key} has no value"
    assert 0.0 <= sr.value <= 1.0, f"{score_key} value {sr.value} not in [0, 1]"


# -- Trace-level evaluators ---


class TestTraceLevelEvaluators:
    @pytest.mark.e2e
    def test_correctness(self) -> None:
        evaluator = _make_evaluator()
        resp = evaluator.score(
            testcases=[load_real_testcase()],
            scorers={"agentcore": {
                "params": {"region": "us-east-2"},
                "scores": {"Builtin.Correctness": None},
            }},
        )
        _assert_score_valid(resp, "agentcore.Builtin.Correctness")

    @pytest.mark.e2e
    def test_helpfulness(self) -> None:
        evaluator = _make_evaluator()
        resp = evaluator.score(
            testcases=[load_real_testcase()],
            scorers={"agentcore": {
                "params": {"region": "us-east-2"},
                "scores": {"Builtin.Helpfulness": None},
            }},
        )
        _assert_score_valid(resp, "agentcore.Builtin.Helpfulness")

    @pytest.mark.e2e
    def test_faithfulness(self) -> None:
        evaluator = _make_evaluator()
        resp = evaluator.score(
            testcases=[load_real_testcase()],
            scorers={"agentcore": {
                "params": {"region": "us-east-2"},
                "scores": {"Builtin.Faithfulness": None},
            }},
        )
        _assert_score_valid(resp, "agentcore.Builtin.Faithfulness")

    @pytest.mark.e2e
    def test_multiple_trace_evaluators(self) -> None:
        evaluator = _make_evaluator()
        resp = evaluator.score(
            testcases=[load_real_testcase()],
            scorers={"agentcore": {
                "params": {"region": "us-east-2"},
                "scores": {
                    "Builtin.Correctness": None,
                    "Builtin.Coherence": None,
                    "Builtin.ResponseRelevance": None,
                },
            }},
        )
        _assert_score_valid(resp, "agentcore.Builtin.Correctness")
        _assert_score_valid(resp, "agentcore.Builtin.Coherence")
        _assert_score_valid(resp, "agentcore.Builtin.ResponseRelevance")


# -- Session-level evaluators ---


class TestSessionLevelEvaluators:
    @pytest.mark.e2e
    def test_goal_success_rate(self) -> None:
        evaluator = _make_evaluator()
        resp = evaluator.score(
            testcases=[load_real_testcase()],
            scorers={"agentcore": {
                "params": {"region": "us-east-2"},
                "scores": {"Builtin.GoalSuccessRate": None},
            }},
        )
        _assert_score_valid(resp, "agentcore.Builtin.GoalSuccessRate")


# -- Tool-level evaluators ---


class TestToolLevelEvaluators:
    @pytest.mark.e2e
    def test_tool_selection_accuracy(self) -> None:
        evaluator = _make_evaluator()
        resp = evaluator.score(
            testcases=[load_real_testcase()],
            scorers={"agentcore": {
                "params": {"region": "us-east-2"},
                "scores": {"Builtin.ToolSelectionAccuracy": None},
            }},
        )
        _assert_score_valid(resp, "agentcore.Builtin.ToolSelectionAccuracy")

    @pytest.mark.e2e
    def test_tool_parameter_accuracy(self) -> None:
        evaluator = _make_evaluator()
        resp = evaluator.score(
            testcases=[load_real_testcase()],
            scorers={"agentcore": {
                "params": {"region": "us-east-2"},
                "scores": {"Builtin.ToolParameterAccuracy": None},
            }},
        )
        _assert_score_valid(resp, "agentcore.Builtin.ToolParameterAccuracy")


# -- Error handling ---


class TestErrorHandling:
    @pytest.mark.e2e
    def test_unknown_evaluator_returns_error(self) -> None:
        evaluator = _make_evaluator()
        resp = evaluator.score(
            testcases=[load_real_testcase()],
            scorers={"agentcore": {
                "params": {"region": "us-east-2"},
                "scores": {"nonexistent_evaluator": None},
            }},
        )
        sr = resp.results[0].scores["agentcore.nonexistent_evaluator"]
        assert sr.error is not None
        assert "Unknown evaluator" in sr.error
