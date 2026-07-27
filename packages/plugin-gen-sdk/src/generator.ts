import { z } from 'zod';
import { EnvVariable, StatusType, MAX_CONCURRENCY_LIMIT } from './constants';
import { getEnvVariable, emitEvent } from './helpers';
import { S3ReferenceModel } from './models';
import { PluginContext, createPluginContext } from './context';

/**
 * Options for defining a test case generator plugin.
 */
export interface GeneratorOptions<TSchema extends z.ZodTypeAny> {
  /** Plugin name (used in logs and events) */
  name: string;

  /** Zod schema to validate plugin-specific configuration */
  configSchema: TSchema;

  /**
   * Async generator function that produces test cases one by one (streaming).
   */
  generate: (config: z.output<TSchema>, ctx: PluginContext) => AsyncGenerator<unknown>;
}

/**
 * Defines a test case generator plugin.
 *
 * Generators create new test cases from source material (documents, configs, etc.).
 * This is the primary API for building GTG (Ground Truth Generation) plugins.
 *
 * @typeParam TSchema - Zod schema type for plugin configuration validation
 *
 * @param options - Generator plugin options
 * @param options.name - Plugin identifier used in logs, events, and error messages
 * @param options.configSchema - Zod schema that validates the `configuration` field from the trigger event.
 *   The parsed configuration is passed to your `generate` function.
 * @param options.generate - Async generator function that yields test cases one at a time.
 *   Receives the validated config and a {@link PluginContext} for S3 writes and progress reporting.
 *
 * @returns Object with `name` and `start()` method. Call `start()` to run the plugin.
 *
 * @remarks
 * **Lifecycle:**
 * 1. Plugin reads `CONFIG` env var (JSON trigger event from Step Functions)
 * 2. Validates trigger event against schema (including your `configSchema`)
 * 3. Creates {@link PluginContext} with S3 write and progress capabilities
 * 4. Calls your `generate` function and streams test cases to S3
 * 5. Emits EventBridge event on success or failure
 *
 * **Error handling:**
 * - Validation errors (bad config) cause immediate failure with descriptive message
 * - Errors thrown from `generate` are caught, logged, and reported via EventBridge
 * - Plugin exits with code 1 on any error
 *
 * **Environment variables** (set by GTG workflow):
 * - `CONFIG`: JSON trigger event with taskToken, id, output location, and configuration
 * - `EVENT_BUS_ARN`: EventBridge ARN for status events
 * - `INTERNAL_S3_BUCKET`: S3 bucket for intermediate artifacts
 *
 * @example
 * ```typescript
 * const plugin = defineGenerator({
 *   name: 'RAGGenerator',
 *   configSchema: z.object({
 *     documentSource: S3ReferenceModel,
 *     questionsPerChunk: z.number().default(3),
 *   }),
 *   generate: async function* (config, ctx) {
 *     await ctx.reportProgress('Starting generation...');
 *
 *     for (const chunk of chunks) {
 *       yield {
 *         input: chunk.question,
 *         expected: { response: chunk.answer }
 *       };
 *     }
 *   }
 * });
 *
 * plugin.start();
 * ```
 *
 * @see {@link PluginContext} for available context methods
 * @see {@link defineFilter} for filtering existing test cases
 */
export function defineGenerator<TSchema extends z.ZodTypeAny>(options: GeneratorOptions<TSchema>) {
  const { name, configSchema, generate } = options;

  // Create trigger event schema that includes plugin config
  const TriggerEventModel = z.object({
    taskToken: z.string(),
    id: z.string(),
    output: S3ReferenceModel,
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
        input: undefined, // Generators don't have input
      });

      await ctx.reportProgress(`${name} started`);

      // Run generator
      let testCaseIndex = 0;

      for await (const testCase of generate(config, ctx)) {
        const id = `test-case-${String(testCaseIndex).padStart(6, '0')}`;
        await ctx.writeTestCase(id, testCase);
        testCaseIndex++;

        if (testCaseIndex % MAX_CONCURRENCY_LIMIT === 0) {
          await ctx.reportProgress(`Generated ${testCaseIndex} test cases`);
        }
      }

      console.log(`[${name}] Generated ${testCaseIndex} test cases`);

      await emitEvent({
        taskToken,
        status: StatusType.SUCCESS,
        message: `Generated ${testCaseIndex} test cases`,
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
          message: 'Generation failed',
          error: error.name,
          cause: `${pluginName} plugin failed: ${error.message}`,
        });
      }

      process.exit(1);
    }
  }

  return { name, start };
}
