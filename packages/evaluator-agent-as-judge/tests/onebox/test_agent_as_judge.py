"""Minimal onebox integration test for AgentAsJudgeScorer.

Tests the scorer end-to-end through the Evaluator SDK with the real API handler
in-process (moto DDB), mocked opencode subprocess, and mocked S3.

Uses the standard passthrough_app pattern so evaluate() has an app_invoke phase
that carries pre-built output through to the scorer — consistent with how
AgentCoreScorer and LlmAsJudgeScorer onebox tests work.
"""

import json
import os
from typing import Any
from unittest.mock import MagicMock, patch

import pytest
from awssolutions_gen_ai_evaluation_toolkit_python_client.api import DefaultApi  # type: ignore[attr-defined]
from awssolutions_gen_ai_evaluation_toolkit_python_client.models import InlineTestCase  # type: ignore[attr-defined]
from evaluator_sdk import Evaluator, ScoreResult

from evaluator_agent_as_judge.scorers.agent_as_judge import AgentAsJudgeScorer
from tests.onebox.conftest import passthrough_app


def _make_subprocess_mock(verdict_data: dict) -> Any:
    """Return a Popen factory mock that writes a verdict file and exits cleanly."""
    import io

    def _factory(cmd: list, **kwargs: Any) -> Any:
        mock_proc = MagicMock()
        mock_proc.stdout = io.StringIO("")
        mock_proc.stderr = io.StringIO("")
        mock_proc.returncode = 0
        mock_proc.__enter__ = lambda s: s
        mock_proc.__exit__ = MagicMock(return_value=False)

        env = kwargs.get("env", {})
        verdict_file = env.get("VERDICT_FILE", "")
        if verdict_file:
            os.makedirs(os.path.dirname(os.path.abspath(verdict_file)), exist_ok=True)
            with open(verdict_file, "w") as f:
                json.dump(verdict_data, f)

        mock_proc.wait.return_value = 0
        return mock_proc

    return _factory


def test_scorer_runs_end_to_end_via_sdk(client: DefaultApi) -> None:
    """Minimal e2e: scorer invoked through Evaluator.evaluate(), verdict written by mocked subprocess."""
    verdict_data = {
        "scores": [{"name": "overall", "score": 0.85}],
        "summary": "looks good",
        "issues": [],
        "context": None,
    }

    evaluator = Evaluator(
        name="test-aaj",
        app_invoke=passthrough_app,
        scorers=[AgentAsJudgeScorer],
        client=client,
    )

    with patch("subprocess.Popen", side_effect=_make_subprocess_mock(verdict_data)):
        with patch("evaluator_agent_as_judge.scorers.agent_as_judge.download_artifacts", return_value=[]):
            resp = evaluator.evaluate(
                testcases=[InlineTestCase(
                    input={
                        "_output": {"answer": "This is good code"},
                        "code": "def add(a, b): return a + b",
                    }
                )],
                scorers={
                    "agent_as_judge": {
                        "scores": {"my_eval": {"description": "evaluate the output"}},
                    }
                },
            )

    assert resp.total_results == 1
    result = resp.results[0]  # type: ignore[index]

    # Score key is prefixed with scorer name
    score_key = next((k for k in result.scores if "my_eval" in k), None)
    assert score_key is not None, f"my_eval score not found in {list(result.scores.keys())}"

    score = result.scores[score_key]
    assert isinstance(score, ScoreResult)
    assert score.value == pytest.approx(0.85)
    assert score.error is None

    # Verify persisted
    results_resp = client.list_test_results(report_id=resp.report_id)
    assert len(results_resp.test_results) == 1
