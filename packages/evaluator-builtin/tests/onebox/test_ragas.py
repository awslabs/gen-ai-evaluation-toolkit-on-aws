"""Onebox integration tests for RagasScorer.

Tests the full flow: Evaluator → API handler → DDB, with RAGAS/Bedrock mocked.
Uses evaluate() with a passthrough app to exercise the full pipeline.
"""

from unittest.mock import MagicMock, patch

from awssolutions_gen_ai_evaluation_toolkit_python_client.api import DefaultApi  # type: ignore[attr-defined]
from awssolutions_gen_ai_evaluation_toolkit_python_client.models import InlineTestCase  # type: ignore[attr-defined]
from evaluator_sdk import Evaluator, ScoreResult

from evaluator_builtin.scorers.ragas import RagasScorer
from tests.onebox.conftest import passthrough_app


@patch("evaluator_builtin.scorers.ragas.ragas")
@patch("evaluator_builtin.scorers.ragas.BedrockEmbeddings")
@patch("evaluator_builtin.scorers.ragas.ChatBedrock")
def test_evaluate_single_turn(
    mock_chat: MagicMock,
    mock_embed: MagicMock,
    mock_ragas: MagicMock,
    client: DefaultApi,
) -> None:
    """evaluate() with single-turn RAGAS metrics persists results via the real handler."""
    mock_result = MagicMock()
    mock_result.scores = [{"answer_relevancy": 0.85, "faithfulness": 0.9}]
    mock_ragas.evaluate.return_value = mock_result

    evaluator = Evaluator(
        name="test-ragas",
        app_invoke=passthrough_app,
        scorers=[RagasScorer],
        client=client,
    )
    resp = evaluator.evaluate(
        testcases=[InlineTestCase(
            input={
                "_output": {"response": "X is a thing"},
                "user_input": "What is X?",
                "retrieved_contexts": ["X is..."],
            },
            expected={"reference": "X is a concept"},
        )],
        scorers={"ragas": {"scores": {"answer_relevancy": None, "faithfulness": None}}},
    )

    assert resp.total_results == 1
    assert resp.results[0].scores["ragas.answer_relevancy"].value == 0.85
    assert resp.results[0].scores["ragas.faithfulness"].value == 0.9

    # Verify persisted
    results_resp = client.list_test_results(report_id=resp.report_id)
    assert len(results_resp.test_results) == 1


@patch("evaluator_builtin.scorers.ragas.ragas")
@patch("evaluator_builtin.scorers.ragas.BedrockEmbeddings")
@patch("evaluator_builtin.scorers.ragas.ChatBedrock")
def test_evaluate_multiple_testcases(
    mock_chat: MagicMock,
    mock_embed: MagicMock,
    mock_ragas: MagicMock,
    client: DefaultApi,
) -> None:
    """evaluate() with multiple testcases persists all results."""
    mock_result_1 = MagicMock()
    mock_result_1.scores = [{"answer_relevancy": 0.85}]
    mock_result_2 = MagicMock()
    mock_result_2.scores = [{"answer_relevancy": 0.6}]
    mock_ragas.evaluate.side_effect = [mock_result_1, mock_result_2]

    evaluator = Evaluator(
        name="test-ragas",
        app_invoke=passthrough_app,
        scorers=[RagasScorer],
        client=client,
    )
    resp = evaluator.evaluate(
        testcases=[
            InlineTestCase(input={"_output": {"response": "A1"}, "user_input": "Q1"}),
            InlineTestCase(input={"_output": {"response": "A2"}, "user_input": "Q2"}),
        ],
        scorers={"ragas": {"scores": {"answer_relevancy": None}}},
    )

    assert resp.total_results == 2

    # Verify all persisted
    results_resp = client.list_test_results(report_id=resp.report_id)
    assert len(results_resp.test_results) == 2

    # Verify job evaluation work is done (post-processing runs async via SFN and is not awaited here)
    job_resp = client.get_evaluator_job(job_id=resp.job_id)
    assert job_resp.status.value in ("SUCCESS", "PARTIAL_FAILURE", "RUNNING")


def test_evaluate_unknown_metric_persists_error(
    client: DefaultApi,
) -> None:
    """Unknown RAGAS metric returns an error that is persisted."""
    evaluator = Evaluator(
        name="test-ragas",
        app_invoke=passthrough_app,
        scorers=[RagasScorer],
        client=client,
    )
    resp = evaluator.evaluate(
        testcases=[InlineTestCase(input={"_output": {"response": "hello"}, "user_input": "hi"})],
        scorers={"ragas": {"scores": {"nonexistent_metric": None}}},
    )

    assert resp.total_results == 1
    sr = resp.results[0].scores["ragas.nonexistent_metric"]
    assert isinstance(sr, ScoreResult)
    assert sr.error is not None
    assert "Unknown RAGAS metric" in sr.error
