import { Taxonomy, TaxonomyModel, ToolDefinition, TaxonomyAxes, TraceCoverage } from '../models';
import {
  createUserMessage,
  extractJsonFromResponse,
  converseWithRetry,
  parseWithFieldErrors,
  safeJsonParse,
} from '../helpers/bedrock';
import { buildTaxonomyPrompt, buildRetryPrompt } from '../helpers/prompts';
import { DEFAULT_TAXONOMY_AXES } from '../constants';

export interface BuildTaxonomyOptions {
  modelId: string;
  systemPrompt: string | undefined;
  tools: ToolDefinition[] | undefined;
  focusAreas: string[] | undefined;
  taxonomyAxes: TaxonomyAxes | undefined;
  traceCoverage?: TraceCoverage | undefined;
}

export async function buildTaxonomy(options: BuildTaxonomyOptions): Promise<Taxonomy> {
  const { modelId, systemPrompt, tools, focusAreas, taxonomyAxes, traceCoverage } = options;

  let prompt = buildTaxonomyPrompt(systemPrompt, tools, focusAreas, taxonomyAxes);

  if (traceCoverage) {
    prompt += `\n\n## Trace Coverage Analysis

The following trace data is available from production:
- Observed tools: ${traceCoverage.observedTools.join(', ') || 'none'}
- Observed tool combinations: ${JSON.stringify(traceCoverage.observedCombinations)}
- Outcome distribution: success=${traceCoverage.outcomeDistribution.success}, failure=${traceCoverage.outcomeDistribution.failure}, abandonment=${traceCoverage.outcomeDistribution.abandonment}

Use this data to:
1. Identify gaps: which tools/combinations are defined but never observed?
2. Note failure-prone patterns for prioritization
3. Add these gaps to the "gaps" field in the taxonomy`;
  }

  console.log('Building taxonomy with LLM...');

  const taxonomy = await converseWithRetry<Taxonomy>(
    {
      modelId,
      messages: [createUserMessage(prompt)],
      temperature: 0.5,
    },
    (content) => {
      const jsonStr = extractJsonFromResponse(content);
      const parsed = safeJsonParse(jsonStr);
      return parseWithFieldErrors(TaxonomyModel, parsed, 'Schema validation failed');
    },
    buildRetryPrompt,
  );

  // Enforce user-specified axes over LLM-generated ones
  const userAxes = { ...DEFAULT_TAXONOMY_AXES, ...taxonomyAxes };
  taxonomy.axes.turnCounts = userAxes.turnCounts ?? DEFAULT_TAXONOMY_AXES.turnCounts;
  taxonomy.axes.difficulty = userAxes.difficulty ?? DEFAULT_TAXONOMY_AXES.difficulty;
  taxonomy.axes.outcomes = userAxes.outcomes ?? DEFAULT_TAXONOMY_AXES.outcomes;

  console.log(`Taxonomy built with ${taxonomy.axes.tools.length} tools, ${taxonomy.axes.topics.length} topics`);

  return taxonomy;
}

export function buildDefaultTaxonomy(
  _systemPrompt: string | undefined,
  tools: ToolDefinition[] | undefined,
  focusAreas: string[] | undefined,
): Taxonomy {
  const toolNames = tools?.map((t) => t.name) ?? [];
  const toolCombinations: string[][] = [];

  for (const tool of toolNames) {
    toolCombinations.push([tool]);
  }

  for (let i = 0; i < toolNames.length; i++) {
    for (let j = i + 1; j < toolNames.length; j++) {
      const tool1 = toolNames[i];
      const tool2 = toolNames[j];
      if (tool1 && tool2) {
        toolCombinations.push([tool1, tool2]);
      }
    }
  }

  const topics: string[] = [];
  if (focusAreas) {
    topics.push(...focusAreas.slice(0, 5));
  }
  if (topics.length === 0) {
    topics.push('general');
  }

  return {
    axes: {
      tools: toolNames,
      toolCombinations: toolCombinations.length > 0 ? toolCombinations : [[]],
      turnCounts: DEFAULT_TAXONOMY_AXES.turnCounts,
      difficulty: DEFAULT_TAXONOMY_AXES.difficulty,
      topics,
      outcomes: DEFAULT_TAXONOMY_AXES.outcomes,
    },
    gaps: [],
  };
}
