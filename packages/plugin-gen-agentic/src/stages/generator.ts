import { Scenario, ToolDefinition, SeedExample, GeneratedTestCase, GeneratedTestCaseModel, ToolCall } from '../models';
import {
  converseWithRetry,
  createUserMessage,
  extractJsonFromResponse,
  parseWithFieldErrors,
  safeJsonParse,
} from '../helpers/bedrock';
import { buildGenerationPrompt } from '../helpers/prompts';
import { validateToolCalls } from '../validation/toolValidator';
import { DEFAULT_CONCURRENCY, MIN_CONCURRENCY } from '../constants';

/**
 * Flattens toolCalls which can be either:
 * - ToolCall[] for single-turn
 * - ToolCall[][] for multi-turn (array of arrays, one per turn)
 */
function flattenToolCalls(toolCalls: ToolCall[] | ToolCall[][]): ToolCall[] {
  if (toolCalls.length === 0) return [];
  // Check if first element is an array (multi-turn format)
  // Use explicit check to handle empty inner arrays correctly
  if (toolCalls[0] && Array.isArray(toolCalls[0])) {
    return (toolCalls as ToolCall[][]).flat();
  }
  return toolCalls as ToolCall[];
}

/**
 * Validates that the generated toolCalls match the scenario's toolsInvolved.
 * Returns an array of error messages (empty if valid).
 */
function validateScenarioToolMatch(toolCalls: ToolCall[], scenario: Scenario): string[] {
  const errors: string[] = [];
  const expectedTools = new Set(scenario.toolsInvolved);
  const generatedTools = new Set(toolCalls.map((tc) => tc.name));

  // Check for missing tools (in scenario but not in generated)
  const missingTools = [...expectedTools].filter((t) => !generatedTools.has(t));
  if (missingTools.length > 0) {
    errors.push(
      `Missing tools from scenario: [${missingTools.join(', ')}]. Expected: [${scenario.toolsInvolved.join(', ')}]`,
    );
  }

  // Check for extra tools (in generated but not in scenario)
  const extraTools = [...generatedTools].filter((t) => !expectedTools.has(t));
  if (extraTools.length > 0) {
    errors.push(
      `Extra tools not in scenario: [${extraTools.join(', ')}]. Expected only: [${scenario.toolsInvolved.join(', ')}]`,
    );
  }

  return errors;
}

export interface GenerateTestCasesOptions {
  modelId: string;
  scenarios: Scenario[];
  systemPrompt: string | undefined;
  tools: ToolDefinition[] | undefined;
  seedExamples: SeedExample[] | undefined;
  /** For trace-grounded generation: find matching examples per scenario */
  traceExampleFinder?: ((toolsInvolved: string[], outcome: string) => SeedExample[]) | undefined;
  concurrency?: number | undefined;
  onProgress?: ((completed: number, total: number) => void) | undefined;
}

export interface GenerationResult {
  testCase: GeneratedTestCase;
  scenario: Scenario;
}

export async function* generateTestCases(options: GenerateTestCasesOptions): AsyncGenerator<GenerationResult> {
  const {
    modelId,
    scenarios,
    systemPrompt,
    tools,
    seedExamples,
    traceExampleFinder,
    concurrency = DEFAULT_CONCURRENCY,
    onProgress,
  } = options;

  const queue = [...scenarios];
  let successCount = 0;
  let failedCount = 0;
  let currentConcurrency = Math.min(concurrency, scenarios.length);
  let consecutiveThrottles = 0;

  async function processScenario(scenario: Scenario): Promise<GenerationResult | 'throttled' | null> {
    try {
      // For trace-grounded generation: find matching examples for this scenario
      // Works for both tool-based scenarios (matches by tool overlap) and
      // tool-less scenarios (matches conversations without tool calls)
      const traceExamples = traceExampleFinder ? traceExampleFinder(scenario.toolsInvolved, scenario.outcome) : [];
      const effectiveExamples = traceExamples.length > 0 ? traceExamples : seedExamples;

      const testCase = await generateSingleTestCase({
        modelId,
        scenario,
        systemPrompt,
        tools,
        seedExamples: effectiveExamples,
      });
      consecutiveThrottles = 0;
      return { testCase, scenario };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      if (isThrottlingError(err)) {
        console.warn(`Throttled on scenario ${scenario.id}, will retry with reduced concurrency`);
        consecutiveThrottles++;
        return 'throttled';
      }

      console.error(`Failed to generate test case for scenario ${scenario.id}:`, err);
      return null;
    }
  }

  while (queue.length > 0) {
    const batch = queue.splice(0, currentConcurrency);
    const batchResults = await Promise.all(batch.map(processScenario));

    const throttledScenarios: Scenario[] = [];

    for (let i = 0; i < batchResults.length; i++) {
      const result = batchResults[i];
      const scenario = batch[i];

      if (result === 'throttled') {
        if (scenario) throttledScenarios.push(scenario);
      } else if (result !== null && result !== undefined) {
        yield result;
        successCount++;
      } else {
        failedCount++;
      }
    }

    if (throttledScenarios.length > 0) {
      queue.unshift(...throttledScenarios);

      currentConcurrency = Math.max(MIN_CONCURRENCY, Math.floor(currentConcurrency / 2));
      console.log(`Reducing concurrency to ${currentConcurrency} due to throttling`);

      const backoffMs = Math.min(1000 * Math.pow(2, consecutiveThrottles), 30000);
      console.log(`Backing off for ${backoffMs}ms`);
      await sleep(backoffMs);
    } else {
      // Reset consecutive throttles after a successful batch with no throttling
      consecutiveThrottles = 0;

      // Gradually ramp concurrency back up after successful batches
      if (currentConcurrency < concurrency) {
        currentConcurrency = Math.min(currentConcurrency + 1, concurrency);
      }
    }

    if (onProgress) {
      onProgress(successCount + failedCount, scenarios.length);
    }
  }

  const failedMsg = failedCount > 0 ? ` (${failedCount} failed)` : '';
  console.log(`Generated ${successCount}/${scenarios.length} test cases${failedMsg}`);
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

interface GenerateSingleOptions {
  modelId: string;
  scenario: Scenario;
  systemPrompt: string | undefined;
  tools: ToolDefinition[] | undefined;
  seedExamples: SeedExample[] | undefined;
}

async function generateSingleTestCase(options: GenerateSingleOptions): Promise<GeneratedTestCase> {
  const { modelId, scenario, systemPrompt, tools, seedExamples } = options;

  const prompt = buildGenerationPrompt(scenario, systemPrompt, tools, seedExamples);

  const rawTestCase = await converseWithRetry<Omit<GeneratedTestCase, 'context'>>(
    {
      modelId,
      messages: [createUserMessage(prompt)],
      temperature: 0.7,
    },
    (content) => {
      const jsonStr = extractJsonFromResponse(content);
      const parsed = safeJsonParse(jsonStr);

      const validated = parseWithFieldErrors(
        GeneratedTestCaseModel.omit({ context: true }),
        parsed,
        'Schema validation failed',
      );

      // Flatten toolCalls for validation (handles both single-turn flat array and multi-turn array-of-arrays)
      const rawToolCalls = validated.expected.toolCalls ?? [];
      const flatToolCalls = flattenToolCalls(rawToolCalls);

      if (tools && tools.length > 0 && flatToolCalls.length > 0) {
        const validationErrors = validateToolCalls(flatToolCalls, tools);
        if (validationErrors.length > 0) {
          throw new Error(`Tool validation failed: ${validationErrors.join('; ')}`);
        }
      }

      // Validate that toolCalls match scenario's toolsInvolved (only if scenario expects tools)
      if (scenario.toolsInvolved.length > 0) {
        const scenarioToolsErrors = validateScenarioToolMatch(flatToolCalls, scenario);
        if (scenarioToolsErrors.length > 0) {
          throw new Error(`Scenario tool mismatch: ${scenarioToolsErrors.join('; ')}`);
        }
      }

      return validated;
    },
    (error, previousContent) => {
      let enumHint = '';
      if (tools && error.message.includes('must be equal to one of the allowed values')) {
        const toolEnums = tools
          .filter((t) => t.parameters)
          .map((t) => {
            const params = t.parameters as Record<string, unknown> | undefined;
            const props = params?.['properties'] as Record<string, Record<string, unknown>> | undefined;
            if (!props) return null;
            const enumFields = Object.entries(props)
              .filter(([, v]) => v['enum'])
              .map(([k, v]) => `${t.name}.${k}: [${(v['enum'] as string[]).join(', ')}]`);
            return enumFields.length > 0 ? enumFields.join('; ') : null;
          })
          .filter(Boolean);
        if (toolEnums.length > 0) {
          enumHint = `\n6. Allowed enum values: ${toolEnums.join('; ')}`;
        }
      }

      return `Your previous response was invalid. Error: ${error.message}

Previous response:
${previousContent}

Please fix the error. Ensure:
1. Tool names match exactly the available tools
2. Tool arguments match the parameter schemas exactly
3. toolCalls must contain ALL tools from scenario's toolsInvolved: [${scenario.toolsInvolved.join(', ')}]
4. toolCalls must ONLY contain tools from scenario's toolsInvolved - no extra tools
5. Output is valid JSON${enumHint}

Output ONLY the corrected JSON, no additional text.`;
    },
  );

  const testCase: GeneratedTestCase = {
    ...rawTestCase,
    context: {
      provenance: {
        source: scenario.source,
        scenarioId: scenario.id,
        planAxis: scenario.toolsInvolved.join(','),
      },
    },
  };

  return testCase;
}
