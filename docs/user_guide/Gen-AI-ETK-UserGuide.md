# What is Gen AI Evaluation Toolkit?

Gen AI Evaluation Toolkit on AWS (Gen AI ETK) is an enterprise-grade, cloud-native accelerator for comprehensive evaluation of generative AI applications, deployed and operated in your own AWS account. It provides end-to-end capabilities including test case generation, metrics-based and LLM-based quality assessments, and visualization of experiment results.

You interact with Gen AI ETK through a command-line interface (CLI) or programmatically through generated [TypeScript](../sdk/typescript-client.md) and [Python](../sdk/python-client.md) clients. All three interfaces communicate with the same REST API.

If you need to deploy Gen AI ETK, see the [Solution Guide](../solution_guide/Gen-AI-ETK-SolutionGuide.md). This User Guide assumes the toolkit is already deployed in your AWS account.

# Getting started

## Prerequisites

Before using Gen AI ETK, ensure you have:

- Gen AI ETK deployed in your AWS account (see the [Solution Guide](../solution_guide/Gen-AI-ETK-SolutionGuide.md)).
- Node.js v20 or later: verify with `node --version`.
- AWS credentials with the following permissions:
  - `execute-api:Invoke` on the deployed API Gateway.
  - `sagemaker:CreatePresignedMlflowTrackingServerUrl` for experiment UI access.
  - See [Setup AWS credentials in Node.js](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/setting-credentials-node.html) and [API Gateway IAM authentication](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-control-access-using-iam-policies-to-invoke-api.html).
- Amazon Bedrock model access in your deployment region. The scorers and generation plugins use the following models by default (all configurable):
  - `amazon.nova-micro-v1:0` and `amazon.titan-embed-text-v2:0` (RAGAS scorer)
  - `global.amazon.nova-2-lite-v1:0` (LLM-as-Judge scorer)
  - `global.anthropic.claude-haiku-4-5-20251001-v1:0` (RAG generation plugin)
  - `anthropic.claude-sonnet-4-5-20250929-v1:0` (Agentic generation plugin)
  - Check available models with `aws bedrock list-foundation-models`. To request access, see [Manage access to Amazon Bedrock foundation models](https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html).
- Amazon Bedrock AgentCore access: Required for the AgentCore scorer. Regional availability is subject to change; consult the [official AWS documentation](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/agentcore-regions.html) for supported regions.

## Install the CLI

The CLI is distributed as part of the Gen AI ETK source code and is not published to a public npm registry. To install it, you need access to the built CLI package. Your administrator may provide this as an npm tarball, or you can build it from source:

```bash
# From the repo root, after running mise run codegen and nx build cli:
cd packages/cli
npm run dev:link
```

Verify the installation:

```bash
genai-etk --help
```

> To uninstall the CLI later, run `npm run dev:unlink` from the `packages/cli` directory.

## Configuration

Set the API Gateway URL as an environment variable:

```bash
export GEN_AI_ETK_API_URL="https://<your-api-id>.execute-api.<region>.amazonaws.com/prod"
```

You can find this URL in the AWS API Gateway console under Stages → Invoke URL, or in the CDK deployment output.

The CLI uses the standard AWS SDK credential chain. Configure credentials through any supported method: credentials file, environment variables, IAM roles, or AWS SSO profiles.

## Security and encryption (KMS)

If your deployment uses a customer-managed KMS key, no additional CLI configuration is required. The server-side encryption is handled transparently by the AWS services. See the Solution Guide for details on configuring customer-managed KMS keys during deployment.

# Core concepts

## Datasets and test cases

A **dataset** is a named collection of test cases. Datasets support versioning: creating a version takes a snapshot of the current test cases, allowing you to track changes over time and run evaluations against specific versions.

A **test case** represents a single evaluation input. It contains:

- **input** (required): The prompt or question to evaluate. Supports structured data including prompts, context, and parameters.
- **expected** (optional): The expected output for comparison. Supports structured data including simple text responses, expected tool calls, expected topics, or any combination of expected behaviors for agentic applications.
- **context** (optional): Additional context for the test case. Can contain reference documents for RAG evaluation, metadata such as flags indicating human review needed, artifacts providing evidence for agent-as-judge evaluation, or any other structured data needed for evaluation.
- **conversationHistory** (optional): Prior conversation turns for multi-turn evaluation.
- **metadata** (optional): Arbitrary key-value pairs for categorization and filtering.

**Annotations** are structured labels applied to test cases or dataset versions using annotation schemas. They support collaborative curation and ground truth management.

## Evaluations and metrics

An **evaluation job** runs one or more scorers against test data on a named evaluator. A job specifies:

- The **evaluator name** — the evaluator worker (Lambda) that executes the job, for example `builtin`, which hosts all built-in scorers.
- The **test data** (`testCases`) — either a reference to a dataset in the datastore (`datasetId`, optional `datasetVersion`, optional annotation `filter`) or inline test cases embedded in the request.
- The **scorers** — a map of scorer name to configuration. Each scorer config has optional `params` (scorer-wide settings such as the judge model) and `scores` (the individual metrics/sub-scores to compute).
- An optional **app** configuration — selects and parameterizes the `app_invoke` function that calls your application under test.

Jobs come in three types: **FULL** (invoke the app on each test case, then score the outputs), **SCORE** (score outputs that already exist), and **APP_INVOKE** (invoke the app and record outputs without scoring). Each job produces per-test-case results with metric scores, stored in a report. Scorer configurations can also be saved once as a named, versioned **evaluation configuration** and referenced on submission with `--config` (see [Stored configurations](#stored-configurations-and-the---config-flag)).

Built-in scorers (all run inside the `evaluator-builtin` Lambda):

- **RAGAS** (`ragas`): RAG-specific metrics including faithfulness, answer relevancy, and context recall. Default models: `amazon.nova-micro-v1:0` (LLM) and `amazon.titan-embed-text-v2:0` (embeddings). Configurable through `model_id` and `embeddings_id` scorer params.
- **LLM-as-Judge** (`llm_as_judge`): LLM-based assessment using Amazon Bedrock. Built-in sub-scores for toxicity, tool use, and sample. Custom sub-scores defined by description. Default model: `global.amazon.nova-2-lite-v1:0`. Configurable through `model_id` scorer param.
- **AgentCore** (`agentcore`): Evaluates agentic systems using Amazon Bedrock AgentCore Evaluations. Processes OpenTelemetry trace data using built-in evaluators (Builtin.GoalSuccessRate, Builtin.Correctness, Builtin.ToolSelectionAccuracy, Builtin.Helpfulness, etc.) and custom evaluators. Regional availability is subject to change; see [AWS documentation](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/agentcore-regions.html).
- **DeepEval** (`deepeval`): Comprehensive evaluation metrics for LLMs. Provides 37 metrics in total — for example answer relevancy, faithfulness, bias, toxicity, and hallucination (single-turn), plus conversation completeness, turn relevancy, and knowledge retention (multi-turn). See the [full metric reference](#single-turn-metrics) below for all supported metrics. Supports both single-turn and multi-turn evaluation. Default model: `us.amazon.nova-lite-v1:0`. Configurable through `model_id` and `region` scorer params.

**FMEval** scorer (`evaluator-fmeval`; not deployed by default):

- **FMEval** (`fmeval`): Foundation model evaluation metrics using the [Foundation Model Evaluations Library](https://github.com/aws/fmeval). See `packages/evaluator-fmeval/README.md` for details.

**PyRIT** scorer (`evaluator-pyrit`; not deployed by default):

- **PyRIT** (`pyrit`): Automated adversarial red-teaming for LLM applications using [The Python Risk Identification Tool for generative AI](https://github.com/microsoft/PyRIT) library. See the [PyRIT evaluator reference](../sdk/evaluator-pyrit.md).

**Agent-as-Judge** scorer (runs in its own dedicated `evaluator-agent-as-judge` Lambda):

- **Agent-as-Judge** (`agent-as-judge`): Agentic evaluation using an OpenCode agent. Launches a judge agent per evaluator that actively explores test case artifacts and optional S3-hosted requirement documents before producing a structured verdict. Ships with a `requirements_compliance` built-in evaluator that derives an explicit per-requirement checklist with evidence citations. Default model: `global.anthropic.claude-sonnet-4-6`. Configurable through `agentModel` and `agentTemperature` params. Unlike the other built-in scorers, the Agent-as-Judge Lambda runs in network-isolated subnets with no public-internet egress and enforces an unconditional runtime airgap assertion at every cold start. `app_invoke` is not supported. See `packages/evaluator-agent-as-judge/README.md` for the full configuration schema, network-isolation details, supported models, and environment variables (`LOG_LEVEL`, `SUBPROCESS_TIMEOUT_MINUTES`).

## Experiments

An **experiment** groups related evaluation runs for comparison. Each evaluation run is logged as an MLflow run under the experiment, capturing:

- **Metrics**: Aggregated evaluation scores from all scorers.
- **Parameters**: The evaluation configuration used.
- **Artifacts**: Per-test-case results for detailed analysis.

Use the MLflow UI to visualize and compare runs across experiments.

## Generation

**Generation** creates synthetic test cases from source documents. A generation configuration specifies source documents in S3 and a pipeline of generation plugins to execute sequentially.

The default pipeline is: RAG Generator (creates QA pairs from documents, default model: `global.anthropic.claude-haiku-4-5-20251001-v1:0`) → LLM-as-Judge (filters for quality, default model: `global.anthropic.claude-haiku-4-5-20251001-v1:0`) → DataStore Export (writes results to a dataset). All models are configurable through the plugin configuration.

## Plugins

Evaluator plugins (formerly "plugins") are Lambda functions that perform evaluation or generation work. ETK orchestrates them via Step Functions and EventBridge:

1. The workflow publishes a task event to EventBridge containing the evaluator configuration and dataset reference.
2. The evaluator Lambda receives the event, processes the test cases, and writes results to DynamoDB via the ETK API.
3. Step Functions enforces a heartbeat timeout (default: 300s, configurable per-job via `heartbeatSeconds`). The evaluator must send heartbeat signals within this interval or the workflow marks the task as failed.
4. For large datasets, evaluators use CONTINUE checkpointing to persist progress and resume across invocations, avoiding Lambda timeout limits.

You reference evaluators by name in your configuration; ETK routes to the correct Lambda. See the "Custom evaluators" section for details on building your own.

# Evaluation workflows

## Managing datasets

```bash
# Create a dataset (returns the generated dataset ID — use it in all subsequent commands)
genai-etk dataset create --name "my-dataset" --description "RAG evaluation test cases"

# List datasets
genai-etk dataset list

# Get dataset details
genai-etk dataset get --dataset-id "<dataset-id>"

# Create a test case (simple text values)
genai-etk dataset create-test-case --dataset-id "<dataset-id>" \
  --input "What is Amazon S3?" \
  --expected "Amazon S3 is an object storage service."

# Create a test case with structured data (use the --input-json/--expected-json/--context-json
# variants to pass JSON documents; --input-file etc. read the JSON from a local file)
genai-etk dataset create-test-case --dataset-id "<dataset-id>" \
  --input-json '{"prompt": "Book a flight to Seattle for next Monday"}' \
  --expected-json '{
    "toolCalls": [{"name": "search_flights", "arguments": {"destination": "Seattle"}}],
    "expectedTopics": ["flight booking", "travel"]
  }' \
  --context-json '{"requiresHumanReview": false, "evaluationHints": {"checkToolSequence": true}}' \
  --metadata-json '{"source": "manual", "split": "smoke"}'

# Get a test case (--version defaults to 'head'; a number or 'latest' also works)
genai-etk dataset get-test-case --dataset-id "<dataset-id>" --test-case-id "<test-case-id>"

# List test cases
genai-etk dataset list-test-cases --dataset-id "<dataset-id>"

# Create a dataset version (snapshot of the current test cases; the version number is assigned automatically)
genai-etk dataset create-version --dataset-id "<dataset-id>"

# List versions
genai-etk dataset list-versions --dataset-id "<dataset-id>"

# Get a specific version ('latest' and a version number are both accepted)
genai-etk dataset get-version --dataset-id "<dataset-id>" --version latest
```

### Annotations

```bash
# Create a string-enum annotation schema (repeat --enum-value for each allowed value)
genai-etk dataset create-annotation-schema --name "quality-labels" \
  --description "Manual quality review labels" \
  --enum-value "HIGH" --enum-value "MEDIUM" --enum-value "LOW"

# Create a numeric annotation schema
genai-etk dataset create-annotation-schema --name "review-score" \
  --description "Reviewer score" --number-value

# Apply an annotation to a test case (--string-value for enum schemas, --numeric-value for numeric ones)
genai-etk dataset put-testcase-annotation --dataset-id "<dataset-id>" \
  --test-case-id "<test-case-id>" --name "quality-labels" --string-value "HIGH" \
  --comment "Verified by SME"

# Apply an annotation to a dataset version
genai-etk dataset put-version-annotation --dataset-id "<dataset-id>" \
  --version 1 --name "quality-labels" --string-value "HIGH"
```

### Filtering test cases by annotation in evaluations

Annotations can be used to filter which test cases are included in an evaluation job. Pass a `filter` inside the dataset reference:

```bash
# Evaluate only HIGH-quality test cases
genai-etk eval job submit --evaluator-name "builtin" \
  --test-cases-json '{
    "dataset": {
      "datasetId": "my-dataset",
      "datasetVersion": "1",
      "filter": {
        "condition": {
          "stringEnumCondition": {"name": "quality-labels", "value": "HIGH", "comparator": "="}
        }
      }
    }
  }' \
  --scorers-json '{"llm_as_judge": null}'

# Compound filter: HIGH OR MEDIUM
genai-etk eval job submit --evaluator-name "builtin" \
  --test-cases-file ./filtered-eval.json \
  --scorers-file ./scorers.json
```

Where `filtered-eval.json`:
```json
{
  "dataset": {
    "datasetId": "my-dataset",
    "filter": {
      "or": [
        {"condition": {"stringEnumCondition": {"name": "quality-labels", "value": "HIGH", "comparator": "="}}},
        {"condition": {"stringEnumCondition": {"name": "quality-labels", "value": "MEDIUM", "comparator": "="}}}
      ]
    }
  }
}
```

Supported filter operators: `=`, `!=` for string enums; `=`, `!=`, `<`, `<=`, `>`, `>=` for numeric annotations. Logical operators: `and`, `or`, `not`.

## Configuring evaluations

An evaluation is configured directly on the job submission. Every submission names an **evaluator** (`--evaluator-name`, typically `builtin`), provides **test data** (`--test-cases-json` / `--test-cases-file`), and — for jobs that score — a **scorers** map (`--scorers-json` / `--scorers-file`). There are three job types, each with its own submit command (see [Running evaluations](#running-evaluations)): `eval job submit` (FULL: invoke app, then score), `eval job submit-scoring` (SCORE: score existing outputs), and `eval job submit-invoke` (APP_INVOKE: invoke app only, no scoring).

### Test data: dataset reference or inline

The `testCases` value is either a reference to a dataset in the datastore or inline test cases:

```jsonc
// Reference a dataset (datasetVersion defaults to 'head'; filter is an optional annotation filter)
{
  "dataset": {
    "datasetId": "<dataset-id>",
    "datasetVersion": "1",
    "filter": {
      "condition": {"stringEnumCondition": {"name": "quality-labels", "value": "HIGH", "comparator": "="}}
    }
  }
}

// Inline test cases directly in the request
{
  "inline": [
    {"input": {"question": "What is 2+2?"}, "expected": {"answer": "4"}}
  ]
}
```

### Scorers

The `scorers` value maps scorer name → configuration. Each scorer config has optional `params` (scorer-wide settings, such as the judge model) and `scores` (the individual metrics to compute; a `null` value means "use defaults"). A `null` value for the whole scorer runs it with all defaults.

Here is a full submission using the RAGAS scorer:

```bash
genai-etk eval job submit --evaluator-name "builtin" \
  --test-cases-json '{"dataset": {"datasetId": "<dataset-id>", "datasetVersion": "1"}}' \
  --scorers-json '{
    "ragas": {
      "params": {
        "model_id": "amazon.nova-micro-v1:0",
        "embeddings_id": "amazon.titan-embed-text-v2:0"
      },
      "scores": {
        "faithfulness": null,
        "answer_relevancy": null,
        "context_recall": null
      }
    }
  }'
```

RAGAS single-turn metrics: `answer_relevancy`, `answer_accuracy` (context optional), `response_groundedness`, `faithfulness`, `context_relevancy`, `context_precision`, `context_recall` (require context). Multi-turn agentic metrics: `topic_adherence`, `tool_call_accuracy`, `agent_goal_accuracy`, `agent_goal_accuracy_with_reference` (multi-turn is inferred automatically when `input` or `output` contains a `messages` key).

Here is the LLM-as-Judge scorer with a mix of built-in scores (`toxicity`, `tool_use`, `sample` — pass `null`) and custom scores (defined by a `description`):

```json
{
  "llm_as_judge": {
    "params": {
      "model_id": "global.amazon.nova-2-lite-v1:0",
      "model_args": {"temperature": 0.1, "max_tokens": 4000}
    },
    "scores": {
      "toxicity": null,
      "helpfulness": {
        "description": "Evaluates whether the response is helpful and addresses the user's question. Score of 1 means very helpful, score of 0 means not helpful."
      }
    }
  }
}
```

`model_args` accepts only an allowlisted set of inference-tuning parameters — `temperature`, `top_p`, `top_k`, `max_tokens`, `stop_sequences`, `additional_model_request_fields`, `additional_model_response_field_paths`, `performance_config`, `request_metadata`, `guardrail_config`, and `disable_streaming`. Any other key is rejected with a validation error.

Here is the AgentCore scorer. Each score key is an AgentCore evaluator ID — built-in evaluators (`Builtin.GoalSuccessRate`, `Builtin.Correctness`, `Builtin.ToolSelectionAccuracy`, etc.) take `null`; custom evaluators must specify their evaluation `level` (`session`, `trace`, or `tool`). Test results must contain OpenTelemetry trace data in `output.session_spans` and `output.trace_id` (or `output.trace_ids`):

```json
{
  "agentcore": {
    "params": {"region": "us-east-1"},
    "scores": {
      "Builtin.GoalSuccessRate": null,
      "Builtin.Correctness": null,
      "Builtin.ToolSelectionAccuracy": null,
      "MyCustomEvaluator": {"level": "trace"}
    }
  }
}
```

Multiple scorers can be combined in one submission — for example `{"llm_as_judge": {...}, "ragas": {...}}` — and the same `scorers` map can be stored once as a named, versioned configuration and referenced with `--config` (and pinned with `--config-version`) instead of being passed inline on every submit. See [Stored configurations and the `--config` flag](#stored-configurations-and-the---config-flag).

### DeepEval

DeepEval is a built-in scorer in the `evaluator-builtin` evaluator. The examples below show the `scorers` configuration only — it plugs into a job submission exactly like the RAGAS and LLM-as-Judge examples above.

Here is an example using the DeepEval scorer for single-turn quality evaluation:

```json
{
  "deepeval": {
    "params": {
      "model_id": "us.amazon.nova-lite-v1:0",
      "region": "us-east-1"
    },
    "scores": {
      "answer_relevancy": null,
      "faithfulness": null,
      "toxicity": null,
      "bias": null,
      "hallucination": null
    }
  }
}
```

DeepEval also supports multi-turn conversational metrics. When test cases include an `output.messages` field with the conversation transcript, conversational metrics can be used:

```json
{
  "deepeval": {
    "params": {
      "model_id": "us.amazon.nova-lite-v1:0",
      "region": "us-east-1"
    },
    "scores": {
      "conversation_completeness": null,
      "turn_relevancy": null,
      "knowledge_retention": null
    }
  }
}
```

#### Common parameters

All DeepEval metrics accept these `params`:

| Param | Default | Description |
|-------|---------|-------------|
| `model_id` | `us.amazon.nova-lite-v1:0` | Bedrock model ID used as the evaluation LLM. Ignored by `exact_match` and `pattern_match`, which do not call an LLM. |
| `region` | (boto3 default) | AWS region for the Bedrock model. |

Each metric returns a raw score in `[0.0, 1.0]` along with a reason. The scorer does not expose a pass/fail threshold — apply your own threshold downstream if you need a pass/fail decision.

#### Single-turn metrics

Single-turn metrics read the following test-case fields (each concept has exactly one field name — there are no aliases):

| Test-case field | Type | Required | Used for |
|-----------------|------|----------|----------|
| `input.text` | str | **Yes** | The prompt. Missing/empty raises an error. |
| `output.response` | str | **Yes** | The response being scored. Missing/empty raises an error. |
| `input.retrieved_contexts` | list[str] | Only for context-based metrics | Retrieval/ground-truth documents (used by `faithfulness`, `hallucination`, `contextual_*`, `summarization`). |
| `expected.reference` | str | Only for reference-based metrics | Ground-truth answer (e.g. `contextual_recall`, `exact_match`). |
| `output.tool_calls` | list[obj] | Only for tool metrics | Tools the model called, as `{"name", "args", "output"}` (used by `tool_correctness`, `mcp_use`, `argument_correctness`). |
| `expected.tools` | list[obj] | Only for `tool_correctness` | Expected tool calls, same shape as `output.tool_calls`. |

| `score_name` | Description | Required params | Optional params |
|--------------|-------------|-----------------|-----------------|
| `answer_relevancy` | How relevant the response is to the prompt. | — | — |
| `faithfulness` | Whether the response is grounded in the retrieval context. | — | — |
| `contextual_precision` | Ranking quality of relevant nodes in the retrieval context. | — | — |
| `contextual_recall` | Coverage of the expected answer by the retrieval context. | — | — |
| `contextual_relevancy` | Overall relevance of the retrieval context to the prompt. | — | — |
| `hallucination` | Degree to which the response contradicts the provided context. | — | — |
| `bias` | Presence of biased content in the response. | — | — |
| `toxicity` | Presence of toxic content in the response. | — | — |
| `summarization` | Quality of a summary against the source text. | — | `n`, `assessment_questions`, `truths_extraction_limit` |
| `json_correctness` | Whether the response conforms to an expected JSON schema. | `expected_schema` (dict) | — |
| `prompt_alignment` | Whether the response follows explicit prompt instructions. | `prompt_instructions` (list[str]) | — |
| `exact_match` | Exact string match of response vs. expected (no LLM). | — | — |
| `pattern_match` | Regex match of the response (no LLM). | `pattern` (str) | `ignore_case` (bool) |
| `task_completion` | Whether the agent completed the requested task. | — | `task` |
| `tool_correctness` | Whether the correct tools were called. | — | `available_tools`, `should_exact_match`, `should_consider_ordering` |
| `mcp_use` | Correctness of MCP tool usage. | — | — |
| `argument_correctness` | Correctness of tool-call arguments. | — | — |
| `misuse` | Detection of out-of-domain / misuse responses. | `domain` (str) | — |
| `non_advice` | Detection of disallowed advice categories. | `advice_types` (list[str]) | — |
| `pii_leakage` | Detection of PII leakage in the response. | — | — |
| `plan_adherence` | Whether the agent adhered to its plan. | — | — |
| `plan_quality` | Quality of the agent's plan. | — | — |
| `role_violation` | Detection of responses that break an assigned role. | `role` (str) | — |
| `step_efficiency` | Efficiency of the agent's steps toward the goal. | — | — |

#### Multi-turn (conversational) metrics

Conversational metrics read the following test-case fields:

| Test-case field | Type | Required | Used for |
|-----------------|------|----------|----------|
| `output.messages` | list[obj] | **Yes** | The conversation transcript: `{"type": "human"\|"ai"\|"tool", "content": str, "tool_calls": [...]}`. A `tool` message's content is merged into the preceding assistant turn's matching tool call. Empty raises an error. |
| `input.scenario` | str | No | Scenario description (e.g. `conversation_completeness`). |
| `input.chatbot_role` | str | No | The assistant's assigned role (e.g. `role_adherence`). |
| `input.retrieved_contexts` | list[str] | No | Context documents for the conversation. |
| `expected.expected_outcome` | str | No | The expected conversation outcome. |

| `score_name` | Description | Required params | Optional params |
|--------------|-------------|-----------------|-----------------|
| `conversation_completeness` | Whether the conversation fulfilled the user's intentions. | — | — |
| `turn_relevancy` | Relevance of each turn within the conversation. | — | — |
| `goal_accuracy` | Whether the conversation achieved its goal. | — | — |
| `knowledge_retention` | Whether the assistant retained information across turns. | — | — |
| `role_adherence` | Whether the assistant stayed in its assigned role. | — | — |
| `tool_use` | Quality of tool usage across the conversation. | `available_tools` (list[str]) | — |
| `topic_adherence` | Whether the conversation stayed on the relevant topics. | `relevant_topics` (list[str]) | — |
| `mcp_task_completion` | Task completion for MCP-based conversations. | — | — |
| `multi_turn_mcp_use` | Correctness of MCP tool usage across turns. | — | — |
| `turn_contextual_precision` | Per-turn contextual precision. | — | `window_size` |
| `turn_contextual_recall` | Per-turn contextual recall. | — | `window_size` |
| `turn_contextual_relevancy` | Per-turn contextual relevancy. | — | `window_size` |
| `turn_faithfulness` | Per-turn faithfulness to context. | — | `window_size`, `truths_extraction_limit`, `penalize_ambiguous_claims` |

Required params are supplied per scorer via the `params` block (or per score via `score_params`); a metric that is missing a required param returns an error result rather than failing the whole job.

### Agent-as-Judge

Agent-as-Judge is a dedicated evaluator (`evaluator-agent-as-judge`) that runs independently of the builtin evaluator. Unlike the builtin scorers, it is **scoring-only** — it does not support `app_invoke`. Submit scoring jobs directly using `eval job submit-scoring` (or `eval job submit-scoring` with a `sourceReportId` to re-score results from a previous job).

Each entry under `scores` is keyed by the evaluator/score name and is either a custom evaluator (with a `description`) or a built-in evaluator (with `builtIn`). Agent-level settings (`agentModel`, `agentTemperature`) go in `params`. Field names accept both camelCase (`requirementDocs`) and snake_case (`requirement_docs`).

```bash
genai-etk eval job submit-scoring \
  --evaluator-name "agent-as-judge" \
  --test-results-json '[{"input": {"submission": "..."}, "output": {}}]' \
  --scorers-json '{
    "agent_as_judge": {
      "scores": {
        "code_quality": {
          "description": "Evaluate the code quality of the submitted Python module. Score 1.0 if the code is clean, well-documented, and follows PEP 8. Score 0.0 if the code is unreadable or broken.",
          "requirementDocs": [
            { "bucketName": "<your-etk-data-bucket>", "prefix": "evaluation/agent-as-judge/coding-standards/" }
          ]
        },
        "requirements_compliance": {
          "builtIn": "requirements_compliance",
          "requirementDocs": [
            { "bucketName": "<your-etk-data-bucket>", "prefix": "evaluation/agent-as-judge/requirements/" }
          ]
        }
      },
      "params": {
        "agentModel": "global.anthropic.claude-sonnet-4-6",
        "agentTemperature": 0.1
      }
    }
  }'
```

> **Where to put requirement docs and artifacts.** The Agent-as-Judge evaluator reads `requirementDocs` (and `context.artifacts`) from S3, and the permissions that govern which locations it can read are fully flexible — you can scope the evaluator's role to whatever buckets and prefixes your requirements and use cases call for. The `deployment` package is simply how we deploy the toolkit ourselves and a reference example for setting it up. If you deploy that reference stack as-is, the evaluator's role is granted read access only to the `evaluation/agent-as-judge/` prefix of the ETK data bucket — so requirement docs and artifacts must live under `s3://<your-etk-data-bucket>/evaluation/agent-as-judge/...` or the evaluator gets `AccessDenied`. To read from a different bucket or prefix, extend the evaluator's IAM policy accordingly.

Score results are keyed as `agent_as_judge.<evaluator-name>` (e.g. `agent_as_judge.code_quality`, `agent_as_judge.requirements_compliance`).

To combine Agent-as-Judge with other scorers in a single multi-evaluator job, set `evaluatorName` on the scorer config to route it to the dedicated Lambda:

```json
{
  "evaluatorName": "builtin",
  "scorers": {
    "llm_as_judge": {
      "scores": { "toxicity": null }
    },
    "agent_as_judge": {
      "evaluatorName": "agent-as-judge",
      "scores": {
        "requirements_compliance": {
          "builtIn": "requirements_compliance",
          "requirementDocs": [{ "bucketName": "<your-etk-data-bucket>", "prefix": "evaluation/agent-as-judge/requirements/" }]
        }
      }
    }
  }
}
```

See `packages/evaluator-agent-as-judge/README.md` for the full configuration schema, built-in evaluators, and network isolation details.

### Stored configurations and the `--config` flag

Instead of passing `--scorers-json` (and optionally `--app`) on every submit, you can save an evaluation configuration to the configuration store (an S3-backed, versioned repository — separate from the datastore that holds datasets, reports, and results) once and reference it by name on subsequent jobs:

```bash
# 1. Author a config file (the body of an evaluationConfiguration: scorers + optional app)
cat > rag-baseline.json <<'EOF'
{
  "scorers": {
    "llm_as_judge": {
      "scores": {
        "correctness": {"description": "Evaluate whether the answer is factually correct"},
        "relevance":   {"description": "Is the answer relevant to the question?"}
      }
    },
    "ragas": {"scores": {"faithfulness": null}}
  },
  "app": {"name": "agentcore_app_invoke", "params": {"agent_arn": "arn:aws:bedrock-agentcore:us-east-1:123456789012:agent/my-agent"}}
}
EOF

# 2. Store it under a stable name
genai-etk eval config create --name "rag-baseline" --config-file ./rag-baseline.json

# 3. Reference it from any submit command
genai-etk eval job submit \
  --evaluator-name "builtin" \
  --config "rag-baseline" \
  --test-cases-json '{"dataset": {"datasetId": "my-dataset"}}'

# Update the stored config in place
genai-etk eval config update --name "rag-baseline" --config-file ./rag-baseline.json

# List or retrieve stored configs
genai-etk eval config list
genai-etk eval config get --name "rag-baseline"
```

The `--config <name>` flag is supported on `eval job submit`, `eval job submit-scoring`, and `eval job submit-invoke`. It populates `--scorers-json` (and `--app`, if not already supplied inline) from the stored config. Inline flags always win — anything you pass on the command line overrides the stored value.

#### Pinning to a specific config version

By default `--config <name>` resolves to the **latest** version. To pin a submission to an older version (e.g. you've since iterated the config but want to reproduce an earlier run), pass `--config-version <N>` alongside `--config`:

```bash
# Reproduce an earlier evaluation by pinning to version 3 of the stored config
genai-etk eval job submit \
  --evaluator-name "builtin" \
  --config "rag-baseline" \
  --config-version 3 \
  --test-cases-json '{"dataset": {"datasetId": "my-dataset"}}'
```

This mirrors `eval schedule create --config-version`, where scheduled jobs already pin to a specific version. `--config-version` requires `--config`; passing it alone is rejected.

## Running evaluations

There are three job submission commands, each for a different workflow:

| Command                   | What it does                                                   |
| ------------------------- | -------------------------------------------------------------- |
| `eval job submit`         | Full evaluation: invoke app on test cases, then score results  |
| `eval job submit-scoring` | Score-only: score test results that already have outputs       |
| `eval job submit-invoke`  | App invoke only: call your app and record outputs (no scoring) |

### Quick examples

```bash
# Full evaluation against a dataset
genai-etk eval job submit --evaluator-name "builtin" \
  --test-cases-json '{"dataset": {"datasetId": "my-dataset"}}' \
  --scorers-json '{"llm_as_judge": {"scores": {"correctness": {"description": "Evaluate whether the answer is factually correct"}}}}'

# Score-only (score results that already have outputs)
genai-etk eval job submit-scoring --evaluator-name "builtin" \
  --source-report-id "report-123" \
  --scorers-json '{"llm_as_judge": {"scores": {"correctness": {"description": "Evaluate whether the answer is factually correct"}}}}'

# App invoke only (no scoring)
genai-etk eval job submit-invoke --evaluator-name "builtin" \
  --test-cases-json '{"inline": [{"input": {"question": "Hello"}}]}'
```

### End-to-end workflow: full evaluation with inline test cases

```bash
# 1. Submit a full evaluation with inline test cases and multiple scorers
genai-etk eval job submit --evaluator-name "builtin" \
  --test-cases-json '{
    "inline": [
      {"input": {"question": "What is 2+2?"}, "expected": {"answer": "4"}},
      {"input": {"question": "Capital of France?"}, "expected": {"answer": "Paris"}}
    ]
  }' \
  --scorers-json '{
    "llm_as_judge": {
      "scores": {
        "correctness": {"description": "Evaluate whether the answer is factually correct"},
        "helpfulness": {"description": "Is the answer helpful?"}
      }
    }
  }' \
  --experiment-name "v2-baseline"

# 2. Monitor the job
genai-etk eval job list
genai-etk eval job get --job-id "eval-job-123"
```

### End-to-end workflow: report-driven evaluation with a stored config

When you want to re-use the same scorer setup across many runs and inspect individual results afterwards, combine `eval config`, `eval report`, and `eval result`:

```bash
# 1. Author and store a reusable config (scorers + optional app)
cat > rag-baseline.json <<'EOF'
{
  "scorers": {
    "llm_as_judge": {
      "scores": {
        "correctness": {"description": "Evaluate whether the answer is factually correct"}
      }
    }
  }
}
EOF
genai-etk eval config create --name "rag-baseline" --config-file ./rag-baseline.json

# 2. Submit a full evaluation against a dataset, referencing the stored config.
#    The job auto-creates a report and writes one TestResult per test case.
JOB_OUT=$(genai-etk eval job submit \
  --evaluator-name "builtin" \
  --config "rag-baseline" \
  --test-cases-json '{"dataset": {"datasetId": "my-dataset"}}' \
  --experiment-name "rag-baseline-2026-06")
JOB_ID=$(echo "$JOB_OUT" | sed -n 's/.*Job ID: \([a-z0-9-]*\).*/\1/p')

# 3. Watch the pipeline progress through stages: PENDING → INVOKING → SCORING → COMPLETE
#    (status tracks success/failure independently — see Job status values + Job stages below)
genai-etk eval job get --job-id "$JOB_ID"

# 4. Once the job is COMPLETE, find the report it wrote to and list its results
REPORT_ID=$(genai-etk eval job get --job-id "$JOB_ID" | sed -n 's/.*reportId: \([a-z0-9-]*\).*/\1/p')
genai-etk eval result list --report-id "$REPORT_ID"

# 5. Drill into a single result to see the input/output/expected/scores for one test case
genai-etk eval result get --report-id "$REPORT_ID" --result-id "<resultId from list>"

# 6. Re-score the same outputs later with a different scorer set, without re-running app_invoke,
#    by submitting a scoring-only job that copies results from the original report:
genai-etk eval config create --name "rag-strict" --config-file ./rag-strict.json
genai-etk eval job submit-scoring \
  --evaluator-name "builtin" \
  --config "rag-strict" \
  --source-report-id "$REPORT_ID"

# 7. When you are done with a report, delete it (this also deletes its results)
genai-etk eval report delete --report-id "$REPORT_ID"
```

> **Note on `eval report delete`.** Deleting a report cascades to its test results (the per-test-case scores attached to that report) but does **not** delete the underlying evaluation jobs. The job records remain queryable via `eval job get --job-id <id>` and `eval job list` for run history and debugging; only the report+results pair is removed.

You can substitute `eval result batch-create` in step 4 if you scored test cases outside ETK and want to upload them into a freshly created report (`eval report create`) for inspection alongside ETK-orchestrated runs.

### JSON parameter structures

**`--test-cases-json`** — either a dataset reference or inline test cases:

```jsonc
// Reference a dataset in the datastore
{"dataset": {"datasetId": "my-dataset", "datasetVersion": "1"}}

// Inline test cases directly
{"inline": [{"input": {...}, "expected": {...}}]}
```

**`--scorers-json`** — map of scorer name to config (null value = run with defaults):

```jsonc
{
  "llm_as_judge": {
    "scores": {
      "correctness": { "description": "Evaluate whether the answer is factually correct" },
      "relevance": { "description": "..." },
    },
  },
  "ragas": { "scores": { "faithfulness": null } },
}
```

**`--app`** — app invocation configuration (optional, for evaluators with multiple app_invoke functions):

```jsonc
{
  "name": "agentcore_app_invoke",
  "params": { "agent_arn": "arn:aws:bedrock-agentcore:us-east-1:123456789:agent/my-agent" },
}
```

Note: params are app-specific and passed directly to the app_invoke function. Not all functions accept params.

### Managing jobs

```bash
# List evaluation jobs
genai-etk eval job list

# Get job details
genai-etk eval job get --job-id "eval-job-123"
```

### Scheduled evaluations

Schedule evaluations to run automatically using cron expressions:

```bash
# Create a schedule (runs a FULL evaluation daily at 9 AM)
genai-etk eval schedule create \
  --cron "0 9 * * ? *" \
  --job-type "FULL" \
  --evaluator-name "builtin" \
  --test-cases-json '{"dataset": {"datasetId": "my-dataset"}}' \
  --scorers-json '{"llm_as_judge": {"scores": {"correctness": {"description": "Evaluate whether the answer is factually correct"}}}}'

# List schedules
genai-etk eval schedule list

# Get schedule details
genai-etk eval schedule get --name "daily-eval"

# Update a schedule's cron expression
genai-etk eval schedule update --name "daily-eval" --cron "0 10 * * ? *"

# Delete a schedule
genai-etk eval schedule delete --name "daily-eval"
```

### Managing reports

A **report** is a container for the test results produced by an evaluation. Every job creates a report automatically; the `eval report` commands let you inspect, list, or delete those containers (and create empty ones if you want to record results from an external workflow):

```bash
# Create a standalone report (most users won't need this — submit creates one for you)
genai-etk eval report create \
  --name "manual-2026-06-rerun" \
  --description "Hand-curated results from offline run" \
  --experiment-name "v2-baseline"

# List reports (paginated)
genai-etk eval report list

# Get a single report (includes status: ACTIVE | DELETING)
genai-etk eval report get --report-id "report-abc123"

# Delete a report and all results inside it
genai-etk eval report delete --report-id "report-abc123"
```

Reports group results under an `experimentName`, which is the same key used by the experimentation/MLflow workflow (see [Experimentation](#experimentation)).

### Managing results

A **test result** is one row inside a report — typically the input/output/expected for a single test case plus its scores. The `eval result` commands let you read individual results, list all results in a report, and bulk-write or delete results when integrating an external scoring workflow:

```bash
# Get a single result
genai-etk eval result get \
  --report-id "report-abc123" \
  --result-id "result-xyz789"

# List all results in a report (paginated)
genai-etk eval result list --report-id "report-abc123"

# Batch-create results (up to 25 per call). Useful when scoring outside ETK
# and uploading the results back into a report:
genai-etk eval result batch-create \
  --report-id "report-abc123" \
  --results-json '[
    {"input": {"question": "..."}, "output": {"answer": "..."}, "expected": {"answer": "..."}},
    {"input": {"question": "..."}, "output": {"answer": "..."}, "expected": {"answer": "..."}}
  ]'

# Batch-update scores on existing results (re-scoring without re-running app_invoke).
# Each score is {value, reason?, error?}; null/empty values are allowed.
genai-etk eval result batch-update-scores \
  --report-id "report-abc123" \
  --items-json '[
    {"resultId": "result-xyz789", "scores": {"correctness": {"value": 0.9, "reason": "matches expected"}, "helpfulness": {"value": 0.8}}}
  ]'

# Batch-delete results by ID (up to 25 per call)
genai-etk eval result batch-delete \
  --report-id "report-abc123" \
  --result-ids-json '["result-xyz789", "result-uvw456"]'
```

Batch operations return per-item errors instead of failing the whole call — inspect the `errors` array in the response to find any items that didn't apply. To re-score results from an existing report without copying them by hand, prefer `eval job submit-scoring --source-report-id <id>` (see [Score-only jobs with inline results](#score-only-jobs-with-inline-results)).

## Viewing results

Every evaluation job writes its results into a **report**; each **test result** in the report carries the test case data (`input`, `expected`, `context`, `metadata`), the app `output`, and a `scores` map keyed by scorer name — each score has a `value` (typically 0–1), an optional `reason` explaining the score, and an `error` if scoring failed.

To inspect results, use `genai-etk eval job get --job-id <id>` to find the job's `reportId`, then `eval report get`, `eval result list`, and `eval result get` (see [Managing reports](#managing-reports) and [Managing results](#managing-results)). If the job was submitted with `--experiment-name`, aggregate metrics and per-test-case artifacts are also logged to MLflow for comparison across runs (see [Experimentation](#experimentation)).

# Experimentation

## Creating experiments

```bash
# Create an experiment
genai-etk experiment create --name "rag-model-comparison" \
  --description "Comparing Claude vs Nova for RAG evaluation"

# List experiments
genai-etk experiment list

# Get experiment details
genai-etk experiment get --name "rag-model-comparison"
```

When you start an evaluation job with the `--experiment-name` argument, the run is associated with that experiment and logged as an MLflow run. If you omit the argument, the evaluation runs without experiment tracking.

## Tracking and comparing results

```bash
# Get the output of the latest run in an experiment for a specific version
genai-etk experiment get-output --name "rag-model-comparison" --version 1
```

## MLflow integration

Gen AI ETK uses Amazon SageMaker MLflow for experiment tracking. Each evaluation run logs:

- **Metrics**: Aggregated scores from all scorers.
- **Parameters**: The evaluation configuration (evaluator, scorers, test data, config version).
- **Artifacts**: Per-test-case results uploaded to the MLflow artifact store.

To open the MLflow UI:

```bash
genai-etk experiment launch-ui
```

This generates a presigned URL and opens the MLflow tracking server in your browser. From the UI, you can:

- Compare metrics across runs in table or chart form.
- Drill into individual runs to see per-test-case results in the **Artifacts** tab.
- Filter and sort runs by metrics or parameters.

# Generation workflows

## Configuring generation

Generation jobs execute an ordered list of steps. Create a JSON file containing an **array** of steps (pass it with `--steps-file`, or pass the array inline with `--steps`):

```json
[
  {
    "plugin": "generateTestCases",
    "configuration": {
      "documentSource": {
        "bucket": "my-data-bucket",
        "prefix": "generation/source-docs/"
      },
      "chunk": { "size": 1024, "overlap": 128 },
      "question": {
        "model": "global.anthropic.claude-haiku-4-5-20251001-v1:0",
        "questionsPerChunk": 3
      }
    }
  },
  {
    "plugin": "llmAsAJudge",
    "configuration": {
      "criteria": [
        "The question must be answerable from the provided context",
        "The answer must be factually correct"
      ],
      "threshold": 0.7,
      "model": "global.anthropic.claude-haiku-4-5-20251001-v1:0"
    }
  },
  {
    "plugin": "DatastoreExport",
    "configuration": {
      "datasetConfiguration": {
        "datasetId": "<dataset-id>",
        "mintVersion": true
      }
    }
  }
]
```

## Running generation jobs

```bash
# Start a generation job
genai-etk generation job start --steps-file "gen_config.json"

# List generation jobs
genai-etk generation job list

# Get job details
genai-etk generation job get --id "gen-job-123"

# Stop a running job
genai-etk generation job stop --id "gen-job-123"
```

## Generation plugins

### RAG test case generator (`generateTestCases`)

Generates question-answer pairs from source documents stored in S3. Documents are chunked using a configurable chunk size and overlap, then processed through Amazon Bedrock to create contextually relevant QA pairs. Deployed on ECS for document processing workloads.

Configuration options:

- `documentSource`: S3 location of source documents (`bucket`, `prefix`).
- `chunk.size`: Size of document chunks in characters (default: 1024).
- `chunk.overlap`: Overlap between chunks in characters (default: 128).
- `question.model`: Bedrock model ID (default: `global.anthropic.claude-haiku-4-5-20251001-v1:0`).
- `question.questionsPerChunk`: Number of QA pairs to generate per chunk (default: 3).
- `question.prompt`: Custom generation prompt (optional).

### Agentic test case generation (`agenticTestCases`)

Generates test cases for agentic applications (tool-calling agents) using a multi-stage LLM pipeline: **extract** (optionally pull real conversations from OTEL traces in S3) → **plan** (build a coverage taxonomy and sample diverse scenarios across it) → **generate** (expand scenarios into test cases with expected tool calls) → **augment** (optionally produce per-strategy variations of the base cases). Every input is optional except `totalTestCases` — the more context you provide, the more grounded the output.

Configuration options:

- `totalTestCases` (required): Target number of base test cases; augmentation cases are produced on top.
- `agent.systemPrompt`: The agent's system prompt.
- `agent.tools`: Tool definitions with JSON Schema parameters. Generated tool calls are validated against these schemas.
- `traces`: OTEL traces from S3 (`source: "s3"`, `location: "s3://bucket/prefix/"`) for trace-grounded generation from production data, with per-outcome sample rates (`errorSampleRate`, `successSampleRate`, `abandonmentSampleRate`) and `maxConversations`.
- `seedExamples`: Few-shot examples to guide generation style.
- `focusAreas`: Specific patterns or edge cases to prioritize.
- `augmentationStrategies`: Variations applied to each base case — `rephrase` (same intent, different wording), `parameter_variation` (same tools, different valid arguments; requires `agent.tools`), `multi_turn_extension` (adds follow-up turns), `edge_case` (boundary and ambiguous inputs), `negative_case` (out-of-scope and refusal scenarios; requires `agent.systemPrompt`). Default: none.
- `reviewSampleRate`: Fraction of output tagged `requiresReview: true` for human curation, stratified by provenance (default: 0.2).
- `modelId`: Bedrock model ID (default: Claude Sonnet).

Example steps file, exporting the generated test cases to a dataset:

```json
{
  "steps": [
    {
      "plugin": "agenticTestCases",
      "configuration": {
        "totalTestCases": 50,
        "agent": {
          "systemPrompt": "You are a helpful assistant that can look up product information.",
          "tools": [
            {
              "name": "get_product",
              "description": "Get product information by ID",
              "parameters": {
                "type": "object",
                "properties": {
                  "product_id": { "type": "string", "description": "The product ID" }
                },
                "required": ["product_id"]
              }
            }
          ]
        },
        "focusAreas": ["multi-tool queries", "edge cases with missing parameters"],
        "traces": {
          "source": "s3",
          "location": "s3://my-data-bucket/traces/",
          "maxConversations": 500
        },
        "augmentationStrategies": ["rephrase", "parameter_variation", "negative_case"],
        "reviewSampleRate": 0.3
      }
    },
    {
      "plugin": "DatastoreExport",
      "configuration": {
        "datasetName": "agentic-test-cases"
      }
    }
  ]
}
```

Each generated test case contains an `input` (a string, or an array of strings for multi-turn conversations), an `expected` block with the reference `response`, `topics`, and expected `toolCalls` (an array-of-arrays for multi-turn cases, one per turn), plus provenance metadata recording how the case was produced (`gap_fill`, `focus_area`, `failure_pattern`, or `augmentation`).

### LLM-as-Judge (`llmAsAJudge`)

Validates generated test cases against quality criteria. Only test cases that meet the threshold score are passed to the next plugin. Deployed on ECS for sequential processing pipelines.

Configuration options:

- `criteria`: Array of criteria strings describing what constitutes a good test case.
- `threshold`: Minimum score (0.0–1.0) for a test case to pass (default: 0.8).
- `model`: Bedrock model ID (default: `global.anthropic.claude-haiku-4-5-20251001-v1:0`).

### DataStore Export (`DatastoreExport`)

Exports the filtered test cases to a Gen AI ETK dataset. Deployed as a Step Functions workflow with Lambda functions

Configuration options:

- `datasetConfiguration.datasetId`: ID of the target dataset (create it first with `genai-etk dataset create`).
- `datasetConfiguration.mintVersion`: When `true`, mints a new dataset version after the export completes.

# Extending the toolkit

## CI/CD integration

You can integrate Gen AI ETK into your CI/CD pipeline to automatically evaluate your generative AI application on each change. Here is an example using the CLI in a shell script:

```bash
#!/bin/bash
set -e

# Submit evaluation job
JOB_ID=$(genai-etk eval job submit --evaluator-name "builtin" \
  --test-cases-json '{"dataset": {"datasetId": "regression-tests"}}' \
  --scorers-json '{"llm_as_judge": {"scores": {"sample": {}}}}' \
  --output json | jq -r '.jobId')

# Poll for completion
while true; do
  STATUS=$(genai-etk eval job get --job-id "$JOB_ID" --output json | jq -r '.status')
  case "$STATUS" in
    "SUCCESS") echo "Evaluation passed"; break ;;
    "FAILURE"|"PARTIAL_FAILURE") echo "Evaluation failed: $STATUS"; exit 1 ;;
    *) echo "Status: $STATUS. Waiting..."; sleep 30 ;;
  esac
done
```

The CLI supports `--output json` for machine-readable output, making it straightforward to parse results in automation scripts.

The generated [TypeScript](../sdk/typescript-client.md) and [Python](../sdk/python-client.md) clients provide the same capabilities programmatically. For building custom evaluators, see the [Evaluator SDK reference](../sdk/evaluator-sdk.md).

## EventBridge integration

Gen AI ETK emits events to EventBridge at key points in evaluation and generation workflows. You can subscribe to these events to trigger downstream actions.

Event types:

| Detail type                         | Emitted when                     |
| ----------------------------------- | -------------------------------- |
| `genAiEtkEvaluationDoneEvent`       | An evaluation workflow completes |
| `genAiEtkGenerationDoneEvent`       | A generation workflow completes  |
| `genAiEtkEvaluationMetricDoneEvent` | An evaluation plugin completes   |
| `genAiEtkGenerationPluginDoneEvent` | A generation plugin completes    |

Example EventBridge rule pattern to match evaluation completion:

```json
{
  "source": ["GenAiEvaluationToolkit"],
  "detail-type": ["genAiEtkEvaluationDoneEvent"]
}
```

## Multi-evaluator jobs

Evaluation jobs support **multi-evaluator topology** — scorers can be dispatched as separate Lambda invocations via EventBridge, enabling parallel scoring by independent evaluator services.

### Routing scorers with `evaluatorName`

Set `evaluatorName` on a scorer config to force the job into separate tasks:

```json
{
  "evaluatorName": "builtin",
  "testCases": { "dataset": { "datasetId": "..." } },
  "app": {
    "name": "bedrock_app",
    "params": { "model_id": "amazon.nova-lite-v1:0" },
    "evaluatorName": "my-app-evaluator"
  },
  "scorers": {
    "llm_as_judge": {
      "evaluatorName": "builtin",
      "scores": { "toxicity": null, "correctness": { "description": "..." } }
    }
  }
}
```

The `app` field is optional. When provided, `name` selects the app_invoke function, `params` passes runtime configuration, and `evaluatorName` routes app invocation to a specific evaluator Lambda.

This creates discrete tasks dispatched via EventBridge:

```
app_invoke → score:llm_as_judge → post_process
```

Each task is a separate Lambda invocation. Without explicit `evaluatorName`, the job runs as a single task.

### Job status values

| Status            | Meaning                                        |
| ----------------- | ---------------------------------------------- |
| `PENDING`         | Job submitted, no tasks started                |
| `RUNNING`         | At least one task in progress                  |
| `SUCCESS`         | All tasks completed successfully               |
| `PARTIAL_FAILURE` | Primary task succeeded but some scorers failed |
| `FAILURE`         | Primary task failed                            |

### Job stages (v2)

Jobs also expose a `stage` field that tells you _where_ in the pipeline a job is, independent of its eventual success/failure outcome. Status answers "did it work?"; stage answers "which phase is it in right now?"

| Stage      | Meaning                                                                                              |
| ---------- | ---------------------------------------------------------------------------------------------------- |
| `PENDING`  | Job created, no orchestrated work has started yet                                                    |
| `INVOKING` | App invocation in progress (the primary task is `RUNNING`)                                           |
| `SCORING`  | App invocation finished; one or more scorer tasks are running or already complete                    |
| `COMPLETE` | All tasks (primary + every scorer + post-process) reached a terminal state (`COMPLETED` or `FAILED`) |

For orchestrated jobs (`submit`, `submit-scoring`, `submit-invoke`), stage is derived from the per-task statuses on the job — you do not have to set it. A `COMPLETE` stage with status `PARTIAL_FAILURE` is normal when the app succeeded but a scorer failed; the per-task map shows which one. For local-SDK jobs, the SDK writes the stage directly.

### Score-only jobs with inline results

Submit pre-existing outputs for scoring without running app_invoke:

```json
{
  "evaluatorName": "builtin",
  "testResults": [
    { "input": {...}, "output": {...}, "expected": {...} }
  ],
  "scorers": { "llm_as_judge": { "scores": { "toxicity": null } } }
}
```

Or re-score results from a previous job using `sourceReportId` (copies the results into a new report and applies the specified scorers):

```json
{
  "evaluatorName": "builtin",
  "sourceReportId": "existing-report-id",
  "scorers": { "llm_as_judge": { "scores": { "correctness": { "description": "..." } } } }
}
```

## Migrating from eval plugins to evaluator SDK v2

The legacy eval plugin packages have been replaced by the evaluator SDK v2 scorer system:

| Removed package            | Replacement                                                 |
| -------------------------- | ----------------------------------------------------------- |
| `plugin-eval-llm-as-judge` | Built-in `llm_as_judge` scorer in `evaluator-builtin`       |
| `plugin-eval-ragas`        | Built-in `ragas` scorer in `evaluator-builtin`              |
| `plugin-eval-agentcore`    | Built-in `agentcore` scorer in `evaluator-builtin`          |
| `plugin-eval-fmeval`       | `evaluator-fmeval` package (standalone)                     |
| `plugin-eval-sdk`          | `evaluator-sdk` (Python SDK for building custom evaluators) |
| `experiment-logger`        | Built into the post-processing pipeline (automatic)         |

**What changed:**

- Scorers no longer run as separate ECS tasks or Lambda plugins with S3-based data exchange
- Instead, scorers are Python classes registered on an `Evaluator` and dispatched via EventBridge
- All built-in scorers (LLM-as-Judge, RAGAS, AgentCore) now run inside a single `evaluator-builtin` Lambda
- Custom scorers use the `evaluator-sdk` Python package (see [Custom evaluators](#custom-evaluators) below)

## Custom evaluators

Build custom evaluators using the Python evaluator SDK (`packages/evaluator-sdk`). An evaluator registers scorers and optionally one or more `app_invoke` functions:

```python
from evaluator_sdk import Evaluator, ScoreResult

def my_scorer(*, test_result):
    return 1.0 if test_result.output == test_result.expected else 0.0

def my_app(input_data, params=None):
    # Call your LLM/application — params are optional runtime config
    model_id = (params or {}).get("model_id", "amazon.nova-lite-v1:0")
    return {"response": "..."}

evaluator = Evaluator(
    name="my-evaluator",
    app_invoke=my_app,
    scorers=[my_scorer],
)

# Run locally
response = evaluator.evaluate(
    testcases=[{"input": {...}, "expected": {...}}],
    app={"params": {"model_id": "amazon.nova-pro-v1:0"}},
    scorers={"my_scorer": None},
)
```

### App configuration

The `app` parameter controls which `app_invoke` function runs and passes runtime parameters:

```python
response = evaluator.evaluate(
    testcases=[...],
    app={
        "name": "bedrock_app",          # select which app_invoke to use (optional if only one)
        "params": {"agent_arn": "..."},  # runtime params passed to the function
        "evaluatorName": "my-agent-eval",  # optional: route to a different evaluator Lambda
    },
    scorers={"my_scorer": None},
)
```

The `app_invoke` function can optionally declare a `params` argument to receive the runtime parameters:

```python
def my_app(input_data, params=None):
    agent_arn = (params or {}).get("agent_arn")
    # Use agent_arn to call the right agent...
    return {"response": "..."}
```

Functions that don't declare `params` continue to work unchanged (backward compatible).

### Multiple app_invoke functions

A single evaluator can register multiple named `app_invoke` functions for different use cases (e.g. different models, prompt strategies, or endpoints):

```python
def bedrock_app(input_data, params=None):
    # Call Bedrock
    return {"response": "..."}

def custom_api_app(input_data, params=None):
    # Call your custom endpoint
    return {"response": "..."}

evaluator = Evaluator(
    name="my-evaluator",
    app_invoke=[bedrock_app, custom_api_app],
    scorers=[my_scorer],
)

# Select a specific app_invoke by name and pass params
response = evaluator.evaluate(
    testcases=[...],
    app={"name": "custom_api_app", "params": {"api_key": "..."}},
    scorers={"my_scorer": None},
)
```

Functions are registered by their `__name__` attribute.

Deploy as a Lambda using the `LambdaEvaluator` CDK construct to register it for remote dispatch via EventBridge.

### Remote execution (running work on deployed evaluators)

By default `evaluate()`, `score()`, and `invoke()` run in-process. To run a task
on a **deployed evaluator worker** instead, add an `evaluatorName` to its config.
This is how remote-only evaluators such as **agent-as-judge** (which runs in an
isolated Lambda) are driven through the SDK — the scorer/app need not be
registered locally. The SDK submits the job, waits for it to finish, and returns
the results the worker wrote.

**`score()` with a remote scorer** (the agent-as-judge path):

```python
evaluator = Evaluator(name="my-driver")  # no local scorer needed

# Score inline testcases:
response = evaluator.score(
    testcases=[{"input": {...}, "output": {...}}],
    scorers={
        "agent_as_judge": {
            "evaluatorName": "agent-as-judge",
            "scores": {"correctness": {"description": "Is the answer correct?"}},
        },
    },
)

# Or re-score results already in a report:
response = evaluator.score(
    source_report_id="report-123",
    scorers={"my_scorer": {"evaluatorName": "builtin", "scores": {"toxicity": None}}},
)
```

**`invoke()` with a remote app** (app invocation only):

```python
response = evaluator.invoke(
    testcases=[...],
    app={"evaluatorName": "my-worker", "name": "my_fn", "params": {...}},
)
```

**`evaluate()` fully remote** (route both app and scorers):

```python
response = evaluator.evaluate(
    testcases=[...],
    app={"evaluatorName": "my-worker", "params": {...}},
    scorers={"my_scorer": {"evaluatorName": "builtin", "scores": {...}}},
)
```

A task with an `evaluatorName` runs remotely; without one it runs locally and its
name must be registered on the `Evaluator`.

#### Troubleshooting remote execution

| Error | Cause & fix |
|-------|-------------|
| `Scorer 'X' is not registered and has no evaluatorName` | The scorer name isn't registered locally and has no route. Either register it on the `Evaluator`, or add `evaluatorName` to run it on a remote worker. |
| `Cannot mix local and remote tasks in a single call` | One call mixed in-process tasks with `evaluatorName`-routed ones. Hybrid execution is not yet supported — split into separate `evaluate()`/`score()`/`invoke()` calls (all-local or all-remote). |
| `local_only mode cannot run remote tasks` | The `Evaluator` was created with `local_only=True`, which has no API client. Construct it with an `api_endpoint` (or a `client`) to use remote workers. |

# Tutorials

## RAG evaluation tutorial

This tutorial walks through evaluating a RAG application end-to-end using the evaluator SDK.

### 1. Define your app_invoke function

The `app_invoke` function wraps your RAG application. It receives the test case input and returns the application's output:

```python
import boto3

bedrock = boto3.client("bedrock-runtime")

def my_rag_app(input_data: dict) -> dict:
    """Call your RAG pipeline and return the response."""
    question = input_data["user_input"]
    contexts = input_data.get("retrieved_contexts", [])
    context_block = "\n".join(contexts)

    prompt = f"Answer the question using only the provided context.\n\nContext:\n{context_block}\n\nQuestion: {question}"

    response = bedrock.converse(
        modelId="amazon.nova-lite-v1:0",
        messages=[{"role": "user", "content": [{"text": prompt}]}],
        inferenceConfig={"maxTokens": 256},
    )
    return {"response": response["output"]["message"]["content"][0]["text"]}
```

### 2. Define test cases

Provide test cases inline as dictionaries:

```python
test_cases = [
    {
        "input": {
            "user_input": "What is Amazon S3?",
            "retrieved_contexts": [
                "Amazon Simple Storage Service (Amazon S3) is an object storage service offering industry-leading scalability, data availability, security, and performance."
            ],
        },
        "expected": {"reference": "Amazon S3 is an object storage service."},
    },
    {
        "input": {
            "user_input": "What is AWS Lambda?",
            "retrieved_contexts": [
                "AWS Lambda is a serverless, event-driven compute service that lets you run code for virtually any type of application or backend service without provisioning or managing servers."
            ],
        },
        "expected": {"reference": "AWS Lambda is a serverless compute service."},
    },
]
```

### 3. Run the evaluation

```python
from evaluator_sdk import Evaluator
from evaluator_builtin.scorers.ragas import RagasScorer

evaluator = Evaluator(
    name="builtin",
    api_endpoint="https://<your-api-endpoint>",
    app_invoke=my_rag_app,
    scorers=[RagasScorer],
)

response = evaluator.evaluate(
    testcases=test_cases,
    scorers={
        "ragas": {
            "params": {"model_id": "amazon.nova-lite-v1:0"},
            "scores": {
                "faithfulness": None,
                "answer_relevancy": None,
                "context_recall": None,
            },
        }
    },
    experiment_name="rag-tutorial-experiment",
)
```

### 4. View results in MLflow

```bash
genai-etk experiment launch-ui
```

Navigate to the `rag-tutorial-experiment` experiment to see metrics, compare runs, and drill into per-test-case results.

## Test case generation tutorial

This tutorial walks through generating test cases from source documents.

### 1. Upload source documents to S3

Upload your documents (PDF, text, markdown, and so on) to S3:

```bash
aws s3 cp my-documents/ s3://my-data-bucket/generation/source-docs/ --recursive
```

### 2. Create the target dataset and a generation configuration

Create the dataset that will receive the generated test cases, and note its ID:

```bash
genai-etk dataset create --name "generated-from-docs" --description "Synthetic test cases from source docs"
```

Create `gen-config.json` (a JSON array of steps):

```json
[
  {
    "plugin": "generateTestCases",
    "configuration": {
      "documentSource": {
        "bucket": "my-data-bucket",
        "prefix": "generation/source-docs/"
      },
      "chunk": { "size": 1024, "overlap": 128 }
    }
  },
  {
    "plugin": "llmAsAJudge",
    "configuration": {
      "criteria": [
        "The question must be clearly answerable from the provided context",
        "The answer must be factually correct and complete"
      ],
      "threshold": 0.7
    }
  },
  {
    "plugin": "DatastoreExport",
    "configuration": {
      "datasetConfiguration": {
        "datasetId": "<dataset-id>",
        "mintVersion": true
      }
    }
  }
]
```

### 3. Start generation

```bash
genai-etk generation job start --steps-file "gen-config.json"
```

### 4. Monitor progress

```bash
genai-etk generation job list
genai-etk generation job get --id "<job-id>"
```

When the job completes, the generated test cases are available in the target dataset:

```bash
genai-etk dataset list-test-cases --dataset-id "<dataset-id>"
```

# Troubleshooting

## Installation and configuration

### CLI installation failures

- Verify Node.js v20+: `node --version`.
- Clear npm cache: `npm cache clean --force`.
- Try relinking: run `npm run dev:unlink` and then `npm run dev:link` from the `packages/cli` directory (see [Install the CLI](#install-the-cli)).

### Authentication errors

- Verify AWS credentials are configured: `aws sts get-caller-identity`.
- Ensure your role has `execute-api:Invoke` permission on the API Gateway.
- Check that the API Gateway URL is correct: `echo $GEN_AI_ETK_API_URL`.

### Missing API Gateway URL

If you see `GEN_AI_ETK_API_URL environment variable is required`:

- Set the variable: `export GEN_AI_ETK_API_URL="https://<api-id>.execute-api.<region>.amazonaws.com/prod"`.
- Find the URL in the API Gateway console under Stages → Invoke URL.

## Evaluation issues

### Configuration errors

- Validate the JSON you pass to `--scorers-json` / `--test-cases-json` (or the files behind `--scorers-file` / `--test-cases-file`).
- Ensure the evaluator name (`--evaluator-name`) and scorer names match a deployed evaluator and its registered scorers exactly.
- Verify the referenced dataset (and version) exists in the datastore.

### Job execution failures

- Check CloudWatch Logs for the evaluation Step Functions execution.
- Use `genai-etk eval job get --job-id <id>` to inspect the per-task statuses and errors on the job.
- For scorer- or app-invoke-specific errors, check the evaluator Lambda's CloudWatch logs (for example the `evaluator-builtin` Lambda; ECS tasks are used only by generation plugins).

### Scheduled evaluation issues

- Verify the cron expression syntax. Gen AI ETK uses EventBridge cron format.
- Check that the EventBridge scheduler role has permission to start Step Functions executions.

## Experiment issues

### MLflow UI access

If `genai-etk experiment launch-ui` fails:

- Verify your credentials have `sagemaker:CreatePresignedMlflowTrackingServerUrl` permission.
- Check that the MLflow tracking server is running in the SageMaker console.

### Run creation failures

- Ensure the experiment exists before starting an evaluation that references it.
- Check CloudWatch Logs for the experiment Lambda handlers.

## Generation issues

### Job failures

- Verify source documents exist at the configured S3 location.
- Check that the generation workflow role has read access to the source document bucket.
- For Bedrock-related errors, verify model access is enabled in your region.

### Quality filtering issues

- If too many test cases are filtered out, lower the `threshold` value in the LLM-as-Judge configuration.
- If quality is too low, refine the `criteria` description or increase the threshold.

## KMS encryption errors

### "The specified KMS key does not exist or is not allowed to be used"

- Verify the KMS key exists in the deployment region.
- Ensure the key policy grants the necessary service permissions.

### "Access Denied" (KMS-related)

- Check that the IAM role has `kms:Decrypt` and `kms:GenerateDataKey` permissions on the key.
- For CloudWatch Logs, ensure the key policy includes the CloudWatch Logs service principal.

## Diagnosing issues

### Check logs

All components log to CloudWatch. Key log groups:

- `/aws/lambda/GenAiEtk-*`: Lambda function logs.
- Step Functions execution history: visible in the Step Functions console.
- ECS task logs: visible in the ECS console or CloudWatch.

### Capture error messages

Use `--output json` with CLI commands to get structured error responses for debugging:

```bash
genai-etk eval job get --job-id "failing-job" --output json
```

## Agent-as-Judge issues

### Agent-as-Judge Lambda fails with `InternetEgressDetectedError` or `AwsEndpointUnreachableError`

The Agent-as-Judge Lambda deploys into network-isolated subnets and runs an unconditional runtime airgap assertion at every cold start. The two error messages distinguish the failure modes:

- `InternetEgressDetectedError`: the runtime can reach the public internet when it should not. Most likely cause: a recent change to the deployment (or existing-VPC config) re-routed the Lambda onto NAT-egress subnets. Confirm that the `AgentAsJudgeEvaluatorLambda` VPC config still references the isolated subnets from the pre-reqs stack.
- `AwsEndpointUnreachableError`: the AWS service endpoint is not reachable. Most likely cause: a missing VPC endpoint (Bedrock-Runtime, EventBridge), or the endpoint security group's ingress does not include the secondary CIDR (`10.1.0.0/16`) where the isolated subnets live. See the Solution Guide's [Network isolation for the Agent-as-Judge evaluator](../solution_guide/Gen-AI-ETK-SolutionGuide.md#network-isolation-for-the-agent-as-judge-evaluator) section.

# Revisions

| Date       | Description                                                      |
| ---------- | ---------------------------------------------------------------- |
| March 2026 | Complete rewrite of User Guide to improve structure and clarity. |
