import json
import os
from typing import Any, Tuple
from unittest.mock import MagicMock, patch

import pytest
from evaluator_sdk import TestResult

from evaluator_agent_as_judge.models import AgentAsJudgeParams, AgentVerdict, Evaluator
from evaluator_agent_as_judge.prompt import build_prompt as _build_prompt
from evaluator_agent_as_judge.runner import run_evaluator as _run_evaluator
from evaluator_agent_as_judge.runner import validate_verdict as _validate_verdict

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

SIMPLE_SCHEMA: dict[str, Any] = {"type": "object", "properties": {"x": {"type": "number"}}}


def make_evaluator(
    name: str = "test-eval",
    output_schema: dict | None = None,
    requirement_docs: list | None = None,
) -> Evaluator:
    return Evaluator(
        name=name, description="test description", output_schema=output_schema, requirement_docs=requirement_docs
    )


def make_config() -> AgentAsJudgeParams:
    return AgentAsJudgeParams()


def make_verdict_data(score: float = 0.8, context: Any = None) -> dict:
    # The agent supplies a per-metric `scores` breakdown; the overall score is derived.
    # A single metric with the desired score makes the derived overall score equal `score`.
    return {"scores": [{"name": "overall", "score": score}], "summary": "looks good", "issues": [], "context": context}


def write_verdict_file(path: str, data: dict) -> None:
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f)


def write_error_file(path: str, msg: str) -> None:
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, "w") as f:
        f.write(msg)


# ---------------------------------------------------------------------------
# validate_verdict
# ---------------------------------------------------------------------------


class TestValidateVerdict:
    def test_valid_verdict_is_returned(self) -> None:
        ev = make_evaluator()
        data = make_verdict_data(score=0.75)
        result = _validate_verdict(ev, data)
        assert isinstance(result, AgentVerdict)
        assert result.score == 0.75

    def test_verdict_with_no_schema_accepts_any_context(self) -> None:
        ev = make_evaluator()
        data = make_verdict_data(context={"anything": [1, 2, 3]})
        result = _validate_verdict(ev, data)
        assert result.context == {"anything": [1, 2, 3]}

    def test_verdict_with_valid_context_matching_schema(self) -> None:
        ev = make_evaluator(output_schema=SIMPLE_SCHEMA)
        data = make_verdict_data(context={"x": 1.5})
        result = _validate_verdict(ev, data)
        assert result.context == {"x": 1.5}

    def test_verdict_with_null_context_skips_schema_validation(self) -> None:
        ev = make_evaluator(output_schema=SIMPLE_SCHEMA)
        data = make_verdict_data(context=None)
        result = _validate_verdict(ev, data)
        assert result.context is None

    def test_verdict_context_fails_schema_validation(self) -> None:
        schema = {"type": "object", "required": ["x"], "properties": {"x": {"type": "number"}}}
        ev = make_evaluator(output_schema=schema)
        data = make_verdict_data(context={"x": "not-a-number"})

        with pytest.raises(ValueError, match="outputSchema"):
            _validate_verdict(ev, data)

    def test_malformed_verdict_structure_raises(self) -> None:
        ev = make_evaluator()
        data = {"scores": [{"name": "a", "score": 1.5}], "summary": "oops", "issues": []}  # partial score > 1

        with pytest.raises(ValueError, match="Verdict structure is invalid"):
            _validate_verdict(ev, data)


# ---------------------------------------------------------------------------
# build_prompt
# ---------------------------------------------------------------------------


class TestBuildPrompt:
    def test_contains_evaluator_description(self) -> None:
        ev = Evaluator(name="e", description="my special description")
        prompt = _build_prompt(ev, TestResult(input="test case content"), [], None)
        assert "my special description" in prompt

    def test_contains_test_case_input(self) -> None:
        ev = make_evaluator()
        prompt = _build_prompt(ev, TestResult(input="the actual test input"), [], None)
        assert "the actual test input" in prompt

    def test_contains_test_case_output_when_present(self) -> None:
        ev = make_evaluator()
        prompt = _build_prompt(ev, TestResult(output="the agent response"), [], None)
        assert "the agent response" in prompt

    def test_output_absent_from_prompt_when_none(self) -> None:
        ev = make_evaluator()
        tc = TestResult(input="only input")
        prompt = _build_prompt(ev, tc, [], None)
        assert "the agent response" not in prompt

    def test_evaluator_config_included_as_yaml(self) -> None:
        ev = Evaluator(name="e", description="d", config={"threshold": 0.9})
        prompt = _build_prompt(ev, TestResult(input="tc"), [], None)
        assert "threshold" in prompt
        assert "0.9" in prompt

    def test_no_evaluator_config_section_when_config_is_none(self) -> None:
        ev = make_evaluator()
        prompt = _build_prompt(ev, TestResult(input="tc"), [], None)
        assert "Evaluator Parameters" not in prompt

    def test_artifact_dirs_included_when_present(self) -> None:
        ev = make_evaluator()
        prompt = _build_prompt(ev, TestResult(input="tc"), ["/tmp/arts/dir1", "/tmp/arts/dir2"], None)
        assert "/tmp/arts/dir1" in prompt
        assert "/tmp/arts/dir2" in prompt

    def test_no_artifacts_section_when_empty(self) -> None:
        ev = make_evaluator()
        prompt = _build_prompt(ev, TestResult(input="tc"), [], None)
        assert "Artifacts" not in prompt

    def test_reference_documents_section_included_when_dir_provided(self) -> None:
        ev = make_evaluator()
        prompt = _build_prompt(ev, TestResult(input="tc"), [], "/tmp/req-docs")
        assert "/tmp/req-docs" in prompt
        assert "Reference Documents" in prompt

    def test_no_reference_documents_section_when_dir_is_none(self) -> None:
        ev = make_evaluator()
        prompt = _build_prompt(ev, TestResult(input="tc"), [], None)
        assert "Reference Documents" not in prompt

    def test_output_schema_injected_when_present(self) -> None:
        ev = make_evaluator(output_schema=SIMPLE_SCHEMA)
        prompt = _build_prompt(ev, TestResult(input="tc"), [], None)
        assert "JSON Schema" in prompt
        assert json.dumps(SIMPLE_SCHEMA, indent=2) in prompt

    def test_no_schema_block_when_output_schema_is_none(self) -> None:
        ev = make_evaluator()
        prompt = _build_prompt(ev, TestResult(input="tc"), [], None)
        assert "JSON Schema" not in prompt

    def test_empty_data_guard_in_system_prompt(self) -> None:
        """The empty-data guard lives in the judge system prompt, not build_prompt()."""
        from evaluator_agent_as_judge.prompt import _JUDGE_SYSTEM_PROMPT

        assert "write_error" in _JUDGE_SYSTEM_PROMPT
        assert "No test case data" in _JUDGE_SYSTEM_PROMPT


# ---------------------------------------------------------------------------
# run_evaluator
# ---------------------------------------------------------------------------


def make_popen_mock(
    returncode: int = 0,
    stdout_lines: str = "",
    stderr_lines: str = "",
    env_capture: dict | None = None,
    verdict_data: dict | None = None,
    error_content: str | None = None,
    raise_timeout: bool = False,
) -> MagicMock:
    """Build a Popen context-manager mock that writes verdict/error files when entered."""
    import io
    import subprocess as _sp

    mock_proc = MagicMock()
    mock_proc.stdout = io.StringIO(stdout_lines)
    mock_proc.stderr = io.StringIO(stderr_lines)
    mock_proc.returncode = returncode

    def _wait(timeout: float | None = None) -> int:
        if raise_timeout and not _wait.raised:  # type: ignore[attr-defined]
            _wait.raised = True  # type: ignore[attr-defined]
            raise _sp.TimeoutExpired(cmd=[], timeout=timeout or 0)
        return returncode

    _wait.raised = False  # type: ignore[attr-defined]
    mock_proc.wait.side_effect = _wait
    mock_proc.__enter__ = lambda s: s
    mock_proc.__exit__ = MagicMock(return_value=False)

    def _popen_factory(cmd: list, **kwargs: Any) -> MagicMock:
        if env_capture is not None:
            env_capture.update(kwargs.get("env", {}))

        env = kwargs.get("env", {})
        verdict_file = env.get("VERDICT_FILE", "")
        error_file = env.get("ERROR_FILE", "")

        if error_content is not None and error_file:
            write_error_file(error_file, error_content)
        if verdict_data is not None and verdict_file:
            write_verdict_file(verdict_file, verdict_data)

        return mock_proc

    return _popen_factory  # type: ignore[return-value]


class TestRunEvaluator:
    def _run(
        self,
        evaluator: Evaluator,
        *,
        subprocess_returncode: int = 0,
        verdict_data: dict | None = None,
        error_content: str | None = None,
        test_case: TestResult | None = None,
    ) -> Tuple[Any, Any]:
        config = make_config()
        if test_case is None:
            test_case = TestResult(input="x")

        with patch(
            "subprocess.Popen",
            side_effect=make_popen_mock(
                returncode=subprocess_returncode,
                verdict_data=verdict_data,
                error_content=error_content,
            ),
        ):
            score, raw = _run_evaluator(
                config=config,
                evaluator=evaluator,
                test_case=test_case,
                artifact_dirs=[],
                requirement_doc_dir=None,
            )

        return score, raw

    def test_successful_verdict_returns_score(self) -> None:
        ev = make_evaluator()
        score, raw = self._run(ev, verdict_data=make_verdict_data(score=0.9))

        assert score.value == pytest.approx(0.9)
        assert score.error is None

    def test_verdict_issues_and_context_surface_on_score_context(self) -> None:
        ev = make_evaluator()
        verdict = make_verdict_data(score=0.5, context={"requirements": [{"id": "REQ-1", "score": 0.5}]})
        verdict["issues"] = ["REQ-1: partially met"]
        score, raw = self._run(ev, verdict_data=verdict)

        # The ScoreResult context is an envelope: the agent's schema-governed output
        # lives under "output"; the toolkit's own detail (issues + the derived
        # per-metric breakdown) lives under "metadata".
        assert score.context == {
            "output": {"requirements": [{"id": "REQ-1", "score": 0.5}]},
            "metadata": {
                "issues": ["REQ-1: partially met"],
                "scores": [{"name": "overall", "score": 0.5, "weight": 1.0}],
            },
        }

    def test_error_file_takes_precedence_over_verdict(self) -> None:
        ev = make_evaluator()
        score, raw = self._run(
            ev,
            error_content="something went wrong",
            verdict_data=make_verdict_data(score=0.5),
        )

        assert score.error is not None
        assert "something went wrong" in score.error
        assert score.value is None

    def test_missing_verdict_file_returns_error_score(self) -> None:
        ev = make_evaluator()
        score, raw = self._run(ev)

        assert score.error is not None
        assert score.value is None

    def test_invalid_verdict_json_returns_error_score(self) -> None:
        ev = make_evaluator()
        bad_data = {"scores": [{"name": "a", "score": 99.9}], "summary": "invalid", "issues": []}
        score, raw = self._run(ev, verdict_data=bad_data)

        assert score.error is not None
        assert score.value is None

    def test_non_zero_exit_code_still_processes_verdict(self) -> None:
        ev = make_evaluator()
        score, raw = self._run(ev, subprocess_returncode=1, verdict_data=make_verdict_data(score=0.7))

        assert score.value == pytest.approx(0.7)

    def test_output_schema_env_var_set_when_schema_present(self) -> None:
        ev = make_evaluator(output_schema=SIMPLE_SCHEMA)
        captured_env: dict = {}

        config = make_config()
        with patch(
            "subprocess.Popen",
            side_effect=make_popen_mock(env_capture=captured_env, verdict_data=make_verdict_data()),
        ):
            _run_evaluator(
                config=config,
                evaluator=ev,
                test_case=TestResult(input="x"),
                artifact_dirs=[],
                requirement_doc_dir=None,
            )

        assert "OUTPUT_SCHEMA" in captured_env
        assert json.loads(captured_env["OUTPUT_SCHEMA"]) == SIMPLE_SCHEMA

    def test_output_schema_env_var_absent_when_no_schema(self) -> None:
        ev = make_evaluator()
        captured_env: dict = {}

        config = make_config()
        with patch(
            "subprocess.Popen",
            side_effect=make_popen_mock(env_capture=captured_env, verdict_data=make_verdict_data()),
        ):
            _run_evaluator(
                config=config,
                evaluator=ev,
                test_case=TestResult(input="x"),
                artifact_dirs=[],
                requirement_doc_dir=None,
            )

        assert "OUTPUT_SCHEMA" not in captured_env

    def test_empty_error_file_is_ignored(self) -> None:
        ev = make_evaluator()
        score, raw = self._run(ev, error_content="", verdict_data=make_verdict_data(score=0.6))

        assert score.value == pytest.approx(0.6)

    def test_subprocess_timeout_expired_returns_error_score(self, monkeypatch: pytest.MonkeyPatch) -> None:
        ev = make_evaluator()
        monkeypatch.setenv("SUBPROCESS_TIMEOUT_MINUTES", "1")

        config = make_config()
        with patch("subprocess.Popen", side_effect=make_popen_mock(raise_timeout=True)):
            score, raw = _run_evaluator(
                config=config,
                evaluator=ev,
                test_case=TestResult(input="x"),
                artifact_dirs=[],
                requirement_doc_dir=None,
            )

        assert score.value is None
        assert score.error is not None
        assert "timed out" in score.error.lower()

    def test_subprocess_timeout_default_is_30_minutes(self, monkeypatch: pytest.MonkeyPatch) -> None:
        ev = make_evaluator()
        monkeypatch.delenv("SUBPROCESS_TIMEOUT_MINUTES", raising=False)

        captured_wait_timeout: list[float] = []
        popen_factory = make_popen_mock(verdict_data=make_verdict_data())

        def capturing_popen(cmd: list, **kwargs: Any) -> Any:
            proc = popen_factory(cmd, **kwargs)
            original_wait = proc.wait.side_effect

            def capturing_wait(timeout: float | None = None) -> int:
                captured_wait_timeout.append(timeout or 0)
                return int(original_wait(timeout=timeout))

            proc.wait.side_effect = capturing_wait
            return proc

        config = make_config()
        with patch("subprocess.Popen", side_effect=capturing_popen):
            _run_evaluator(
                config=config,
                evaluator=ev,
                test_case=TestResult(input="x"),
                artifact_dirs=[],
                requirement_doc_dir=None,
            )

        assert captured_wait_timeout == [30 * 60]

    def test_run_with_output_field_set(self) -> None:
        """output field on TestResult is passed through to the runner without error."""
        ev = make_evaluator()
        tc = TestResult(input="the question", output="the agent answer")
        score, raw = self._run(ev, verdict_data=make_verdict_data(score=0.8), test_case=tc)

        assert score.value == pytest.approx(0.8)
        assert score.error is None
