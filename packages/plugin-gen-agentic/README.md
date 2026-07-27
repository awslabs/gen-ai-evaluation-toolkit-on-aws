# Agentic Ground Truth Generation Plugin

A GenAI Evaluation Toolkit plugin for generating test cases for agentic applications.

## Documentation

For detailed understanding of the plugin, read the docs in this order:

1. **[Architecture](./docs/architecture.md)** — Start here. Covers the core pipeline stages (taxonomy, scenarios, generation, review sampling), output formats, concurrency handling, and error strategies.

2. **[OTEL Trace Support](./docs/otel-trace-support.md)** — Read after architecture. Covers how to use production OTEL traces for trace-grounded generation, high-volume handling strategies, and future enhancements.

## Overview

This plugin automates the creation of evaluation test cases for AI agents. It uses a multi-stage LLM pipeline:

1. **Trace Extraction** (optional): Extracts conversations from OTEL traces in a customer-specified S3 bucket
2. **Taxonomy Stage**: Constructs a coverage taxonomy from agent config and trace patterns
3. **Scenario Sampling**: Samples diverse scenarios across taxonomy axes
4. **Test Case Generation**: Expands scenarios into structured test cases with expected tool calls
5. **Augmentation** (optional): Produces per-strategy variations of base test cases (rephrase, parameter variation, multi-turn extension, edge case, negative case)
6. **Review Sampling**: Tags a stratified fraction of output with `requiresReview` for human curation

## Features

- Taxonomy-driven planning to prevent mode collapse
- Support for system prompts, tool definitions, seed examples, and focus areas
- **OTEL trace extraction** for trace-grounded generation from production data
- Tool call validation against JSON schemas
- Concurrent test case generation
- Per-strategy augmentation for robustness coverage (rephrase / parameter variation / multi-turn extension / edge case / negative case)
- Stratified review sampling for silver→gold curation
- S3 reference support for large inputs (>1MB)
- Writes intermediate results (taxonomy, scenarios, trace coverage) to the internal ETK Agentic GTG Plugin S3 bucket for debugging

## Configuration

```json
{
  "plugin": "agenticTestCases",
  "configuration": {
    "modelId": "anthropic.claude-sonnet-4-5-20250929-v1:0",
    "totalTestCases": 50,
    "agent": {
      "systemPrompt": "You are a product assistant...",
      "tools": [
        {
          "name": "get_product_info",
          "description": "Get information about a product",
          "parameters": {
            "type": "object",
            "properties": {
              "product_type": {
                "type": "string",
                "enum": ["laptops", "tablets", "smartphones"]
              }
            },
            "required": ["product_type"]
          }
        }
      ]
    },
    "focusAreas": ["multi-tool queries", "edge cases with missing parameters"],
    "seedExamples": [
      {
        "input": "What laptops do you have?",
        "expected": {
          "response": "We have various laptops with Intel and AMD processors.",
          "topics": ["product-info", "laptops"]
        }
      }
    ],
    "traces": {
      "source": "s3",
      "location": "s3://my-bucket/traces/",
      "maxConversations": 500,
      "errorSampleRate": 1.0,
      "successSampleRate": 0.1,
      "abandonmentSampleRate": 0.5
    }
  }
}
```

## Configuration Options

### Top-level options

| Option                    | Type     | Required | Default                                     | Description                                                                  |
| ------------------------- | -------- | -------- | ------------------------------------------- | ---------------------------------------------------------------------------- |
| `modelId`                 | string   | No       | `anthropic.claude-sonnet-4-5-20250929-v1:0` | Bedrock model ID for generation                                              |
| `totalTestCases`          | number   | Yes      | -                                           | Target number of base test cases (augmentation cases are produced on top)    |
| `focusAreas`              | string[] | No       | -                                           | Specific patterns or edge cases to prioritize                                |
| `seedExamples`            | array    | No       | -                                           | Few-shot examples to guide generation style                                  |
| `taxonomyAxes`            | object   | No       | -                                           | Override default taxonomy axes                                               |
| `augmentationStrategies`  | string[] | No       | `[]`                                        | Strategies to apply post-generation (see [Augmentation](#augmentation))      |
| `reviewSampleRate`        | number   | No       | `0.2`                                       | Fraction of output tagged `requiresReview=true`, stratified by provenance    |

### `agent` (optional)

| Option         | Type            | Description                                           |
| -------------- | --------------- | ----------------------------------------------------- |
| `systemPrompt` | string \| S3Uri | The agent's system prompt                             |
| `tools`        | array \| S3Uri  | Array of tool definitions with JSON Schema parameters |

### `traces` (optional)

Enable trace-grounded generation by extracting patterns from production OTEL traces.

| Option                  | Type   | Default | Description                                         |
| ----------------------- | ------ | ------- | --------------------------------------------------- |
| `source`                | `"s3"` | -       | Trace source type (currently only S3 supported)     |
| `location`              | string | -       | S3 URI to trace files (e.g., `s3://bucket/prefix/`) |
| `maxConversations`      | number | 500     | Maximum conversations to sample                     |
| `errorSampleRate`       | number | 1.0     | Sample rate for failure traces (0.0-1.0)            |
| `successSampleRate`     | number | 0.1     | Sample rate for success traces (0.0-1.0)            |
| `abandonmentSampleRate` | number | 0.5     | Sample rate for abandonment traces (0.0-1.0)        |

### S3 References for Large Inputs

For inputs exceeding 1MB (large system prompts, extensive tool definitions, or many seed examples), use S3 references instead of inline values:

```json
{
  "agent": {
    "systemPrompt": { "s3": "s3://my-bucket/prompts/system-prompt.txt" },
    "tools": { "s3": "s3://my-bucket/config/tool-definitions.json" }
  },
  "seedExamples": { "s3": "s3://my-bucket/examples/seed-examples.json" }
}
```

The S3 objects must be accessible to the plugin's IAM role. JSON files (`tools`, `seedExamples`) are parsed and validated against their schemas after retrieval.

## Output Format

Each test case is written as a JSON file:

```json
{
  "input": "What are the specs for tablets?",
  "expected": {
    "response": "Tablets have 10-12 inch displays with all-day battery life.",
    "topics": ["product-info", "tablets"],
    "toolCalls": [
      {
        "name": "get_product_info",
        "args": { "product_type": "tablets" }
      }
    ]
  },
  "context": {
    "provenance": {
      "source": "gap_fill",
      "scenarioId": "scenario-001",
      "planAxis": "get_product_info"
    }
  },
  "requiresReview": false
}
```

### Review Sampling

LLM-generated test cases are silver data — they need human review before being treated as authoritative. After generation, a configurable fraction is tagged `requiresReview: true`, **stratified by `provenance.source`** so low-volume sources (e.g. `failure_pattern`) aren't under-sampled by uniform random.

- Default rate: `0.2` (20%). Regulated-domain customers raise this; HSBC/FactSet-style deployments often run at `1.0`.
- Stratification: each provenance group (`gap_fill`, `focus_area`, `failure_pattern`, `augmentation`) is sampled independently using ceil rounding, so any non-empty group with rate > 0 has at least one flagged case.
- Per-source counts are logged at the end of the run.

### Multi-turn test cases

For multi-turn conversations, `input` is an array and `toolCalls` is an array-of-arrays (one per turn):

```json
{
  "input": ["Find me a laptop", "What about the battery life?"],
  "expected": {
    "response": "The laptop has 12-hour battery life.",
    "topics": ["product-info", "laptops", "battery"],
    "toolCalls": [
      [{ "name": "search_products", "args": { "query": "laptop" } }],
      [{ "name": "get_product_info", "args": { "product_id": "laptop-x1" } }]
    ]
  }
}
```

### Provenance sources

- `gap_fill`: Generated to cover untested tool/combination gaps
- `focus_area`: Generated from user-specified focus areas
- `failure_pattern`: Generated from observed failure patterns in traces
- `augmentation`: Produced by the augmentation stage from a base case

For augmentation cases, `provenance` also carries `augmentationStrategy` (which strategy was applied) and `parentScenarioId` (the base case it was derived from), e.g.:

```json
{
  "context": {
    "provenance": {
      "source": "augmentation",
      "scenarioId": "scenario-001-rephrase",
      "augmentationStrategy": "rephrase",
      "parentScenarioId": "scenario-001"
    }
  }
}
```

## Augmentation

After base test cases are generated, the augmentation stage produces variations by applying customer-selected strategies. One LLM call runs per `(base_case, strategy)` pair (HLD §2.7.5), so cost is linear in `totalTestCases × strategies.length`. Output is appended to the base set; review sampling then runs over the merged pool.

### Strategies

| Strategy               | What it does                                             | Requires           |
| ---------------------- | -------------------------------------------------------- | ------------------ |
| `rephrase`             | Same intent and tool calls, different user wording       | —                  |
| `parameter_variation`  | Same tools, different valid argument values              | tool definitions   |
| `multi_turn_extension` | Adds 1–2 follow-up turns to single-turn base cases       | —                  |
| `edge_case`            | Boundary inputs, ambiguous queries, missing parameters   | —                  |
| `negative_case`        | Out-of-scope, adversarial, refusal scenarios             | system prompt      |

### Gating

If a requested strategy is missing its prerequisites, it is skipped with a warning rather than failing the run:

- `parameter_variation` without `agent.tools` → skipped
- `negative_case` without `agent.systemPrompt` → skipped

If all requested strategies are skipped, the augmentation stage is bypassed entirely.

### Example configuration

```json
{
  "configuration": {
    "totalTestCases": 50,
    "agent": { "systemPrompt": "...", "tools": [/* ... */] },
    "augmentationStrategies": ["rephrase", "parameter_variation", "negative_case"],
    "reviewSampleRate": 0.3
  }
}
```

This produces 50 base cases plus up to 150 augmented cases (50 × 3 strategies), of which 30% per provenance group are flagged for review.

## Trace-Grounded Generation

When `traces` configuration is provided, the plugin extracts real conversations from OTEL traces and uses them to:

1. **Enhance taxonomy** with observed tool usage patterns
2. **Generate failure scenarios** from production error patterns
3. **Ground test cases** with realistic examples matching each scenario's tools

This produces test cases that reflect actual production usage rather than synthetic patterns.

For detailed architecture and implementation details, see [docs/otel-trace-support.md](docs/otel-trace-support.md).

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Type check
npm run typecheck

# Lint
npm run lint

# Build
npx tsc
```

## Local Testing

The `scripts/` directory contains utilities for local development testing before CDK deployment.

```bash
# Run with default config (complex-agent-config.json)
npx tsx scripts/test-local.ts

# Override total test cases
npx tsx scripts/test-local.ts --total 10

# Custom config file
npx tsx scripts/test-local.ts --config path/to/config.json
```

Results are written to `./output/<run-id>/` with taxonomy, scenarios, and test cases. See `scripts/README.md` for details.

## Environment Variables

- `CONFIG`: JSON stringified trigger event (set by workflow)
- `EVENT_BUS_ARN`: EventBridge ARN for callbacks
- `INTERNAL_S3_BUCKET`: Bucket for intermediate results
- `PLUGIN_NAME`: Plugin identifier (default: "AgenticGenerator")
