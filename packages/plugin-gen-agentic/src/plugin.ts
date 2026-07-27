import { defineGenerator, writeS3Object, getEnvVariable, getS3ObjectContent } from '@genai-etk/plugin-gen-sdk';
import { z } from 'zod';
import { buildTaxonomy, buildDefaultTaxonomy } from './stages/taxonomy';
import { sampleScenarios } from './stages/planner';
import { generateTestCases } from './stages/generator';
import { augmentTestCases } from './stages/augmentor';
import { applyReviewSampling } from './stages/reviewSampler';
import {
  extractTracesInBatches,
  dedupeAndSample,
  computeTraceCoverage,
  findMatchingTraceExamples,
  conversationToSeedExample,
} from './stages/trace-extractor';
import { DEFAULT_MODEL, DEFAULT_CONCURRENCY, DEFAULT_AUGMENTATION_CONCURRENCY, EnvVariable } from './constants';
import {
  ToolDefinitionModel,
  SeedExampleModel,
  TaxonomyAxesModel,
  S3UriModel,
  isS3Reference,
  parseS3Uri,
  ToolDefinition,
  SeedExample,
  TraceConfigModel,
  ExtractedConversation,
  TraceCoverage,
  GeneratedTestCase,
  AugmentationStrategy,
  AugmentationStrategyEnum,
} from './models';

// S3 reference support for large inputs (>1MB) per HLD hybrid model
const AgentConfigSchema = z.object({
  systemPrompt: z.union([z.string(), S3UriModel]).optional(),
  tools: z.union([z.array(ToolDefinitionModel), S3UriModel]).optional(),
});

const AgenticConfigSchema = z.object({
  agent: AgentConfigSchema.optional(),
  modelId: z.string().default(DEFAULT_MODEL),
  totalTestCases: z.number().positive(),
  seedExamples: z.union([z.array(SeedExampleModel), S3UriModel]).optional(),
  focusAreas: z.array(z.string()).optional(),
  taxonomyAxes: TaxonomyAxesModel.optional(),
  traces: TraceConfigModel.optional(),
  // Augmentation strategies to apply after Stage 3. Default empty (off).
  // Per HLD §2.4.4 / §2.7.5 — one LLM call per (base case, strategy) pair.
  augmentationStrategies: z.array(AugmentationStrategyEnum).default([]),
  // Fraction of generated test cases tagged requires_review=true, stratified
  // by provenance source. Regulated-domain customers raise this. HLD §2.4 / §2.7.6.
  reviewSampleRate: z.number().min(0).max(1).default(0.2),
});

// Resolve S3 reference to actual content
async function resolveS3Reference<T>(
  value: T | { s3: string } | undefined,
  parser: (content: string) => T,
): Promise<T | undefined> {
  if (value === undefined) return undefined;
  if (!isS3Reference(value)) return value as T;

  const { bucket, key } = parseS3Uri(value.s3);
  let body: Awaited<ReturnType<typeof getS3ObjectContent>>;
  try {
    body = await getS3ObjectContent(bucket, key);
  } catch (error) {
    // Log the original SDK error first so its name (AccessDenied/NoSuchKey) and
    // $metadata (request ID) survive in CloudWatch even after we wrap it.
    console.error(`Failed to read S3 object ${value.s3}:`, error);
    throw new Error(`Failed to read S3 object ${value.s3}`, { cause: error });
  }
  if (!body) {
    throw new Error(`Failed to read S3 object: ${value.s3}`);
  }
  const content = await body.transformToString();

  try {
    return parser(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse S3 reference ${value.s3}: ${message}`);
  }
}

const plugin = defineGenerator({
  name: 'AgenticGenerator',
  configSchema: AgenticConfigSchema,

  generate: async function* (config, ctx) {
    const internalS3Bucket = getEnvVariable(EnvVariable.INTERNAL_S3_BUCKET);

    const { agent, modelId, totalTestCases, focusAreas, taxonomyAxes, traces } = config;

    // Resolve S3 references for large inputs (hybrid model per HLD)
    await ctx.reportProgress('Resolving configuration inputs');

    const systemPrompt = await resolveS3Reference(agent?.systemPrompt, (c) => c);
    // Validate S3-referenced content against Zod schemas (same validation as inline configs)
    const tools = await resolveS3Reference<ToolDefinition[]>(agent?.tools, (c) =>
      ToolDefinitionModel.array().parse(JSON.parse(c)),
    );
    const seedExamples = await resolveS3Reference<SeedExample[]>(config.seedExamples, (c) =>
      SeedExampleModel.array().parse(JSON.parse(c)),
    );

    // Optional: Extract conversations from OTEL traces
    let traceCoverage: TraceCoverage | undefined;
    let sampledConversations: ExtractedConversation[] | undefined;

    console.log(`[${ctx.runId}] Trace config:`, traces ? JSON.stringify(traces) : 'not provided');

    if (traces?.location) {
      console.log(`[${ctx.runId}] Trace extraction enabled, location: ${traces.location}`);
      await ctx.reportProgress('Phase 1: Extracting conversations from traces');

      const { bucket, key } = parseS3Uri(traces.location);
      console.log(`[${ctx.runId}] Parsed trace location - bucket: ${bucket}, key: ${key}`);

      const { conversationsPrefix, totalConversations } = await extractTracesInBatches(
        bucket,
        key,
        internalS3Bucket,
        ctx.runId,
        (batchNumber, total) => {
          if (batchNumber % 10 === 0) {
            ctx.reportProgress(`Extracted ${total} conversations (batch ${batchNumber})`).catch(console.error);
          }
        },
      );

      console.log(
        `[${ctx.runId}] Extracted ${totalConversations} conversations to s3://${internalS3Bucket}/${conversationsPrefix}`,
      );

      await ctx.reportProgress('Phase 2: Deduplicating and sampling conversations');

      sampledConversations = await dedupeAndSample(internalS3Bucket, conversationsPrefix, traces);

      traceCoverage = computeTraceCoverage(sampledConversations);

      console.log(`[${ctx.runId}] Sampled ${sampledConversations.length} conversations`);
      console.log(`[${ctx.runId}] Outcome distribution:`, traceCoverage.outcomeDistribution);

      const traceMetaKey = `trace-coverage/${ctx.runId}.json`;
      await writeS3Object(internalS3Bucket, traceMetaKey, JSON.stringify(traceCoverage, null, 2));
    }

    // Stage 1: Build Taxonomy (enhanced with trace coverage if available)
    await ctx.reportProgress('Building coverage taxonomy');

    let taxonomy;
    try {
      taxonomy = await buildTaxonomy({
        modelId,
        systemPrompt,
        tools,
        focusAreas,
        taxonomyAxes,
        traceCoverage,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.warn(`[${ctx.runId}] LLM taxonomy construction failed, using default taxonomy:`, errorMessage);
      taxonomy = buildDefaultTaxonomy(systemPrompt, tools, focusAreas);
    }

    const taxonomyKey = `taxonomy/${ctx.runId}.json`;
    try {
      await writeS3Object(internalS3Bucket, taxonomyKey, JSON.stringify(taxonomy, null, 2));
      console.log(`[${ctx.runId}] Wrote taxonomy to s3://${internalS3Bucket}/${taxonomyKey}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[${ctx.runId}] Failed to write taxonomy to S3: ${errorMessage}`);
      throw error;
    }

    await ctx.reportProgress('Taxonomy built, sampling scenarios');

    // Stage 2: Sample Scenarios (enhanced with failure patterns if available)
    const failureConversations = sampledConversations?.filter((c) => c.outcome === 'failure');

    const scenarios = await sampleScenarios({
      modelId,
      taxonomy,
      totalTestCases,
      focusAreas,
      traceCoverage,
      failureConversations,
    });

    const scenariosKey = `scenarios/${ctx.runId}.json`;
    try {
      await writeS3Object(internalS3Bucket, scenariosKey, JSON.stringify(scenarios, null, 2));
      console.log(`[${ctx.runId}] Wrote ${scenarios.length} scenarios to s3://${internalS3Bucket}/${scenariosKey}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[${ctx.runId}] Failed to write scenarios to S3: ${errorMessage}`);
      throw error;
    }

    await ctx.reportProgress(`Generated ${scenarios.length} scenarios, starting test case generation`);

    // Stage 3: Generate Test Cases (with trace-grounded examples if available)
    // Build a finder function that matches trace examples to each scenario's tools
    const traceExampleFinder: ((toolsInvolved: string[], outcome: string) => SeedExample[]) | undefined =
      sampledConversations && sampledConversations.length > 0
        ? (toolsInvolved: string[], outcome: string): SeedExample[] => {
            const matched = findMatchingTraceExamples(sampledConversations, toolsInvolved, outcome, 3);
            return matched.map((conv) => {
              const example = conversationToSeedExample(conv);
              // Strip internal metadata for prompt, preserve per-turn tool call structure
              const seedExample: SeedExample = {
                input: example.input,
                expected: {
                  response: example.expected.response,
                },
              };
              if (example.expected.toolCalls) {
                seedExample.expected.toolCalls = example.expected.toolCalls;
              }
              return seedExample;
            });
          }
        : undefined;

    // Fall back to user-provided seed examples if no traces
    const fallbackSeedExamples = seedExamples ?? convertToSeedExamples(sampledConversations);

    // Buffer generated cases so review sampling can stratify over the full set.
    // Totals are bounded (~50–500), so the memory cost is fine and beats two-pass S3.
    const generatedCases: GeneratedTestCase[] = [];

    for await (const result of generateTestCases({
      modelId,
      scenarios,
      systemPrompt,
      tools,
      seedExamples: fallbackSeedExamples,
      traceExampleFinder,
      concurrency: DEFAULT_CONCURRENCY,
      onProgress: (completed, total) => {
        if (completed % 10 === 0 || completed === total) {
          ctx.reportProgress(`Generated ${completed}/${total} test cases`).catch(console.error);
        }
      },
    })) {
      generatedCases.push(result.testCase);
    }

    // Stage 4: Augmentation — produce per-strategy variations of base cases.
    // Per HLD §2.4.4 / §2.7.5. Augmented cases are appended to the pool.
    const augmentedCases: GeneratedTestCase[] = [];
    const activeStrategies = filterApplicableStrategies(
      config.augmentationStrategies ?? [],
      systemPrompt,
      tools,
      ctx.runId,
    );

    if (activeStrategies.length > 0 && generatedCases.length > 0) {
      await ctx.reportProgress(`Augmenting ${generatedCases.length} cases with ${activeStrategies.length} strategies`);

      const strategyCounts: Record<string, number> = {};
      for await (const result of augmentTestCases({
        modelId,
        baseCases: generatedCases,
        strategies: activeStrategies,
        systemPrompt,
        tools,
        concurrency: DEFAULT_AUGMENTATION_CONCURRENCY,
        onProgress: (completed, total) => {
          if (completed % 10 === 0 || completed === total) {
            ctx.reportProgress(`Augmented ${completed}/${total} cases`).catch(console.error);
          }
        },
      })) {
        augmentedCases.push(result.testCase);
        strategyCounts[result.strategy] = (strategyCounts[result.strategy] ?? 0) + 1;
      }

      const strategySummary = Object.entries(strategyCounts)
        .map(([s, n]) => `${s}=${n}`)
        .join(', ');
      console.log(
        `[${ctx.runId}] Augmentation: produced ${augmentedCases.length} cases (${strategySummary || 'none'})`,
      );
    }

    const allCases = [...generatedCases, ...augmentedCases];

    // Stage 5: Review sampling — stratified by provenance.source per HLD §2.7.6.
    // Augmentation cases stratify into their own group automatically.
    await ctx.reportProgress(`Applying review sampling (rate=${config.reviewSampleRate})`);

    const { testCases: finalCases, stats } = applyReviewSampling(allCases, config.reviewSampleRate);

    const sourceSummary = Object.entries(stats.bySource)
      .map(([source, { total, flagged }]) => `${source}=${flagged}/${total}`)
      .join(', ');
    console.log(
      `[${ctx.runId}] Review sampling: ${stats.flagged}/${stats.total} flagged (${sourceSummary || 'no sources'})`,
    );

    for (const testCase of finalCases) {
      // Move requiresReview into context so the DatastoreExport strict schema
      // (only input/expected/context at top level) does not reject it.
      const { requiresReview, context, ...rest } = testCase;
      yield { ...rest, context: { ...context, requiresReview } };
    }

    console.log(`[${ctx.runId}] Completed: ${finalCases.length} test cases generated`);
  },
});

/**
 * Convert extracted conversations to seed examples for test case generation.
 * Includes both success and failure conversations for balanced generation.
 */
function convertToSeedExamples(conversations: ExtractedConversation[] | undefined): SeedExample[] | undefined {
  if (!conversations || conversations.length === 0) return undefined;

  // Include both success and failure examples for balanced seed data
  // Filter out conversations with no turns to prevent null access
  const successExamples = conversations.filter((c) => c.outcome === 'success' && c.turns.length > 0).slice(0, 5);
  const failureExamples = conversations.filter((c) => c.outcome === 'failure' && c.turns.length > 0).slice(0, 5);

  return [...successExamples, ...failureExamples].map((c) => {
    const isSingleTurn = c.turns.length === 1;
    const perTurnToolCalls = c.turns.map((t) => t.toolCalls ?? []);
    const hasAnyToolCalls = perTurnToolCalls.some((calls) => calls.length > 0);

    const example: SeedExample = {
      input: isSingleTurn ? c.turns[0]!.userMessage : c.turns.map((t) => t.userMessage),
      expected: {
        response: c.turns[c.turns.length - 1]?.assistantMessage ?? '',
      },
    };

    if (hasAnyToolCalls) {
      // Single-turn: flat array; Multi-turn: per-turn arrays
      example.expected.toolCalls = isSingleTurn ? (perTurnToolCalls[0] ?? []) : perTurnToolCalls;
    }

    return example;
  });
}

/**
 * Filter augmentation strategies by the inputs available in this run.
 * Per HLD: parameter_variation needs tools; negative_case needs a system prompt.
 * Inapplicable strategies are dropped with a warning rather than failing the run.
 */
function filterApplicableStrategies(
  requested: AugmentationStrategy[],
  systemPrompt: string | undefined,
  tools: ToolDefinition[] | undefined,
  runId: string,
): AugmentationStrategy[] {
  const hasTools = !!(tools && tools.length > 0);
  const hasSystemPrompt = !!systemPrompt;
  const active: AugmentationStrategy[] = [];
  const skipped: string[] = [];

  for (const strategy of requested) {
    if (strategy === 'parameter_variation' && !hasTools) {
      skipped.push(`${strategy} (requires tool definitions)`);
      continue;
    }
    if (strategy === 'negative_case' && !hasSystemPrompt) {
      skipped.push(`${strategy} (requires system prompt to define scope)`);
      continue;
    }
    active.push(strategy);
  }

  if (skipped.length > 0) {
    console.warn(`[${runId}] Skipping augmentation strategies: ${skipped.join(', ')}`);
  }

  return active;
}

export default plugin;
