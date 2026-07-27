"""Unit tests for AgentAsJudgeScorer."""

import os
import tempfile
from typing import Any
from unittest.mock import patch

import pytest
from evaluator_sdk import TestResult
from pydantic import ValidationError

from evaluator_agent_as_judge.models import S3Ref
from evaluator_agent_as_judge.scorers.agent_as_judge import AgentAsJudgeScorer

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def make_score_params(description: str = "evaluate this") -> dict[str, Any]:
    """Inline (custom) evaluator definition, as carried by score_params."""
    return {"description": description}


def make_score_result(value: float = 0.8, error: str | None = None) -> Any:
    from evaluator_sdk import ScoreResult

    return ScoreResult(value=value if error is None else None, error=error)


# ---------------------------------------------------------------------------
# AgentAsJudgeScorer._evaluator_scorer
# ---------------------------------------------------------------------------


class TestAgentAsJudgeScorerDispatch:
    def _call_scorer(
        self,
        score_name: str,
        score_params: dict | None = None,
        params: dict | None = None,
        input: Any = None,
        output: Any = None,
        mock_run_return: Any = None,
    ) -> Any:
        scorer = AgentAsJudgeScorer()
        if mock_run_return is None:
            mock_run_return = (make_score_result(value=0.9), {})

        with patch("evaluator_agent_as_judge.scorers.agent_as_judge.run_evaluator", return_value=mock_run_return):
            with patch("evaluator_agent_as_judge.scorers.agent_as_judge.download_artifacts", return_value=[]):
                result = scorer._evaluator_scorer(
                    score_name=score_name,
                    score_params=score_params,
                    test_result=TestResult(input=input, output=output),
                    params=params,
                )
        return result

    def test_returns_score_result_on_success(self) -> None:
        result = self._call_scorer("my-eval", score_params=make_score_params(), input={"q": "what?"})

        assert result.value == pytest.approx(0.9)
        assert result.error is None

    def test_error_when_top_level_params_invalid(self) -> None:
        result = self._call_scorer(
            "my-eval",
            score_params=make_score_params(),
            params={"agent_temperature": "not-a-float"},
        )

        assert result.error is not None
        assert "Invalid agent-as-judge params" in result.error

    def test_assert_when_score_params_missing(self) -> None:
        with pytest.raises(AssertionError):
            self._call_scorer("my-eval", score_params=None)

    def test_error_when_evaluator_definition_invalid(self) -> None:
        # An inline evaluator definition with no description fails validation.
        with pytest.raises(ValidationError):
            self._call_scorer("my-eval", score_params={})

    def test_builtin_evaluator_resolved_by_name(self) -> None:
        from evaluator_agent_as_judge.builtins import BUILT_IN_EVALUATORS

        name = next(iter(BUILT_IN_EVALUATORS))
        result = self._call_scorer(name, score_params={"builtIn": name})

        assert result.error is None

    def test_output_passed_to_test_case(self) -> None:
        """output from the SDK is included in the EvalTestCase constructed inside the scorer."""
        captured_tc: list = []

        def capturing_run(config, evaluator, test_case, artifact_dirs, requirement_doc_dir):
            captured_tc.append(test_case)
            return make_score_result(value=1.0), {}

        scorer = AgentAsJudgeScorer()
        with patch("evaluator_agent_as_judge.scorers.agent_as_judge.run_evaluator", side_effect=capturing_run):
            with patch("evaluator_agent_as_judge.scorers.agent_as_judge.download_artifacts", return_value=[]):
                scorer._evaluator_scorer(
                    score_name="e",
                    score_params=make_score_params(),
                    test_result=TestResult(input={"question": "q"}, output={"answer": "a"}),
                )

        assert len(captured_tc) == 1
        assert captured_tc[0].output == {"answer": "a"}

    def test_artifact_dirs_cleaned_up_after_scoring(self) -> None:
        artifact_dir = tempfile.mkdtemp()

        scorer = AgentAsJudgeScorer()
        with patch(
            "evaluator_agent_as_judge.scorers.agent_as_judge.download_artifacts",
            return_value=[artifact_dir],
        ):
            with patch(
                "evaluator_agent_as_judge.scorers.agent_as_judge.run_evaluator",
                return_value=(make_score_result(), {}),
            ):
                scorer._evaluator_scorer(
                    score_name="e",
                    score_params=make_score_params(),
                    test_result=TestResult(),
                )

        assert not os.path.isdir(artifact_dir)

    def test_artifact_dirs_cleaned_up_on_run_evaluator_exception(self) -> None:
        artifact_dir = tempfile.mkdtemp()

        scorer = AgentAsJudgeScorer()
        with patch(
            "evaluator_agent_as_judge.scorers.agent_as_judge.download_artifacts",
            return_value=[artifact_dir],
        ):
            with patch(
                "evaluator_agent_as_judge.scorers.agent_as_judge.run_evaluator",
                side_effect=RuntimeError("boom"),
            ):
                with pytest.raises(RuntimeError):
                    scorer._evaluator_scorer(
                        score_name="e",
                        score_params=make_score_params(),
                        test_result=TestResult(),
                    )

        assert not os.path.isdir(artifact_dir)

    def test_requirement_docs_downloaded_fresh_each_call(self) -> None:
        """Requirement docs must be re-downloaded on every call — no cross-call caching.

        Caching across calls previously leaked a prior run's requirement dir into
        a later run that reused the same evaluator name (warm Lambda reuse). Each
        call must download into its own temp dir.
        """
        score_params = {
            "description": "d",
            "requirement_docs": [S3Ref(bucket_name="b", prefix="p/").model_dump()],
        }

        req_dirs = [tempfile.mkdtemp(), tempfile.mkdtemp()]

        scorer = AgentAsJudgeScorer()
        with patch(
            "evaluator_agent_as_judge.scorers.agent_as_judge.download_requirements",
            side_effect=[req_dirs[0], req_dirs[1]],
        ) as mock_dl:
            with patch(
                "evaluator_agent_as_judge.scorers.agent_as_judge.run_evaluator",
                return_value=(make_score_result(), {}),
            ):
                with patch("evaluator_agent_as_judge.scorers.agent_as_judge.download_artifacts", return_value=[]):
                    scorer._evaluator_scorer("e", score_params, TestResult(), None)
                    scorer._evaluator_scorer("e", score_params, TestResult(), None)

        # Downloaded fresh both times, not cached.
        assert mock_dl.call_count == 2

    def test_requirement_dir_cleaned_up_after_scoring(self) -> None:
        req_dir = tempfile.mkdtemp()
        score_params = {
            "description": "d",
            "requirement_docs": [S3Ref(bucket_name="b", prefix="p/").model_dump()],
        }

        scorer = AgentAsJudgeScorer()
        with patch(
            "evaluator_agent_as_judge.scorers.agent_as_judge.download_requirements",
            return_value=req_dir,
        ):
            with patch("evaluator_agent_as_judge.scorers.agent_as_judge.download_artifacts", return_value=[]):
                with patch(
                    "evaluator_agent_as_judge.scorers.agent_as_judge.run_evaluator",
                    return_value=(make_score_result(), {}),
                ):
                    scorer._evaluator_scorer("e", score_params, TestResult(), None)

        assert not os.path.isdir(req_dir)

    def test_requirement_dir_cleaned_up_on_run_evaluator_exception(self) -> None:
        req_dir = tempfile.mkdtemp()
        score_params = {
            "description": "d",
            "requirement_docs": [S3Ref(bucket_name="b", prefix="p/").model_dump()],
        }

        scorer = AgentAsJudgeScorer()
        with patch(
            "evaluator_agent_as_judge.scorers.agent_as_judge.download_requirements",
            return_value=req_dir,
        ):
            with patch("evaluator_agent_as_judge.scorers.agent_as_judge.download_artifacts", return_value=[]):
                with patch(
                    "evaluator_agent_as_judge.scorers.agent_as_judge.run_evaluator",
                    side_effect=RuntimeError("boom"),
                ):
                    with pytest.raises(RuntimeError):
                        scorer._evaluator_scorer("e", score_params, TestResult(), None)

        assert not os.path.isdir(req_dir)
