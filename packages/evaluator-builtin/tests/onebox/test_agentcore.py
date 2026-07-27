"""Onebox integration tests for AgentCoreScorer.

Tests the full flow: Evaluator → API handler → DDB, with boto3 mocked.
Uses evaluate() with a passthrough app to exercise the full pipeline.
"""

from unittest.mock import MagicMock, patch

from awssolutions_gen_ai_evaluation_toolkit_python_client.api import DefaultApi  # type: ignore[attr-defined]
from awssolutions_gen_ai_evaluation_toolkit_python_client.models import InlineTestCase  # type: ignore[attr-defined]
from evaluator_sdk import Evaluator, ScoreResult

from evaluator_builtin.scorers.agentcore import AgentCoreScorer
from tests.fixtures.agentcore_traces import PRODUCT_AGENT_TESTCASE
from tests.onebox.conftest import passthrough_app


@patch("evaluator_builtin.scorers.agentcore.boto3_client")
def test_evaluate_with_builtin_evaluator(
    mock_boto3_client: MagicMock,
    client: DefaultApi,
) -> None:
    """evaluate() with a built-in AgentCore evaluator persists results via the real handler."""
    mock_ac_client = MagicMock()
    mock_ac_client.evaluate.return_value = {
        "evaluationResults": [{"value": 0.92, "explanation": "Correct answer"}]
    }
    mock_boto3_client.return_value = mock_ac_client

    evaluator = Evaluator(
        name="test-agentcore",
        app_invoke=passthrough_app,
        scorers=[AgentCoreScorer],
        client=client,
    )
    resp = evaluator.evaluate(
        testcases=[InlineTestCase(
            input={
                "_output": PRODUCT_AGENT_TESTCASE["output"],
                "text": PRODUCT_AGENT_TESTCASE["input"]["text"],
            },
            expected=PRODUCT_AGENT_TESTCASE.get("expected"),
        )],
        scorers={"agentcore": {"scores": {"Builtin.Correctness": None}}},
    )

    assert resp.total_results == 1
    sr = resp.results[0].scores["agentcore.Builtin.Correctness"]
    assert isinstance(sr, ScoreResult)
    assert sr.value == 0.92

    # Verify persisted
    results_resp = client.list_test_results(report_id=resp.report_id)
    assert len(results_resp.test_results) == 1


def test_evaluate_unknown_evaluator_error(
    client: DefaultApi,
) -> None:
    """Unknown evaluator without level returns an error that is persisted."""
    evaluator = Evaluator(
        name="test-agentcore",
        app_invoke=passthrough_app,
        scorers=[AgentCoreScorer],
        client=client,
    )
    resp = evaluator.evaluate(
        testcases=[InlineTestCase(
            input={
                "_output": PRODUCT_AGENT_TESTCASE["output"],
                "text": PRODUCT_AGENT_TESTCASE["input"]["text"],
            },
        )],
        scorers={"agentcore": {"scores": {"CustomEval": None}}},
    )

    assert resp.total_results == 1
    sr = resp.results[0].scores["agentcore.CustomEval"]
    assert sr.error is not None
    assert "Unknown evaluator" in sr.error

    # Verify error persisted
    results_resp = client.list_test_results(report_id=resp.report_id)
    assert len(results_resp.test_results) == 1
