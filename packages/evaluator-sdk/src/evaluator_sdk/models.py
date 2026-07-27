"""Public types, dataclasses, and type aliases for the Evaluator SDK."""

from dataclasses import dataclass, field
from typing import Any, Callable, TypeVar

from awssolutions_gen_ai_evaluation_toolkit_python_client.models import (  # type: ignore[attr-defined]
    InlineTestCase,
)

# ---------------------------------------------------------------------------
# User-definable type variables for test-case data
# ---------------------------------------------------------------------------
# Users can narrow these to TypedDict or Pydantic models for static checking:
#   class MyInput(TypedDict):
#       question: str
#   def my_app(input_data: MyInput) -> MyOutput: ...
InputType = TypeVar("InputType")
OutputType = TypeVar("OutputType")
ExpectedType = TypeVar("ExpectedType")
MetadataType = TypeVar("MetadataType")

# Type aliases — intentionally broad so typed user functions are accepted.
# Users narrow these in their own code (e.g. def my_app(x: MyInput) -> MyOutput).
AppInvokeFn = Callable[..., Any]
ScorerFn = Callable[..., Any]


# Alias for InlineTestCase — used internally and exported for user convenience
TestCase = InlineTestCase


@dataclass
class TestResult:
    """The single object handed to scorers — a test case that has been run.

    Carries the full test-case core (``input``, ``expected``, ``context``,
    ``metadata``) plus the execution artifacts (``output``, ``app_metrics``,
    ``error``). Scorers receive this as the sole ``test_result`` data argument;
    scoring configuration (``params``, ``score_name``, ``score_params``) is
    passed separately.
    """

    input: dict[str, Any] | None = None
    output: dict[str, Any] | None = None
    expected: dict[str, Any] | None = None
    context: dict[str, Any] | None = None
    metadata: dict[str, Any] | None = None
    app_metrics: dict[str, Any] | None = None
    error: str | None = None


@dataclass
class ScoreResult:
    """Result of a single score.

    Attributes:
        value: The numeric score (typically 0-1).
        error: Error message if scoring failed.
        reason: Human-readable explanation of the score.
        context: Optional free-form structured detail (e.g. a per-requirement
            breakdown). Use it to attach machine-readable metadata that consumers
            can parse alongside ``value``/``reason``. It is persisted and returned
            by the API (surfaced as ``ScoreOutput.context``). Leave it ``None`` if
            the scorer produces no structured detail.
    """

    value: float | None = None
    error: str | None = None
    reason: str | None = None
    context: dict[str, Any] | None = None

    def to_dict(self) -> dict[str, Any]:
        return {"value": self.value, "error": self.error, "reason": self.reason, "context": self.context}


@dataclass
class EvaluationResult:
    """Result of evaluating a single test case."""

    input_data: dict[str, Any]
    output: dict[str, Any] | None = None
    expected: dict[str, Any] | None = None
    context: dict[str, Any] | None = None
    scores: dict[str, ScoreResult] = field(default_factory=dict)
    error: str | None = None
    metadata: dict[str, Any] | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "input": self.input_data,
            "output": self.output,
            "expected": self.expected,
            "context": self.context,
            "scores": {k: v.to_dict() for k, v in self.scores.items()},
            "error": self.error,
            "metadata": self.metadata,
        }

    def __str__(self) -> str:
        parts = [f"input={self.input_data}"]
        if self.output is not None:
            parts.append(f"output={self.output}")
        if self.scores:
            parts.append(f"scores={{{', '.join(f'{k}: {v.value}' for k, v in self.scores.items())}}}")
        if self.metadata:
            parts.append(f"metadata={self.metadata}")
        if self.error:
            parts.append(f"error={self.error}")
        return "  ".join(parts)


@dataclass
class EvaluationResponse:
    """Response from evaluate() — contains results + identifiers."""

    report_id: str
    job_id: str
    results: list[EvaluationResult] | None

    @property
    def total_results(self) -> int:
        return len(self.results) if self.results else 0

    @property
    def total_errors(self) -> int:
        return sum(1 for r in self.results if r.error) if self.results else 0

    @property
    def total_with_output(self) -> int:
        return sum(1 for r in self.results if r.output is not None) if self.results else 0

    @property
    def score_summary(self) -> dict[str, dict[str, float | int]]:
        """Per-scorer summary: count, errors, and mean value (excluding errors)."""
        if not self.results:
            return {}
        summary: dict[str, dict[str, float | int]] = {}
        for result in self.results:
            for name, sr in result.scores.items():
                if name not in summary:
                    summary[name] = {"count": 0, "errors": 0, "total": 0.0}
                summary[name]["count"] += 1
                if sr.error:
                    summary[name]["errors"] += 1
                elif sr.value is not None:
                    summary[name]["total"] += sr.value
        for stats in summary.values():
            scored = int(stats["count"]) - int(stats["errors"])
            stats["mean"] = stats.pop("total") / scored if scored > 0 else 0.0
        return summary

    def print_results(self) -> None:
        """Print each result to stdout."""
        if not self.results:
            print("No results.")
            return
        for i, result in enumerate(self.results):
            print(f"[{i}] {result}")

    def print_summary(self) -> None:
        """Print a summary of the evaluation."""
        print(f"Results: {self.total_results}  Output: {self.total_with_output}  Errors: {self.total_errors}")
        for name, stats in self.score_summary.items():
            print(f"  {name}: mean={stats['mean']:.3f}  count={int(stats['count'])}  errors={int(stats['errors'])}")


class EvaluatorError(Exception):
    """Base exception for evaluator errors."""

    pass
