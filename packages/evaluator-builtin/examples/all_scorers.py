"""Example: Run all scorers (LLM-as-Judge, RAGAS, DeepEval) together.

Demonstrates single-turn and multi-turn evaluation using all three scoring
frameworks side by side, with results logged to MLflow via the deployed ETK API.

Usage:
    cd packages/evaluator-builtin

    # Uses ETK_API_ENDPOINT env var
    uv run python examples/all_scorers.py

    # Or pass endpoint explicitly
    uv run python examples/all_scorers.py --api-endpoint https://xxx.execute-api.eu-west-2.amazonaws.com

    # Custom experiment name
    uv run python examples/all_scorers.py -e my-experiment
"""

from __future__ import annotations

import logging
import os
import sys

from evaluator_sdk import Evaluator

from evaluator_builtin.scorers.deepeval import DeepEvalScorer
from evaluator_builtin.scorers.llm_as_judge import LlmAsJudgeScorer
from evaluator_builtin.scorers.ragas import RagasScorer

logging.basicConfig(level=logging.WARNING, format="%(levelname)s %(name)s: %(message)s")
logging.getLogger("evaluator_builtin").setLevel(logging.INFO)
logger = logging.getLogger(__name__)

# =============================================================================
# Test Data
# =============================================================================

# ETK single-turn schema. Each concept has one canonical field; the only field
# that differs between scorers is the prompt: DeepEval reads `input.text` while
# RAGAS reads `input.user_input` (LLM-as-Judge reads the whole input/output).
SINGLE_TURN_TESTCASES = [
    {
        "input": {
            "text": "What is the capital of France?",  # DeepEval
            "user_input": "What is the capital of France?",  # RAGAS
            "retrieved_contexts": [
                "Paris is the capital and most populous city of France.",
                "France is a country in Western Europe.",
            ],
        },
        "output": {
            "response": "The capital of France is Paris.",
        },
        "expected": {
            "reference": "Paris",
        },
    },
    {
        "input": {
            "text": "What is photosynthesis?",  # DeepEval
            "user_input": "What is photosynthesis?",  # RAGAS
            "retrieved_contexts": [
                "Photosynthesis is the process by which green plants use sunlight to synthesize nutrients from carbon dioxide and water.",
            ],
        },
        "output": {
            "response": "Photosynthesis is the process by which plants convert sunlight into energy, producing oxygen as a byproduct.",
        },
        "expected": {
            "reference": "Photosynthesis is the process plants use to convert light energy into chemical energy.",
        },
    },
]

MULTI_TURN_TESTCASES = [
    {
        "input": {
            "messages": [
                {"type": "human", "content": "What's the weather in London?"},
            ],
        },
        "output": {
            "messages": [
                {"type": "human", "content": "What's the weather in London?"},
                {
                    "type": "ai",
                    "content": "I'll check the weather for you.",
                    "tool_calls": [{"name": "get_weather", "args": {"city": "London"}}],
                },
                {"type": "tool", "content": "Temperature: 15°C, Conditions: Cloudy"},
                {"type": "ai", "content": "The weather in London is currently 15°C and cloudy."},
            ],
        },
        "expected": {
            "reference": "The weather in London is 15°C and cloudy.",
            "reference_tool_calls": [{"name": "get_weather", "args": {"city": "London"}}],
            "reference_topics": ["weather", "London"],
        },
    },
    {
        "input": {
            "messages": [
                {"type": "human", "content": "Book me a flight to Paris next Monday."},
            ],
        },
        "output": {
            "messages": [
                {"type": "human", "content": "Book me a flight to Paris next Monday."},
                {
                    "type": "ai",
                    "content": "Let me search for available flights.",
                    "tool_calls": [{"name": "search_flights", "args": {"destination": "Paris", "date": "next Monday"}}],
                },
                {"type": "tool", "content": "Found 3 flights: BA304 at 09:00 ($250), AF1234 at 11:30 ($180), EZ456 at 14:00 ($120)"},
                {
                    "type": "ai",
                    "content": "I found 3 flights to Paris next Monday:\n1. BA304 at 09:00 - $250\n2. AF1234 at 11:30 - $180\n3. EZ456 at 14:00 - $120\n\nWould you like me to book one of these?",
                },
                {"type": "human", "content": "Book the cheapest one please."},
                {
                    "type": "ai",
                    "content": "I'll book EZ456 for you.",
                    "tool_calls": [{"name": "book_flight", "args": {"flight_id": "EZ456"}}],
                },
                {"type": "tool", "content": "Booking confirmed: EZ456, Paris, next Monday 14:00. Confirmation: XYZ789"},
                {"type": "ai", "content": "Done! I've booked flight EZ456 to Paris next Monday at 14:00. Your confirmation code is XYZ789."},
            ],
        },
        "expected": {
            "reference": "Book the cheapest flight to Paris and provide confirmation.",
            "reference_tool_calls": [
                {"name": "search_flights", "args": {"destination": "Paris", "date": "next Monday"}},
                {"name": "book_flight", "args": {"flight_id": "EZ456"}},
            ],
            "reference_topics": ["flights", "booking", "Paris"],
        },
    },
]

# =============================================================================
# Scorer configurations
# =============================================================================

SINGLE_TURN_SCORERS = {
    "llm_as_judge": {
        "params": {"model_id": "amazon.nova-lite-v1:0"},
        "scores": {
            "sample": None,
            "toxicity": None,
        },
    },
    "ragas": {
        "params": {"model_id": "amazon.nova-micro-v1:0"},
        "scores": {
            "answer_relevancy": None,
            "faithfulness": None,
            "answer_accuracy": None,
        },
    },
    "deepeval": {
        "params": {"model_id": "us.amazon.nova-lite-v1:0", "region": "us-east-1"},
        "scores": {
            "answer_relevancy": None,
            "faithfulness": None,
            "hallucination": None,
            "bias": None,
            "toxicity": None,
            "contextual_relevancy": None,
        },
    },
}

MULTI_TURN_SCORERS = {
    "llm_as_judge": {
        "params": {"model_id": "amazon.nova-lite-v1:0"},
        "scores": {
            "sample": None,
            "tool_use": None,
        },
    },
    "ragas": {
        "params": {"model_id": "amazon.nova-micro-v1:0"},
        "scores": {
            "topic_adherence": None,
            "tool_call_accuracy": None,
            "agent_goal_accuracy_with_reference": None,
        },
    },
    "deepeval": {
        "params": {"model_id": "us.amazon.nova-lite-v1:0", "region": "us-east-1"},
        "scores": {
            "conversation_completeness": None,
            "turn_relevancy": None,
            "knowledge_retention": None,
        },
    },
}


# =============================================================================
# Runner
# =============================================================================


def print_results(resp, label: str) -> None:
    """Pretty-print evaluation results."""
    print(f"\n{'='*80}")
    print(f" {label}")
    print(f"{'='*80}")

    for i, result in enumerate(resp.results):
        print(f"\n--- Test Case {i + 1} ---")
        for score_name, sr in sorted(result.scores.items()):
            if sr.error:
                status = f"ERROR: {sr.error}"
            elif sr.value is not None:
                status = f"{sr.value:.3f}"
                if sr.reason:
                    status += f"  ({sr.reason[:80]}{'...' if len(sr.reason or '') > 80 else ''})"
            else:
                status = "N/A"
            print(f"  {score_name:50s} {status}")


def run_single_turn(api_endpoint: str, region: str, experiment_name: str) -> bool:
    """Run all single-turn scorers together."""
    print("\nRunning single-turn evaluation with LLM-as-Judge + RAGAS + DeepEval...")
    evaluator = Evaluator(
        name="all-scorers-single-turn",
        api_endpoint=api_endpoint,
        region=region,
        scorers=[LlmAsJudgeScorer, RagasScorer, DeepEvalScorer],
    )

    exp_name = f"{experiment_name}-single-turn"
    resp = evaluator.score(
        testcases=SINGLE_TURN_TESTCASES,
        scorers=SINGLE_TURN_SCORERS,
        experiment_name=exp_name,
        return_results=True,
    )

    print_results(resp, "SINGLE-TURN RESULTS")
    print(f"\n  MLflow experiment: {exp_name}")
    print(f"  Report ID: {resp.report_id}")

    # Check for failures
    errors = []
    for i, result in enumerate(resp.results):
        for name, sr in result.scores.items():
            if sr.error:
                errors.append(f"  TC{i+1} {name}: {sr.error}")
    return len(errors) == 0


def run_multi_turn(api_endpoint: str, region: str, experiment_name: str) -> bool:
    """Run all multi-turn scorers together."""
    print("\nRunning multi-turn evaluation with LLM-as-Judge + RAGAS + DeepEval...")
    evaluator = Evaluator(
        name="all-scorers-multi-turn",
        api_endpoint=api_endpoint,
        region=region,
        scorers=[LlmAsJudgeScorer, RagasScorer, DeepEvalScorer],
    )

    exp_name = f"{experiment_name}-multi-turn"
    resp = evaluator.score(
        testcases=MULTI_TURN_TESTCASES,
        scorers=MULTI_TURN_SCORERS,
        experiment_name=exp_name,
        return_results=True,
    )

    print_results(resp, "MULTI-TURN RESULTS")
    print(f"\n  MLflow experiment: {exp_name}")
    print(f"  Report ID: {resp.report_id}")

    # Check for failures
    errors = []
    for i, result in enumerate(resp.results):
        for name, sr in result.scores.items():
            if sr.error:
                errors.append(f"  TC{i+1} {name}: {sr.error}")
    return len(errors) == 0


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="Run all scorers example with MLflow logging")
    parser.add_argument(
        "--experiment", "-e",
        default="all-scorers-demo",
        help="MLflow experiment name prefix (default: all-scorers-demo)",
    )
    parser.add_argument(
        "--api-endpoint",
        default=os.environ.get("ETK_API_ENDPOINT"),
        help="ETK API endpoint. Also reads ETK_API_ENDPOINT env var.",
    )
    parser.add_argument(
        "--region",
        default=os.environ.get("AWS_REGION", "eu-west-2"),
        help="AWS region (default: eu-west-2)",
    )
    args = parser.parse_args()

    if not args.api_endpoint:
        print("ERROR: --api-endpoint is required (or set ETK_API_ENDPOINT env var)", file=sys.stderr)
        sys.exit(1)

    print("=" * 80)
    print(" All Scorers Example: LLM-as-Judge + RAGAS + DeepEval")
    print("=" * 80)
    print(f"  API endpoint: {args.api_endpoint}")
    print(f"  Region: {args.region}")
    print(f"  MLflow experiments: {args.experiment}-single-turn, {args.experiment}-multi-turn")

    single_ok = run_single_turn(args.api_endpoint, args.region, args.experiment)
    multi_ok = run_multi_turn(args.api_endpoint, args.region, args.experiment)

    print(f"\n{'='*80}")
    print(" SUMMARY")
    print(f"{'='*80}")
    print(f"  Single-turn: {'PASS' if single_ok else 'SOME ERRORS (see above)'}")
    print(f"  Multi-turn:  {'PASS' if multi_ok else 'SOME ERRORS (see above)'}")

    if not (single_ok and multi_ok):
        sys.exit(1)


if __name__ == "__main__":
    main()
