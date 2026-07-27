# Agentic GTG Plugin Architecture

This document describes the architecture and pipeline of the Agentic Ground Truth Generation (GTG) plugin.

## Related Documentation

- **[OTEL Trace Support](./otel-trace-support.md)** — How to use production OTEL traces for trace-grounded test generation

## Overview

The Agentic GTG plugin generates test cases for AI agents through a multi-stage LLM pipeline. It uses taxonomy-driven planning to ensure diverse coverage and prevent mode collapse.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         What is Agentic GTG?                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   Taxonomy ──► Scenarios ──► Generate ──► Augment* ──► Review               │
│                                           (* optional)                      │
│                                                                             │
│   INPUTS                                              OUTPUTS               │
│   • System Prompt                                     • input               │
│   • Tool Definitions                                  • expected            │
│   • Focus Areas                                       • toolCalls           │
│   • Seed Examples                                     • provenance          │
│   • OTEL Traces (optional)                            • requiresReview      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Pipeline Stages

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Agentic GTG Pipeline                                 │
└─────────────────────────────────────────────────────────────────────────────┘

  Input Config                Stage 1                    Stage 2
  ┌─────────────┐          ┌─────────────┐           ┌─────────────┐
  │ System      │          │  Taxonomy   │           │  Scenario   │
  │ Prompt      │────────► │  Building   │─────────► │  Sampling   │
  │ Tools       │          │             │           │             │
  │ Focus Areas │          └─────────────┘           └──────┬──────┘
  └─────────────┘                                           │
                                                            ▼
   Stage 4 (optional)         Stage 3
  ┌─────────────┐          ┌─────────────┐           ┌─────────────┐
  │  Augment-   │          │  Test Case  │           │  Scenario   │
  │  ation      │◄──────── │  Generation │◄───────── │    List     │
  │             │          │             │           │             │
  └──────┬──────┘          └─────────────┘           └─────────────┘
         │
         ▼
   Stage 5
  ┌─────────────┐          ┌─────────────┐
  │   Review    │          │   Final     │
  │  Sampling   │────────► │   Output    │
  │             │          │  (yielded)  │
  └─────────────┘          └─────────────┘
```

## Stage 1: Taxonomy Building

The taxonomy stage analyzes the agent configuration to build a coverage taxonomy.

### What is a Taxonomy?

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Coverage Taxonomy                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  A taxonomy defines the DIMENSIONS of test coverage:                        │
│                                                                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐              │
│  │   Tool Axis     │  │ Complexity Axis │  │  Outcome Axis   │              │
│  ├─────────────────┤  ├─────────────────┤  ├─────────────────┤              │
│  │ • get_product   │  │ • simple        │  │ • success       │              │
│  │ • search        │  │ • moderate      │  │ • partial       │              │
│  │ • checkout      │  │ • complex       │  │ • failure       │              │
│  │ • get+search    │  │                 │  │ • refusal       │              │
│  │ • search+check  │  │                 │  │                 │              │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘              │
│                                                                             │
│  Cross-product creates test scenarios:                                      │
│  (get_product × simple × success), (search × complex × failure), etc.       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Taxonomy Building Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Stage 1: Taxonomy Building                             │
└─────────────────────────────────────────────────────────────────────────────┘

                              ┌─────────────────┐
                              │   LLM Prompt    │
                              │   "Analyze      │
                              │    agent and    │
                              │    build axes"  │
                              └────────┬────────┘
                                       │
         ┌─────────────────────────────┼─────────────────────────────┐
         │                             │                             │
         ▼                             ▼                             ▼
  ┌─────────────┐              ┌─────────────┐              ┌─────────────┐
  │   System    │              │    Tool     │              │   Focus     │
  │   Prompt    │              │ Definitions │              │   Areas     │
  │             │              │             │              │             │
  │ "You are a  │              │ get_product │              │ "error      │
  │  shopping   │              │ search      │              │  handling"  │
  │  assistant" │              │ checkout    │              │ "multi-tool │
  │             │              │             │              │  queries"   │
  └──────┬──────┘              └──────┬──────┘              └──────┬──────┘
         │                             │                             │
         └─────────────────────────────┼─────────────────────────────┘
                                       │
                                       ▼
                              ┌─────────────────┐
                              │    Taxonomy     │
                              ├─────────────────┤
                              │ toolAxes:       │
                              │   - single      │
                              │   - combos      │
                              │ complexityAxes: │
                              │   - simple      │
                              │   - moderate    │
                              │   - complex     │
                              │ outcomeAxes:    │
                              │   - success     │
                              │   - failure     │
                              └─────────────────┘
```

### Default Taxonomy Fallback

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Taxonomy Fallback Strategy                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│                    ┌─────────────────┐                                      │
│                    │  LLM Taxonomy   │                                      │
│                    │   Construction  │                                      │
│                    └────────┬────────┘                                      │
│                             │                                               │
│              ┌──────────────┴──────────────┐                                │
│              │                             │                                │
│              ▼                             ▼                                │
│       ┌─────────────┐              ┌─────────────┐                          │
│       │   Success   │              │   Failure   │                          │
│       │             │              │  (timeout,  │                          │
│       │  Use LLM    │              │  parse err) │                          │
│       │  taxonomy   │              │             │                          │
│       └─────────────┘              └──────┬──────┘                          │
│                                           │                                 │
│                                           ▼                                 │
│                                    ┌─────────────┐                          │
│                                    │   Default   │                          │
│                                    │  Taxonomy   │                          │
│                                    ├─────────────┤                          │
│                                    │ Built from: │                          │
│                                    │ • Tools     │                          │
│                                    │ • Focus     │                          │
│                                    │   areas     │                          │
│                                    └─────────────┘                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Stage 2: Scenario Sampling

The planner samples scenarios across the taxonomy to ensure diverse coverage.

### Scenario Sampling Strategy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Stage 2: Scenario Sampling                             │
└─────────────────────────────────────────────────────────────────────────────┘

  Taxonomy Cross-Product                Prioritization              Deduplication
  ┌─────────────────────┐            ┌─────────────────┐         ┌─────────────────┐
  │                     │            │                 │         │                 │
  │  Tool × Complexity  │            │  1. Gap Fill    │         │  Remove Similar │
  │       × Outcome     │            │  2. Focus Areas │         │  Scenarios      │
  │                     │            │  3. Failures    │         │                 │
  │  Creates N cells    │──────────► │                 │───────► │                 │
  │  (e.g., 45 combos)  │            │  Sample up to   │         │  Final list of  │
  │                     │            │  totalTestCases │         │  unique cases   │
  └─────────────────────┘            └─────────────────┘         └─────────────────┘

  Example: 3 tools × 3 complexity × 3 outcomes = 27 base cells
           + tool combinations = ~45 total cells
```

### Scenario Sources

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Scenario Sources                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                          gap_fill                                   │    │
│  │  ┌─────────────────────────────────────────────────────────────┐    │    │
│  │  │ Generated to cover untested tool/combination gaps           │    │    │
│  │  │ Example: "Test get_product with complex multi-step query"   │    │    │
│  │  └─────────────────────────────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                         focus_area                                  │    │
│  │  ┌─────────────────────────────────────────────────────────────┐    │    │
│  │  │ Generated from user-specified priority areas                │    │    │
│  │  │ Example: "Test error handling when product not found"       │    │    │
│  │  └─────────────────────────────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                       failure_pattern                               │    │
│  │  ┌─────────────────────────────────────────────────────────────┐    │    │
│  │  │ Generated from observed failure patterns in traces          │    │    │
│  │  │ Example: "Test timeout scenario with search_products"       │    │    │
│  │  └─────────────────────────────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Scenario Object Structure

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Scenario Object                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  {                                                                          │
│    "id": "scenario-001",              ◄── Unique identifier                 │
│    "description": "User searches      ◄── Human-readable description        │
│         for product and checks                                              │
│         inventory",                                                         │
│    "toolsInvolved": [                 ◄── Tools to use in test              │
│      "search_products",                                                     │
│      "check_inventory"                                                      │
│    ],                                                                       │
│    "turnCount": 2,                    ◄── Number of conversation turns      │
│    "outcome": "success",              ◄── Expected outcome                  │
│    "source": "gap_fill"               ◄── How scenario was generated        │
│  }                                                                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Stage 3: Test Case Generation

The generator expands each scenario into a complete test case.

### Generation Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Stage 3: Test Case Generation                          │
└─────────────────────────────────────────────────────────────────────────────┘

  For each scenario:

  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
  │  Scenario   │     │   Build     │     │  LLM Call   │     │  Validate   │
  │             │────►│   Prompt    │────►│  (with      │────►│  Output     │
  │             │     │             │     │   retry)    │     │             │
  └─────────────┘     └─────────────┘     └─────────────┘     └──────┬──────┘
                                                                      │
                             ┌────────────────────────────────────────┘
                             │
                             ▼
                      ┌──────────────┐
                      │  Test Case   │
                      │  ┌────────┐  │
                      │  │ input  │  │
                      │  │ expect │  │
                      │  │ context│  │
                      │  └────────┘  │
                      └──────────────┘
```

### Prompt Construction

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Generation Prompt Structure                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                        SYSTEM CONTEXT                               │    │
│  │  "You are generating a test case for an AI agent..."                │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                              │                                              │
│                              ▼                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                      AGENT DESCRIPTION                              │    │
│  │  System Prompt: "You are a shopping assistant..."                   │    │
│  │  Available Tools: [get_product, search_products, ...]               │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                              │                                              │
│                              ▼                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                      SCENARIO DETAILS                               │    │
│  │  Description: "User searches and checks inventory"                  │    │
│  │  Tools to use: [search_products, check_inventory]                   │    │
│  │  Turn count: 2                                                      │    │
│  │  Expected outcome: success                                          │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                              │                                              │
│                              ▼                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                       SEED EXAMPLES                                 │    │
│  │  Example 1: { input: "...", expected: {...} }                       │    │
│  │  Example 2: { input: "...", expected: {...} }                       │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Retry Logic

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         LLM Retry Flow                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│                         ┌─────────────┐                                     │
│                         │  LLM Call   │                                     │
│                         └──────┬──────┘                                     │
│                                │                                            │
│                   ┌────────────┴────────────┐                               │
│                   │                         │                               │
│                   ▼                         ▼                               │
│            ┌─────────────┐           ┌─────────────┐                        │
│            │   Success   │           │   Failure   │                        │
│            │  (valid     │           │  (parse or  │                        │
│            │   JSON)     │           │   validate) │                        │
│            └──────┬──────┘           └──────┬──────┘                        │
│                   │                         │                               │
│                   ▼                         ▼                               │
│            ┌─────────────┐           ┌─────────────┐                        │
│            │  Validate   │           │  Retry with │◄──────┐                │
│            │  Tool Calls │           │  Error Msg  │       │                │
│            └──────┬──────┘           └──────┬──────┘       │                │
│                   │                         │              │                │
│          ┌────────┴────────┐                │         Retry│                │
│          │                 │                │         (max 3)               │
│          ▼                 ▼                │              │                │
│   ┌─────────────┐   ┌─────────────┐         └──────────────┘                │
│   │   Valid     │   │  Invalid    │                                         │
│   │             │   │  (missing   │                                         │
│   │  Return     │   │   tools)    │────────► Retry with hints               │
│   │  Test Case  │   │             │                                         │
│   └─────────────┘   └─────────────┘                                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Stage 4: Augmentation (Optional)

When `augmentationStrategies` is non-empty, base test cases are expanded with per-strategy variations. Per HLD §2.4.4 / §2.7.5: **one LLM call per `(base_case, strategy)` pair**. Output is appended to the base pool — augmentation does not replace base cases.

### Strategies and Execution Model

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                  Per-Strategy / Per-Case Execution                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Base test cases                       Strategies (customer-selected)       │
│  ┌─────────┐ ┌─────────┐               ┌────────────┐ ┌────────────┐        │
│  │ base-01 │ │ base-02 │       ...     │  rephrase  │ │ edge_case  │  ...   │
│  └────┬────┘ └────┬────┘               └─────┬──────┘ └─────┬──────┘        │
│       │           │                          │              │               │
│       └───────────┴──────────────┬───────────┴──────────────┘               │
│                                  ▼                                          │
│                    Cartesian product → N × K LLM calls                      │
│                                  │                                          │
│                                  ▼                                          │
│                       ┌──────────────────────┐                              │
│                       │  Augmented test case │                              │
│                       │  provenance:         │                              │
│                       │    source =          │                              │
│                       │      'augmentation'  │                              │
│                       │    augmentation-     │                              │
│                       │      Strategy = ...  │                              │
│                       │    parentScenarioId  │                              │
│                       │      = base-XX       │                              │
│                       └──────────────────────┘                              │
│                                                                             │
│  Concurrency: default 5 (lower than generator's 10) per HLD §2.6 (line 633).│
│  Adaptive throttle/backoff mirrors the generator stage.                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Strategy Reference

| Strategy               | What it does                                             | Requires           | Tool calls in output                  |
| ---------------------- | -------------------------------------------------------- | ------------------ | ------------------------------------- |
| `rephrase`             | Same intent + tools, different user wording              | —                  | Same as base                          |
| `parameter_variation`  | Same tools, different valid argument values              | tool definitions   | Same names, different args            |
| `multi_turn_extension` | Adds 1–2 follow-up turns to single-turn base cases       | —                  | Per-turn array, base's calls in turn 1|
| `edge_case`            | Boundary, ambiguous, or missing-parameter inputs         | —                  | May be empty (clarification)          |
| `negative_case`        | Out-of-scope, adversarial, refusal                       | system prompt      | Typically empty                       |

### Gating

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       Strategy Gating                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Requested:  [rephrase, parameter_variation, negative_case]                 │
│                                                                             │
│  Inputs:     • tools provided?           No                                 │
│              • systemPrompt provided?    Yes                                │
│                                                                             │
│  Result:     ✓ rephrase            (no prerequisites)                       │
│              ✗ parameter_variation (skipped — requires tools)               │
│              ✓ negative_case       (system prompt available)                │
│                                                                             │
│  Behavior:   skipped strategies log a warning; the run continues.           │
│              If ALL strategies are skipped, augmentation is bypassed.       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Validation

Same as Stage 3:
- Tool calls validate against JSON Schemas (Ajv).
- Schema-invalid output is retried with corrective context (max 3 attempts).
- **Relaxed for `negative_case`**: empty `toolCalls` is valid (refusing the request usually means no tool invocation).

Failed augmentation jobs are dropped (logged); they do not abort the run, since each augmentation case is supplemental.

## Stage 5: Review Sampling

LLM-generated test cases are silver data — they need human review before being treated as authoritative regression suites. After all test cases are generated (including augmentation), the review sampler tags a configurable fraction with `requiresReview: true`.

### Stratified Sampling Strategy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                  Stratified Review Sampling                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Why stratified, not uniform?                                               │
│  Uniform sampling under-samples low-volume sources. If failure_pattern      │
│  cases are 5% of output, a 20% uniform rate may flag zero of them.          │
│  Stratified sampling guarantees coverage across origin types.               │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                     │    │
│  │  Generated Test Cases (e.g., 50 total)                              │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐              │    │
│  │  │  gap_fill   │  │ focus_area  │  │ failure_pattern │              │    │
│  │  │     30      │  │     15      │  │        5        │              │    │
│  │  └──────┬──────┘  └──────┬──────┘  └────────┬────────┘              │    │
│  │         │                │                  │                       │    │
│  │  Sample 20% per group (ceil rounding):                              │    │
│  │         ▼                ▼                  ▼                       │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐              │    │
│  │  │ ceil(0.2×30)│  │ ceil(0.2×15)│  │  ceil(0.2×5)    │              │    │
│  │  │     = 6     │  │     = 3     │  │      = 1        │              │    │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘              │    │
│  │                                                                     │    │
│  │  Total flagged: 10/50  (slightly above 20% due to ceil rounding)    │    │
│  │                                                                     │    │
│  │  When augmentation is enabled, augmented cases form their own       │    │
│  │  'augmentation' group and are stratified the same way.              │    │
│  │                                                                     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Configuration

| Option              | Type   | Default | Description                                            |
| ------------------- | ------ | ------- | ------------------------------------------------------ |
| `reviewSampleRate`  | number | `0.2`   | Fraction tagged per provenance group. Range `[0, 1]`.  |

- `0.0` — disable review sampling (all cases marked `requiresReview: false`).
- `1.0` — flag every case (regulated-domain default — HSBC, FactSet).
- Per-group ceil rounding: any non-empty group with rate > 0 gets at least one flagged case.

### What This Is Not (V1.1+ Considerations)

The HLD (§2.7.6) considered two adjacent strategies and rejected both for V1:

- **Confidence-weighted** — flag cases that hit schema-validation retries. Deferred until generation telemetry exists; V1.1 candidate.
- **Risk-classified** — system identifies high-risk cases. Rejected as a policy decision: customers raise the rate wholesale to express domain risk. GTG does not classify customer risk.

Semantic coherence checks (§2.7.7) are a separate optional stage gated by `verificationEnabled`, also V1.1.

## Output Format

### Single-Turn Test Case

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Single-Turn Test Case                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  {                                                                          │
│    "input": "What's the price of laptop-x1?",                               │
│                                                                             │
│    "expected": {                                                            │
│      "response": "The laptop-x1 is priced at $999.",                        │
│      "topics": ["product-info", "pricing"],                                 │
│      "toolCalls": [                                                         │
│        {                                                                    │
│          "name": "get_product",                                             │
│          "args": { "product_id": "laptop-x1" }                              │
│        }                                                                    │
│      ]                                                                      │
│    },                                                                       │
│                                                                             │
│    "context": {                                                             │
│      "provenance": {                                                        │
│        "source": "gap_fill",                                                │
│        "scenarioId": "scenario-001",                                        │
│        "planAxis": "get_product"                                            │
│      }                                                                      │
│    },                                                                       │
│    "requiresReview": false  ◄── Set by Stage 5 review sampler               │
│  }                                                                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Multi-Turn Test Case

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Multi-Turn Test Case                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  {                                                                          │
│    "input": [                         ◄── Array of user messages            │
│      "Find me a laptop",                   (one per turn)                   │
│      "What about battery life?"                                             │
│    ],                                                                       │
│                                                                             │
│    "expected": {                                                            │
│      "response": "The laptop has 12-hour battery life.",                    │
│      "topics": ["product-info", "laptops", "battery"],                      │
│      "toolCalls": [                   ◄── Array of arrays                   │
│        [                                   (one array per turn)             │
│          { "name": "search_products", "args": { "query": "laptop" } }       │
│        ],                                                                   │
│        [                                                                    │
│          { "name": "get_product", "args": { "product_id": "laptop-x1" } }   │
│        ]                                                                    │
│      ]                                                                      │
│    },                                                                       │
│                                                                             │
│    "context": { ... },                                                      │
│    "requiresReview": true   ◄── Stratified-sampled for human curation       │
│  }                                                                          │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────┐     │
│  │                    Visual Representation                           │     │
│  │                                                                    │     │
│  │  Turn 1: User: "Find me a laptop"                                  │     │
│  │          Tool: search_products({ query: "laptop" })                │     │
│  │          Agent: [internal processing]                              │     │
│  │                                                                    │     │
│  │  Turn 2: User: "What about battery life?"                          │     │
│  │          Tool: get_product({ product_id: "laptop-x1" })            │     │
│  │          Agent: "The laptop has 12-hour battery life."             │     │
│  └────────────────────────────────────────────────────────────────────┘     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Concurrency and Throttling

### Adaptive Concurrency

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Adaptive Concurrency Control                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Concurrency                                                                │
│       │                                                                     │
│    10 ┤ ████████████                                                        │
│       │             ████                                                    │
│     5 ┤                 ████        Throttle        ████████████████        │
│       │                     ████      ↓        ████                         │
│     2 ┤                         ████████████                                │
│       │                                                                     │
│       └──────────────────────────────────────────────────────────────► Time │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Normal Operation:     concurrency = 10                             │    │
│  │  On Throttle:          concurrency = concurrency / 2                │    │
│  │  Recovery:             concurrency = concurrency + 1 (per batch)    │    │
│  │  Minimum:              concurrency = 1                              │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Backoff Strategy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Exponential Backoff                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Throttle    Wait Time                                                      │
│  Count       (seconds)                                                      │
│                                                                             │
│    1    ─────►   2s    ████                                                 │
│    2    ─────►   4s    ████████                                             │
│    3    ─────►   8s    ████████████████                                     │
│    4    ─────►  16s    ████████████████████████████████                     │
│    5+   ─────►  30s    ████████████████████████████████████████ (max)       │
│                                                                             │
│  Formula: min(1000 × 2^throttleCount, 30000) ms                             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Tool Validation

### Validation Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Tool Call Validation                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Generated Tool Call                                                        │
│  ┌─────────────────────────────────┐                                        │
│  │ { "name": "get_product",        │                                        │
│  │   "args": { "product_id": "x1"}}│                                        │
│  └───────────────┬─────────────────┘                                        │
│                  │                                                          │
│         ┌────────┴────────┐                                                 │
│         ▼                 ▼                                                 │
│  ┌─────────────┐   ┌─────────────┐                                          │
│  │ Tool Name   │   │  Arguments  │                                          │
│  │ Validation  │   │ Validation  │                                          │
│  └──────┬──────┘   └──────┬──────┘                                          │
│         │                 │                                                 │
│         ▼                 ▼                                                 │
│  ┌─────────────┐   ┌─────────────────────────────────────┐                  │
│  │ Must match  │   │ JSON Schema Validation:             │                  │
│  │ available   │   │ • Required properties present       │                  │
│  │ tool names  │   │ • Types match (string/number/etc)   │                  │
│  │             │   │ • Enum values in allowed list       │                  │
│  └─────────────┘   └─────────────────────────────────────┘                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Scenario Tool Match Validation

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                   Scenario Tool Match Validation                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Scenario specifies:  toolsInvolved = [search_products, get_product]        │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    Generated Tool Calls                             │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ✓ VALID                          ✗ INVALID                                 │
│  ┌────────────────────┐           ┌────────────────────┐                    │
│  │ [search_products,  │           │ [search_products]  │  Missing: get_prod │
│  │  get_product]      │           └────────────────────┘                    │
│  └────────────────────┘                                                     │
│                                   ┌────────────────────┐                    │
│                                   │ [search_products,  │  Extra: checkout   │
│                                   │  get_product,      │                    │
│                                   │  checkout]         │                    │
│                                   └────────────────────┘                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## S3 Reference Support

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      S3 Reference Resolution                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  For large inputs (>1MB), use S3 references:                                │
│                                                                             │
│  Config with S3 Reference              Resolution                           │
│  ┌─────────────────────────┐          ┌─────────────────────────┐           │
│  │ {                       │          │                         │           │
│  │   "agent": {            │          │  ┌─────────────────┐    │           │
│  │     "systemPrompt": {   │────────► │  │    S3 Bucket    │    │           │
│  │       "s3": "s3://...   │          │  │  ┌───────────┐  │    │           │
│  │            /prompt.txt" │          │  │  │prompt.txt │  │    │           │
│  │     }                   │          │  │  └───────────┘  │    │           │
│  │   }                     │          │  └─────────────────┘    │           │
│  │ }                       │          │          │              │           │
│  └─────────────────────────┘          │          ▼              │           │
│                                       │  ┌─────────────────┐    │           │
│                                       │  │ "You are a      │    │           │
│                                       │  │  helpful..."    │    │           │
│                                       │  └─────────────────┘    │           │
│                                       └─────────────────────────┘           │
│                                                                             │
│  Supported S3 References:                                                   │
│  • agent.systemPrompt → plain text                                          │
│  • agent.tools → JSON array                                                 │
│  • seedExamples → JSON array                                                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Intermediate Outputs

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Intermediate S3 Outputs                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Internal S3 Bucket                                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                     │    │
│  │  taxonomy/                                                          │    │
│  │  └── {runId}.json          ◄── Coverage taxonomy                    │    │
│  │                                                                     │    │
│  │  scenarios/                                                         │    │
│  │  └── {runId}.json          ◄── Sampled scenarios                    │    │
│  │                                                                     │    │
│  │  trace-coverage/           (if traces enabled)                      │    │
│  │  └── {runId}.json          ◄── Trace coverage stats                 │    │
│  │                                                                     │    │
│  │  extracted-conversations/  (if traces enabled)                      │    │
│  │  └── {runId}/                                                       │    │
│  │      ├── batch-00000.json  ◄── Extracted conversations              │    │
│  │      ├── batch-00001.json                                           │    │
│  │      └── ...                                                        │    │
│  │                                                                     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## OTEL Trace Integration (Optional)

The plugin can optionally ingest OTEL traces from production to enhance test case generation. For full details, see [OTEL Trace Support](./otel-trace-support.md).

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                   Pipeline with OTEL Trace Support                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                     Standard Pipeline (without traces)              │    │
│  │                                                                     │    │
│  │  Input Config ──► Taxonomy ──► Scenarios ──► Test Cases             │    │
│  │                                                                     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│                              vs.                                            │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                 Enhanced Pipeline (with OTEL traces)                │    │
│  │                                                                     │    │
│  │  ┌─────────┐                                                        │    │
│  │  │  OTEL   │                                                        │    │
│  │  │ Traces  │──┐                                                     │    │
│  │  │  (S3)   │  │                                                     │    │
│  │  └─────────┘  │                                                     │    │
│  │               ▼                                                     │    │
│  │  Input ──► Extract ──► Taxonomy* ──► Scenarios* ──► Test Cases*     │    │
│  │  Config    Convos      (enhanced)    (+ failure    (trace-grounded  │    │
│  │                                       patterns)     examples)       │    │
│  │                                                                     │    │
│  │  * = Enhanced by trace data                                         │    │
│  │                                                                     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### How Traces Enhance Each Stage

```
┌─────────────────────────────────────────────────────────────────────────────┐
│               Trace Enhancement at Each Pipeline Stage                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  STAGE 1: TAXONOMY                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Without Traces              With Traces                            │    │
│  │  ────────────────            ───────────────────────────────────    │    │
│  │  Tools from config only      Tools from config + observed in traces │    │
│  │                              Tool combinations actually used        │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  STAGE 2: SCENARIOS                                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Without Traces              With Traces                            │    │
│  │  ────────────────            ───────────────────────────────────    │    │
│  │  • gap_fill scenarios        • gap_fill scenarios                   │    │
│  │  • focus_area scenarios      • focus_area scenarios                 │    │
│  │                              • failure_pattern scenarios (NEW!)     │    │
│  │                                                                     │    │
│  │  failure_pattern = scenarios derived from real production failures  │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  STAGE 3: GENERATION                                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Without Traces              With Traces                            │    │
│  │  ────────────────            ───────────────────────────────────    │    │
│  │  Static seed examples        Dynamic trace-matched examples         │    │
│  │  (user-provided)             (matched per scenario)                 │    │
│  │                                                                     │    │
│  │  Scenario: [tool_a, tool_b]                                         │    │
│  │        ↓                                                            │    │
│  │  Find traces using [tool_a, tool_b] → use as seed examples          │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Enabling Trace Support

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     Trace Configuration Example                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  {                                                                          │
│    "agent": { ... },                                                        │
│    "totalTestCases": 50,                                                    │
│                                                                             │
│    "traces": {                     ◄── Add this block to enable             │
│      "source": "s3",                                                        │
│      "location": "s3://bucket/traces/",                                     │
│      "maxConversations": 500,                                               │
│      "errorSampleRate": 1.0,       ◄── 100% of failures                     │
│      "successSampleRate": 0.1,     ◄── 10% of successes                     │
│      "abandonmentSampleRate": 0.5  ◄── 50% of abandonments                  │
│    }                                                                        │
│  }                                                                          │
│                                                                             │
│  See otel-trace-support.md for full configuration options and details.      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Error Handling Summary

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Error Handling Strategies                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Error Type              Strategy              Retries                      │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐        │
│  │ LLM Parse Error │────►│ Retry with      │────►│ Up to 3 times   │        │
│  │                 │     │ corrective msg  │     │                 │        │
│  └─────────────────┘     └─────────────────┘     └─────────────────┘        │
│                                                                             │
│  ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐        │
│  │ Tool Validation │────►│ Retry with      │────►│ Up to 3 times   │        │
│  │ Error           │     │ schema hints    │     │                 │        │
│  └─────────────────┘     └─────────────────┘     └─────────────────┘        │
│                                                                             │
│  ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐        │
│  │ Taxonomy Build  │────►│ Use default     │────►│ No retry        │        │
│  │ Failure         │     │ taxonomy        │     │ (fallback)      │        │
│  └─────────────────┘     └─────────────────┘     └─────────────────┘        │
│                                                                             │
│  ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐        │
│  │ Authentication  │────►│ Fail fast       │────►│ No retry        │        │
│  │ Error           │     │                 │     │                 │        │
│  └─────────────────┘     └─────────────────┘     └─────────────────┘        │
│                                                                             │
│  ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐        │
│  │ Throttling      │────►│ Exponential     │────►│ Unlimited       │        │
│  │                 │     │ backoff         │     │ (with backoff)  │        │
│  └─────────────────┘     └─────────────────┘     └─────────────────┘        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```
