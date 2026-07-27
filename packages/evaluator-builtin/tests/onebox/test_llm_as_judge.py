"""Onebox integration tests for LlmAsJudgeScorer.

Tests the full flow: Evaluator → API handler → DDB, with Bedrock mocked.
Uses evaluate() with a passthrough app to exercise the full pipeline.
"""

from unittest.mock import MagicMock, patch

from awssolutions_gen_ai_evaluation_toolkit_python_client.api import DefaultApi  # type: ignore[attr-defined]
from awssolutions_gen_ai_evaluation_toolkit_python_client.models import InlineTestCase  # type: ignore[attr-defined]
from evaluator_sdk import Evaluator, ScoreResult

from evaluator_builtin.scorers.llm_as_judge import LlmAsJudgeScorer, LLMEvalScore
from tests.onebox.conftest import passthrough_app


@patch("evaluator_builtin.scorers.llm_as_judge.ChatBedrockConverse")
def test_evaluate_with_builtin_evaluator(
    mock_bedrock_cls: MagicMock,
    client: DefaultApi,
) -> None:
    """evaluate() with a built-in evaluator persists results via the real handler."""
    mock_llm = MagicMock()
    mock_structured = MagicMock()
    mock_structured.invoke.return_value = LLMEvalScore(score=0.85, context="Looks good")
    mock_llm.with_structured_output.return_value = mock_structured
    mock_bedrock_cls.return_value = mock_llm

    evaluator = Evaluator(
        name="test-builtin",
        app_invoke=passthrough_app,
        scorers=[LlmAsJudgeScorer],
        client=client,
    )
    resp = evaluator.evaluate(
        testcases=[InlineTestCase(input={"_output": {"answer": "AI"}, "question": "What is AI?"})],
        scorers={"llm_as_judge": {"scores": {"toxicity": None}}},
    )

    assert resp.total_results == 1
    sr = resp.results[0].scores["llm_as_judge.toxicity"]
    assert isinstance(sr, ScoreResult)
    assert sr.value == 0.85

    # Verify persisted
    results_resp = client.list_test_results(report_id=resp.report_id)
    assert len(results_resp.test_results) == 1


@patch("evaluator_builtin.scorers.llm_as_judge.ChatBedrockConverse")
def test_evaluate_with_custom_evaluator(
    mock_bedrock_cls: MagicMock,
    client: DefaultApi,
) -> None:
    """evaluate() with a custom evaluator (dynamic handler) persists results."""
    mock_llm = MagicMock()
    mock_structured = MagicMock()
    mock_structured.invoke.return_value = LLMEvalScore(score=0.9, context=None)
    mock_llm.with_structured_output.return_value = mock_structured
    mock_bedrock_cls.return_value = mock_llm

    evaluator = Evaluator(
        name="test-builtin",
        app_invoke=passthrough_app,
        scorers=[LlmAsJudgeScorer],
        client=client,
    )
    resp = evaluator.evaluate(
        testcases=[InlineTestCase(input={"_output": {"response": "Hi"}, "text": "Hello"})],
        scorers={"llm_as_judge": {"scores": {"clarity": {"description": "Evaluate clarity 0-1"}}}},
    )

    assert resp.total_results == 1
    sr = resp.results[0].scores["llm_as_judge.clarity"]
    assert sr.value == 0.9

    # Verify persisted
    results_resp = client.list_test_results(report_id=resp.report_id)
    assert len(results_resp.test_results) == 1


@patch("evaluator_builtin.scorers.llm_as_judge.ChatBedrockConverse")
def test_evaluate_multiple_testcases(
    mock_bedrock_cls: MagicMock,
    client: DefaultApi,
) -> None:
    """evaluate() with multiple testcases persists all results."""
    mock_llm = MagicMock()
    mock_structured = MagicMock()
    mock_structured.invoke.side_effect = [
        LLMEvalScore(score=0.1, context="Clean"),
        LLMEvalScore(score=0.9, context="Toxic"),
    ]
    mock_llm.with_structured_output.return_value = mock_structured
    mock_bedrock_cls.return_value = mock_llm

    evaluator = Evaluator(
        name="test-builtin",
        app_invoke=passthrough_app,
        scorers=[LlmAsJudgeScorer],
        client=client,
    )
    resp = evaluator.evaluate(
        testcases=[
            InlineTestCase(input={"_output": {"a": "hello"}, "q": "hi"}),
            InlineTestCase(input={"_output": {"a": "go away"}, "q": "bye"}),
        ],
        scorers={"llm_as_judge": {"scores": {"toxicity": None}}},
    )

    assert resp.total_results == 2
    assert resp.results[0].scores["llm_as_judge.toxicity"].value == 0.1
    assert resp.results[1].scores["llm_as_judge.toxicity"].value == 0.9

    # Verify all persisted
    results_resp = client.list_test_results(report_id=resp.report_id)
    assert len(results_resp.test_results) == 2

    # Verify job evaluation work is done (post-processing runs async via SFN and is not awaited here)
    job_resp = client.get_evaluator_job(job_id=resp.job_id)
    assert job_resp.status.value in ("SUCCESS", "PARTIAL_FAILURE", "RUNNING")


@patch("evaluator_builtin.scorers.llm_as_judge.ChatBedrockConverse")
def test_evaluate_mixed_builtin_and_custom(
    mock_bedrock_cls: MagicMock,
    client: DefaultApi,
) -> None:
    """evaluate() with both built-in and custom evaluators in one call."""
    mock_llm = MagicMock()
    mock_structured = MagicMock()
    mock_structured.invoke.side_effect = [
        LLMEvalScore(score=0.75, context=None),   # sample (built-in)
        LLMEvalScore(score=0.5, context="Fair"),   # clarity (custom)
    ]
    mock_llm.with_structured_output.return_value = mock_structured
    mock_bedrock_cls.return_value = mock_llm

    evaluator = Evaluator(
        name="test-builtin",
        app_invoke=passthrough_app,
        scorers=[LlmAsJudgeScorer],
        client=client,
    )
    resp = evaluator.evaluate(
        testcases=[InlineTestCase(input={"_output": {"a": "hello"}, "q": "hi"})],
        scorers={
            "llm_as_judge": {
                "scores": {
                    "sample": None,
                    "clarity": {"description": "Rate clarity"},
                },
            },
        },
    )

    assert resp.total_results == 1
    assert resp.results[0].scores["llm_as_judge.sample"].value == 0.75
    assert resp.results[0].scores["llm_as_judge.clarity"].value == 0.5


def test_evaluate_unknown_evaluator_persists_error(
    client: DefaultApi,
) -> None:
    """Unknown evaluator name (no description) returns an error that is persisted."""
    evaluator = Evaluator(
        name="test-builtin",
        app_invoke=passthrough_app,
        scorers=[LlmAsJudgeScorer],
        client=client,
    )
    resp = evaluator.evaluate(
        testcases=[InlineTestCase(input={"_output": {"a": "hello"}, "q": "hi"})],
        scorers={"llm_as_judge": {"scores": {"nonexistent": None}}},
    )

    assert resp.total_results == 1
    sr = resp.results[0].scores["llm_as_judge.nonexistent"]
    assert sr.error is not None
    assert "Unknown built-in" in sr.error
