"""Example evaluator — a getting-started reference for the Evaluator SDK.

This module shows how to build and run an evaluation locally using the
Evaluator SDK with ``local_only=True`` (no ETK API needed).

It demonstrates **typed test data**: defining TypedDict classes for input,
output, expected, and metadata so that your app and scorers get static
type checking and IDE autocompletion.
"""

from __future__ import annotations

from typing import Any, TypedDict

from evaluator_sdk import Evaluator, Scorer, ScoreResult, TestResult, scorer

# ---------------------------------------------------------------------------
# 1. Define your test-case types (optional but recommended)
# ---------------------------------------------------------------------------


class MyInput(TypedDict):
    """Shape of the input your app receives."""

    text: str


class MyOutput(TypedDict):
    """Shape of the output your app returns."""

    text: str


class MyExpected(TypedDict):
    """Shape of the expected output for comparison."""

    text: str


class MyMetadata(TypedDict, total=False):
    """Optional metadata attached to each test case."""

    source: str
    priority: str


# ---------------------------------------------------------------------------
# 2. Define your app
# ---------------------------------------------------------------------------


def example_app(input_data: MyInput) -> MyOutput:
    """An app that echoes input text with a prefix.

    Replace this with your own logic (e.g. a Bedrock call, a RAG pipeline).
    """
    text = input_data.get("text", "")
    return {"text": f"Response: {text}"}


# ---------------------------------------------------------------------------
# 3. Define your scorer(s)
# ---------------------------------------------------------------------------


def example_exact_match(
    test_result: TestResult,
) -> float | ScoreResult:
    """Score 1.0 if output text matches expected text exactly, else 0.0.

    Demonstrates a scorer that reads the output and expected off the single
    ``test_result`` object. The SDK passes ``test_result`` (and optionally
    ``params``) — read whatever fields you need from it (input, output,
    expected, context, metadata, app_metrics, error).
    """
    expected = test_result.expected
    output = test_result.output or {}
    if expected is None:
        return ScoreResult(value=0.0, reason="No expected output provided")
    match = output.get("text") == expected.get("text")
    return ScoreResult(
        value=1.0 if match else 0.0,
        reason="Exact match" if match else "Mismatch",
    )


class ExampleTextQualityScorer(Scorer):
    """A Scorer subclass using ``@scorer`` to declare individual scoring methods.

    Each decorated method is a sub-score that the caller can select independently::

        evaluator.evaluate(
            testcases=...,
            scorers={"ExampleTextQualityScorer": {"params": {"strict": True}, "scores": {"length": None}}},
        )

    Methods receive the single ``test_result`` object (plus optionally
    ``params``, ``score_name``, ``score_params``).
    """

    name = "quality"

    @scorer
    def length(self, test_result: TestResult, params: dict[str, Any] | None = None) -> float:
        """Score based on output length. In strict mode, requires > 5 chars."""
        strict = (params or {}).get("strict", False)
        output_text = (test_result.output or {}).get("text", "")
        if strict:
            return 1.0 if len(output_text) > 5 else 0.0
        return 1.0 if len(output_text) > 0 else 0.0

    @scorer
    def prefix(self, test_result: TestResult) -> ScoreResult:
        """Check that output starts with 'Response:'."""
        output_text = (test_result.output or {}).get("text", "")
        has_prefix = output_text.startswith("Response:")
        return ScoreResult(
            value=1.0 if has_prefix else 0.0,
            reason="Starts with 'Response:'" if has_prefix else "Missing 'Response:' prefix",
        )


# ---------------------------------------------------------------------------
# 4. Run the evaluation
# ---------------------------------------------------------------------------


def run_local_example() -> None:
    """Run an example evaluation locally (no ETK API needed)."""
    evaluator: Evaluator = Evaluator(
        name="builtin-example",
        app_invoke=example_app,
        scorers=[
            example_exact_match,  # simple function scorer
            ExampleTextQualityScorer,  # Scorer subclass with sub-scores
        ],
        local_only=True,
    )

    response = evaluator.evaluate(
        testcases=[
            {
                "input": {"text": "Hello"},
                "expected": {"text": "Response: Hello"},
                "metadata": {"source": "unit-test", "priority": "high"},
            },
            {
                "input": {"text": "World"},
                "expected": {"text": "Response: World"},
                "metadata": {"source": "unit-test"},
            },
            {"input": {"text": "Foo"}, "expected": {"text": "Response: Bar"}},
        ],
        # Select only the "length" sub-score from quality, with strict mode
        scorers={
            "example_exact_match": None,
            "quality": {"params": {"strict": True}, "scores": {"length": None}},
        },
    )

    response.print_results()
