#!/usr/bin/env npx tsx
/**
 * Local test script for the Agentic Generator plugin.
 *
 * Runs the full pipeline (Taxonomy → Scenarios → Test Cases → Augmentation → Review Sampling)
 * locally, writing output to ./output/<run-id>/ instead of S3.
 *
 * Usage:
 *   npx tsx scripts/test-local.ts [--config path/to/config.json] [--total N] [--model MODEL_ID]
 *
 * Requires AWS credentials with Bedrock access.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildTaxonomy, buildDefaultTaxonomy } from '../src/stages/taxonomy';
import { sampleScenarios } from '../src/stages/planner';
import { generateTestCases } from '../src/stages/generator';
import { augmentTestCases } from '../src/stages/augmentor';
import { applyReviewSampling } from '../src/stages/reviewSampler';
import type {
  ToolDefinition,
  SeedExample,
  TaxonomyAxes,
  GeneratedTestCase,
  AugmentationStrategy,
} from '../src/models';

interface TestConfig {
  agent?: {
    systemPrompt?: string;
    tools?: ToolDefinition[];
  };
  generation: {
    modelId?: string;
    totalTestCases: number;
    seedExamples?: SeedExample[];
    focusAreas?: string[];
    taxonomyAxes?: TaxonomyAxes;
    augmentationStrategies?: AugmentationStrategy[];
    reviewSampleRate?: number;
  };
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_MODEL = 'anthropic.claude-sonnet-4-5-20250929-v1:0';
const DEFAULT_CONFIG_PATH = path.join(__dirname, 'complex-agent-config.json');

async function writeJson(filePath: string, data: unknown): Promise<void> {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
  console.log(`  → Wrote ${filePath}`);
}

async function loadConfig(configPath: string): Promise<TestConfig> {
  const configStr = await fs.readFile(configPath, 'utf-8');
  return JSON.parse(configStr) as TestConfig;
}

async function main() {
  const args = process.argv.slice(2);

  let configPath = DEFAULT_CONFIG_PATH;
  let totalOverride: number | undefined;
  let modelOverride: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--config' && args[i + 1]) {
      configPath = args[i + 1];
      i++;
    } else if (args[i] === '--total' && args[i + 1]) {
      totalOverride = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--model' && args[i + 1]) {
      modelOverride = args[i + 1];
      i++;
    }
  }

  console.log(`Loading config from ${configPath}`);
  const config = await loadConfig(configPath);

  if (totalOverride) {
    config.generation.totalTestCases = totalOverride;
  }

  if (modelOverride) {
    config.generation.modelId = modelOverride;
  }

  const runId = `run-${Date.now()}`;
  const outputDir = path.join(process.cwd(), 'output', runId);
  await fs.mkdir(outputDir, { recursive: true });

  console.log(`\n=== Agentic Generator Local Test ===`);
  console.log(`Run ID: ${runId}`);
  console.log(`Output: ${outputDir}`);
  console.log(`Total test cases: ${config.generation.totalTestCases}`);
  console.log(`Model: ${config.generation.modelId ?? DEFAULT_MODEL}\n`);

  const modelId = config.generation.modelId ?? DEFAULT_MODEL;

  // Stage 1: Build Taxonomy
  console.log('Stage 1: Building Taxonomy...');
  let taxonomy;
  try {
    taxonomy = await buildTaxonomy({
      modelId,
      systemPrompt: config.agent?.systemPrompt,
      tools: config.agent?.tools,
      focusAreas: config.generation.focusAreas,
      taxonomyAxes: config.generation.taxonomyAxes,
    });
  } catch (error) {
    console.warn('  LLM taxonomy failed, using default:', error instanceof Error ? error.message : error);
    taxonomy = buildDefaultTaxonomy(config.agent?.systemPrompt, config.agent?.tools, config.generation.focusAreas);
  }

  await writeJson(path.join(outputDir, '1-taxonomy.json'), taxonomy);
  console.log(`  Tools: ${taxonomy.axes.tools.join(', ')}`);
  console.log(`  Topics: ${taxonomy.axes.topics.join(', ')}`);
  console.log(`  Gaps: ${taxonomy.gaps?.length ?? 0}\n`);

  // Stage 2: Sample Scenarios
  console.log('Stage 2: Sampling Scenarios...');
  const scenarios = await sampleScenarios({
    modelId,
    taxonomy,
    totalTestCases: config.generation.totalTestCases,
    focusAreas: config.generation.focusAreas,
  });

  await writeJson(path.join(outputDir, '2-scenarios.json'), scenarios);
  console.log(`  Generated ${scenarios.length} scenarios\n`);

  // Stage 3: Generate Test Cases
  console.log('Stage 3: Generating Test Cases...');
  const generatedCases: GeneratedTestCase[] = [];

  for await (const result of generateTestCases({
    modelId,
    scenarios,
    systemPrompt: config.agent?.systemPrompt,
    tools: config.agent?.tools,
    seedExamples: config.generation.seedExamples,
    concurrency: 5,
    onProgress: (completed, total) => {
      process.stdout.write(`\r  Progress: ${completed}/${total}`);
    },
  })) {
    generatedCases.push(result.testCase);
  }

  console.log('\n');

  await writeJson(path.join(outputDir, '3-base-test-cases.json'), generatedCases);

  // Stage 4: Augmentation (optional)
  const requestedStrategies = config.generation.augmentationStrategies ?? [];
  const activeStrategies = filterApplicableStrategies(
    requestedStrategies,
    config.agent?.systemPrompt,
    config.agent?.tools,
  );
  const augmentedCases: GeneratedTestCase[] = [];

  if (activeStrategies.length > 0 && generatedCases.length > 0) {
    console.log(`Stage 4: Augmentation (strategies=[${activeStrategies.join(', ')}])...`);
    for await (const result of augmentTestCases({
      modelId,
      baseCases: generatedCases,
      strategies: activeStrategies,
      systemPrompt: config.agent?.systemPrompt,
      tools: config.agent?.tools,
      onProgress: (completed, total) => {
        process.stdout.write(`\r  Progress: ${completed}/${total}`);
      },
    })) {
      augmentedCases.push(result.testCase);
    }
    console.log(`\n  Produced ${augmentedCases.length} augmented cases`);
    await writeJson(path.join(outputDir, '4-augmented.json'), augmentedCases);
  }

  const allCases = [...generatedCases, ...augmentedCases];

  // Stage 5: Review Sampling
  const reviewRate = config.generation.reviewSampleRate ?? 0.2;
  console.log(`Stage 5: Review Sampling (rate=${reviewRate})...`);
  const { testCases: finalCases, stats } = applyReviewSampling(allCases, reviewRate);
  const sourceSummary = Object.entries(stats.bySource)
    .map(([source, { total, flagged }]) => `${source}=${flagged}/${total}`)
    .join(', ');
  console.log(`  Flagged ${stats.flagged}/${stats.total}: ${sourceSummary}\n`);

  const testCasesDir = path.join(outputDir, '5-test-cases');
  await fs.mkdir(testCasesDir, { recursive: true });

  for (let i = 0; i < finalCases.length; i++) {
    const id = `test-case-${String(i).padStart(4, '0')}`;
    await writeJson(path.join(testCasesDir, `${id}.json`), finalCases[i]);
  }

  await writeJson(path.join(outputDir, '5-test-cases-all.json'), finalCases);

  console.log(`=== Complete ===`);
  console.log(`Output directory: ${outputDir}`);
  console.log(`  1-taxonomy.json          - Coverage taxonomy`);
  console.log(`  2-scenarios.json         - Sampled scenarios (${scenarios.length})`);
  console.log(`  3-base-test-cases.json   - Pre-augmentation/review base cases (${generatedCases.length})`);
  if (augmentedCases.length > 0) {
    console.log(`  4-augmented.json         - Augmented cases (${augmentedCases.length})`);
  }
  console.log(`  5-test-cases/            - Individual test cases (with requiresReview tags)`);
  console.log(`  5-test-cases-all.json    - All test cases (${finalCases.length})`);
}

function filterApplicableStrategies(
  requested: AugmentationStrategy[],
  systemPrompt: string | undefined,
  tools: ToolDefinition[] | undefined,
): AugmentationStrategy[] {
  const hasTools = !!(tools && tools.length > 0);
  const hasSystemPrompt = !!systemPrompt;
  const active: AugmentationStrategy[] = [];
  const skipped: string[] = [];

  for (const strategy of requested) {
    if (strategy === 'parameter_variation' && !hasTools) {
      skipped.push(`${strategy} (requires tools)`);
      continue;
    }
    if (strategy === 'negative_case' && !hasSystemPrompt) {
      skipped.push(`${strategy} (requires systemPrompt)`);
      continue;
    }
    active.push(strategy);
  }

  if (skipped.length > 0) {
    console.warn(`  Skipping strategies: ${skipped.join(', ')}`);
  }

  return active;
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
