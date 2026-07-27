# OTEL Trace Support in Agentic GTG

This document describes how the Agentic GTG plugin extracts and uses production OTEL traces to generate higher-quality test cases.

## Related Documentation

- **[Architecture](./architecture.md)** — Core plugin architecture and pipeline stages

## Overview

The plugin can ingest OpenTelemetry (OTEL) traces from your production agent system to:

1. **Understand real usage patterns** — Learn what tools users invoke and in what combinations
2. **Identify failure modes** — Extract failure and abandonment patterns to prioritize testing
3. **Generate realistic test cases** — Use actual conversations as seed examples for LLM-based generation

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     Why Use Trace-Grounded GTG?                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Without Traces                         With Traces                          │
│  ┌─────────────────────┐               ┌─────────────────────┐              │
│  │                     │               │                     │              │
│  │  Synthetic test     │               │  Test cases based   │              │
│  │  cases based on     │               │  on REAL production │              │
│  │  imagination        │               │  conversations      │              │
│  │                     │               │                     │              │
│  │  May miss real      │               │  Covers actual      │              │
│  │  usage patterns     │               │  usage patterns     │              │
│  │                     │               │                     │              │
│  │  Unknown failure    │               │  Tests observed     │              │
│  │  modes              │               │  failure modes      │              │
│  │                     │               │                     │              │
│  └─────────────────────┘               └─────────────────────┘              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## End-to-End Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        OTEL Trace-Grounded GTG Flow                         │
└─────────────────────────────────────────────────────────────────────────────┘

  Production Agent                    S3 Bucket                    GTG Plugin
  ┌─────────────┐                  ┌─────────────┐              ┌─────────────┐
  │   Agent     │    OTEL Export   │   traces/   │   Extract   │  Taxonomy   │
  │   System    │ ───────────────► │  *.json     │ ──────────► │  Building   │
  │             │                  │             │              │             │
  └─────────────┘                  └─────────────┘              └──────┬──────┘
                                                                       │
                                                                       ▼
  ┌─────────────┐                  ┌─────────────┐              ┌─────────────┐
  │  Generated  │    Output        │  Scenario   │   Sample     │  Trace      │
  │  Test Cases │ ◄─────────────── │  Planning   │ ◄─────────── │  Coverage   │
  │             │                  │             │              │             │
  └─────────────┘                  └─────────────┘              └─────────────┘


  ┌─────────────────────────────────────────────────────────────────────────┐
  │                          Detailed Flow                                   │
  ├─────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │  1. OTEL Export         Your agent system exports traces to S3           │
  │         │                                                                │
  │         ▼                                                                │
  │  2. Batch Extraction    GTG reads traces in batches of 1000              │
  │         │                                                                │
  │         ▼                                                                │
  │  3. Conversation Parse  OTEL spans → conversation turns                  │
  │         │                                                                │
  │         ▼                                                                │
  │  4. Outcome Tagging     Each conversation: success/failure/abandonment   │
  │         │                                                                │
  │         ▼                                                                │
  │  5. Sampling            Stratified sampling with diversity clustering    │
  │         │                                                                │
  │         ▼                                                                │
  │  6. Taxonomy Enhance    Add observed tools/combos to taxonomy            │
  │         │                                                                │
  │         ▼                                                                │
  │  7. Scenario Planning   Generate failure_pattern scenarios               │
  │         │                                                                │
  │         ▼                                                                │
  │  8. Trace Matching      Match trace examples to each scenario            │
  │         │                                                                │
  │         ▼                                                                │
  │  9. Test Generation     LLM generates test cases with trace context      │
  │                                                                          │
  └─────────────────────────────────────────────────────────────────────────┘
```

## Configuration

Enable trace support by adding a `traces` configuration:

```json
{
  "agent": {
    "systemPrompt": "You are a helpful shopping assistant...",
    "tools": [...]
  },
  "totalTestCases": 50,
  "traces": {
    "source": "s3",
    "location": "s3://your-bucket/traces/",
    "maxConversations": 500,
    "errorSampleRate": 1.0,
    "successSampleRate": 0.1,
    "abandonmentSampleRate": 0.5
  }
}
```

### Configuration Options

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Trace Configuration Options                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Option                 Type      Default    Description                     │
│  ─────────────────────────────────────────────────────────────────────────  │
│  source                 string    "s3"       Trace source type               │
│  location               string    required   S3 URI (s3://bucket/prefix/)    │
│  maxConversations       number    500        Max conversations to sample     │
│  errorSampleRate        float     1.0        Sample rate for failures        │
│  successSampleRate      float     0.1        Sample rate for successes       │
│  abandonmentSampleRate  float     0.5        Sample rate for abandonments    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                     Sample Rate Visual                               │    │
│  │                                                                      │    │
│  │  Failures:      ████████████████████ 100% (capture all errors)      │    │
│  │  Abandonments:  ██████████           50%  (half of incomplete)      │    │
│  │  Successes:     ██                   10%  (representative sample)   │    │
│  │                                                                      │    │
│  │  Why? Failures are rare but valuable. Successes are common.          │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Processing Pipeline

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Trace Processing Pipeline                          │
└─────────────────────────────────────────────────────────────────────────────┘

Phase 1: Extraction                Phase 2: Sampling               Phase 3: Generation
┌────────────────────┐            ┌────────────────────┐          ┌────────────────────┐
│                    │            │                    │          │                    │
│  S3 List Objects   │            │  Stratified        │          │  Trace-Grounded    │
│  (paginated)       │            │  Sampling          │          │  Example Matching  │
│        │           │            │        │           │          │        │           │
│        ▼           │            │        ▼           │          │        ▼           │
│  Fetch Traces      │            │  Diversity         │          │  Scenario-Specific │
│  (20 concurrent)   │──────────► │  Clustering        │────────► │  Seed Examples     │
│        │           │            │        │           │          │        │           │
│        ▼           │            │        ▼           │          │        ▼           │
│  Parse OTEL Spans  │            │  Deduplication     │          │  LLM Generation    │
│        │           │            │  (by tool seq)     │          │                    │
│        ▼           │            │                    │          │                    │
│  Extract Convos    │            │                    │          │                    │
│                    │            │                    │          │                    │
└────────────────────┘            └────────────────────┘          └────────────────────┘
```

### Phase 1: Batch Extraction (Detailed)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Phase 1: Batch Extraction                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  S3 Bucket: s3://your-bucket/traces/                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  trace-001.json  trace-002.json  ...  trace-10000.json              │    │
│  └───────────────────────────┬─────────────────────────────────────────┘    │
│                              │                                               │
│                              ▼                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    Paginated S3 LIST                                 │    │
│  │                                                                      │    │
│  │  Batch 1: files 1-1000      ────►  Process  ────►  Save to internal │    │
│  │  Batch 2: files 1001-2000   ────►  Process  ────►  Save to internal │    │
│  │  Batch 3: files 2001-3000   ────►  Process  ────►  Save to internal │    │
│  │  ...                                                                 │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Within each batch:                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐      20 concurrent        │    │
│  │  │ GET │ │ GET │ │ GET │ │ GET │ │ GET │ ...  S3 fetches           │    │
│  │  └──┬──┘ └──┬──┘ └──┬──┘ └──┬──┘ └──┬──┘                            │    │
│  │     │       │       │       │       │                                │    │
│  │     ▼       ▼       ▼       ▼       ▼                                │    │
│  │  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐                            │    │
│  │  │Parse│ │Parse│ │Parse│ │Parse│ │Parse│      Parse OTEL JSON       │    │
│  │  └─────┘ └─────┘ └─────┘ └─────┘ └─────┘                            │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Output: extracted-conversations/{runId}/batch-XXXXX.json                    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Phase 2: Deduplication and Sampling (Detailed)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                  Phase 2: Deduplication and Sampling                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Step 1: Load and Categorize                                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │  batch-00000.json ─┐                                                 │    │
│  │  batch-00001.json ─┼────► Stream and categorize by outcome           │    │
│  │  batch-00002.json ─┘                                                 │    │
│  │                                                                      │    │
│  │                    ┌────────────┐                                    │    │
│  │                    │            │                                    │    │
│  │           ┌────────┼────────────┼────────┐                           │    │
│  │           ▼        ▼            ▼        │                           │    │
│  │     ┌──────────┐ ┌──────────┐ ┌──────────┐                           │    │
│  │     │ Failures │ │Abandonmnt│ │ Success  │                           │    │
│  │     │   120    │ │    45    │ │   835    │                           │    │
│  │     └──────────┘ └──────────┘ └──────────┘                           │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Step 2: Early Sampling (during streaming)                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │  Apply sample rates as conversations stream in:                      │    │
│  │                                                                      │    │
│  │  Failures:     120 × 1.0 = 120 kept                                 │    │
│  │  Abandonments:  45 × 0.5 =  ~22 kept                                │    │
│  │  Successes:    835 × 0.1 =  ~84 kept                                │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Step 3: Diversity Clustering                                                │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │  Group by tool combination + outcome:                                │    │
│  │                                                                      │    │
│  │  Cluster "failure:get_product"           → 40 convos → keep 3       │    │
│  │  Cluster "failure:search+get"            → 50 convos → keep 3       │    │
│  │  Cluster "failure:search+get+checkout"   → 30 convos → keep 3       │    │
│  │  Cluster "success:get_product"           → 30 convos → keep 2       │    │
│  │  ...                                                                 │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Step 4: Final Assembly                                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │  Priority order:                                                     │    │
│  │  1. All failure clusters  ─────────────────────────► Add first      │    │
│  │  2. All abandonment clusters ──────────────────────► Add second     │    │
│  │  3. Success clusters (fill remaining budget) ──────► Add last       │    │
│  │                                                                      │    │
│  │  Deduplicate by tool sequence                                        │    │
│  │  Trim to maxConversations (500)                                      │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Phase 3: Trace-Grounded Generation (Detailed)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                  Phase 3: Trace-Grounded Generation                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  For each scenario, find matching trace examples:                            │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                   Trace Scoring Algorithm                            │    │
│  ├─────────────────────────────────────────────────────────────────────┤    │
│  │                                                                      │    │
│  │  Scenario: tools=[get_product, check_inventory], outcome=success     │    │
│  │                                                                      │    │
│  │  Trace A: [get_product, check_inventory]                             │    │
│  │           matching=2, extra=0  →  score = 2×10 - 0×2 = 20 ✓ Best    │    │
│  │                                                                      │    │
│  │  Trace B: [get_product]                                              │    │
│  │           matching=1, extra=0  →  score = 1×10 - 0×2 = 10           │    │
│  │                                                                      │    │
│  │  Trace C: [get_product, search, checkout]                            │    │
│  │           matching=1, extra=2  →  score = 1×10 - 2×2 = 6            │    │
│  │                                                                      │    │
│  │  Trace D: [search_products]                                          │    │
│  │           matching=0, extra=1  →  score = 0 (skip, no overlap)      │    │
│  │                                                                      │    │
│  │  Formula: score = (matching_tools × 10) - (extra_tools × 2)          │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Selected examples (top 3 by score) are included in LLM prompt:              │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    Generation Prompt                                 │    │
│  │                                                                      │    │
│  │  "Generate a test case for scenario: ..."                            │    │
│  │                                                                      │    │
│  │  Here are similar real conversations from production:                │    │
│  │                                                                      │    │
│  │  Example 1 (from trace abc123):                                      │    │
│  │    User: "Is laptop-x1 in stock?"                                    │    │
│  │    Tools: [get_product, check_inventory]                             │    │
│  │    Response: "Yes, laptop-x1 is available..."                        │    │
│  │                                                                      │    │
│  │  Example 2 (from trace def456):                                      │    │
│  │    ...                                                               │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## OTEL Span Classification

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Span Classification                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  The plugin classifies OTEL spans into three types:                          │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │  Model Spans              Tool Spans              Agent Spans        │    │
│  │  ┌──────────────┐        ┌──────────────┐        ┌──────────────┐   │    │
│  │  │              │        │              │        │              │   │    │
│  │  │  "chat"      │        │  "execute    │        │  "agent"     │   │    │
│  │  │  "complete"  │        │   _tool"     │        │  "invoke     │   │    │
│  │  │  "llm_call"  │        │  "tool_call" │        │   _agent"    │   │    │
│  │  │              │        │              │        │              │   │    │
│  │  └──────┬───────┘        └──────┬───────┘        └──────┬───────┘   │    │
│  │         │                       │                       │           │    │
│  │         ▼                       ▼                       ▼           │    │
│  │  ┌──────────────┐        ┌──────────────┐        ┌──────────────┐   │    │
│  │  │ Extract:     │        │ Extract:     │        │ Used for:    │   │    │
│  │  │ • User msg   │        │ • Tool name  │        │ • Session    │   │    │
│  │  │ • Assistant  │        │ • Tool args  │        │   boundary   │   │    │
│  │  │   response   │        │              │        │              │   │    │
│  │  └──────────────┘        └──────────────┘        └──────────────┘   │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Detection Criteria:                                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │  Model Span:  name contains "chat"/"llm" OR has gen_ai.operation    │    │
│  │  Tool Span:   name contains "tool" OR has gen_ai.tool.name          │    │
│  │  Agent Span:  name contains "agent"/"invoke_agent"                  │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Supported OTEL Attributes

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Supported OTEL Attributes                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Attribute                    Description              Used For              │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  gen_ai.prompt                User message             Turn.userMessage      │
│  gen_ai.completion            Assistant response       Turn.assistantMessage │
│  gen_ai.tool.name             Tool name                ToolCall.name         │
│  gen_ai.tool.args             Tool arguments (JSON)    ToolCall.args         │
│  gen_ai.operation.name        Operation type           Span classification   │
│  session.id                   Session identifier       Conversation grouping │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                     Example OTEL Span                                │    │
│  │                                                                      │    │
│  │  {                                                                   │    │
│  │    "traceId": "abc123",                                              │    │
│  │    "spanId": "span1",                                                │    │
│  │    "name": "chat_completion",                                        │    │
│  │    "attributes": {                                                   │    │
│  │      "gen_ai.operation.name": "chat",                                │    │
│  │      "gen_ai.prompt": "What is the price of laptop-x1?",             │    │
│  │      "gen_ai.completion": "The laptop-x1 is priced at $999."         │    │
│  │    }                                                                 │    │
│  │  }                                                                   │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Outcome Tagging

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       Outcome Detection                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Each extracted conversation is tagged with an outcome signal:               │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │    FAILURE                ABANDONMENT              SUCCESS           │    │
│  │  ┌──────────────┐       ┌──────────────┐       ┌──────────────┐     │    │
│  │  │              │       │              │       │              │     │    │
│  │  │ • Error      │       │ • No         │       │ • Has        │     │    │
│  │  │   status     │       │   assistant  │       │   response   │     │    │
│  │  │   code (2)   │       │   response   │       │              │     │    │
│  │  │              │       │              │       │ • Agent      │     │    │
│  │  │ • Exception  │       │ • Agent      │       │   loop       │     │    │
│  │  │   event      │       │   didn't     │       │   completed  │     │    │
│  │  │              │       │   complete   │       │              │     │    │
│  │  │ • HTTP       │       │              │       │ • No         │     │    │
│  │  │   4xx/5xx    │       │              │       │   errors     │     │    │
│  │  │              │       │              │       │              │     │    │
│  │  │ • error=true │       │              │       │              │     │    │
│  │  │   attribute  │       │              │       │              │     │    │
│  │  │              │       │              │       │              │     │    │
│  │  └──────────────┘       └──────────────┘       └──────────────┘     │    │
│  │                                                                      │    │
│  │     Priority: 1            Priority: 2            Priority: 3       │    │
│  │  (100% sample)          (50% sample)           (10% sample)         │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Detection Order:                                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │    Check for errors  ──────►  Yes  ──────►  FAILURE                 │    │
│  │          │                                                           │    │
│  │          No                                                          │    │
│  │          │                                                           │    │
│  │          ▼                                                           │    │
│  │    Has response AND  ──────►  No   ──────►  ABANDONMENT             │    │
│  │    agent completed?                                                  │    │
│  │          │                                                           │    │
│  │         Yes                                                          │    │
│  │          │                                                           │    │
│  │          ▼                                                           │    │
│  │       SUCCESS                                                        │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## High-Volume Handling Strategies

The plugin is designed to handle millions of traces without memory exhaustion.

### Memory Protection Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Memory Protection Strategy                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Problem: 1M traces × 10KB each = 10GB of data                              │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐            │    │
│  │  │   Stream    │     │   Early     │     │   Memory    │            │    │
│  │  │   Loading   │────►│   Sampling  │────►│   Trim      │            │    │
│  │  │             │     │             │     │             │            │    │
│  │  └─────────────┘     └─────────────┘     └─────────────┘            │    │
│  │                                                                      │    │
│  │  Load traces         Apply sample        If > 5000 convos:          │    │
│  │  in batches          rates during        trim successes,            │    │
│  │  of 1000             streaming           keep failures              │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Key Limits:                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │  MAX_CONVERSATIONS_IN_MEMORY = 5000  (triggers trimming)            │    │
│  │  BATCH_SIZE = 1000                   (S3 LIST limit)                │    │
│  │  CONCURRENCY = 20                    (parallel S3 fetches)          │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Memory Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Memory Usage Over Time                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Memory                                                                      │
│    │                                                                         │
│ 5K │                           ┌─────┐  Trim          ┌─────┐               │
│    │                          ╱│     │╲ triggered    ╱│     │               │
│ 4K │                    ┌────╱ │     │ ╲────┐       ╱ │     │               │
│    │                   ╱       │     │      ╲     ╱   │     │               │
│ 3K │             ┌────╱        │     │       ╲───╱    │     │               │
│    │            ╱              │     │               │     │               │
│ 2K │       ┌───╱               │     │               │     │               │
│    │      ╱                    │     │               │     │               │
│ 1K │  ┌──╱                     │     │               │     │               │
│    │ ╱                         │     │               │     │               │
│  0 └─┴─────────────────────────┴─────┴───────────────┴─────┴───────────────│
│      │ Batch │ Batch │ Batch │ Trim │ Batch │ Batch │ Trim │ Final        │
│      │   1   │   2   │   3   │      │   4   │   5   │      │              │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Trim Strategy:                                                      │    │
│  │  1. Keep ALL failures (most valuable)                               │    │
│  │  2. Keep ALL abandonments (second priority)                         │    │
│  │  3. Trim successes to fit remaining budget                          │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### LLM Context Protection

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                 Failure Pattern Diversity Selection                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Problem: 200 failure conversations would saturate LLM context               │
│                                                                              │
│  Step 1: Group by tool combination                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐   │    │
│  │  │   get_product    │  │     search       │  │   get+search     │   │    │
│  │  │      (80)        │  │      (60)        │  │      (60)        │   │    │
│  │  └──────────────────┘  └──────────────────┘  └──────────────────┘   │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Step 2: Round-robin selection (max 10)                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │  Round 1:  get_product[0], search[0], get+search[0]  → 3 selected   │    │
│  │  Round 2:  get_product[1], search[1], get+search[1]  → 6 selected   │    │
│  │  Round 3:  get_product[2], search[2], get+search[2]  → 9 selected   │    │
│  │  Round 4:  get+search[3]                             → 10 selected  │    │
│  │                                                                      │    │
│  │  ┌──────────────────────────────────────────────────────────────┐   │    │
│  │  │  get_product: 3  │  search: 3  │  get+search: 4              │   │    │
│  │  └──────────────────────────────────────────────────────────────┘   │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Output: 10 diverse failure patterns for LLM prompt                          │
│                                                                              │
│  Key Limit: MAX_FAILURE_PATTERNS_FOR_PROMPT = 10                             │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Conversation Extraction

### Building Turns from Spans

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                   Building Conversation Turns                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  OTEL Spans (sorted by time)                                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │  t0 ──► Model Span (user: "Find laptops under $1000")               │    │
│  │  t1 ──► Tool Span (search_products, {query: "laptop", max: 1000})   │    │
│  │  t2 ──► Model Span (completion: "I found 5 laptops...")             │    │
│  │  t3 ──► Model Span (user: "Tell me about the first one")            │    │
│  │  t4 ──► Tool Span (get_product, {id: "laptop-1"})                   │    │
│  │  t5 ──► Model Span (completion: "The first laptop has...")          │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                              │                                               │
│                              ▼                                               │
│  Extracted Conversation                                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │  Turn 1:                                                             │    │
│  │  ┌─────────────────────────────────────────────────────────────┐    │    │
│  │  │  userMessage: "Find laptops under $1000"                     │    │    │
│  │  │  toolCalls: [{name: "search_products", args: {...}}]         │    │    │
│  │  │  assistantMessage: "I found 5 laptops..."                    │    │    │
│  │  └─────────────────────────────────────────────────────────────┘    │    │
│  │                                                                      │    │
│  │  Turn 2:                                                             │    │
│  │  ┌─────────────────────────────────────────────────────────────┐    │    │
│  │  │  userMessage: "Tell me about the first one"                  │    │    │
│  │  │  toolCalls: [{name: "get_product", args: {...}}]             │    │    │
│  │  │  assistantMessage: "The first laptop has..."                 │    │    │
│  │  └─────────────────────────────────────────────────────────────┘    │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## OTEL Trace Format

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     Expected OTEL JSON Format                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {                                                                           │
│    "resourceSpans": [{                                                       │
│      "scopeSpans": [{                                                        │
│        "spans": [                                                            │
│          ┌──────────────────────────────────────────────────────────────┐   │
│          │  {                                          Model Span       │   │
│          │    "traceId": "abc123",                                      │   │
│          │    "spanId": "span1",                                        │   │
│          │    "name": "chat_completion",                                │   │
│          │    "startTimeUnixNano": "1716000000000000000",               │   │
│          │    "attributes": {                                           │   │
│          │      "gen_ai.operation.name": "chat",                        │   │
│          │      "gen_ai.prompt": "What is the price of laptop-x1?",    │   │
│          │      "gen_ai.completion": "The laptop-x1 is priced at $999."│   │
│          │    }                                                         │   │
│          │  }                                                           │   │
│          └──────────────────────────────────────────────────────────────┘   │
│          ┌──────────────────────────────────────────────────────────────┐   │
│          │  {                                           Tool Span       │   │
│          │    "traceId": "abc123",                                      │   │
│          │    "spanId": "span2",                                        │   │
│          │    "name": "execute_tool",                                   │   │
│          │    "attributes": {                                           │   │
│          │      "gen_ai.tool.name": "get_product",                      │   │
│          │      "gen_ai.tool.args": "{\"product_id\": \"laptop-x1\"}"   │   │
│          │    }                                                         │   │
│          │  }                                                           │   │
│          └──────────────────────────────────────────────────────────────┘   │
│        ]                                                                    │
│      }]                                                                     │
│    }]                                                                       │
│  }                                                                          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Trace Coverage Output

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Trace Coverage Statistics                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Written to: trace-coverage/{runId}.json                                     │
│                                                                              │
│  {                                                                           │
│    "observedTools": [                                                        │
│      "get_product",                                                          │
│      "search_products",               ◄── Tools seen in traces              │
│      "check_inventory"                                                       │
│    ],                                                                        │
│                                                                              │
│    "observedCombinations": [                                                 │
│      ["get_product"],                                                        │
│      ["search_products", "get_product"],    ◄── Tool combos used together   │
│      ["get_product", "check_inventory"]                                      │
│    ],                                                                        │
│                                                                              │
│    "outcomeDistribution": {                                                  │
│      "success": 350,                                                         │
│      "failure": 120,                  ◄── Conversation outcomes             │
│      "abandonment": 30                                                       │
│    }                                                                         │
│  }                                                                           │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    Outcome Distribution                              │    │
│  │                                                                      │    │
│  │  Success:     ████████████████████████████████████  350 (70%)       │    │
│  │  Failure:     ████████████                          120 (24%)       │    │
│  │  Abandonment: ███                                    30  (6%)       │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Integration with Pipeline Stages

```
┌─────────────────────────────────────────────────────────────────────────────┐
│               How Traces Integrate with GTG Pipeline                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                      Taxonomy Stage                                  │    │
│  │                                                                      │    │
│  │  Without Traces           With Traces                                │    │
│  │  ┌─────────────────┐     ┌─────────────────┐                        │    │
│  │  │ Tools from      │     │ Tools from      │                        │    │
│  │  │ config only     │     │ config + traces │                        │    │
│  │  └─────────────────┘     │                 │                        │    │
│  │                          │ Observed combos │                        │    │
│  │                          │ added to axes   │                        │    │
│  │                          └─────────────────┘                        │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                      Planner Stage                                   │    │
│  │                                                                      │    │
│  │  Without Traces           With Traces                                │    │
│  │  ┌─────────────────┐     ┌─────────────────┐                        │    │
│  │  │ gap_fill +      │     │ gap_fill +      │                        │    │
│  │  │ focus_area      │     │ focus_area +    │                        │    │
│  │  │ scenarios       │     │ failure_pattern │                        │    │
│  │  └─────────────────┘     │ scenarios       │                        │    │
│  │                          └─────────────────┘                        │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                     Generator Stage                                  │    │
│  │                                                                      │    │
│  │  Without Traces           With Traces                                │    │
│  │  ┌─────────────────┐     ┌─────────────────┐                        │    │
│  │  │ User-provided   │     │ Matched trace   │                        │    │
│  │  │ seed examples   │     │ examples per    │                        │    │
│  │  │ (static)        │     │ scenario        │                        │    │
│  │  └─────────────────┘     │ (dynamic)       │                        │    │
│  │                          └─────────────────┘                        │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Future Enhancements

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Future Enhancements Roadmap                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  1. EMBEDDING-BASED CLUSTERING                                       │    │
│  │  ┌─────────────────────────────────────────────────────────────┐    │    │
│  │  │                                                              │    │    │
│  │  │  Current: Signature-based (tool sequence + intent words)    │    │    │
│  │  │  Future:  Semantic embeddings for better diversity          │    │    │
│  │  │                                                              │    │    │
│  │  │  Benefits:                                                   │    │    │
│  │  │  • Better semantic understanding of similar conversations   │    │    │
│  │  │  • More meaningful diversity in selection                   │    │    │
│  │  │  • Handling of paraphrased queries                          │    │    │
│  │  │                                                              │    │    │
│  │  └─────────────────────────────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  2. ADDITIONAL TRACE SOURCES                                         │    │
│  │  ┌─────────────────────────────────────────────────────────────┐    │    │
│  │  │                                                              │    │    │
│  │  │  Current: S3 only                                            │    │    │
│  │  │  Future:                                                     │    │    │
│  │  │  • Direct OTEL collector endpoints                          │    │    │
│  │  │  • CloudWatch Logs                                          │    │    │
│  │  │  • Datadog, New Relic, Honeycomb                            │    │    │
│  │  │  • Custom observability backends                            │    │    │
│  │  │                                                              │    │    │
│  │  └─────────────────────────────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  3. INCREMENTAL PROCESSING                                           │    │
│  │  ┌─────────────────────────────────────────────────────────────┐    │    │
│  │  │                                                              │    │    │
│  │  │  Current: Full extraction on each run                        │    │    │
│  │  │  Future:                                                     │    │    │
│  │  │  • Track processed trace files (watermarking)               │    │    │
│  │  │  • Only process new traces since last run                   │    │    │
│  │  │  • Incremental updates to coverage statistics               │    │    │
│  │  │                                                              │    │    │
│  │  └─────────────────────────────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  4. ANOMALY DETECTION                                                │    │
│  │  ┌─────────────────────────────────────────────────────────────┐    │    │
│  │  │                                                              │    │    │
│  │  │  Current: Manual sampling rates                              │    │    │
│  │  │  Future:                                                     │    │    │
│  │  │  • Auto-detect unusual tool combinations                    │    │    │
│  │  │  • Identify emerging failure patterns                       │    │    │
│  │  │  • Flag rare but important scenarios                        │    │    │
│  │  │  • Trend analysis across time windows                       │    │    │
│  │  │                                                              │    │    │
│  │  └─────────────────────────────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  5. FEEDBACK LOOP                                                    │    │
│  │  ┌─────────────────────────────────────────────────────────────┐    │    │
│  │  │                                                              │    │    │
│  │  │  Current: One-way (traces → test cases)                      │    │    │
│  │  │  Future:                                                     │    │    │
│  │  │  • Compare test results with trace outcomes                 │    │    │
│  │  │  • Identify test cases that don't match production         │    │    │
│  │  │  • Auto-adjust generation based on feedback                 │    │    │
│  │  │  • Quality scoring of generated test cases                  │    │    │
│  │  │                                                              │    │    │
│  │  └─────────────────────────────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  6. REAL-TIME STREAMING                                              │    │
│  │  ┌─────────────────────────────────────────────────────────────┐    │    │
│  │  │                                                              │    │    │
│  │  │  Current: Batch processing                                   │    │    │
│  │  │  Future:                                                     │    │    │
│  │  │  • Process traces as they arrive                            │    │    │
│  │  │  • Continuous test case generation                          │    │    │
│  │  │  • Integration with event-driven architectures              │    │    │
│  │  │                                                              │    │    │
│  │  └─────────────────────────────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  7. CUSTOM SPAN EXTRACTORS                                           │    │
│  │  ┌─────────────────────────────────────────────────────────────┐    │    │
│  │  │                                                              │    │    │
│  │  │  Current: Fixed span classification                          │    │    │
│  │  │  Future:                                                     │    │    │
│  │  │  • Plugin architecture for custom extractors                │    │    │
│  │  │  • Support org-specific span formats                        │    │    │
│  │  │  • Configurable attribute mappings                          │    │    │
│  │  │                                                              │    │    │
│  │  └─────────────────────────────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```
