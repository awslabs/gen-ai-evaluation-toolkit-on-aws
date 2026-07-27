import json
import os
from typing import Any

import jsonschema
from mcp.server import FastMCP
from pydantic import ValidationError

from evaluator_agent_as_judge.models import AgentVerdict

VERDICT_FILE_ENV = "VERDICT_FILE"
ERROR_FILE_ENV = "ERROR_FILE"
OUTPUT_SCHEMA_ENV = "OUTPUT_SCHEMA"


def register(mcp: FastMCP) -> None:
    mcp.tool()(write_verdict)
    mcp.tool()(write_error)


def write_verdict(data: dict[str, Any]) -> str:
    """
    Write the evaluation verdict to the output file as structured JSON.

    Do NOT compute an overall score yourself. Break the evaluation down into named
    metrics and report each one — the overall score is derived automatically as a
    weighted average of your partial scores, so the aggregate arithmetic is always exact.

    data must contain:
    - scores: non-empty list of per-metric partial scores. Each item is an object with:
        - name (string, required): a label for the metric. Names MUST be unique across
          the list.
        - score (number, required): the metric's score, between 0.0 and 1.0.
        - weight (number, optional): relative importance, must be >= 0. Defaults to 1.0.
          Use a larger weight for metrics that matter more; use 0 to record a metric
          without letting it affect the overall score.
    - summary: non-empty string describing the evaluation result
    - issues: list of strings describing specific problems found (empty list if none)
    - context: any additional structured data (must match outputSchema if configured)
    """
    verdict_file = os.environ.get(VERDICT_FILE_ENV)
    if not verdict_file:
        raise RuntimeError(f"{VERDICT_FILE_ENV} environment variable is not set")

    # Parse + validate. AgentVerdict enforces non-empty scores, each score in [0,1],
    # each weight >= 0, unique metric names, and derives the overall score from the
    # partial scores. Surface a clean, agent-readable message instead of the raw
    # pydantic dump so the agent can self-correct and retry.
    try:
        verdict = AgentVerdict.model_validate(data)
    except ValidationError as exc:
        raise ValueError(f"Invalid verdict: {_format_validation_error(exc)}") from exc

    # Validate context against outputSchema if configured.
    # Skip validation when context is None — null context is always accepted.
    output_schema_str = os.environ.get(OUTPUT_SCHEMA_ENV)
    if output_schema_str is not None and verdict.context is not None:
        output_schema = json.loads(output_schema_str)
        try:
            jsonschema.validate(verdict.context, output_schema)
        except jsonschema.ValidationError as exc:
            raise ValueError(f"context does not match outputSchema: {exc.message}") from exc

    os.makedirs(os.path.dirname(os.path.abspath(verdict_file)), exist_ok=True)
    with open(verdict_file, "w") as f:
        json.dump(verdict.model_dump(), f)

    return (
        f"Verdict written to {verdict_file}. "
        f"Overall score derived as {verdict.score} (weighted average of {len(verdict.scores)} metric(s))."
    )



def write_error(error: str) -> str:
    """
    Write a critical error message to the error file and signal the agent to terminate.

    Call this when write_verdict has failed after 5 retries, or when an unrecoverable error
    prevents evaluation from completing. After calling this tool, the agent MUST stop immediately
    and not attempt any further actions.
    """
    error_file = os.environ.get(ERROR_FILE_ENV)
    if not error_file:
        raise RuntimeError(f"{ERROR_FILE_ENV} environment variable is not set")

    os.makedirs(os.path.dirname(os.path.abspath(error_file)), exist_ok=True)
    with open(error_file, "w") as f:
        f.write(error)

    return f"Error written to {error_file}. Stop immediately — do not attempt any further actions."


def _format_validation_error(exc: ValidationError) -> str:
    """Condense a pydantic ValidationError into a short, agent-readable message."""
    parts = []
    for err in exc.errors():
        loc = ".".join(str(x) for x in err["loc"]) or "(root)"
        parts.append(f"{loc}: {err['msg']}")
    return "; ".join(parts)
