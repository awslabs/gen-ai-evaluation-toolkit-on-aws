"""Shared test helpers used by both unit (mock) and onebox (integration) tests."""

from typing import Any

from awssolutions_gen_ai_evaluation_toolkit_python_client.models import (  # type: ignore[attr-defined]
    InlineTestCase,
)

from evaluator_sdk import TestResult


def exact_match_scorer(*, test_result: TestResult) -> float:
    """Simple scorer that checks exact match. Uses keyword-only args."""
    if test_result.expected is None:
        return 0.0
    return 1.0 if test_result.output == test_result.expected else 0.0


def simple_app(input_data: dict[str, Any]) -> dict[str, Any]:
    """Simple app that returns a fixed answer."""
    return {"answer": "4"}


def failing_app(input_data: dict[str, Any]) -> dict[str, Any]:
    """App that always raises ValueError."""
    raise ValueError("App failed!")


def failing_scorer(*, test_result: TestResult) -> float:
    """Scorer that always raises RuntimeError."""
    raise RuntimeError("Scorer exploded!")


def make_sample_testcases() -> list[InlineTestCase]:
    """Return a standard pair of testcases for evaluation tests."""
    return [
        InlineTestCase(input={"question": "What is 2+2?"}, expected={"answer": "4"}),
        InlineTestCase(input={"question": "What is 3+3?"}, expected={"answer": "6"}),
    ]
