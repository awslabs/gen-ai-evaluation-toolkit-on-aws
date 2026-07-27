import json
import os
import tempfile
from unittest.mock import MagicMock, patch

import pytest

from evaluator_agent_as_judge.tools.verdict import register, write_error, write_verdict

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def valid_verdict_data() -> dict:
    return {"scores": [{"name": "overall", "score": 0.8}], "summary": "all good", "issues": [], "context": None}


# ---------------------------------------------------------------------------
# write_verdict
# ---------------------------------------------------------------------------


class TestWriteVerdict:
    def test_raises_when_verdict_file_env_not_set(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            with pytest.raises(RuntimeError, match="VERDICT_FILE"):
                write_verdict(valid_verdict_data())

    def test_writes_verdict_json_to_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            verdict_file = os.path.join(tmpdir, "verdict.json")
            env = {"VERDICT_FILE": verdict_file}
            with patch.dict(os.environ, env, clear=True):
                write_verdict(valid_verdict_data())

            assert os.path.isfile(verdict_file)
            with open(verdict_file) as f:
                written = json.load(f)

            assert written["score"] == pytest.approx(0.8)
            assert written["summary"] == "all good"

    def test_returns_confirmation_message(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            verdict_file = os.path.join(tmpdir, "verdict.json")
            env = {"VERDICT_FILE": verdict_file}
            with patch.dict(os.environ, env, clear=True):
                result = write_verdict(valid_verdict_data())

            assert verdict_file in result

    def test_context_validated_against_output_schema(self) -> None:
        schema = json.dumps({"type": "object", "required": ["x"], "properties": {"x": {"type": "number"}}})
        with tempfile.TemporaryDirectory() as tmpdir:
            verdict_file = os.path.join(tmpdir, "verdict.json")
            env = {"VERDICT_FILE": verdict_file, "OUTPUT_SCHEMA": schema}
            with patch.dict(os.environ, env, clear=True):
                data = {**valid_verdict_data(), "context": {"x": 1.0}}
                write_verdict(data)  # must not raise

    def test_context_fails_output_schema_raises(self) -> None:
        schema = json.dumps({"type": "object", "required": ["x"], "properties": {"x": {"type": "number"}}})
        with tempfile.TemporaryDirectory() as tmpdir:
            verdict_file = os.path.join(tmpdir, "verdict.json")
            env = {"VERDICT_FILE": verdict_file, "OUTPUT_SCHEMA": schema}
            with patch.dict(os.environ, env, clear=True):
                data = {**valid_verdict_data(), "context": {"x": "not-a-number"}}
                with pytest.raises(ValueError, match="outputSchema"):
                    write_verdict(data)

    def test_null_context_skips_schema_validation(self) -> None:
        """context=None must be accepted even when OUTPUT_SCHEMA is set."""
        schema = json.dumps({"type": "object", "required": ["x"]})
        with tempfile.TemporaryDirectory() as tmpdir:
            verdict_file = os.path.join(tmpdir, "verdict.json")
            env = {"VERDICT_FILE": verdict_file, "OUTPUT_SCHEMA": schema}
            with patch.dict(os.environ, env, clear=True):
                data = {**valid_verdict_data(), "context": None}
                write_verdict(data)  # must not raise

    def test_no_schema_env_var_accepts_any_context(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            verdict_file = os.path.join(tmpdir, "verdict.json")
            env = {"VERDICT_FILE": verdict_file}
            with patch.dict(os.environ, env, clear=True):
                data = {**valid_verdict_data(), "context": {"anything": [1, 2, 3]}}
                write_verdict(data)  # must not raise

    def test_invalid_verdict_structure_raises(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            verdict_file = os.path.join(tmpdir, "verdict.json")
            env = {"VERDICT_FILE": verdict_file}
            with patch.dict(os.environ, env, clear=True):
                bad_data = {"scores": [{"name": "a", "score": 999}], "summary": "bad", "issues": []}  # score > 1
                with pytest.raises(ValueError):
                    write_verdict(bad_data)


# ---------------------------------------------------------------------------
# write_error
# ---------------------------------------------------------------------------


class TestWriteError:
    def test_raises_when_error_file_env_not_set(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            with pytest.raises(RuntimeError, match="ERROR_FILE"):
                write_error("something broke")

    def test_writes_error_message_to_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            error_file = os.path.join(tmpdir, "error.txt")
            env = {"ERROR_FILE": error_file}
            with patch.dict(os.environ, env, clear=True):
                write_error("evaluation failed completely")

            assert os.path.isfile(error_file)
            with open(error_file) as f:
                content = f.read()

            assert "evaluation failed completely" in content

    def test_returns_message_instructing_agent_to_stop(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            error_file = os.path.join(tmpdir, "error.txt")
            env = {"ERROR_FILE": error_file}
            with patch.dict(os.environ, env, clear=True):
                result = write_error("oops")

            assert error_file in result
            assert "Stop" in result or "stop" in result


# ---------------------------------------------------------------------------
# register
# ---------------------------------------------------------------------------


class TestRegister:
    def test_registers_write_verdict_and_write_error(self) -> None:
        mock_mcp = MagicMock()
        # mcp.tool() returns a decorator; calling it with a function registers it
        mock_decorator = MagicMock(side_effect=lambda fn: fn)
        mock_mcp.tool.return_value = mock_decorator

        register(mock_mcp)

        assert mock_mcp.tool.call_count == 2
        registered = [call_args[0][0] for call_args in mock_decorator.call_args_list]
        assert write_verdict in registered
        assert write_error in registered
