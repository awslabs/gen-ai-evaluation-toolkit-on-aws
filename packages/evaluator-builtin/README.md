# Evaluator Built-in

Getting-started examples showing how to use the [Evaluator SDK](../evaluator-sdk/README.md) to build and run evaluations.

## Quick Start

```bash
# Install dependencies
nx install evaluator-builtin

# Run the example evaluation locally (no ETK API needed)
uv run python -m evaluator_builtin
```

This runs the example app and scorer against sample testcases entirely in-process using `local_only=True` — no deployed ETK instance required.

## How It Works

An evaluation has three pieces — see [`example.py`](src/evaluator_builtin/example.py) for the full, annotated code:

1. **Define your app** — any callable that takes an input dict and returns an output dict.
   ```python
   def my_app(input_data):
       return {"text": f"Response: {input_data['text']}"}
   ```

2. **Define your scorer(s)** — a function that compares output to expected and returns a score (0.0–1.0) or a `ScoreResult`.
   ```python
   from evaluator_sdk import ScoreResult

   def exact_match(*, test_result):
       match = (test_result.output or {}).get("text") == (test_result.expected or {}).get("text")
       return ScoreResult(value=1.0 if match else 0.0, reason="Exact match" if match else "Mismatch")
   ```

3. **Wire them together** — create an `Evaluator` with `local_only=True`, pass in testcases, and call `evaluate()`.
   ```python
   from evaluator_sdk import Evaluator

   evaluator = Evaluator(
       name="my-evaluator",
       app_invoke=my_app,
       scorers={"exact_match": exact_match},
       local_only=True,
   )

   response = evaluator.evaluate(
       testcases=[
           {"input": {"text": "Hello"}, "expected": {"text": "Response: Hello"}},
       ],
   )

   for result in response.results:
       print(result.scores)
   ```

## Built-in App Invocations

The `evaluator_builtin.app_invoke` module ships ready-made `app_invoke` callables for common targets:

- `bedrock_converse_app_invoke` — single-shot Bedrock Converse call. Reads `BEDROCK_MODEL_ID` and `AWS_REGION` from the environment.
- `agentcore_app_invoke(agent_arn, ...)` — invokes an agent deployed on Amazon Bedrock AgentCore Runtime, propagates a W3C traceparent per turn, and fetches OTEL spans from CloudWatch. Supports single-turn (`{"text": "..."}`) and multi-turn (`{"turns": ["...", "..."]}`) inputs with session id preserved across turns. Output shape (`session_spans`, `trace_id(s)`, `session_id`, `tool_calls`) matches what `AgentCoreScorer` expects.

```python
from evaluator_builtin.app_invoke import agentcore_app_invoke
from evaluator_builtin.scorers.agentcore import AgentCoreScorer
from evaluator_sdk import Evaluator

evaluator = Evaluator(
    name="agentcore-eval",
    app_invoke=agentcore_app_invoke(
        agent_arn="arn:aws:bedrock-agentcore:us-east-2:...:runtime/agent-xxx",
        region="us-east-2",
    ),
    scorers=[AgentCoreScorer],
    local_only=True,
)

response = evaluator.evaluate(
    testcases=[{"input": {"text": "What are the specs for tablets?"}}],
    scorers={"agentcore": {
        "params": {"region": "us-east-1"},  # AgentCore Evaluations preview region
        "scores": {"Builtin.Correctness": None, "Builtin.ToolSelectionAccuracy": None},
    }},
)
```

See [`examples/agentcore_full_eval.py`](examples/agentcore_full_eval.py) for a runnable end-to-end example with positive and adversarial test cases, and [`examples/agentcore_live_test.py`](examples/agentcore_live_test.py) for a span-dump smoke test.

For unit tests or offline replay, pass `fetch_spans=False` to skip the CloudWatch round trip.

## Built-in Scorers

### LLM-as-Judge Scorer

The LLM-as-Judge scorer (`evaluator_builtin.scorers.llm_as_judge`) accepts model configuration via `params`:

- `model_id` — Bedrock model ID for LLM evaluation (default: `global.amazon.nova-2-lite-v1:0`)
- `model_args` — Inference-tuning arguments passed to the Bedrock model. Only the
  following allowlisted parameters are forwarded to `ChatBedrockConverse`; any other
  key is rejected with a validation error. This restriction prevents configuration
  injection attacks where an attacker who controls the scorer config could otherwise
  inject security-sensitive constructor arguments such as `endpoint_url`,
  `credentials_provider`, `aws_access_key_id`, `client`, or `config`.
  - `temperature` — Controls randomness (0.0–1.0, lower = more consistent)
  - `top_p` — Controls diversity via nucleus sampling (0.0–1.0)
  - `top_k` — Restricts sampling to the top K tokens
  - `max_tokens` — Maximum tokens in response (default: 4000)
  - `stop_sequences` — Sequences that stop generation
  - `additional_model_request_fields` — Model-specific request fields
  - `additional_model_response_field_paths` — Paths into model-specific response fields
  - `performance_config` — Bedrock performance configuration
  - `request_metadata` — Metadata attached to the request
  - `guardrail_config` — Bedrock guardrail configuration
  - `disable_streaming` — Disable streaming responses

### RAGAS Scorer

The RAGAS scorer (`evaluator_builtin.scorers.ragas`) supports multi-turn agentic evaluations. For expected tool calls, it accepts both:

- `reference_tool_calls` — standard RAGAS field name
- `toolCalls` — field name used by test cases created via the GTG (Generate Test Cases) plugin

This allows test cases generated by the GTG plugin to be evaluated directly with RAGAS without field renaming.

### DeepEval Scorer

The DeepEval scorer (`evaluator_builtin.scorers.deepeval`, scorer name `deepeval`) wraps [DeepEval](https://deepeval.com/) metrics. Supported metrics are defined in `packages/evaluator-builtin/src/evaluator_builtin/scorers/deepeval.py` — request any of them by name as the score name. At the time of writing these are:

- **Single-turn**: `answer_relevancy`, `faithfulness`, `contextual_precision`, `contextual_recall`, `contextual_relevancy`, `hallucination`, `bias`, `toxicity`, `summarization`, `json_correctness`, `prompt_alignment`, `exact_match`, `pattern_match`, `task_completion`, `tool_correctness`, `mcp_use`, `argument_correctness`, `misuse`, `non_advice`, `pii_leakage`, `plan_adherence`, `plan_quality`, `role_violation`, `step_efficiency`.
- **Multi-turn conversational**: `conversation_completeness`, `turn_relevancy`, `goal_accuracy`, `knowledge_retention`, `role_adherence`, `tool_use`, `topic_adherence`, `mcp_task_completion`, `multi_turn_mcp_use`, `turn_contextual_precision`, `turn_contextual_recall`, `turn_contextual_relevancy`, `turn_faithfulness`.

The judge LLM runs on Amazon Bedrock, configured via `params`:

- `model_id` — Bedrock model ID for the judge (default: `us.amazon.nova-lite-v1:0`).
- `region` — AWS region for Bedrock.
- Any other key is forwarded verbatim to the underlying DeepEval metric constructor (for example, `prompt_alignment` needs `prompt_instructions`; `pattern_match` needs `pattern`). Unknown or missing kwargs surface as an error on the score result.

The scorer returns each metric's raw score (0.0–1.0) plus DeepEval's reason; it does not expose a pass/fail threshold. `exact_match` and `pattern_match` are deterministic and use no LLM.

## Connecting to a Deployed ETK Instance

Once your evaluator logic works locally, switch to a deployed instance by replacing `local_only=True` with an API endpoint:

```python
evaluator = Evaluator(
    name="my-evaluator",
    api_endpoint="https://your-etk-api.example.com",
    app_invoke=my_app,
    scorers={"exact_match": exact_match},
    region="eu-west-2",
)
```

Results will then be persisted to the ETK API (reports, jobs, scores).

## Development

```bash
nx test evaluator-builtin    # Run tests
nx check evaluator-builtin   # Lint + type check
```
