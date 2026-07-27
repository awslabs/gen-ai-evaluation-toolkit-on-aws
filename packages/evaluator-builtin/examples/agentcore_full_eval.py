"""Full end-to-end AgentCore evaluation: invoke + multi-scorer.

Runs three test cases against a deployed AgentCore agent and scores the
results with three frameworks side by side:
  - AgentCore Evaluations (Bedrock) over the agent's traces,
  - RAGAS agent metrics (tool-call accuracy, goal accuracy),
  - DeepEval over the agent's final text response (answer relevancy, toxicity).
The agent invocation and scoring run client-side, while the report and results
are persisted to the deployed ETK API under an experiment so they show up in
ETK / MLflow.

Usage:
    cd packages/evaluator-builtin
    export AGENTCORE_AGENT_ARN="arn:aws:bedrock-agentcore:<region>:<account>:runtime/agent-<id>"
    export ETK_API_ENDPOINT="https://<id>.execute-api.<region>.amazonaws.com/prod/"
    export AGENT_REGION="<region>"         # optional, defaults to the ARN's region
    export SCORER_REGION="us-east-1"       # optional, must be a preview region
    export ETK_EXPERIMENT_NAME="..."       # optional, defaults to agentcore-multi-scorer-demo
    uv run python examples/agentcore_full_eval.py
"""

from __future__ import annotations

import json
import logging
import os
import sys
from dataclasses import dataclass

from evaluator_sdk import Evaluator

from evaluator_builtin.app_invoke import agentcore_app_invoke
from evaluator_builtin.scorers.agentcore import AgentCoreScorer
from evaluator_builtin.scorers.deepeval import DeepEvalScorer
from evaluator_builtin.scorers.ragas import RagasScorer

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")

# AgentCore Evaluations is preview-only in us-east-1, us-west-2, ap-southeast-2, eu-central-1.
DEFAULT_SCORER_REGION = "us-east-1"


@dataclass(frozen=True)
class AgentConfig:
    arn: str
    agent_region: str
    scorer_region: str
    api_endpoint: str
    api_region: str
    experiment_name: str


def _die(msg: str) -> None:
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(1)


def parse_agent_config() -> AgentConfig:
    arn = os.environ.get("AGENTCORE_AGENT_ARN")
    if not arn:
        _die(
            "set AGENTCORE_AGENT_ARN to your deployed agent ARN, e.g.\n"
            '  export AGENTCORE_AGENT_ARN="arn:aws:bedrock-agentcore:us-east-1:'
            '123456789012:runtime/agent-xxxxxxxx"'
        )
    parts = arn.split(":")  # type: ignore[union-attr]
    if len(parts) < 6:
        _die(f"malformed ARN {arn!r}")

    api_endpoint = os.environ.get("ETK_API_ENDPOINT")
    if not api_endpoint:
        _die(
            "set ETK_API_ENDPOINT to your deployed ETK REST API endpoint "
            "(see SSM /genai-etk/restApiEndpoint)"
        )

    return AgentConfig(
        arn=arn,  # type: ignore[arg-type]
        agent_region=os.environ.get("AGENT_REGION") or parts[3],
        scorer_region=os.environ.get("SCORER_REGION", DEFAULT_SCORER_REGION),
        api_endpoint=api_endpoint,  # type: ignore[arg-type]
        # Region used to SigV4-sign ETK API calls — must match where ETK is
        # deployed (the endpoint's region), not the scorer/agent regions.
        api_region=os.environ.get("ETK_AWS_REGION", "eu-west-2"),
        experiment_name=os.environ.get("ETK_EXPERIMENT_NAME", "agentcore-multi-scorer-demo"),
    )


def _print_result(index: int, result: object) -> None:
    label = (result.metadata or {}).get("label", f"case {index}")  # type: ignore[attr-defined]
    print(f"\n[{index}] {label}")
    print(f"  input : {result.input_data.get('text')!r}")  # type: ignore[attr-defined]
    output_text = (result.output or {}).get("text", "")  # type: ignore[attr-defined]
    truncated = output_text[:140] + ("..." if len(output_text) > 140 else "")
    print(f"  output: {truncated!r}")
    tool_calls = (result.output or {}).get("tool_calls") or []  # type: ignore[attr-defined]
    print(f"  tool_calls: {json.dumps(tool_calls)}")
    if result.error:  # type: ignore[attr-defined]
        print(f"  ERROR: {result.error}")  # type: ignore[attr-defined]
    for name, sr in result.scores.items():  # type: ignore[attr-defined]
        if sr.error:
            print(f"    {name:55s} ERROR: {sr.error}")
        else:
            reason = f"  ({sr.reason})" if sr.reason else ""
            print(f"    {name:55s} {sr.value}{reason}")


def print_results(response: object) -> None:
    print("\n" + "=" * 72)
    print("Results")
    print("=" * 72)
    for i, result in enumerate(response.results or []):  # type: ignore[attr-defined]
        _print_result(i, result)
    print("\n" + "=" * 72)
    response.print_summary()  # type: ignore[attr-defined]


TESTCASES = [
    {
        "input": {"text": "What are the specs for tablets?"},
        "expected": {
            "reference": (
                "Tablets feature 10-12 inch displays, all-day battery life, and "
                "support stylus input."
            ),
            "reference_tool_calls": [
                {"name": "get_product_info", "args": {"product_type": "tablets"}},
            ],
        },
        "metadata": {"label": "positive: product-info tool call expected"},
    },
    {
        "input": {"text": "What is your return policy for laptops?"},
        "expected": {
            "reference": (
                "Laptops can be returned within 30 days of delivery in original "
                "condition with all packaging."
            ),
            "reference_tool_calls": [
                {"name": "get_return_policy", "args": {"product_category": "laptops"}},
            ],
        },
        "metadata": {"label": "positive: return-policy tool call expected"},
    },
    {
        "input": {"text": "What are the specs for smartphones?"},
        "expected": {
            "reference": (
                "Smartphones feature 6-7 inch OLED displays, multi-lens cameras, "
                "and fast charging."
            ),
            "reference_tool_calls": [
                {"name": "get_product_info", "args": {"product_type": "smartphones"}},
            ],
        },
        "metadata": {"label": "positive: product-info tool call expected"},
    },
]


def main() -> None:
    config = parse_agent_config()

    evaluator = Evaluator(
        name="agentcore-live-eval",
        api_endpoint=config.api_endpoint,
        region=config.api_region,
        app_invoke=agentcore_app_invoke(
            config.arn,
            region=config.agent_region,
            fetch_spans=True,
            cloudwatch_wait_seconds=15,
            cloudwatch_retries=3,
        ),
        scorers=[AgentCoreScorer, RagasScorer, DeepEvalScorer],
    )

    response = evaluator.evaluate(
        testcases=TESTCASES,
        experiment_name=config.experiment_name,
        scorers={
            "agentcore": {
                "params": {"region": config.scorer_region},
                "scores": {
                    "Builtin.Correctness": None,
                    "Builtin.Helpfulness": None,
                    "Builtin.GoalSuccessRate": None,
                },
            },
            "ragas": {
                # On-demand model IDs (e.g. amazon.nova-micro-v1:0) are rejected by
                # Converse; point RAGAS at an inference profile (the "us." prefix).
                "params": {"model_id": "us.amazon.nova-lite-v1:0"},
                "scores": {
                    "tool_call_accuracy": None,
                },
            },
            # DeepEval scores the agent's final text response (output.response,
            # which agentcore_app_invoke now emits). answer_relevancy needs only
            # the prompt + response; toxicity is a safety check on the response.
            "deepeval": {
                "params": {"model_id": "us.amazon.nova-lite-v1:0", "region": config.scorer_region},
                "scores": {
                    "answer_relevancy": None,
                    "toxicity": None,
                },
            },
        },
    )

    print(f"\nReport: {response.report_id}  (experiment: {config.experiment_name})")
    print_results(response)


if __name__ == "__main__":
    main()
