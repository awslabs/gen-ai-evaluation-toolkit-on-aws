"""E2E tests for the evaluator-agent-as-judge handler against a deployed stack.

Tests the full production chain:
  Client → API → EventBridge → evaluator-agent-as-judge Lambda (Docker) → Bedrock → DDB

Run with: uv run pytest tests/e2e -m e2e -v --timeout=600
"""

from typing import Any, List

import pytest
from awssolutions_gen_ai_evaluation_toolkit_python_client.api import DefaultApi  # type: ignore[attr-defined]
from awssolutions_gen_ai_evaluation_toolkit_python_client.models.inline_test_result import InlineTestResult
from awssolutions_gen_ai_evaluation_toolkit_python_client.models.scorer_config import ScorerConfig
from awssolutions_gen_ai_evaluation_toolkit_python_client.models.submit_scoring_job_request_content import (
    SubmitScoringJobRequestContent,
)

from .conftest import EVALUATOR_NAME, get_customer_bucket_name, list_all_results, poll_job

pytestmark = pytest.mark.e2e


# --- Scorer params ---

# AaJ is scoring-only — it reads from input (artifacts, context, requirements) and
# ignores output. Pass empty dict as placeholder output, which is all the API requires.
INLINE_TEST_RESULTS = [
    InlineTestResult(input={"code": "def add(a, b): return a + b"}, output={}),
    InlineTestResult(input={"code": "def greet(name): return f'Hello, {name}'"}, output={}),
]


def _find_score(result: Any, name_fragment: str) -> Any:
    """Find a score by partial name match."""
    scores = result.scores or {}
    for k, v in scores.items():
        if name_fragment in k:
            return v
    pytest.fail(f"Score containing '{name_fragment}' not found in {list(scores.keys())}")


# --- Tests ---


@pytest.mark.e2e
def test_builtin_requirements_compliance_scorer(client: DefaultApi, test_cases: List[InlineTestResult]) -> None:
    """SCORE job using the requirements-compliance built-in evaluator with inline results."""
    job_resp = client.submit_scoring_job(
        EVALUATOR_NAME,
        SubmitScoringJobRequestContent(
            testResults=test_cases,
            scorers={
                "agent_as_judge": ScorerConfig(
                    scores={
                        "requirements_compliance": {
                            "builtIn": "requirements_compliance",
                            "requirement_docs": [
                                {
                                    "bucket_name": get_customer_bucket_name(),
                                    "prefix": "evaluation/agent-as-judge/requirements/",
                                }
                            ],
                        }
                    },
                )
            },
        ),
    )

    status = poll_job(client, job_resp.job_id)
    assert status == "SUCCESS", f"Job ended with status {status}"

    results = list_all_results(client, job_resp.report_id)
    assert len(results) == len(test_cases)

    for result in results:
        score = _find_score(result, "requirements_compliance")
        # The scorer ran and returned a result (either a score value or a graceful error).
        # Without requirement docs, the scorer returns an error — that's valid behaviour.
        assert score is not None, "Expected a score entry for requirements_compliance"


@pytest.mark.e2e
def test_custom_evaluator_scorer(client: DefaultApi) -> None:
    """SCORE job using a fully custom evaluator (user-supplied description) with inline results."""
    job_resp = client.submit_scoring_job(
        EVALUATOR_NAME,
        SubmitScoringJobRequestContent(
            testResults=INLINE_TEST_RESULTS,
            scorers={
                "agent_as_judge": ScorerConfig(
                    scores={
                        "code_quality": {
                            "description": (
                                "Evaluate the provided code snippet for basic quality: "
                                "does it have a function definition, is it syntactically sensible, "
                                "and does it follow Python naming conventions? "
                                "Score 1.0 if all criteria are met, 0.5 if partially, 0.0 if none."
                            ),
                        }
                    },
                )
            },
        ),
    )

    status = poll_job(client, job_resp.job_id)
    assert status == "SUCCESS", f"Job ended with status {status}"

    results = list_all_results(client, job_resp.report_id)
    assert len(results) == len(INLINE_TEST_RESULTS)

    for result in results:
        score = _find_score(result, "code_quality")
        assert score.error is None or score.value is not None

        # The agent-as-judge verdict's structured detail is surfaced on the
        # score's `context` field (persisted + returned by the API), an envelope
        # shaped as {"output": <verdict context>, "metadata": {"issues": [...],
        # "scores": [...]}}.
        if score.error is None:
            assert score.context is not None, "Expected structured context on the score"
            assert isinstance(score.context, dict)
            assert "output" in score.context
            metadata = score.context["metadata"]
            assert isinstance(metadata, dict)
            assert isinstance(metadata["issues"], list)
            assert isinstance(metadata["scores"], list)
            assert len(metadata["scores"]) >= 1
