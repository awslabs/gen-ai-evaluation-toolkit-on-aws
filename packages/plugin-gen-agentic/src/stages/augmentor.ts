import { AugmentationStrategy, GeneratedTestCase, GeneratedTestCaseModel, ToolCall, ToolDefinition } from '../models';
import {
  converseWithRetry,
  createUserMessage,
  extractJsonFromResponse,
  parseWithFieldErrors,
  safeJsonParse,
} from '../helpers/bedrock';
import { buildAugmentationPrompt } from '../helpers/prompts';
import { validateToolCalls } from '../validation/toolValidator';
import { DEFAULT_AUGMENTATION_CONCURRENCY, MIN_CONCURRENCY } from '../constants';

/**
 * Per HLD §2.4.4 / §2.7.5: one LLM call per (base_case, strategy) pair.
 * The augmentor expands existing generated test cases into variations using
 * the strategies the customer enabled. Output is appended to the base set;
 * the review sampler downstream stratifies by provenance.source which now
 * includes 'augmentation' as its own group.
 */

/**
 * Inputs to {@link augmentTestCases}. Strategies must already be filtered for
 * applicability — pass only strategies whose prerequisites (tools for
 * `parameter_variation`, systemPrompt for `negative_case`) are satisfied; the
 * augmentor does not gate. Concurrency defaults to {@link DEFAULT_AUGMENTATION_CONCURRENCY}.
 */
export interface AugmentTestCasesOptions {
  modelId: string;
  baseCases: GeneratedTestCase[];
  strategies: AugmentationStrategy[];
  systemPrompt: string | undefined;
  tools: ToolDefinition[] | undefined;
  concurrency?: number | undefined;
  onProgress?: ((completed: number, total: number) => void) | undefined;
}

/**
 * Yielded by {@link augmentTestCases} for each successfully augmented case.
 * `parentCase` and `strategy` are exposed alongside the augmented `testCase`
 * so callers can correlate without re-deriving from `provenance`.
 */
export interface AugmentationResult {
  testCase: GeneratedTestCase;
  parentCase: GeneratedTestCase;
  strategy: AugmentationStrategy;
}

interface AugmentationJob {
  baseCase: GeneratedTestCase;
  strategy: AugmentationStrategy;
  index: number;
}

/**
 * Flattens toolCalls for tool-call validation (single-turn flat array vs
 * multi-turn array-of-arrays). Mirrors the generator's flattenToolCalls.
 */
function flattenToolCalls(toolCalls: ToolCall[] | ToolCall[][]): ToolCall[] {
  if (toolCalls.length === 0) return [];
  if (toolCalls[0] && Array.isArray(toolCalls[0])) {
    return (toolCalls as ToolCall[][]).flat();
  }
  return toolCalls as ToolCall[];
}

export async function* augmentTestCases(options: AugmentTestCasesOptions): AsyncGenerator<AugmentationResult> {
  const {
    modelId,
    baseCases,
    strategies,
    systemPrompt,
    tools,
    concurrency = DEFAULT_AUGMENTATION_CONCURRENCY,
    onProgress,
  } = options;

  if (baseCases.length === 0 || strategies.length === 0) {
    return;
  }

  // Build the (baseCase, strategy) work-list. Strategies vary in cost and
  // value, but order doesn't matter — concurrency mixes them naturally.
  const jobs: AugmentationJob[] = [];
  let jobIndex = 0;
  for (const baseCase of baseCases) {
    for (const strategy of strategies) {
      jobs.push({ baseCase, strategy, index: jobIndex++ });
    }
  }

  const totalJobs = jobs.length;
  let successCount = 0;
  let failedCount = 0;
  let currentConcurrency = Math.min(concurrency, totalJobs);
  // Counts consecutive *batches* (not jobs) that contained any throttle.
  // Resets after a clean batch so backoff doesn't compound when a single
  // throttled job in a mostly-successful batch keeps the exponent climbing.
  let consecutiveThrottledBatches = 0;

  // Result carries the originating job so we don't need to zip with batch[i]
  // afterwards — keeps job access consistent and avoids tripping
  // noUncheckedIndexedAccess on parallel-array lookups.
  type JobOutcome =
    | { kind: 'ok'; result: AugmentationResult }
    | { kind: 'throttled'; job: AugmentationJob }
    | { kind: 'failed' };

  async function processJob(job: AugmentationJob): Promise<JobOutcome> {
    try {
      const testCase = await augmentSingleTestCase({
        modelId,
        baseCase: job.baseCase,
        strategy: job.strategy,
        systemPrompt,
        tools,
      });
      return { kind: 'ok', result: { testCase, parentCase: job.baseCase, strategy: job.strategy } };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      if (isThrottlingError(err)) {
        console.warn(`Throttled augmenting case (strategy=${job.strategy}); will retry with reduced concurrency`);
        return { kind: 'throttled', job };
      }
      console.error(
        `Failed to augment case (strategy=${job.strategy}, parent=${job.baseCase.context.provenance.scenarioId}):`,
        err,
      );
      return { kind: 'failed' };
    }
  }

  const queue = [...jobs];

  while (queue.length > 0) {
    const batch = queue.splice(0, currentConcurrency);
    const batchResults = await Promise.all(batch.map(processJob));
    const throttledJobs: AugmentationJob[] = [];

    for (const outcome of batchResults) {
      if (outcome.kind === 'throttled') {
        throttledJobs.push(outcome.job);
      } else if (outcome.kind === 'ok') {
        yield outcome.result;
        successCount++;
      } else {
        failedCount++;
      }
    }

    if (throttledJobs.length > 0) {
      queue.unshift(...throttledJobs);
      consecutiveThrottledBatches++;
      currentConcurrency = Math.max(MIN_CONCURRENCY, Math.floor(currentConcurrency / 2));
      console.log(`Reducing augmentation concurrency to ${currentConcurrency} due to throttling`);
      const backoffMs = Math.min(1000 * Math.pow(2, consecutiveThrottledBatches), 30000);
      console.log(`Backing off for ${backoffMs}ms`);
      await sleep(backoffMs);
    } else {
      consecutiveThrottledBatches = 0;
      if (currentConcurrency < concurrency) {
        currentConcurrency = Math.min(currentConcurrency + 1, concurrency);
      }
    }

    if (onProgress) {
      onProgress(successCount + failedCount, totalJobs);
    }
  }

  const failedMsg = failedCount > 0 ? ` (${failedCount} failed)` : '';
  console.log(`Augmented ${successCount}/${totalJobs} cases${failedMsg}`);
}

interface AugmentSingleOptions {
  modelId: string;
  baseCase: GeneratedTestCase;
  strategy: AugmentationStrategy;
  systemPrompt: string | undefined;
  tools: ToolDefinition[] | undefined;
}

async function augmentSingleTestCase(options: AugmentSingleOptions): Promise<GeneratedTestCase> {
  const { modelId, baseCase, strategy, systemPrompt, tools } = options;

  const prompt = buildAugmentationPrompt(baseCase, strategy, systemPrompt, tools);

  const rawTestCase = await converseWithRetry<Omit<GeneratedTestCase, 'context'>>(
    {
      modelId,
      messages: [createUserMessage(prompt)],
      // Slightly higher than generator (0.7) because variations should
      // diverge from the base; near-duplicates defeat the purpose.
      temperature: 0.8,
    },
    (content) => {
      const jsonStr = extractJsonFromResponse(content);
      const parsed = safeJsonParse(jsonStr);

      const validated = parseWithFieldErrors(
        GeneratedTestCaseModel.omit({ context: true }),
        parsed,
        'Schema validation failed',
      );

      const rawToolCalls = validated.expected.toolCalls ?? [];
      const flatToolCalls = flattenToolCalls(rawToolCalls);

      // Negative cases legitimately have no tool calls — refusing the request.
      // Any non-empty tool calls in any strategy still need to validate against schemas.
      if (tools && tools.length > 0 && flatToolCalls.length > 0) {
        const validationErrors = validateToolCalls(flatToolCalls, tools);
        if (validationErrors.length > 0) {
          throw new Error(`Tool validation failed: ${validationErrors.join('; ')}`);
        }
      }

      return validated;
    },
    (error, previousContent) => `Your previous response was invalid. Error: ${error.message}

Previous response:
${previousContent}

Please fix the error and provide a valid JSON response. Output ONLY the corrected JSON, no additional text.`,
  );

  const parentProvenance = baseCase.context.provenance;
  const parentScenarioId = parentProvenance.scenarioId;

  const testCase: GeneratedTestCase = {
    ...rawTestCase,
    context: {
      provenance: {
        source: 'augmentation',
        scenarioId: `${parentScenarioId}-${strategy}`,
        ...(parentProvenance.planAxis !== undefined ? { planAxis: parentProvenance.planAxis } : {}),
        augmentationStrategy: strategy,
        parentScenarioId,
      },
    },
  };

  return testCase;
}

function isThrottlingError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return (
    message.includes('throttl') ||
    message.includes('rate limit') ||
    message.includes('too many requests') ||
    message.includes('serviceunavailableexception') ||
    error.name === 'ThrottlingException' ||
    error.name === 'ServiceUnavailableException'
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
