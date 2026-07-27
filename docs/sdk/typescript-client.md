# TypeScript client reference

The Gen AI Evaluation Toolkit TypeScript SDK follows the [AWS SDK for JavaScript v3](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/) command pattern.

## Installation

```bash
npm install @awssolutions/gen-ai-evaluation-toolkit-ts-client
```

## Quick start

```typescript
import {
  GenAiEvaluationToolkit,
  CreateExperimentCommand,
} from "@awssolutions/gen-ai-evaluation-toolkit-ts-client";

const client = new GenAiEvaluationToolkit({ region: "us-east-1" });

// Use the aggregated client (convenience methods)
const experiment = await client.createExperiment({ name: "my-experiment" });

// Or use the command pattern
const command = new CreateExperimentCommand({ name: "my-experiment" });
const response = await client.send(command);
```

## Creating test cases with structured data

The `expected` and `context` fields support both simple strings (for backward compatibility) and structured data (for agentic applications).

```typescript
import {
  GenAiEvaluationToolkit,
  CreateTestCaseCommand,
} from "@awssolutions/gen-ai-evaluation-toolkit-ts-client";

const client = new GenAiEvaluationToolkit({ region: "us-east-1" });

// Simple string format (backward compatible)
await client.send(
  new CreateTestCaseCommand({
    datasetName: "my-dataset",
    testCaseData: {
      input: "What is Amazon S3?",
      expected: "Amazon S3 is an object storage service.",
      context: ["Amazon S3 is an object storage service that offers..."],
    },
  })
);

// Structured data for agentic applications
await client.send(
  new CreateTestCaseCommand({
    datasetName: "my-dataset",
    testCaseData: {
      input: { prompt: "Book a flight to Seattle for next Monday" },
      expected: {
        toolCalls: [
          { name: "search_flights", arguments: { destination: "Seattle" } },
        ],
        expectedTopics: ["flight booking", "travel"],
      },
      context: {
        requiresHumanReview: false,
        evaluationHints: { checkToolSequence: true },
      },
    },
  })
);
```

## API reference

For the complete list of commands, models, paginators, and enumerations, see the [TypeScript SDK API documentation](typescript/index.md).
