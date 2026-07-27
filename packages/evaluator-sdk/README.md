# Evaluator SDK

Python SDK for building custom evaluators that integrate with the Gen AI Evaluation Toolkit.

## Installation

```bash
pip install awssolutions-gen-ai-evaluation-toolkit-evaluator-sdk
```

## Quick Start

```python
from evaluator_sdk import Evaluator, ScoreResult

def my_app(input_data):
    """Application invocation - process input, return output."""
    text = input_data.get("text", "")
    return {"text": f"Response: {text}"}

def my_scorer(*, test_result):
    """Custom scorer - return score between 0 and 1."""
    if test_result.expected is None:
        return 0.0
    return 1.0 if test_result.output.get("text") == test_result.expected.get("text") else 0.0

evaluator = Evaluator(
    name="my-evaluator",
    app_invoke=my_app,
    scorers={"exact_match": my_scorer},
    api_endpoint="https://your-etk-api.example.com",
)

response = evaluator.evaluate(
    testcases=[
        {"input": {"text": "Hello"}, "expected": {"text": "Response: Hello"}},
        {"input": {"text": "World"}, "expected": {"text": "Response: World"}},
    ],
)

print(f"Report: {response.report_id}")
print(f"Job: {response.job_id}")
for result in response.results:
    print(f"  scores: {result.scores}")
```

## AI Gateway Support

The SDK includes built-in support for routing LLM calls through the AI Gateway, an OAuth2-fronted LLM gateway (Bedrock Converse-compatible). When gateway environment variables are configured (automatically injected by CDK when `gatewayConfig` is provided), all built-in evaluators transparently route through the gateway for centralized cost tracking and budget enforcement.

### Public API

```python
from evaluator_sdk.gateway_client import (
    is_gateway_configured,
    get_gateway_bedrock_client,
    get_gateway_model_id,
)
```

- **`is_gateway_configured() -> bool`** — Returns `True` when all required gateway env vars are present (`AI_GATEWAY_ENDPOINT`, `AI_GATEWAY_TOKEN_ENDPOINT`, `AI_GATEWAY_CLIENT_ID`, `AI_GATEWAY_CLIENT_SECRET_ARN`). Set `AI_GATEWAY_SCOPE` if the gateway's IdP requires OAuth2 scopes on the token request (space-separated); omit otherwise.
- **`get_gateway_bedrock_client()`** — Returns a boto3 `bedrock-runtime` client pre-configured to route through the gateway with OAuth2 Bearer token injection.
- **`get_gateway_model_id() -> str`** — Returns the model name registered in the gateway (`AI_GATEWAY_MODEL_ID`).

### Usage in Custom Evaluators

Custom evaluators using `ChatBedrockConverse` or raw boto3 can opt into gateway routing:

```python
import boto3
from evaluator_sdk.gateway_client import (
    is_gateway_configured,
    get_gateway_bedrock_client,
    get_gateway_model_id,
)

def my_app(input_data):
    if is_gateway_configured():
        client = get_gateway_bedrock_client()
        model_id = get_gateway_model_id()
    else:
        client = boto3.client("bedrock-runtime")
        model_id = "anthropic.claude-3-sonnet-20240229-v1:0"

    response = client.converse(modelId=model_id, messages=[...])
    return response
```

> **Note:** Built-in evaluators (LLM-as-Judge, RAGAS, etc.) automatically use the gateway when configured — no code changes needed. Custom evaluators deployed via `setupEvalLambdaPlugin` also inherit gateway environment variables automatically.

### Model Override Behavior

When the gateway is configured, `AI_GATEWAY_MODEL_ID` (the model registered in the gateway) takes precedence over the model specified in evaluator configuration. This ensures all calls are routed through the gateway's registered model for accurate cost attribution.

## Evaluator

The `Evaluator` class is the main entry point. It handles report creation, job submission, running your app and scorers, and recording results.

```python
evaluator = Evaluator(
    name="my-evaluator",             # Evaluator name (registered in ETK)
    api_endpoint="https://...",      # ETK API endpoint
    app_invoke=my_app,               # Optional: function to invoke your app
    scorers={"name": scorer_fn},     # Optional: dict of scorer name → implementation
    region="us-east-1",              # AWS region (default: us-east-1)
    batch_size=40,                   # Results per API batch (default: 40)
)
```

## Running an Evaluation

Call `evaluate()` with testcases to run the full pipeline:

```python
response = evaluator.evaluate(
    testcases=[                      # List of InlineTestCase or plain dicts
        {"input": {"q": "2+2"}, "expected": {"answer": "4"}},
    ],
    scorers={"exact_match": None},   # Optional: filter/configure which scorers run
    experiment_name="my-experiment", # Optional: name for the report
)
```

The pipeline:
1. Creates a report (using `experiment_name` or an auto-generated name)
2. Submits a job
3. For each testcase: runs `app_invoke` (if set), then runs scorers
4. Batches results to the API
5. Returns an `EvaluationResponse` with `report_id`, `job_id`, and `results`

### Evaluating a filtered dataset subset

Use `annotation_filter` with `dataset_id` to evaluate only test cases matching an annotation condition:

```python
response = evaluator.evaluate(
    dataset_id="my-dataset-id",
    annotation_filter={
        "condition": {
            "stringEnumCondition": {
                "name": "QUALITY_TIER", "value": "HIGH", "comparator": "=",
            }
        }
    },
    scorers={"llm_as_judge": None},
    experiment_name="high-quality-only",
)
```

Supported filter operators: `=`, `!=` for string enums; `=`, `!=`, `<`, `<=`, `>`, `>=` for numeric annotations. Logical operators: `and`, `or`, `not`.

## Scorers

Scorers are functions or classes that evaluate the quality of your app's output. Each scorer receives a single `test_result` object carrying everything about the test case that was run — `input`, `output`, `expected`, `context`, `metadata`, `app_metrics`, and `error`. Read whatever fields you need off it. Scoring configuration (`params`) is passed as a separate argument.

### Function Scorers

The simplest scorer is a function that returns a `float`:

```python
def exact_match(*, test_result):
    """Return 1.0 if output matches expected, else 0.0."""
    if test_result.expected is None:
        return 0.0
    return 1.0 if test_result.output == test_result.expected else 0.0
```

Available keyword arguments: `test_result` and `params`. You only need to include the ones you use:

```python
# Minimal — only needs test_result
def length_scorer(*, test_result):
    return min(len(str(test_result.output)), 100) / 100

# With params — receives config from scorer config
def threshold_scorer(*, test_result, params):
    threshold = (params or {}).get("threshold", 0.5)
    return 1.0 if (test_result.output or {}).get("confidence", 0) >= threshold else 0.0
```

### Returning ScoreResult

For richer output, return a `ScoreResult` instead of a float. This lets you include a reason or report an error:

```python
from evaluator_sdk import ScoreResult

def quality_scorer(*, test_result):
    output = test_result.output or {}
    if "error" in output:
        return ScoreResult(error="Output contains an error")
    score = compute_quality(output)
    return ScoreResult(value=score, reason=f"Quality based on {len(output)} fields")
```

### Returning Structured Context

Beyond `value`/`reason`, a `ScoreResult` can carry a free-form `context` dict for
machine-readable detail — e.g. a per-requirement breakdown. It is persisted and
returned by the API (as `ScoreOutput.context`), so consumers can parse it:

```python
def requirements_scorer(*, test_result):
    reqs = [
        {"id": "REQ-1", "score": 1.0, "passed": True},
        {"id": "REQ-2", "score": 0.0, "passed": False},
    ]
    overall = sum(r["score"] for r in reqs) / len(reqs)
    return ScoreResult(
        value=overall,
        reason="2 requirements evaluated; 1 passed",
        context={"requirements": reqs},
    )
```

Reading it back from a test result (e.g. via the Python client):

```python
score = result.scores["requirements_scorer"]
print(score.value)                      # 0.5
for req in score.context["requirements"]:
    print(req["id"], req["score"])
```

### Plugin Scorers (Scorer ABC)

For scorers that produce multiple sub-scores, subclass `Scorer`:

```python
from evaluator_sdk import Scorer, ScoreResult

class MyScorer(Scorer):
    available_scores = {"faithfulness": None, "relevance": {"mode": "strict"}}

    def score(self, *, test_result, scores=None, params=None):
        return {
            "faithfulness": 0.9,
            "relevance": ScoreResult(value=0.7, reason="Partially relevant"),
        }

evaluator = Evaluator(
    name="my-evaluator",
    scorers={"quality": MyScorer()},
    api_endpoint="https://...",
)
```

### Scorer Configuration

The `scorers` parameter on `evaluate()` filters and configures which scorers run:

```python
response = evaluator.evaluate(
    testcases=[...],
    scorers={
        "exact_match": None,                    # Run with defaults
        "quality": {                            # Plugin scorer config
            "params": {"model_id": "nova"},     # Top-level params
            "scores": {                         # Filter sub-scores
                "faithfulness": None,
                "relevance": {"mode": "precision"},
            },
        },
    },
)
```

- `None` — run the scorer with defaults
- Dict with `params` — pass parameters to the scorer
- Dict with `scores` — filter/configure sub-scores (plugin scorers only)
- Omitting `scorers` entirely runs all registered scorers with defaults

## Error Handling

The SDK captures errors at each level without failing the entire job:

- **App invoke failure**: error is recorded on the individual result, scorers are skipped, job continues
- **Scorer failure**: error is recorded on that score (`ScoreResult` with `error` set, `value=None`), other scorers continue
- **Top-level failure** (e.g., API error): entire job is marked as `FAILED`, raises `EvaluatorError`

```python
from evaluator_sdk import EvaluatorError

try:
    response = evaluator.evaluate(testcases=[...])
except EvaluatorError as e:
    print(f"Job failed: {e}")

# Individual errors are on the results
for result in response.results:
    if result.error:
        print(f"App invoke failed: {result.error}")
    for name, sr in result.scores.items():
        if sr.error:
            print(f"Scorer {name} failed: {sr.error}")
```

## Function Signatures

### App Invoke

```python
def my_app(input_data: dict[str, Any]) -> dict[str, Any]:
    """
    Args:
        input_data: Input from the testcase (e.g., {"text": "Hello"})

    Returns:
        Output dict (e.g., {"text": "Response: Hello"})
    """
    ...
```

For common invocation targets, the [`evaluator-builtin`](../evaluator-builtin) package ships ready-made `app_invoke` callables: `bedrock_converse_app_invoke` for single-shot Bedrock Converse, and `agentcore_app_invoke(agent_arn, ...)` for agents on Amazon Bedrock AgentCore Runtime (handles traceparent propagation, multi-turn session reuse, and CloudWatch span capture).

### Scorer Function

```python
def my_scorer(
    *,
    test_result: TestResult,
    params: dict[str, Any] | None = None,
) -> float | ScoreResult:
    """
    Keyword args (include only what you need):
        test_result: The test case that was run — carries input, output,
            expected, context, metadata, app_metrics, and error.
        params: Configuration passed via scorer config

    Returns:
        float (0.0–1.0) or ScoreResult with value, error, and/or reason
    """
    ...
```
