# Agent-as-Judge Evaluator

Evaluation scorer that launches an OpenCode agent to assess test cases and produce structured verdicts.

## Overview

The Agent-as-Judge evaluator replaces the single LLM call in the built-in LLM-as-Judge scorer with a full agentic evaluation loop. Instead of asking an LLM to score a test case in one shot, the evaluator launches an OpenCode agent that actively explores artifacts, runs tools, and collects evidence before writing a structured verdict.

For every test case, the evaluator:

1. Downloads any referenced artifacts from S3 to a temp directory.
2. Spawns an OpenCode agent per evaluator with a curated set of read-only file-inspection commands. The bash allow-list is advisory, not the security boundary — see [Network isolation](#network-isolation) and the [Artifacts](#artifacts) section for the actual containment model.
3. Feeds the agent the evaluator description/config, the test case, pointers to artifacts, and (optionally) pointers to requirement documents.
4. Collects the agent's structured verdict (or error) via a bundled MCP tool and converts it into a `ScoreResult`.

## Network isolation

Unlike the other built-in scorers, the Agent-as-Judge evaluator runs in **isolated subnets with no route to the public internet** — neither IGW nor NAT. The evaluator reaches AWS services exclusively through VPC interface and gateway endpoints provisioned by the deployment:

- `execute-api` — for ETK API calls (job status updates, result writes) via the **private** API Gateway. This is the endpoint that allows the isolated Lambda to communicate with ETK without internet egress.
- `bedrock-runtime` — for `InvokeModel` calls from the judge agent.
- `events` — for evaluator progress / completion events sent through the SDK.
- `ecr` and `ecr.dkr` — for the Lambda image pulls.
- `logs` and `monitoring` — for CloudWatch.
- `s3` (gateway) — for artifact and requirement-doc downloads.

> **Note:** `app_invoke` is intentionally not supported. The evaluator runs in an isolated subnet with no route to the public internet, so it cannot reach customer application endpoints. Use the built-in evaluator (`evaluator-builtin`) for scorers that require `app_invoke`.

### Runtime airgap assertion

In addition to the network controls, the evaluator enforces a runtime drift detector at every cold start (`network_guard.py`). Before any test-case processing or `opencode` invocation, the evaluator runs three probes:

1. **Negative probes** (must fail) — TCP connect to known public destinations (`1.1.1.1:443`, `8.8.8.8:443`, `example.com:443`). Any successful connect raises `InternetEgressDetectedError` and refuses to run.
2. **Positive control** (must succeed) — TCP connect to `bedrock-runtime.<region>.amazonaws.com:443`. Failure raises `AwsEndpointUnreachableError` and refuses to run, distinguishing a misconfigured environment from a correctly airgapped one.

This catches future drift — for example, someone reverting the isolated-subnet pinning so the evaluator silently regains NAT egress — instead of relying on the network controls alone.

The assertion is **unconditional**: there is no env-var toggle to disable it. If you're running this evaluator's code outside the deployed runtime (e.g. local dev) and the assertion gets in the way, monkey-patch or skip the call site rather than introducing a runtime opt-out.

### BYO-VPC

When deploying with `EXISTING_VPC_ID`, the deployment does *not* create isolated subnets or VPC endpoints for you. In that mode the evaluator gets deployed into the default NAT-egress subnets — but the runtime airgap assertion is still unconditional, so the evaluator will refuse to run as soon as it detects internet reachability (it raises `InternetEgressDetectedError` on the first invocation).

This is **fail-closed by design**, not a bug: there is no quiet fallback and no opt-out for the airgap assertion. A BYO-VPC operator who wants to use this evaluator therefore has two real choices:

1. Recreate the full isolation stack themselves — isolated subnets (one per AZ, no default route) and the VPC endpoints listed above (including `execute-api`) — so the evaluator runs with the same no-internet guarantee as in a fresh deployment.
2. Accept that the evaluator will not run on this deployment, and disable / drop it from the workflow.

## Test Case Format

Each test case is a JSON file with the following schema:

```jsonc
{
  "input": "The text, prompt, or submission to evaluate.", // optional
  "output": "The application's output to evaluate.",       // optional
  "context": {
    // optional
    "artifacts": [
      // optional: S3 locations of files to inspect
      { "bucketName": "<your-etk-data-bucket>", "prefix": "evaluation/agent-as-judge/submissions/case-001/" },
    ],
    // Any additional fields are accepted and forwarded verbatim to the agent prompt as YAML.
    "referenceAnswer": "...",
    "metadata": { "submissionId": "abc-123" },
  },
  // Any other top-level fields are also accepted and forwarded verbatim to the agent prompt as YAML.
  "customField": "...",
}
```

| Field               | Required | Type      | Description                                                                             |
| ------------------- | -------- | --------- | --------------------------------------------------------------------------------------- |
| `input`             | No       | any       | The content the agent evaluates (a code submission, an answer, a generated text, etc.). |
| `output`            | No       | any       | The application's output to evaluate. Forwarded to the agent as YAML.                  |
| `context`           | No       | object    | Optional structured context passed to the agent alongside the input.                    |
| `context.artifacts` | No       | `S3Ref[]` | S3 locations of files the agent should inspect (see [Artifacts](#artifacts) below).     |
| `context.<any>`     | No       | any       | Additional free-form fields inside `context`. Forwarded verbatim to the agent as YAML.  |
| `<any>`             | No       | any       | Any other top-level fields are accepted and forwarded verbatim to the agent as YAML.    |

### Artifacts

`context.artifacts` is a list of `{ bucketName, prefix }` S3 references pointing at directories of files that the agent should read and inspect as part of its evaluation (e.g. a code submission, a generated report, logs).

**Where the files must live.** The permissions that govern which S3 locations the evaluator can read are fully flexible — the evaluator's role can be scoped to whatever buckets and prefixes your requirements and use cases call for. The `deployment` package is simply how we deploy the toolkit ourselves and a reference example for setting it up. If you deploy that reference stack as-is, the role is granted read access only to the `evaluation/agent-as-judge/` prefix of the ETK data bucket — so `artifacts` (and `requirementDocs`) must point under `s3://<your-etk-data-bucket>/evaluation/agent-as-judge/...` or the download fails with `AccessDenied`. To read from a different bucket or prefix, extend the evaluator's IAM policy accordingly.

**Lifecycle:**

1. **Download** — before the agent runs, each `S3Ref` in `artifacts` is downloaded to a dedicated temp directory on disk, preserving relative paths (the S3 prefix is stripped; path-traversal segments are blocked).
2. **Injection** — the local directory paths are listed in an `## Artifacts` section of the agent prompt. The agent is told to explore them using the built-in read-only tools (and a small set of read-only bash commands).
3. **Exclusion from YAML** — the raw `S3Ref` objects are **not** included in the YAML test-case dump sent to the agent. The agent sees the file contents through the filesystem, not as S3 references.
4. **Cleanup** — all temp directories are deleted after the test case finishes, regardless of success or failure.

The agent operates under a **deny-by-default permission model**: every tool is denied unless explicitly allowed. It is granted the built-in read-only tools (`read`, `list`, `grep`, `glob`) — which it should prefer — plus a curated set of read-only bash commands for inspecting artifacts: `ls`, `tree`, `cat`, `head`, `tail`, `grep`, `rg`, `wc`, `file`, `stat`, `diff`. It is also given a SymPy-backed `calculator` MCP tool for exact arithmetic (weighted scores, tolerances, unit conversions) instead of guessing numbers. Everything else — file edits/writes, `webfetch`/`websearch`, subagents (`task`), skills, and any bash command outside the allow-list (including `find` and all `git` commands) — is denied, as is any tool added by future OpenCode versions. This means the configuration is maintained as an allow-list, not a deny-list.

The bash allow-list is advisory and not the security boundary — a prompt-injected agent can in principle escape via argument syntax (e.g. via a permitted command's flags, or `xargs`). Containment relies on network isolation (no internet egress; AWS endpoints reachable only via VPC endpoints) and IAM scoping (read-only S3 access to the agent's evaluation prefix; no write paths anywhere customer data lives). The runtime `network_guard` enforces the airgap on every cold start (see [Runtime airgap assertion](#runtime-airgap-assertion)).

### Verdict model

The agent always terminates by calling `write_verdict` (or `write_error` on failure). The agent reports a per-metric `scores` breakdown; it does **not** compute an overall score itself — the overall score is derived automatically as a weighted average of the partial scores, so the aggregate arithmetic is always exact. The verdict has this shape:

| Field     | Type            | Constraints                      | Description                                                                                                                          |
| --------- | --------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `scores`  | `PartialScore[]` | non-empty; unique `name`s        | Per-metric breakdown. Each entry is `{ name, score, weight? }` (see below). The overall `score` is derived from this list.            |
| `summary` | `string`        | non-empty                        | Concise narrative of findings.                                                                                                       |
| `issues`  | `string[]`      | —                                | Specific issues found, with file/line references where applicable. Empty list if none.                                               |
| `context` | any             | must match `outputSchema` if set | Additional structured data. Validated against the evaluator's `outputSchema` at write time and again when the evaluator reads the file. |
| `score`   | `float`         | `[0.0, 1.0]`                     | Overall evaluation score, **derived** (not agent-supplied) as the weighted average of `scores`, rounded to 3 dp.                     |

Each `PartialScore` in `scores` has:

| Field    | Type     | Constraints    | Description                                                                                            |
| -------- | -------- | -------------- | ------------------------------------------------------------------------------------------------------ |
| `name`   | `string` | non-empty, unique | Label for the metric.                                                                               |
| `score`  | `float`  | `[0.0, 1.0]`   | The metric's score. 1.0 = fully passing, 0.0 = fully failing.                                          |
| `weight` | `float`  | `>= 0`, default `1.0` | Relative importance. A larger weight matters more; `0` records the metric without affecting the overall score. |

The overall score is `round(sum(weight × score) / sum(weight), 3)`. Weights that sum to zero are rejected (no signal to aggregate).

The verdict becomes a `ScoreResult` in the SDK and is mapped onto the API's score fields:

- `score` (derived) → the score's numeric `value`.
- `summary` → the score's `reason`.
- `issues`, `context`, and the per-metric `scores` breakdown → the score's `context` field, as an envelope `{ "output": <verdict context>, "metadata": { "issues": [...], "scores": [...] } }`. The agent's schema-governed `context` is isolated under `output`; toolkit-produced detail (issues + the derived breakdown) lives under `metadata`.

The `context` field is persisted and returned by the API (`ScoreOutput.context`), so consumers can retrieve the full per-metric breakdown — e.g. via `eval result list`/`eval result get`, alongside `value` and `reason`.

## Configuration

The **evaluator name** (for `--evaluator-name`) is `agent-as-judge`. The **scorer name** (for `--scorers-json`) is `agent_as_judge`.

Configuration is split across two places in the scorer config:

- **`scores`** — a map of score name → evaluator definition. Each entry is either a custom evaluator (description-driven) or a reference to a built-in evaluator. The **score name is the evaluator name** (it surfaces as `agent_as_judge.<score-name>` in the result), so custom evaluators do not carry their own `name` field.
- **`params`** — agent-level settings shared across all scores (`agentModel`, `agentTemperature`).

> **Field casing:** all field names accept both camelCase (`requirementDocs`, `outputSchema`, `builtIn`) and snake_case (`requirement_docs`, `output_schema`, `built_in`). camelCase is shown below for consistency with the rest of the API. The built-in vs. custom distinction is made by the presence of the `builtIn` / `built_in` key.

### Full configuration schema

```jsonc
{
  "scorers": {
    "agent_as_judge": {
      // One entry per evaluator. The KEY is the score/evaluator name.
      // Each value is either a custom evaluator (description-driven) or
      // a reference to a built-in evaluator (carries "builtIn").
      "scores": {
        // ── Custom evaluator ──────────────────────────────────────────
        "code_quality": {
          "description": "Evaluate the code quality of the submission...", // required, non-empty
          "config": { "threshold": 0.8 },             // optional, free-form YAML-friendly dict
          "outputSchema": { "type": "object", ... },  // optional JSON Schema (Draft-07)
          "requirementDocs": [                         // optional: S3 refs to requirement docs
            { "bucketName": "<your-etk-data-bucket>", "prefix": "evaluation/agent-as-judge/coding-standards/" }
          ]
        },
        // ── Built-in evaluator reference ──────────────────────────────
        "requirements_compliance": {
          "builtIn": "requirements_compliance",        // required
          "config": { "strict": true },                // optional
          "outputSchema": { ... },                     // optional, overrides the built-in default
          "requirementDocs": [                         // optional
            { "bucketName": "<your-etk-data-bucket>", "prefix": "evaluation/agent-as-judge/requirements/" }
          ]
        }
      },
      "params": {
        "agentModel": "global.anthropic.claude-sonnet-4-6",  // optional, default shown
        "agentTemperature": 0.1                              // optional, default shown
      }
    }
  }
}
```

Field reference:

| Field                                   | Required | Default                              | Description                                                                                                     |
| --------------------------------------- | -------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `scores`                                | Yes      | —                                    | Non-empty map of score name → evaluator definition. The key is the evaluator/score name.                        |
| `scores.<name>.description`             | Custom   | —                                    | Natural-language instructions for the agent.                                                                    |
| `scores.<name>.config`                  | No       | `null`                               | Free-form dict rendered into the agent prompt as YAML (threshold, rubric, criteria…).                           |
| `scores.<name>.outputSchema`            | No       | `null`                               | JSON Schema (Draft-07) that the verdict's `context` must satisfy. Validated at config load and at verdict time. |
| `scores.<name>.requirementDocs`         | No       | `null`                               | List of `{bucketName, prefix}` S3 locations. Downloaded once per job and made available to the agent.           |
| `scores.<name>.builtIn`                 | Built-in | —                                    | Name of a built-in evaluator (see below). Its presence marks the entry as a built-in reference; mutually exclusive with `description`. |
| `params.agentModel`                     | No       | `global.anthropic.claude-sonnet-4-6` | Bedrock model ID (without the `amazon-bedrock/` prefix — added automatically).                                  |
| `params.agentTemperature`               | No       | `0.1`                                | Sampling temperature for the judge agent.                                                                       |

### Custom evaluator — full example

The following example demonstrates every available field for a custom evaluator (the score name `code_quality` is the evaluator name):

```jsonc
{
  "scorers": {
    "agent_as_judge": {
      "scores": {
        "code_quality": {
          // "description" is the natural-language task description sent to
          // the judge agent as the core evaluation instruction. Write it
          // like a rubric: be explicit about what good/bad looks like.
          // Required, non-empty.
          "description": "Evaluate the code quality of the submitted Python module.\n\nScore 1.0 if the submission:\n- Has clear, descriptive variable and function names\n- Includes docstrings on all public functions and classes\n- Has no obvious logic errors or unhandled edge cases\n- Follows PEP 8 style conventions\n\nDeduct proportionally for each missing or partially met criterion.\nScore 0.0 if the file is empty, not valid Python, or completely unreadable.",

          // "config" is an optional free-form dict injected into the agent
          // prompt as a YAML block under "### Evaluator Parameters".
          // Use it to pass thresholds, rubric weights, or any other
          // structured parameters your description refers to.
          "config": {
            "minimumPassingScore": 0.7,
            "rubric": {
              "naming": 0.25,
              "docstrings": 0.25,
              "correctness": 0.35,
              "style": 0.15
            }
          },

          // "outputSchema" is an optional JSON Schema (Draft-07) that the
          // verdict's "context" field must satisfy. The agent is instructed
          // to populate "context" accordingly, and the schema is validated
          // both when the agent calls write_verdict and again when the
          // evaluator reads the verdict file.
          // Omit to allow context to be any value (or null).
          "outputSchema": {
            "type": "object",
            "required": ["rubricScores", "passedThreshold"],
            "additionalProperties": false,
            "properties": {
              "rubricScores": {
                "type": "object",
                "description": "Per-criterion scores from the rubric.",
                "properties": {
                  "naming":      { "type": "number", "minimum": 0, "maximum": 1 },
                  "docstrings":  { "type": "number", "minimum": 0, "maximum": 1 },
                  "correctness": { "type": "number", "minimum": 0, "maximum": 1 },
                  "style":       { "type": "number", "minimum": 0, "maximum": 1 }
                }
              },
              "passedThreshold": {
                "type": "boolean",
                "description": "True if the weighted score meets minimumPassingScore."
              }
            }
          },

          // "requirementDocs" is an optional list of S3 locations. Each
          // entry is downloaded (once per job, not per test case) to a
          // temp directory and made available to the agent under
          // "## Reference Documents". Use it to supply standards, style
          // guides, or requirement specifications the agent should consult.
          // Omit if your evaluation is fully self-contained in "description".
          "requirementDocs": [
            { "bucketName": "<your-etk-data-bucket>", "prefix": "evaluation/agent-as-judge/python-style-guide/" },
            { "bucketName": "<your-etk-data-bucket>", "prefix": "evaluation/agent-as-judge/project-coding-standards.md" }
          ]
        }
      },

      // Optional — defaults shown.
      "params": {
        "agentModel": "global.anthropic.claude-sonnet-4-6",
        "agentTemperature": 0.1
      }
    }
  }
}
```

### Built-in evaluators

The evaluator ships with ready-made evaluators that are referenced by name via `builtIn`. They carry pre-written instructions and output schemas so the customer only has to supply `config` and/or `requirementDocs` when needed.

| `builtIn` key               | What it does                                                                                                                                                                                                                                                                                                                                          |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `requirements_compliance`   | Collects requirements from `requirementDocs` and/or `config`, builds an explicit numbered checklist (`REQ-1`, `REQ-2`, …), scores each requirement on `[0, 1]`, and returns a per-requirement breakdown with evidence citations (filename + line range + explanation). Final score is the (weighted, if specified) average of per-requirement scores. |

Example usage of a built-in evaluator:

```json
{
  "scorers": {
    "agent_as_judge": {
      "scores": {
        "requirements_compliance": {
          "builtIn": "requirements_compliance",
          "requirementDocs": [{ "bucketName": "<your-etk-data-bucket>", "prefix": "evaluation/agent-as-judge/coding-standards/" }]
        }
      }
    }
  }
}
```

Example output for the `requirements_compliance` evaluator:

```json
[
  {
    "name": "requirements_compliance",
    "value": 0.3,
    "error": null,
    "context": {
      "requirements": [
        {
          "id": "REQ-1",
          "description": "CSC-01: All S3 buckets must have server-side encryption (SSE-S3 or SSE-KMS) enabled.",
          "score": 0,
          "rationale": {
            "filename": "s3-bucket-inventory.md",
            "lines": { "from": 9, "to": 13 },
            "explanation": "bucket-legacy-backups has SSE Enabled = No and SSE Type = — (line 9). The notes confirm encryption has not been enabled and is only scheduled for Q1 2025 (lines 12-13). 3 of 4 buckets comply, but any non-compliant bucket constitutes a control failure under CSC-01."
          }
        },
        {
          "id": "REQ-2",
          "description": "CSC-02: All S3 buckets must have Block Public Access enabled on all four settings.",
          "score": 1,
          "rationale": {
            "filename": "s3-bucket-inventory.md",
            "lines": { "from": 6, "to": 9 },
            "explanation": "All four buckets show 'Public Access Blocked = Yes'. Full compliance."
          }
        }
      ]
    }
  }
]
```

### Environment variables

#### User-configurable

These variables are intended to be set by the operator to tune runtime behaviour:

| Variable                     | Default | Purpose                                                                                                                                                                                                                  |
| ---------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `LOG_LEVEL`                  | `INFO`  | Python `logging` level. Accepted values: `DEBUG`, `INFO`, `WARNING`, `ERROR`, `CRITICAL`.                                                                                                                               |
| `SUBPROCESS_TIMEOUT_MINUTES` | `30`    | Maximum time (in whole minutes) the agent subprocess is allowed to run per evaluator before it is killed. Must be a positive integer; absent, blank, non-integer, or non-positive values all fall back silently to `30`. |

On subprocess timeout the evaluator returns an error `ScoreResult` rather than crashing the whole job — the remaining evaluators and test cases continue to run.

#### Internal / runtime-injected

These variables are set automatically by the evaluator at runtime and are not intended to be configured externally:

| Variable                      | Set by                    | Read by                | Purpose                                                                                                                                                                                                          |
| ----------------------------- | ------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OPENCODE_CONFIG_CONTENT`     | `runner._build_agent_env` | `opencode` subprocess  | JSON-serialized opencode configuration (model, agent settings, MCP tool registration, bash permission allow-list). Consumed by the `opencode run` process before it starts.                                     |
| `OPENCODE_DISABLE_AUTOUPDATE` | `runner._build_agent_env` | `opencode` subprocess  | Always set to `1` so `opencode` does not attempt an update check at startup (isolated subnet, no internet egress). Hard-coded; cannot be overridden.                                                             |
| `OPENCODE_TELEMETRY_DISABLED` | `runner._build_agent_env` | `opencode` subprocess  | Always set to `1` to disable `opencode` telemetry. Hard-coded.                                                                                                                                                  |
| `DO_NOT_TRACK`                | `runner._build_agent_env` | `opencode` subprocess  | Industry-standard "do not track" hint, also honoured by `opencode`. Set alongside `OPENCODE_TELEMETRY_DISABLED` for redundancy. Hard-coded.                                                                     |
| `VERDICT_FILE`                | `runner._build_agent_env` | `tools/verdict.py`     | Absolute path to the JSON file where `write_verdict` writes the structured verdict. Created inside a `tempfile.mkdtemp()` directory; deleted after each test case regardless of outcome.                        |
| `ERROR_FILE`                  | `runner._build_agent_env` | `tools/verdict.py`     | Absolute path to the text file where `write_error` writes a terminal error message.                                                                                                                             |
| `OUTPUT_SCHEMA`               | `runner._build_agent_env` | `tools/verdict.py`     | JSON-serialized JSON Schema string for the verdict's `context` field. Only set when the evaluator defines `outputSchema`; when absent, context schema validation is skipped.                                    |

### Per-test-case error isolation

Each test case is evaluated independently. If a given test case raises an exception (bad JSON, artifact download failure, or any other runtime error), the evaluator logs the error, emits one error `ScoreResult` per configured evaluator for that test case, and moves on to the next one. A single bad test case never aborts the whole evaluation job.

## Security considerations

### Model-invocation scope

The IAM grant for this evaluator permits `bedrock:InvokeModel` on any foundation model or inference profile in the deploying account (`foundation-model:*` + `inference-profile:*`). The `agentModel` configuration value is read from the per-invocation params at runtime, so synth-time IAM cannot pin the grant to the specific configured model. Enforcement of `agentModel` happens at the application layer only — the system prompt and the OpenCode model config — not at the IAM layer. A prompt-injected agent or a misconfigured invocation could therefore invoke a different Bedrock model than the one declared in the configuration.

The confidentiality impact is bounded: the response stays inside the runtime and there is no exfiltration channel (see [Network isolation](#network-isolation)). The residual concerns are cost, audit posture, and any account-level policy that disallows certain models.

To constrain the set of reachable models, deploy with a Bedrock guardrail or an account-level service control policy that restricts `bedrock:InvokeModel` to your supported list.

## Supported Models

The `agentModel` field accepts any Bedrock model ID (bare, without the `amazon-bedrock/` prefix — the evaluator adds it automatically). However, not all Bedrock models are suitable for agentic use.

### Recommended: Claude 4.x family

```
global.anthropic.claude-sonnet-4-6   ← default, recommended
global.anthropic.claude-haiku-4-5    ← cheaper, faster
eu.anthropic.claude-sonnet-4-5-20250929-v1:0
```

These are the only models currently well-tested and confirmed to work reliably. They satisfy all three requirements for agentic tool use:

1. **High output token limit (64K)** — the agent needs room to reason and then emit tool calls. Models with low output caps (e.g. Amazon Nova Pro at 5K) exhaust their budget during reasoning and fail to call `write_verdict`.
2. **Tool use via `bedrock-runtime`** — OpenCode uses the AWS Converse API (`bedrock-runtime` endpoint). Models that only expose tool use via the newer `bedrock-mantle` endpoint (Mistral Large 3, Devstral, Kimi K2.5, Qwen3, DeepSeek V3.2, etc.) are not reachable by OpenCode today.
3. **Reliable tool calling behaviour** — the model must consistently choose to call tools rather than producing text-only responses.

### Why other models don't work today

**Amazon Nova (Pro, Lite, Micro):** Support tool use via `bedrock-runtime` but have a hard 5K max output token cap. The agent's reasoning fills this budget before it can emit a `write_verdict` tool call.

**Mistral Large 3, Devstral, Kimi K2.5, Qwen3, DeepSeek V3.2, MiniMax, gpt-oss:** Have adequate output limits but only expose tool use through the `bedrock-mantle` endpoint, which uses the OpenAI-compatible API surface. OpenCode's `amazon-bedrock` provider uses the native Converse API (`bedrock-runtime`) and cannot reach these models for tool use.

> **Note:** The Vercel AI SDK (which OpenCode is built on) has an open PR ([vercel/ai#14246](https://github.com/vercel/ai/pull/14246)) adding a `bedrock-mantle` sub-provider. Once merged and picked up by OpenCode, models on the Mantle endpoint would become accessible — potentially opening up Kimi K2.5, Qwen3 Coder, Devstral, and others as viable agent models.

### Model selection summary

| Model                      | Max Output | Tool Use via `bedrock-runtime` | Suitable                |
| -------------------------- | ---------- | ------------------------------ | ----------------------- |
| Claude Sonnet/Haiku 4.x    | 64K        | Yes                            | **Yes**                 |
| Amazon Nova Pro/Lite/Micro | 5K         | Yes                            | No — output cap too low |
| Mistral Large 3, Devstral  | 32K        | No (mantle only)               | No — wrong endpoint     |
| Kimi K2.5, gpt-oss-120b    | 16K        | No (mantle only)               | No — wrong endpoint     |
| Qwen3, DeepSeek V3.2       | 8K         | No (mantle only)               | No — wrong endpoint     |

## Notes

This evaluator has the ability to download requirements and artifacts from S3 in order to collect evidence. If those are provided, then the evaluator needs to be granted access to such S3 bucket.

The deployment grants the agent-as-judge Lambda read access to the `evaluation/agent-as-judge/*` prefix of the data bucket by default. If your artifacts and requirement docs live elsewhere, extend the Lambda execution role permissions accordingly.

When the ETK deployment is configured with `createCustomerKmsKey: true`, the evaluator's Lambda execution role automatically receives `kms:Decrypt` on the ETK-managed CMK. This means any customer bucket encrypted with that same key (e.g. an `artifacts` or `requirementDocs` bucket sharing the ETK CMK) will be readable as soon as the operator grants S3 read access on that bucket — no extra KMS wiring needed. Operators remain responsible for granting S3 read access on those buckets, and for granting `kms:Decrypt` on any *other* (non-ETK) KMS keys their referenced buckets are encrypted with.
