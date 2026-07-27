"""E2E smoke test for SDK-driven remote-only evaluation.

Drives the SDK's score() against the deployed, remote-only agent-as-judge
evaluator using per-call evaluatorName routing. This is the path a user could
previously only reach via the raw API/CLI. Exercises real EventBridge routing,
the isolated agent-as-judge Lambda, real Bedrock, and score-in-place.

Run with: pytest -m e2e tests/e2e/test_remote_routing_e2e.py
Requires a deployed stack (agent-as-judge evaluator present) + AWS creds.
"""


import pytest
from awssolutions_gen_ai_evaluation_toolkit_python_client.api import DefaultApi  # type: ignore[attr-defined]

from evaluator_sdk import Evaluator

pytestmark = pytest.mark.e2e

# Evaluators registered by the CDK (external-plugins stack).
AGENT_AS_JUDGE = "agent-as-judge"
BUILTIN = "builtin"

# DeepEval scorer (hosted by the builtin evaluator) params — matches the deployed
# builtin Lambda's expected config.
DEEPEVAL_PARAMS = {"model_id": "us.amazon.nova-lite-v1:0", "region": "us-east-1"}

# A single self-contained test case: input + output to judge. No S3 artifacts or
# requirement docs, so the evaluator relies solely on the inline description.
TESTCASES = [
    {
        "input": {"question": "What is the capital of France?"},
        "output": {"answer": "The capital of France is Paris."},
        "expected": {"answer": "Paris"},
    },
]


def test_score_remote_agent_as_judge(client: DefaultApi) -> None:
    """score() routes the agent-as-judge scorer to the deployed worker via
    evaluatorName. The SDK submits remotely, waits for the job, and returns
    scored results — no local scorer implementation involved.

    The agent-as-judge worker registers a single dynamic scorer named
    ``agent_as_judge``. Its ``scores`` map holds per-evaluator definitions
    (score name -> Evaluator, given as score_params). Sub-scores are surfaced
    on results as ``{scorer}.{score_name}`` — here ``agent_as_judge.correctness``.
    """
    # Path evaluator has no local scorer — routing is entirely via evaluatorName.
    driver = Evaluator(name="sdk-e2e-driver", scorers=[], client=client)

    resp = driver.score(
        testcases=TESTCASES,
        scorers={
            "agent_as_judge": {
                "evaluatorName": AGENT_AS_JUDGE,
                # Each entry in `scores` is an evaluator definition; the key is
                # the score name, the value carries the Evaluator's fields.
                "scores": {
                    "correctness": {
                        "description": (
                            "Judge whether the answer correctly and clearly states "
                            "that the capital of France is Paris. Score 1.0 if fully "
                            "correct, 0.0 if incorrect."
                        ),
                    },
                },
            },
        },
    )

    assert resp.total_results == 1
    result = resp.results[0]
    # The remote worker wrote a sub-score for our evaluator. The dynamic scorer
    # surfaces it under a key containing the score name ("correctness").
    matching = [k for k in result.scores if "correctness" in k]
    assert matching, f"no correctness score; scores present: {list(result.scores)}"
    score = result.scores[matching[0]]
    # Tolerate a reported error, but a real score must be a number in [0, 1].
    if score.error is None:
        assert score.value is not None
        assert 0.0 <= score.value <= 1.0


def test_score_remote_multiple_evaluators(client: DefaultApi) -> None:
    """score(testcases=...) routes two scorers to two DIFFERENT deployed
    evaluators — agent-as-judge and the builtin (DeepEval) — which score the same
    pre-written results in parallel. Exercises the skipPrimaryTask ASL path (no
    primary task, parallel score fan-out) end-to-end on real infrastructure."""
    driver = Evaluator(name="sdk-e2e-driver-multi", scorers=[], client=client)

    # DeepEval relevancy/faithfulness need context to ground against.
    testcases = [
        {
            "input": {
                "text": "What is the capital of France?",
                "context": [
                    "Paris is the capital and most populous city of France.",
                    "France is a country in Western Europe.",
                ],
            },
            "output": {"text": "The capital of France is Paris."},
            "expected": {"text": "Paris"},
        },
    ]

    resp = driver.score(
        testcases=testcases,
        scorers={
            # Scorer 1 -> agent-as-judge worker.
            "agent_as_judge": {
                "evaluatorName": AGENT_AS_JUDGE,
                "scores": {
                    "correctness": {
                        "description": "Does the answer correctly state the capital is Paris?",
                    },
                },
            },
            # Scorer 2 -> builtin worker (DeepEval).
            "deepeval": {
                "evaluatorName": BUILTIN,
                "params": DEEPEVAL_PARAMS,
                "scores": {"answer_relevancy": None, "toxicity": None},
            },
        },
    )

    assert resp.total_results == 1
    scores = resp.results[0].scores
    keys = list(scores)
    # Both evaluators wrote scores onto the same result.
    assert any("correctness" in k for k in keys), f"no agent-as-judge score: {keys}"
    assert any("answer_relevancy" in k or "toxicity" in k for k in keys), (
        f"no deepeval score: {keys}"
    )
    # Every real (non-errored) score must be a number in [0, 1].
    for sr in scores.values():
        if sr.error is None:
            assert sr.value is not None
            assert 0.0 <= sr.value <= 1.0
