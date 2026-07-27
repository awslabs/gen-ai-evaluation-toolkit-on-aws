import { z } from 'zod';
import { EnvVariable, StatusType, MAX_CONCURRENCY_LIMIT } from './constants';
import { getEnvVariable, emitEvent } from './helpers';
import { S3ReferenceModel } from './models';
import { PluginContext, createPluginContext } from './context';

/**
 * Input test case with its S3 key for tracking.
 */
export interface InputTestCase<T = unknown> {
  key: string;
  data: T;
}

/**
 * Options for defining a test case filter plugin.
 */
export interface FilterOptions<TSchema extends z.ZodTypeAny> {
  /** Plugin name (used in logs and events) */
  name: string;

  /** Zod schema to validate plugin-specific configuration */
  configSchema: TSchema;

  /**
   * Async generator function that processes all test cases and yields kept ones.
   * Use this for batch processing (e.g., Bedrock Batch API).
   */
  filter: (testCases: InputTestCase[], config: z.output<TSchema>, ctx: PluginContext) => AsyncGenerator<unknown>;
}

/**
 * Defines a test case filter plugin.
 *
 * Filters evaluate existing test cases and keep only those that meet criteria.
 * Use this API when you need to validate, score, or filter test cases from a previous
 * generation stage (e.g., LLM-as-Judge validation, quality scoring, deduplication).
 *
 * @typeParam TSchema - Zod schema type for plugin configuration validation
 *
 * @param options - Filter plugin options
 * @param options.name - Plugin identifier used in logs, events, and error messages
 * @param options.configSchema - Zod schema that validates the `configuration` field from the trigger event.
 *   The parsed configuration is passed to your `filter` function.
 * @param options.filter - Async generator function that receives all input test cases and yields kept ones.
 *   Receives an array of {@link InputTestCase} (with S3 key and data), the validated config,
 *   and a {@link PluginContext} for S3 writes and progress reporting.
 *
 * @returns Object with `name` and `start()` method. Call `start()` to run the plugin.
 *
 * @remarks
 * **Lifecycle:**
 * 1. Plugin reads `CONFIG` env var (JSON trigger event from Step Functions)
 * 2. Validates trigger event against schema (including your `configSchema`)
 * 3. Creates {@link PluginContext} and loads all input test cases from S3
 * 4. Calls your `filter` function with the full test case array
 * 5. Writes yielded test cases to output S3 location
 * 6. Emits EventBridge event with kept/discarded counts
 *
 * **Batch processing:**
 * Unlike generators that stream test cases one at a time, filters receive all input
 * test cases upfront. This enables batch operations like Bedrock Batch API calls
 * or cross-test-case deduplication.
 *
 * **Error handling:**
 * - Validation errors (bad config) cause immediate failure with descriptive message
 * - Errors thrown from `filter` are caught, logged, and reported via EventBridge
 * - Plugin exits with code 1 on any error
 *
 * **Environment variables** (set by GTG workflow):
 * - `CONFIG`: JSON trigger event with taskToken, id, input/output locations, and configuration
 * - `EVENT_BUS_ARN`: EventBridge ARN for status events
 * - `INTERNAL_S3_BUCKET`: S3 bucket for intermediate artifacts
 *
 * @example
 * ```typescript
 * const plugin = defineFilter({
 *   name: 'LLMAsJudgeFilter',
 *   configSchema: z.object({
 *     model: z.string().default('anthropic.claude-3-sonnet'),
 *     threshold: z.number().default(0.8),
 *   }),
 *   filter: async function* (testCases, config, ctx) {
 *     await ctx.reportProgress(`Validating ${testCases.length} test cases`);
 *
 *     // Process via Bedrock Batch API or iterate individually
 *     for (const { key, data } of testCases) {
 *       const score = await evaluateWithLLM(data, config.model);
 *       if (score >= config.threshold) {
 *         yield { ...data, score };
 *       }
 *     }
 *   }
 * });
 *
 * plugin.start();
 * ```
 *
 * @see {@link InputTestCase} for the input test case structure
 * @see {@link PluginContext} for available context methods
 * @see {@link defineGenerator} for creating new test cases
 */
export function defineFilter<TSchema extends z.ZodTypeAny>(options: FilterOptions<TSchema>) {
  const { name, configSchema, filter } = options;

  // Create trigger event schema that includes plugin config and input
  const TriggerEventModel = z.object({
    taskToken: z.string(),
    id: z.string(),
    output: S3ReferenceModel,
    input: S3ReferenceModel, // Filters require input
    configuration: configSchema,
  });

  async function start(): Promise<void> {
    let taskToken = '';

    try {
      // Parse config from environment
      const configStr = getEnvVariable(EnvVariable.CONFIG);
      const triggerEvent = TriggerEventModel.parse(JSON.parse(configStr));

      taskToken = triggerEvent.taskToken;
      const runId = triggerEvent.id;
      const config = triggerEvent.configuration as z.output<TSchema>;

      console.log(`[${name}] Starting with run ID: ${runId}`);

      // Create context
      const ctx = createPluginContext({
        taskToken,
        runId,
        output: triggerEvent.output,
        input: triggerEvent.input,
      });

      await ctx.reportProgress(`${name} started`);

      // Collect input test cases
      const inputTestCases: InputTestCase[] = [];
      for await (const file of ctx.listInputFiles()) {
        if (!file.Key.endsWith('.json')) continue;
        const data = await ctx.readInputFile(file.Key);
        inputTestCases.push({ key: file.Key, data });
      }

      console.log(`[${name}] Loaded ${inputTestCases.length} input test cases`);

      let totalKept = 0;

      for await (const testCase of filter(inputTestCases, config, ctx)) {
        const id = `test-case-${String(totalKept).padStart(6, '0')}`;
        await ctx.writeTestCase(id, testCase);
        totalKept++;

        if (totalKept % MAX_CONCURRENCY_LIMIT === 0) {
          await ctx.reportProgress(`Kept ${totalKept} test cases so far`);
        }
      }

      const totalDiscarded = inputTestCases.length - totalKept;
      console.log(`[${name}] Result: ${totalKept} kept, ${totalDiscarded} discarded`);

      await emitEvent({
        taskToken,
        status: StatusType.SUCCESS,
        message: `Filtered ${inputTestCases.length} test cases: ${totalKept} kept, ${totalDiscarded} discarded`,
        error: undefined,
        cause: undefined,
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error(`[${name}] Error:`, error);

      if (taskToken) {
        const pluginName = process.env[EnvVariable.PLUGIN_NAME] ?? name;
        await emitEvent({
          taskToken,
          status: StatusType.ERROR,
          message: 'Filtering failed',
          error: error.name,
          cause: `${pluginName} plugin failed: ${error.message}`,
        });
      }

      process.exit(1);
    }
  }

  return { name, start };
}
