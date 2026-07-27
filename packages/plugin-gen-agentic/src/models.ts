import { z } from 'zod';
import { DEFAULT_MODEL } from './constants';

export const S3ReferenceModel = z.object({
  bucket: z.string(),
  prefix: z.string(),
});

// S3 URI reference for large inputs (>1MB) - supports "s3://bucket/key" format
export const S3UriModel = z.object({
  s3: z.string().regex(/^s3:\/\/[^/]+\/.+$/, 'Must be a valid S3 URI: s3://bucket/key'),
});

export type S3Uri = z.infer<typeof S3UriModel>;

// Helper to check if a value is an S3 reference
export function isS3Reference(value: unknown): value is S3Uri {
  return typeof value === 'object' && value !== null && 's3' in value;
}

// Parse S3 URI into bucket and key
export function parseS3Uri(uri: string): { bucket: string; key: string } {
  const match = uri.match(/^s3:\/\/([^/]+)\/(.+)$/);
  if (!match || !match[1] || !match[2]) {
    throw new Error(`Invalid S3 URI: ${uri}`);
  }
  return { bucket: match[1], key: match[2] };
}

export const ToolParameterSchemaModel: z.ZodType<Record<string, unknown>> = z.record(z.unknown());

export const ToolDefinitionModel = z.object({
  name: z.string(),
  description: z.string(),
  parameters: ToolParameterSchemaModel.optional(),
});

export type ToolDefinition = z.infer<typeof ToolDefinitionModel>;

export const ToolCallModel = z.object({
  name: z.string(),
  args: z.record(z.unknown()),
});

export type ToolCall = z.infer<typeof ToolCallModel>;

export const SeedExampleModel = z.object({
  input: z.union([z.string(), z.array(z.string())]),
  expected: z.object({
    response: z.string(),
    topics: z.array(z.string()).optional(),
    // Single-turn: ToolCall[] - flat array of tool invocations
    // Multi-turn: ToolCall[][] - array of arrays, one per turn
    toolCalls: z.union([z.array(ToolCallModel), z.array(z.array(ToolCallModel))]).optional(),
  }),
});

export type SeedExample = z.infer<typeof SeedExampleModel>;

export const TaxonomyAxesModel = z.object({
  turnCounts: z.array(z.number()).optional(),
  difficulty: z.array(z.string()).optional(),
  outcomes: z.array(z.string()).optional(),
});

export type TaxonomyAxes = z.infer<typeof TaxonomyAxesModel>;

export const AgentConfigModel = z.object({
  systemPrompt: z.string().optional(),
  tools: z.array(ToolDefinitionModel).optional(),
});

export const GenerationConfigModel = z.object({
  modelId: z.string().default(DEFAULT_MODEL),
  totalTestCases: z.number().positive(),
  seedExamples: z.array(SeedExampleModel).optional(),
  focusAreas: z.array(z.string()).optional(),
  taxonomyAxes: TaxonomyAxesModel.optional(),
});

export const TriggerEventModel = z.object({
  taskToken: z.string(),
  id: z.string(),
  output: S3ReferenceModel,
  configuration: z.object({
    agent: AgentConfigModel.optional(),
    generation: GenerationConfigModel,
  }),
});

export type TriggerEvent = z.infer<typeof TriggerEventModel>;

// Taxonomy output from Plan stage
export const TaxonomyModel = z.object({
  axes: z.object({
    tools: z.array(z.string()),
    toolCombinations: z.array(z.array(z.string())),
    turnCounts: z.array(z.number()),
    difficulty: z.array(z.string()),
    topics: z.array(z.string()),
    outcomes: z.array(z.string()),
  }),
  gaps: z.array(z.string()).optional(),
});

export type Taxonomy = z.infer<typeof TaxonomyModel>;

// Provenance source — origin of a test case or scenario:
// - gap_fill: planner output covering untested tool/combination gaps
// - focus_area: planner output from user-specified focus areas
// - failure_pattern: planner output from observed failure patterns in traces
// - augmentation: augmentor output (Stage 4) derived from a base case
//
// Scenarios only ever carry the first three; the augmentor overwrites with
// 'augmentation' on the cases it produces. Used by the review sampler (HLD
// §2.7.6) for stratification.
export const ProvenanceSourceEnum = z.enum(['gap_fill', 'focus_area', 'failure_pattern', 'augmentation']);

// Augmentation strategies per HLD §2.4.4. Each runs as a separate LLM call
// per base test case (HLD §2.7.5).
export const AugmentationStrategyEnum = z.enum([
  'rephrase',
  'parameter_variation',
  'multi_turn_extension',
  'edge_case',
  'negative_case',
]);

export type AugmentationStrategy = z.infer<typeof AugmentationStrategyEnum>;

// Scenario output from Plan stage
export const ScenarioModel = z.object({
  id: z.string(),
  description: z.string(),
  type: z.enum(['single_turn', 'multi_turn']),
  turns: z.number(),
  toolsInvolved: z.array(z.string()),
  difficulty: z.string(),
  topics: z.array(z.string()),
  outcome: z.string(),
  source: ProvenanceSourceEnum,
  priority: z.number(),
});

export type Scenario = z.infer<typeof ScenarioModel>;

// Provenance tracks test case origin for debugging/auditing.
// For augmentation cases, augmentationStrategy and parentScenarioId link
// back to the strategy applied and the base case it was derived from.
export const ProvenanceModel = z.object({
  source: ProvenanceSourceEnum, // Origin: scenario source or 'augmentation'
  scenarioId: z.string(), // Links to the scenario or base case ID
  planAxis: z.string().optional(), // Which taxonomy axis (tool combination) it covers
  augmentationStrategy: AugmentationStrategyEnum.optional(), // Which strategy produced this (augmentation cases only)
  parentScenarioId: z.string().optional(), // Base case scenarioId (augmentation cases only)
});

export type Provenance = z.infer<typeof ProvenanceModel>;

// Generated test case output - aligns with HLD data model:
// - input: string (single-turn) or string[] (multi-turn conversation)
// - expected: response, topics, and tool calls
// - context: provenance metadata
// - requiresReview: silver→gold curation signal, set by review sampler
//
// Tool calls structure per HLD:
// - Single-turn: toolCalls is flat array of tool invocations
// - Multi-turn: toolCalls is array-of-arrays (per-turn tool calls)
export const GeneratedTestCaseModel = z.object({
  input: z.union([z.string(), z.array(z.string())]),
  expected: z.object({
    response: z.string(),
    topics: z.array(z.string()),
    // Single-turn: ToolCall[] - flat array of tool invocations
    // Multi-turn: ToolCall[][] - array of arrays, one per turn
    toolCalls: z.union([z.array(ToolCallModel), z.array(z.array(ToolCallModel))]).optional(),
  }),
  context: z.object({
    provenance: ProvenanceModel,
  }),
  // Default false so generator-stage parsing of LLM output doesn't require it;
  // review sampler stage flips a stratified subset to true.
  requiresReview: z.boolean().default(false),
});

export type GeneratedTestCase = z.infer<typeof GeneratedTestCaseModel>;

// ============================================================================
// OTEL Trace Extraction Models
// ============================================================================

// Outcome signal for extracted conversations
export const OutcomeSignalEnum = z.enum(['success', 'failure', 'abandonment']);
export type OutcomeSignal = z.infer<typeof OutcomeSignalEnum>;

// Configuration for trace extraction from S3
export const TraceConfigModel = z.object({
  source: z.literal('s3'),
  location: z.string(), // s3://bucket/prefix/
  maxConversations: z.number().default(500),
  errorSampleRate: z.number().min(0).max(1).default(1.0), // 100% of failures
  successSampleRate: z.number().min(0).max(1).default(0.1), // 10% of successes
  abandonmentSampleRate: z.number().min(0).max(1).default(0.5), // 50% of abandonments
});

export type TraceConfig = z.infer<typeof TraceConfigModel>;

// A single turn in an extracted conversation
export const ExtractedTurnModel = z.object({
  userMessage: z.string(),
  assistantMessage: z.string().optional(),
  toolCalls: z.array(ToolCallModel).optional(),
});

export type ExtractedTurn = z.infer<typeof ExtractedTurnModel>;

// Extracted conversation from OTEL traces
export const ExtractedConversationModel = z.object({
  sessionId: z.string(),
  traceId: z.string(),
  turns: z.array(ExtractedTurnModel),
  outcome: OutcomeSignalEnum,
});

export type ExtractedConversation = z.infer<typeof ExtractedConversationModel>;

// Trace coverage computed from extracted conversations
export const TraceCoverageModel = z.object({
  observedTools: z.array(z.string()),
  observedCombinations: z.array(z.array(z.string())),
  outcomeDistribution: z.object({
    success: z.number(),
    failure: z.number(),
    abandonment: z.number(),
  }),
});

export type TraceCoverage = z.infer<typeof TraceCoverageModel>;
