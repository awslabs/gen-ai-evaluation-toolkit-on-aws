import json
import logging
import os
import shutil
import subprocess
import tempfile
import threading
from typing import Any, List, Optional, Tuple

import jsonschema
from evaluator_sdk import ScoreResult, TestResult
from pydantic import ValidationError

from evaluator_agent_as_judge.models import AgentAsJudgeParams, AgentVerdict, Evaluator
from evaluator_agent_as_judge.prompt import build_opencode_config, build_prompt

logger = logging.getLogger(__name__)


def run_evaluator(
    config: AgentAsJudgeParams,
    evaluator: Evaluator,
    test_case: TestResult,
    artifact_dirs: List[str],
    requirement_doc_dir: Optional[str],
) -> Tuple[ScoreResult, Any]:
    """Run a single evaluator against a test case using the OpenCode agent.

    Downloads artifacts and requirement docs are expected to already be on disk
    (passed via ``artifact_dirs`` and ``requirement_doc_dir``). This function
    builds the agent prompt, invokes the opencode subprocess, and parses the
    verdict written by the agent's ``writeVerdict`` MCP tool.

    Args:
        config: Top-level Agent-as-Judge parameters (model, temperature, etc.).
        evaluator: The evaluator definition (name, description, optional schema).
        test_case: Parsed test case data.
        artifact_dirs: List of local directories containing downloaded test artifacts.
        requirement_doc_dir: Local directory containing downloaded requirement docs,
            or ``None`` if the evaluator has no requirement docs.

    Returns:
        A tuple of (ScoreResult, raw context dict). On error the ScoreResult carries
        an ``error`` string and the context dict contains ``{"error": ...}``.
    """
    case_temp_dir = tempfile.mkdtemp()
    verdict_file = os.path.join(case_temp_dir, "verdict.json")
    error_file = os.path.join(case_temp_dir, "error.txt")

    try:
        env = _build_agent_env(config, evaluator, verdict_file, error_file)
        prompt = build_prompt(evaluator, test_case, artifact_dirs, requirement_doc_dir)

        logger.info(f"Invoking agent for evaluator: {evaluator.name!r}")
        returncode, timeout_error = _invoke_agent(evaluator, prompt, env)
        if timeout_error is not None:
            return ScoreResult(error=timeout_error), {"error": timeout_error}

        assert returncode is not None  # guaranteed: _invoke_agent returns (None, error) or (returncode, None)
        if returncode != 0:
            logger.warning(f"Agent exited with code {returncode} for evaluator {evaluator.name!r}. ")

        return _parse_agent_output(evaluator, verdict_file, error_file)
    finally:
        shutil.rmtree(case_temp_dir, ignore_errors=True)


def validate_verdict(evaluator: Evaluator, verdict_data: Any) -> AgentVerdict:
    """Validate and parse raw verdict data written by the agent.

    Performs two-stage validation: first validates ``context`` against the
    evaluator's ``output_schema`` (if provided), then parses the full dict
    into an :class:`AgentVerdict` model.

    The ``output_schema`` check here is a secondary safety net — the
    ``writeVerdict`` MCP tool already validates the schema before writing the
    file. Validation is skipped when ``context`` is ``None``.

    Args:
        evaluator: The evaluator whose ``output_schema`` is used for context validation.
        verdict_data: Raw dict loaded from the agent-written verdict JSON file.

    Returns:
        A validated :class:`AgentVerdict` instance.

    Raises:
        ValueError: If ``context`` fails ``output_schema`` validation, or if the
            overall verdict structure does not match :class:`AgentVerdict`.
    """
    if evaluator.output_schema is not None and verdict_data.get("context") is not None:
        try:
            jsonschema.validate(verdict_data["context"], evaluator.output_schema)
        except jsonschema.ValidationError as exc:
            raise ValueError("Verdict context failed outputSchema validation") from exc

    try:
        verdict = AgentVerdict.model_validate(verdict_data)
    except ValidationError as exc:
        raise ValueError("Verdict structure is invalid") from exc

    return verdict


def _build_agent_env(
    config: AgentAsJudgeParams,
    evaluator: Evaluator,
    verdict_file: str,
    error_file: str,
) -> dict:
    env = {
        **os.environ,
        # Always disable opencode auto-update and telemetry. The evaluator runs in
        # an isolated subnet (no internet egress), so these calls would silently
        # eat the cold-start timeout trying to reach opencode.ai. Setting these
        # in code rather than as deployment env vars keeps the guarantee
        # un-bypass-able from outside the evaluator.
        "OPENCODE_DISABLE_AUTOUPDATE": "1",
        "OPENCODE_TELEMETRY_DISABLED": "1",
        # Industry-standard "do not track" hint, also honoured by opencode.
        "DO_NOT_TRACK": "1",
        "OPENCODE_CONFIG_CONTENT": json.dumps(build_opencode_config(config)),
        # VERDICT_FILE, ERROR_FILE, and OUTPUT_SCHEMA env variables are passed down
        # to the MCP tools as the LLM starts the MCP server as a sub process
        "VERDICT_FILE": verdict_file,
        "ERROR_FILE": error_file,
    }
    if evaluator.output_schema is not None:
        env["OUTPUT_SCHEMA"] = json.dumps(evaluator.output_schema)
    return env


def _invoke_agent(
    evaluator: Evaluator,
    prompt: str,
    env: dict,
) -> Tuple[Optional[int], Optional[str]]:
    """Run the agent subprocess. Returns (returncode, None) on success or (None, error_msg) on timeout."""
    timeout_seconds = _get_subprocess_timeout_seconds()
    with subprocess.Popen(
        ["mise", "exec", "--", "opencode", "run", "--agent", "judge", "--dangerously-skip-permissions", prompt],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        env=env,
    ) as proc:
        threads = _drain_process_output(proc)
        try:
            proc.wait(timeout=timeout_seconds)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait()
            error_msg = (
                f"Agent subprocess for evaluator {evaluator.name!r} "
                f"timed out after {timeout_seconds // 60} minute(s). "
                f"Override with SUBPROCESS_TIMEOUT_MINUTES env variable."
            )
            logger.error(error_msg)
            return None, error_msg
        finally:
            for t in threads:
                t.join(timeout=timeout_seconds)
        return proc.returncode, None


def _drain_process_output(proc: subprocess.Popen) -> Tuple[threading.Thread, threading.Thread]:
    """Start background threads to drain the agent's stdout and stderr pipes.

    The two streams must be drained concurrently with the process running. If
    only one pipe is read at a time, the other can fill the OS pipe buffer
    (~64 KB) and block the subprocess — a real risk for a long-running opencode
    session that can produce significant output over its lifetime.

    Returns the two threads so the caller can join them after the process exits.
    """

    def _drain(stream: Any, prefix: str) -> None:
        for line in stream:
            logger.info("%s %s", prefix, line.rstrip())

    t_out = threading.Thread(target=_drain, args=(proc.stdout, "[stdout]"), daemon=True)
    t_err = threading.Thread(target=_drain, args=(proc.stderr, "[stderr]"), daemon=True)
    t_out.start()
    t_err.start()
    return t_out, t_err


def _parse_agent_output(
    evaluator: Evaluator,
    verdict_file: str,
    error_file: str,
) -> Tuple[ScoreResult, Any]:
    """Read the error or verdict file written by the agent and return the appropriate score."""
    # Check error file first — agent writes here when it cannot recover
    if os.path.isfile(error_file):
        with open(error_file) as f:
            error_content = f.read().strip()
        if error_content:
            logger.error(f"Agent reported error for evaluator {evaluator.name!r}: {error_content}")
            return ScoreResult(error=error_content), {"error": error_content}

    if not os.path.isfile(verdict_file):
        error_msg = f"Agent did not write a verdict for evaluator {evaluator.name!r}."
        logger.error(error_msg)
        return ScoreResult(error=error_msg), {"error": error_msg}

    with open(verdict_file) as f:
        verdict_data = json.load(f)

    try:
        verdict = validate_verdict(evaluator, verdict_data)
    except ValueError as err:
        error_message = f"Evaluator {evaluator.name!r} failed: {err}"
        logger.error(error_message)
        return ScoreResult(error=error_message), {"error": str(err), "raw": verdict_data}

    logger.info(f"Evaluator {evaluator.name!r} completed with score {verdict.score}")
    # Result envelope: the agent's schema-governed output is isolated under "output";
    # everything the toolkit produces (issues + the derived per-metric breakdown) lives
    # under "metadata". This keeps our keys from ever colliding with the agent's context.
    score_context = {
        "output": verdict.context,
        "metadata": {
            "issues": verdict.issues,
            "scores": [s.model_dump() for s in verdict.scores],
        },
    }
    return (
        ScoreResult(value=verdict.score, reason=verdict.summary, context=score_context),
        verdict.model_dump(),
    )


def _get_subprocess_timeout_seconds() -> int:
    """Resolve the per-evaluator subprocess timeout (in seconds) from the env.

    Read on every call so tests and runtime overrides are picked up without
    restarting the process. Invalid or non-positive values fall back to the
    default with a warning.
    """
    DEFAULT_MINUTES = 30

    raw = os.environ.get("SUBPROCESS_TIMEOUT_MINUTES")
    minutes = DEFAULT_MINUTES

    if raw is not None and raw.strip() != "":
        try:
            parsed = int(raw)
            if parsed <= 0:
                raise ValueError("must be a positive integer")
            minutes = parsed
        except ValueError as exc:
            logger.warning(
                f"Invalid SUBPROCESS_TIMEOUT_MINUTES={raw!r} ({exc}); falling back to default {DEFAULT_MINUTES} minutes"
            )

    return minutes * 60
