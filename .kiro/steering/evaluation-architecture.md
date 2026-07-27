---
inclusion: manual
---

# Evaluation workflow architecture

This document captures the architecture of the Gen AI Evaluation Toolkit evaluation workflow. As always, the code is the authoritative reference, but use this file as a quick start when working on evaluation-related features, plugins, or infrastructure.

## High-level flow

The evaluation workflow runs as an AWS Step Functions state machine. The API Lambda handler (`startEvaluationLambda.ts`) validates the request, starts the execution, and returns the execution details. There is no DynamoDB table for evaluation jobs. Step Functions execution history is the sole persistence layer, and the API reads job state directly from `DescribeExecution`.

The workflow proceeds through these stages:

1. Parse the input JSON body and extract the evaluation config, experiment name, and config version.
2. Emit an `EVALUATION_STARTED` CloudWatch metric.
3. Start an experiment run (register with MLflow through EventBridge).
4. Copy test data from the user-specified S3 location into the evaluation bucket under `<executionName>/test-data`.
5. Iterate over plugin configs (not test case files) and invoke each plugin in parallel.
6. After each plugin completes, aggregate its results from S3.
7. Merge plugin results, build a plugin-to-S3 mapping, and end the experiment run (log to MLflow).
8. Emit an `EVALUATION_COMPLETED` metric and publish a `genAiEtkEvaluationDoneEvent` to EventBridge.

Error handling catches failures at the plugin invocation and test data copy stages. Timeouts produce a descriptive error that names the timed-out plugins.

## Plugin contract

A plugin is anything that subscribes to the correct EventBridge event and responds with the expected event pattern. The built-in plugins run on ECS Fargate, but Lambda-based and Step Functions-based plugins also exist in the codebase.

### Trigger event

The Step Functions workflow emits an EventBridge event with the following properties:

- Source: `genaietk`
- Detail type: `genAiEtkEvaluationMetricTriggerEvent` (evaluation) or `genAiEtkGenerationPluginTriggerEvent` (generation)
- Detail: filtered by `plugin` field to match the plugin name

The event detail contains the following fields:

```json
{
  "plugin": "pluginName",
  "configuration": { },
  "testData": {
    "bucketName": "evaluation-bucket",
    "prefix": "<executionName>/test-data"
  },
  "output": {
    "bucketName": "evaluation-bucket",
    "prefix": "<executionName>/<pluginName>/results"
  },
  "taskToken": "step-functions-task-token",
  "responseDetailType": "genAiEtkEvaluationMetricDoneEvent"
}
```

For ECS-based plugins, the trigger Lambda starts a Fargate task and passes `event.detail` as the `CONFIG` environment variable.

### Plugin obligations

A plugin must perform four operations:

1. Read test data from the S3 location in `testData`.
2. Process each file and produce scores (a list of `{name, value}` pairs).
3. Write results to the S3 location in `output` as JSON files with this structure:
   ```json
   {
     "original": "raw input file content",
     "raw": { },
     "scores": [{"name": "metricId", "value": 0.85}],
     "result": "PASS"
   }
   ```
4. Send status events back through EventBridge with the provided `taskToken` and `responseDetailType`.

### Response events

The plugin sends events to the same event bus with source `genaietk.evaluation.plugins.<pluginName>` and the detail type from `responseDetailType`. The detail follows one of three shapes:

- Progress: `{"status": "inProgress", "taskToken": "...", "percentage": 0.5}`
- Success: `{"status": "success", "taskToken": "...", "output": "{}"}`
- Error: `{"status": "error", "taskToken": "...", "error": "ErrorType", "cause": "description"}`

The heartbeat timeout is 10 minutes. The plugin must send at least one event within that window.

### Async bridge mechanism

The `AsyncAwaitState` construct bridges Step Functions to EventBridge:

- An `asyncFunction` Lambda emits the trigger event with the task token (using `WAIT_FOR_TASK_TOKEN` integration).
- An `awaitFunction` Lambda listens for response events and translates them into `SendTaskHeartbeat`, `SendTaskSuccess`, or `SendTaskFailure` calls.
- A `Parallel` state preserves the input context alongside the async invocation, then merges them after callback.

## Built-in evaluation plugins

### LLM-as-judge (`plugin-eval-llm-as-judge`)

- Uses the plugin SDK (`run_plugin_evaluation`).
- Iterates file by file, sequentially.
- For each file, runs every evaluator by calling Amazon Bedrock through LangChain `ChatBedrockConverse`.
- No parallelism within the plugin. No batching.

### RAGAS (`plugin-eval-ragas`)

- Uses the plugin SDK.
- Groups files into batches (controlled by `config.batch_size`).
- Reads each batch into a RAGAS `EvaluationDataset` and calls `ragas.evaluate()` on the whole batch.
- Explicitly disables RAGAS's async executor (`return_executor=False`).
- Maps results back to individual files for output.

### fmeval (`plugin-eval-fmeval`)

- Does not use the plugin SDK. Has its own `aws_utils` and config parsing.
- Downloads all files upfront into a temp directory (returns `List[Path]`, not an iterator).
- Creates a `DataConfig` per file, chunks them by `chunk_size`, and calls `evaluator.evaluate()` per chunk.
- Optionally uses a `BedrockModelRunner` for model-based evaluation.
- Writes results per file per evaluator to S3.

### Agent-as-Judge (`evaluator-agent-as-judge`)

- Uses the **evaluator SDK** (`evaluator_sdk`), NOT the plugin SDK (`evaluation_plugin_sdk`).
- Entry point: `evaluator_agent_as_judge.handler.lambda_handler` (Lambda only; no ECS entry point).
- Scorer: `AgentAsJudgeScorer` (extends `evaluator_sdk.Scorer`), registered with `name = "agent-as-judge"`. Uses `@scorer(dynamic=True)` so any score name in the request dispatches to the same scorer method.
- Per-invocation params: `AgentAsJudgeParams` (camelCase aliases: `agentModel`, `agentTemperature`) — agent-level only.
- Evaluator definitions are carried **per score** in `score_params` (not in a shared `params.evaluators` list). `_resolve_evaluator(score_name, score_params)` dispatches on the literal `builtIn` key:
  - `BuiltInEvaluator` (has `builtIn`, e.g. `"requirements-compliance"`): optional `config`, `outputSchema`, `requirementDocs`.
  - `Evaluator` (custom, no `builtIn`): the score name supplies `name`; requires `description`; optional `config`, `outputSchema`, `requirementDocs`.
  - All three model fields accept camelCase or snake_case.
- Spawns `opencode` subprocess per evaluator via `mise exec -- opencode run --agent judge`.
- Verdict written to file by `write_verdict` MCP tool; read back by `runner._parse_agent_output`.
- Requirement docs are downloaded once per scorer instance (warm Lambda invocations skip re-download).
- Artifact dirs are cleaned up per test case regardless of outcome.
- Runs in **isolated subnets** (no internet egress). Enforces an unconditional runtime airgap assertion at cold start (`network_guard.py`). `app_invoke` is explicitly not supported.

### Scale limitations

None of the plugins clean up individual files after processing. All downloaded files accumulate on disk until the entire evaluation completes. The primary constraint is Fargate ephemeral storage (default 20 GiB, configurable up to 200 GiB). No plugin performs internal parallelism.

## Post-plugin processing

### Result summarisation

The `TestResultsSummaryState` paginates through S3 result files (100 per page) using `IterateOverBucketFilesState`. For each page, it collects S3 keys (not file contents) and invokes the `createAggregateHandler` Lambda. That Lambda reads each file from S3, extracts scores, and merges them into a running aggregate using Welford's online algorithm. The aggregate persists to S3 as `aggregate.json` after each batch. After all pages, the `createSummaryHandler` Lambda reads the aggregate and computes final statistics (count, min, max, mean, standard deviation). This pipeline scales to arbitrarily large datasets.

### Experiment logger

The experiment logger runs as a Fargate task (2 vCPU, 8 GB memory). It downloads all result files from all plugins into memory using async S3 downloads (with a concurrency semaphore). It builds an in-memory dict of all results grouped by filename, then creates consolidated JSON and HTML artifacts for each test case and logs them to MLflow. This component does not scale well because it materialises all results in memory simultaneously.

## Key source files

| Component | Path |
|---|---|
| Evaluation workflow (Step Functions) | `packages/cdk/src/evaluation/constructs/evaluationApiGatewayIntegration.ts` |
| Plugin invocation state | `packages/cdk/src/evaluation/constructs/stepfunction/invokePluginsState.ts` |
| Async bridge (trigger) | `packages/cdk/src/common/api/handler/asyncHandler.ts` |
| Async bridge (await) | `packages/cdk/src/common/api/handler/awaitHandler.ts` |
| Async bridge (construct) | `packages/cdk/src/common/constructs/stepfunction/asyncAwaitState.ts` |
| ECS plugin construct | `packages/cdk/src/common/constructs/containers/ecsContainers/eventDrivenEcs.ts` |
| ECS trigger Lambda | `packages/cdk/src/common/constructs/containers/ecsContainers/triggerLambda.ts` |
| Lambda plugin construct | `packages/cdk/src/plugins/lambdaPlugin/index.ts` |
| EventTypes constants | `packages/cdk/src/plugins/contracts/handler/common.ts` |
| Plugin SDK entry point | `packages/plugin-eval-sdk/src/evaluation_plugin_sdk/genai_etk_plugin.py` |
| Plugin SDK AWS utilities | `packages/plugin-eval-sdk/src/evaluation_plugin_sdk/aws_utils.py` |
| Plugin SDK models | `packages/plugin-eval-sdk/src/evaluation_plugin_sdk/models.py` |
| LLM-as-judge processor | `packages/plugin-eval-llm-as-judge/src/plugin_llm_as_judge_eval/processor.py` |
| RAGAS processor | `packages/plugin-eval-ragas/src/plugin_ragas/ragas_processor.py` |
| fmeval evaluation | `packages/plugin-eval-fmeval/src/plugin_fmeval/evaluation.py` |
| fmeval main | `packages/plugin-eval-fmeval/src/plugin_fmeval/main.py` |
| Evaluator SDK entry point | `packages/evaluator-sdk/src/evaluator_sdk/__init__.py` |
| Evaluator SDK scorer ABC | `packages/evaluator-sdk/src/evaluator_sdk/scorer.py` |
| Agent-as-Judge handler | `packages/evaluator-agent-as-judge/src/evaluator_agent_as_judge/handler.py` |
| Agent-as-Judge scorer | `packages/evaluator-agent-as-judge/src/evaluator_agent_as_judge/scorers/agent_as_judge.py` |
| Agent-as-Judge models | `packages/evaluator-agent-as-judge/src/evaluator_agent_as_judge/models.py` |
| Agent-as-Judge runner | `packages/evaluator-agent-as-judge/src/evaluator_agent_as_judge/runner.py` |
| Agent-as-Judge prompt builder | `packages/evaluator-agent-as-judge/src/evaluator_agent_as_judge/prompt.py` |
| Agent-as-Judge built-in evaluators | `packages/evaluator-agent-as-judge/src/evaluator_agent_as_judge/builtins.py` |
| Agent-as-Judge network guard | `packages/evaluator-agent-as-judge/src/evaluator_agent_as_judge/network_guard.py` |
| Agent-as-Judge MCP server | `packages/evaluator-agent-as-judge/src/evaluator_agent_as_judge/tools/server.py` |
| Agent-as-Judge verdict MCP tools | `packages/evaluator-agent-as-judge/src/evaluator_agent_as_judge/tools/verdict.py` |
| Result aggregation Lambda | `packages/cdk/src/evaluation/lambdas/createAggregateHandler.ts` |
| Result summary Lambda | `packages/cdk/src/evaluation/lambdas/createSummaryHandler.ts` |
| S3 pagination construct | `packages/cdk/src/common/constructs/stepfunction/iterateOverBucketFiles.ts` |
| Job scheduler Lambda handlers | `packages/cdk/src/evaluation/api/handlers/` |
| Job scheduler utilities | `packages/cdk/src/evaluation/api/utils/evaluationJobSchedulerUtils.ts` |
| Execution mapping | `packages/cdk/src/evaluation/api/helper/mapExecution.ts` |
| Smithy evaluation models | `packages/models/model/entity/evaluation/` |
