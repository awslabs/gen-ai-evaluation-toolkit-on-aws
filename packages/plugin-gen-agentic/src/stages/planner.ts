import { Taxonomy, Scenario, ScenarioModel, TraceCoverage, ExtractedConversation } from '../models';
import { z } from 'zod';
import {
  converseWithRetry,
  createUserMessage,
  extractJsonFromResponse,
  parseWithFieldErrors,
  safeJsonParse,
} from '../helpers/bedrock';
import { buildScenarioSamplingPrompt, CoverageSummary } from '../helpers/prompts';
import { SCENARIO_BATCH_SIZE } from '../constants';
import { selectDiverseFailurePatterns } from './trace-extractor';

const MAX_FAILURE_PATTERNS_IN_PROMPT = 10;

export interface SampleScenariosOptions {
  modelId: string;
  taxonomy: Taxonomy;
  totalTestCases: number;
  focusAreas: string[] | undefined;
  traceCoverage?: TraceCoverage | undefined;
  failureConversations?: ExtractedConversation[] | undefined;
}

const ScenariosArrayModel = z.array(ScenarioModel);

export async function sampleScenarios(options: SampleScenariosOptions): Promise<Scenario[]> {
  const { modelId, taxonomy, totalTestCases, focusAreas, traceCoverage, failureConversations } = options;

  console.log(`Sampling ${totalTestCases} scenarios from taxonomy...`);

  // Build trace context for enhanced prompts
  const traceContext = buildTraceContext(traceCoverage, failureConversations);

  // For small counts, generate in one shot
  if (totalTestCases <= SCENARIO_BATCH_SIZE) {
    const scenarios = await sampleScenariosBatch(
      modelId,
      taxonomy,
      totalTestCases,
      focusAreas,
      1,
      undefined,
      traceContext,
    );
    scenarios.sort((a, b) => a.priority - b.priority);
    console.log(`Sampled ${scenarios.length} scenarios`);
    return scenarios;
  }

  // For larger counts, generate in batches with coverage tracking
  const allScenarios: Scenario[] = [];
  const numBatches = Math.ceil(totalTestCases / SCENARIO_BATCH_SIZE);
  let consecutiveFailures = 0;
  const MAX_CONSECUTIVE_FAILURES = 3;

  for (let batch = 0; batch < numBatches; batch++) {
    const remaining = totalTestCases - allScenarios.length;
    const batchSize = Math.min(SCENARIO_BATCH_SIZE, remaining);
    const startId = allScenarios.length + 1;

    // Build coverage summary from previous batches
    const coverageSummary = buildCoverageSummary(allScenarios, taxonomy);

    console.log(
      `  Batch ${batch + 1}/${numBatches}: generating ${batchSize} scenarios (starting at scenario-${String(startId).padStart(3, '0')})...`,
    );

    try {
      const batchScenarios = await sampleScenariosBatch(
        modelId,
        taxonomy,
        batchSize,
        focusAreas,
        startId,
        batch > 0 ? coverageSummary : undefined, // Only pass coverage for subsequent batches
        traceContext,
      );
      allScenarios.push(...batchScenarios);
      consecutiveFailures = 0;
    } catch (error) {
      consecutiveFailures++;
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn(`  Batch ${batch + 1} failed: ${errorMessage}`);

      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        console.error(`Stopping scenario generation after ${MAX_CONSECUTIVE_FAILURES} consecutive failures`);
        break;
      }

      // If we have some scenarios, continue with reduced expectations
      if (allScenarios.length > 0) {
        console.warn(`  Continuing with ${allScenarios.length} scenarios generated so far`);
      } else if (batch === 0) {
        // First batch failed with no scenarios - rethrow to fail fast
        throw error;
      }
    }
  }

  if (allScenarios.length === 0) {
    throw new Error('Failed to generate any scenarios');
  }

  console.log(`Sampled ${allScenarios.length} scenarios total`);

  allScenarios.sort((a, b) => a.priority - b.priority);

  return allScenarios;
}

async function sampleScenariosBatch(
  modelId: string,
  taxonomy: Taxonomy,
  count: number,
  focusAreas: string[] | undefined,
  startId: number,
  coverageSummary: CoverageSummary | undefined,
  traceContext: string | undefined,
): Promise<Scenario[]> {
  let prompt = buildScenarioSamplingPrompt(taxonomy, count, focusAreas, startId, coverageSummary);

  if (traceContext) {
    prompt += `\n\n${traceContext}`;
  }

  const buildScenarioRetryPrompt = (error: Error, previousContent: string): string => {
    return `Your previous response was invalid. Error: ${error.message}

Previous response:
${previousContent}

IMPORTANT - Allowed values from taxonomy:
- turns: MUST be one of [${taxonomy.axes.turnCounts.join(', ')}]
- outcome: MUST be one of ["${taxonomy.axes.outcomes.join('", "')}"]
- difficulty: MUST be one of ["${taxonomy.axes.difficulty.join('", "')}"]

Please fix the error and provide a valid JSON response. Output ONLY the corrected JSON, no additional text.`;
  };

  const scenarios = await converseWithRetry<Scenario[]>(
    {
      modelId,
      messages: [createUserMessage(prompt)],
      temperature: 0.5, // Lower temperature for more consistent coverage
      maxTokens: 4096,
    },
    (content) => {
      const jsonStr = extractJsonFromResponse(content);
      const parsed = safeJsonParse(jsonStr);

      const validated = parseWithFieldErrors(ScenariosArrayModel, parsed, 'Schema validation failed');

      if (validated.length === 0) {
        throw new Error('LLM returned empty scenarios array');
      }

      // Post-validation: check for duplicate tools and taxonomy compliance
      const errors: string[] = [];
      const allowedTurns = new Set(taxonomy.axes.turnCounts);
      const allowedOutcomes = new Set(taxonomy.axes.outcomes);
      const allowedDifficulty = new Set(taxonomy.axes.difficulty);

      for (const scenario of validated) {
        // Check duplicate tools
        const uniqueTools = new Set(scenario.toolsInvolved);
        if (uniqueTools.size !== scenario.toolsInvolved.length) {
          const duplicates = scenario.toolsInvolved.filter((t, i) => scenario.toolsInvolved.indexOf(t) !== i);
          errors.push(`${scenario.id}: duplicate tools in toolsInvolved [${duplicates.join(', ')}]`);
        }

        // Check turn count is in taxonomy
        if (!allowedTurns.has(scenario.turns)) {
          errors.push(`${scenario.id}: turns=${scenario.turns} not in taxonomy [${[...allowedTurns].join(', ')}]`);
        }

        // Check outcome is in taxonomy
        if (!allowedOutcomes.has(scenario.outcome)) {
          errors.push(
            `${scenario.id}: outcome="${scenario.outcome}" not in taxonomy [${[...allowedOutcomes].join(', ')}]`,
          );
        }

        // Check difficulty is in taxonomy
        if (!allowedDifficulty.has(scenario.difficulty)) {
          errors.push(
            `${scenario.id}: difficulty="${scenario.difficulty}" not in taxonomy [${[...allowedDifficulty].join(', ')}]`,
          );
        }
      }

      if (errors.length > 0) {
        throw new Error(`Invalid scenarios: ${errors.join('; ')}`);
      }

      return validated;
    },
    buildScenarioRetryPrompt,
  );

  return scenarios;
}

function buildCoverageSummary(scenarios: Scenario[], taxonomy: Taxonomy): CoverageSummary {
  // Initialize coverage counts
  const turnCountCoverage: Record<number, number> = {};
  for (const tc of taxonomy.axes.turnCounts) {
    turnCountCoverage[tc] = 0;
  }

  const difficultyCoverage: Record<string, number> = {};
  for (const d of taxonomy.axes.difficulty) {
    difficultyCoverage[d] = 0;
  }

  const outcomeCoverage: Record<string, number> = {};
  for (const o of taxonomy.axes.outcomes) {
    outcomeCoverage[o] = 0;
  }

  // Initialize tool combination coverage
  const toolCombinationCoverage: Record<string, number> = {};
  for (const combo of taxonomy.axes.toolCombinations) {
    const key = [...combo].sort().join(',');
    toolCombinationCoverage[key] = 0;
  }

  // Count coverage from existing scenarios
  const previousScenarios: CoverageSummary['previousScenarios'] = [];

  for (const s of scenarios) {
    previousScenarios.push({
      id: s.id,
      turns: s.turns,
      difficulty: s.difficulty,
      outcome: s.outcome,
      tools: s.toolsInvolved,
      description: s.description,
    });

    if (s.turns in turnCountCoverage) {
      turnCountCoverage[s.turns] = (turnCountCoverage[s.turns] ?? 0) + 1;
    }
    if (s.difficulty in difficultyCoverage) {
      difficultyCoverage[s.difficulty] = (difficultyCoverage[s.difficulty] ?? 0) + 1;
    }
    if (s.outcome in outcomeCoverage) {
      outcomeCoverage[s.outcome] = (outcomeCoverage[s.outcome] ?? 0) + 1;
    }

    // Track tool combination coverage
    const toolKey = [...s.toolsInvolved].sort().join(',');
    if (toolKey in toolCombinationCoverage) {
      toolCombinationCoverage[toolKey] = (toolCombinationCoverage[toolKey] ?? 0) + 1;
    } else if (toolKey) {
      // Warn about tool combinations not in taxonomy (may indicate LLM generated invalid combo)
      console.warn(`Scenario ${s.id} references tool combination not in taxonomy: [${toolKey}]`);
    }
  }

  return {
    previousScenarios,
    turnCountCoverage,
    difficultyCoverage,
    outcomeCoverage,
    toolCombinationCoverage,
  };
}

function buildTraceContext(
  traceCoverage: TraceCoverage | undefined,
  failureConversations: ExtractedConversation[] | undefined,
): string | undefined {
  if (!traceCoverage && !failureConversations?.length) {
    return undefined;
  }

  const parts: string[] = ['## Trace-Based Prioritization'];

  if (traceCoverage) {
    const { outcomeDistribution } = traceCoverage;
    const total = outcomeDistribution.success + outcomeDistribution.failure + outcomeDistribution.abandonment;
    const failureRate = total > 0 ? ((outcomeDistribution.failure / total) * 100).toFixed(1) : '0';
    const abandonmentRate = total > 0 ? ((outcomeDistribution.abandonment / total) * 100).toFixed(1) : '0';

    parts.push(`
Production trace analysis shows:
- ${outcomeDistribution.failure} failures (${failureRate}% of traces)
- ${outcomeDistribution.abandonment} abandonments (${abandonmentRate}% of traces)
- Observed tools: ${traceCoverage.observedTools.join(', ') || 'none'}

Generate scenarios that prioritize testing failure-prone patterns.`);
  }

  if (failureConversations && failureConversations.length > 0) {
    // Select diverse failure patterns to avoid context saturation with similar errors
    const diverseFailures = selectDiverseFailurePatterns(failureConversations, MAX_FAILURE_PATTERNS_IN_PROMPT);

    const summaries = diverseFailures.map((c) => {
      const toolNames = c.turns.flatMap((t) => t.toolCalls?.map((tc) => tc.name) ?? []);
      const firstUserMsg = c.turns[0]?.userMessage?.slice(0, 80) ?? 'N/A';
      return `- [${c.outcome}] tools: [${toolNames.join(', ')}], turns: ${c.turns.length}, intent: "${firstUserMsg}..."`;
    });

    const totalFailures = failureConversations.length;
    const shownCount = diverseFailures.length;

    parts.push(`
Observed failure patterns (${shownCount} diverse samples from ${totalFailures} total failures):
${summaries.join('\n')}

For failure-pattern scenarios, set source="failure_pattern" and priority=1.`);
  }

  return parts.join('\n');
}
