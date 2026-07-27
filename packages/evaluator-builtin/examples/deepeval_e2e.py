"""DeepEval + RAGAS Scorer — ETK Integration Demo.

Demonstrates running DeepEval and RAGAS metrics over the same RAG test cases
through ETK's evaluation pipeline with MLflow tracking.

Scenario: A RAG-powered product assistant answering customer questions.
We evaluate response quality with DeepEval (answer relevancy, faithfulness,
toxicity, bias) and RAGAS (faithfulness).

Test-case schema. Each concept has one canonical field; the only field that
differs between the two scorers is the prompt:
    input.text                -> DeepEval prompt
    input.user_input          -> RAGAS prompt
    input.retrieved_contexts  -> RAG context documents (shared)
    output.response           -> the model's answer (shared)

Requirements:
- AWS credentials with Bedrock access
- ETK_API_ENDPOINT and ETK_AWS_REGION env vars

Usage:
    cd packages/evaluator-builtin
    uv run python examples/deepeval_e2e.py
"""

import os

from evaluator_sdk import Evaluator

from evaluator_builtin.scorers.deepeval import DeepEvalScorer
from evaluator_builtin.scorers.ragas import RagasScorer

# Bedrock model exposed as an inference profile (the "us." prefix). On-demand
# model IDs such as "amazon.nova-micro-v1:0" are rejected by Converse, so both
# scorers are pointed at this profile.
MODEL_ID = "us.amazon.nova-lite-v1:0"

# --- Test cases: RAG-style Q&A with context ---
# input.text (DeepEval) and input.user_input (RAGAS) carry the same question;
# retrieved_contexts and response are shared by both scorers.
test_cases = [
    {
        "input": {
            "text": "What is Acme Corp's return policy?",
            "user_input": "What is Acme Corp's return policy?",
            "retrieved_contexts": [
                "Acme Corp offers a 30-day no-questions-asked return policy on all products.",
                "Returns must include the original packaging and receipt.",
                "Refunds are processed within 5 business days.",
            ],
        },
        "output": {
            "response": (
                "Acme Corp has a 30-day return policy. You can return any product "
                "within 30 days with the original packaging and receipt. "
                "Refunds are processed within 5 business days."
            ),
        },
    },
    {
        "input": {
            "text": "Does Acme Corp ship internationally?",
            "user_input": "Does Acme Corp ship internationally?",
            "retrieved_contexts": [
                "Acme Corp ships to over 50 countries worldwide.",
                "International shipping takes 7-14 business days.",
                "Free shipping on orders over $100 for domestic customers.",
            ],
        },
        "output": {
            "response": (
                "Yes, Acme Corp ships internationally to over 50 countries. "
                "International orders typically arrive within 7-14 business days."
            ),
        },
    },
    {
        "input": {
            "text": "What payment methods does Acme accept?",
            "user_input": "What payment methods does Acme accept?",
            "retrieved_contexts": [
                "Acme Corp accepts Visa, Mastercard, and American Express.",
                "PayPal and Apple Pay are also supported.",
                "Installment plans available for orders over $500.",
            ],
        },
        "output": {
            "response": (
                "Acme accepts Visa, Mastercard, American Express, PayPal, and Apple Pay. "
                "For orders over $500, installment plans are available."
            ),
        },
    },
]

# --- Run evaluation ---
evaluator = Evaluator(
    name="deepeval-quality",
    api_endpoint=os.environ["ETK_API_ENDPOINT"],
    region=os.environ.get("ETK_AWS_REGION", "eu-west-2"),
    scorers=[DeepEvalScorer, RagasScorer],
)

print("Running DeepEval + RAGAS quality evaluation...")
print("  DeepEval: answer_relevancy, faithfulness, toxicity, bias")
print("  RAGAS:    faithfulness")
print(f"  Test cases: {len(test_cases)}")
print()

response = evaluator.score(
    testcases=test_cases,
    scorers={
        "deepeval": {
            "params": {"model_id": MODEL_ID, "region": "us-east-1"},
            "scores": {
                "answer_relevancy": None,
                "faithfulness": None,
                "toxicity": None,
                "bias": None,
            },
        },
        "ragas": {
            "params": {"model_id": MODEL_ID},
            "scores": {
                "faithfulness": None,
            },
        },
    },
    experiment_name="deepeval-product-assistant",
)

# --- Results ---
print(f"\nReport: {response.report_id}")
response.print_summary()
print()
for i, r in enumerate(response.results):
    question = (r.input_data.get("text") or "")[:60]
    print(f"[{i+1}] {question}")
    for name, sr in sorted(r.scores.items()):
        status = f"{sr.value:.2f}" if sr.value is not None else f"ERROR: {sr.error}"
        print(f"     {name}: {status}")
    print()
