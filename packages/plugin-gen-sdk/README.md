# Plugin Generation SDK

Shared TypeScript SDK for GenAI-ETK ground truth generation (GTG) plugins.

## Installation

```bash
npm install @genai-etk/plugin-gen-sdk
```

Or as a local dependency:
```json
{
  "dependencies": {
    "@genai-etk/plugin-gen-sdk": "file:../plugin-gen-sdk"
  }
}
```

## Quick Start

### Creating a Generator Plugin

Generators create new test cases from source material (documents, configs, etc.)

```typescript
import { defineGenerator } from '@genai-etk/plugin-gen-sdk';
import { z } from 'zod';

const plugin = defineGenerator({
  name: 'MyGenerator',
  
  configSchema: z.object({
    sourceDocuments: z.object({
      bucket: z.string(),
      prefix: z.string(),
    }),
    questionsPerDocument: z.number().default(5),
  }),
  
  generate: async function* (config, ctx) {
    await ctx.reportProgress('Starting generation...');
    
    // Generate test cases
    for (const doc of documents) {
      yield {
        input: doc.question,
        expected: {
          response: doc.answer,
          topics: doc.topics,
        },
      };
    }
    
    // Optionally write debug artifacts
    await ctx.writeArtifact('metadata.json', JSON.stringify({ totalDocs: documents.length }));
  },
});

// Start the plugin
plugin.start();
```

### Creating a Filter Plugin

Filters evaluate existing test cases and keep only those that meet criteria.

```typescript
import { defineFilter } from '@genai-etk/plugin-gen-sdk';
import { z } from 'zod';

const plugin = defineFilter({
  name: 'QualityFilter',
  
  configSchema: z.object({
    minQualityScore: z.number().default(0.8),
    requireTopics: z.boolean().default(true),
  }),
  
  filter: async (testCase, config, ctx) => {
    const score = await evaluateQuality(testCase);
    
    // Return boolean for simple keep/discard
    // return score >= config.minQualityScore;
    
    // Or return object with reason (for debugging)
    return {
      keep: score >= config.minQualityScore,
      reason: `Quality score: ${score.toFixed(2)}`,
    };
  },
});

plugin.start();
```

## Plugin Context

Both generator and filter functions receive a `PluginContext` with these methods:

```typescript
interface PluginContext {
  // Unique run identifier
  runId: string;
  
  // Report progress to the workflow
  reportProgress(message: string): Promise<void>;
  
  // Write debug artifacts to internal S3 bucket
  writeArtifact(key: string, content: string): Promise<void>;
  
  // Write a test case to the output location
  writeTestCase(id: string, testCase: unknown): Promise<void>;
  
  // For filters: list and read input test cases
  listInputFiles(): AsyncGenerator<{ Key: string }>;
  readInputFile<T>(key: string): Promise<T>;
}
```

## Low-Level Helpers

For advanced use cases, you can use the lower-level helpers directly:

```typescript
import {
  // S3 operations
  listS3PrefixObjects,
  getS3ObjectContent,
  writeS3Object,
  
  // EventBridge events
  emitEvent,
  StatusType,
  
  // Environment
  getEnvVariable,
  EnvVariable,
  
  // Utilities
  lazy,
  createRegistry,
} from '@genai-etk/plugin-gen-sdk';
```

## Environment Variables

The SDK expects these environment variables (set by the GTG workflow):

| Variable | Description |
|----------|-------------|
| `CONFIG` | JSON-encoded trigger event with plugin configuration |
| `EVENT_BUS_ARN` | EventBridge ARN for status events |
| `INTERNAL_S3_BUCKET` | S3 bucket for intermediate artifacts |
| `PLUGIN_NAME` | Plugin identifier (optional, defaults to plugin name) |

## Models

```typescript
import { S3ReferenceModel } from '@genai-etk/plugin-gen-sdk';

// Use in your config schema
const MyConfigSchema = z.object({
  documentSource: S3ReferenceModel,
});
```

## API Reference

### High-Level APIs

| API | Use Case |
|-----|----------|
| `defineGenerator()` | Create plugins that generate new test cases from source material. Use the async generator pattern to stream results. |
| `defineFilter()` | Create plugins that evaluate and filter existing test cases. Returns keep/discard decision per test case. |

Use the high-level APIs when possible — they handle configuration parsing, event emission, error handling, and the plugin lifecycle automatically.

### Constants

```typescript
import {
  MAX_CONCURRENCY_LIMIT,  // 50 - Maximum concurrent S3 operations
  EventType,              // Event types for EventBridge
  StatusType,             // Plugin status values
  EnvVariable,            // Environment variable names
} from '@genai-etk/plugin-gen-sdk';
```

| Constant | Value | Description |
|----------|-------|-------------|
| `MAX_CONCURRENCY_LIMIT` | 50 | Maximum concurrent S3 list/read operations |
| `EventType.DONE` | `genAiEtkGenerationPluginDoneEvent` | EventBridge event type for plugin completion |
| `StatusType.IN_PROGRESS` | `inProgress` | Plugin is still running |
| `StatusType.SUCCESS` | `success` | Plugin completed successfully |
| `StatusType.ERROR` | `error` | Plugin failed |

### Plugin Lifecycle

1. **Initialization**: Plugin parses `CONFIG` environment variable and validates against schema
2. **Execution**: Generator yields test cases or filter processes input test cases
3. **Progress**: Plugin calls `ctx.reportProgress()` to emit heartbeat events
4. **Completion**: Plugin emits `DONE` event with `SUCCESS` or `ERROR` status
5. **Cleanup**: Workflow resumes based on the completion event

### When to Use Low-Level Helpers

Use low-level helpers (`listS3PrefixObjects`, `getS3ObjectContent`, `writeS3Object`, `emitEvent`) when:

- Building custom plugin patterns not covered by `defineGenerator`/`defineFilter`
- Implementing complex S3 operations with custom concurrency control
- Integrating with external services that require custom event handling
- Writing tests that need to mock specific SDK functions
