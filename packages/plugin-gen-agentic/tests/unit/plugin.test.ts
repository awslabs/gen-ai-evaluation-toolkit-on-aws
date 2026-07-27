jest.mock('../../src/stages/taxonomy', () => ({
  buildTaxonomy: jest.fn(),
  buildDefaultTaxonomy: jest.fn(),
}));

jest.mock('../../src/stages/planner', () => ({
  sampleScenarios: jest.fn(),
}));

jest.mock('../../src/stages/generator', () => ({
  generateTestCases: jest.fn(),
}));

jest.mock('../../src/stages/augmentor', () => ({
  augmentTestCases: jest.fn(),
}));

const MockEnvVariable = {
  INTERNAL_S3_BUCKET: 'INTERNAL_S3_BUCKET',
  BEDROCK_ROLE_ARN: 'BEDROCK_ROLE_ARN',
};

const mockGetS3ObjectContent = jest.fn();

jest.mock('@genai-etk/plugin-gen-sdk', () => ({
  defineGenerator: jest.fn((options) => ({
    name: options.name,
    start: jest.fn(),
    _generate: options.generate,
    _configSchema: options.configSchema,
  })),
  writeS3Object: jest.fn().mockResolvedValue(undefined),
  getS3ObjectContent: (...args: unknown[]) => mockGetS3ObjectContent(...args),
  getEnvVariable: jest.fn((key: string) => {
    const vars: Record<string, string> = {
      INTERNAL_S3_BUCKET: 'test-bucket',
    };
    return vars[key] ?? '';
  }),
  EnvVariable: MockEnvVariable,
  MAX_CONCURRENCY_LIMIT: 50,
}));

import { buildTaxonomy, buildDefaultTaxonomy } from '../../src/stages/taxonomy';
import { sampleScenarios } from '../../src/stages/planner';
import { generateTestCases } from '../../src/stages/generator';
import { augmentTestCases } from '../../src/stages/augmentor';
import { writeS3Object } from '@genai-etk/plugin-gen-sdk';
import plugin from '../../src/plugin';
import { Taxonomy, Scenario, GeneratedTestCase, ToolDefinition, SeedExample, TaxonomyAxes } from '../../src/models';

interface AgenticConfig {
  agent?: {
    systemPrompt?: string | { s3: string };
    tools?: ToolDefinition[] | { s3: string };
  };
  modelId?: string;
  totalTestCases: number;
  seedExamples?: SeedExample[] | { s3: string };
  focusAreas?: string[];
  taxonomyAxes?: TaxonomyAxes;
  reviewSampleRate?: number;
  augmentationStrategies?: string[];
}

interface MockPluginContext {
  runId: string;
  reportProgress: jest.Mock;
}

const mockedBuildTaxonomy = buildTaxonomy as jest.MockedFunction<typeof buildTaxonomy>;
const mockedBuildDefaultTaxonomy = buildDefaultTaxonomy as jest.MockedFunction<typeof buildDefaultTaxonomy>;
const mockedSampleScenarios = sampleScenarios as jest.MockedFunction<typeof sampleScenarios>;
const mockedGenerateTestCases = generateTestCases as jest.MockedFunction<typeof generateTestCases>;
const mockedAugmentTestCases = augmentTestCases as jest.MockedFunction<typeof augmentTestCases>;
const mockedWriteS3Object = writeS3Object as jest.MockedFunction<typeof writeS3Object>;

describe('AgenticGenerator plugin', () => {
  const mockCtx = {
    runId: 'test-run-123',
    reportProgress: jest.fn().mockResolvedValue(undefined),
  };

  const defaultConfig = {
    modelId: 'anthropic.claude-sonnet-4-5-20250929-v1:0',
    totalTestCases: 10,
  };

  const generateFn = (
    plugin as unknown as {
      _generate: (config: AgenticConfig, ctx: MockPluginContext) => AsyncGenerator<GeneratedTestCase>;
    }
  )._generate;
  const configSchema = (plugin as unknown as { _configSchema: { parse: (v: unknown) => AgenticConfig } })._configSchema;

  const mockTaxonomy: Taxonomy = {
    axes: {
      tools: ['tool_a'],
      toolCombinations: [['tool_a']],
      turnCounts: [1, 2],
      difficulty: ['easy', 'medium'],
      topics: ['general'],
      outcomes: ['happy_path'],
    },
    gaps: [],
  };

  const mockScenarios: Scenario[] = [
    {
      id: 'scenario-001',
      description: 'Test scenario',
      type: 'single_turn',
      turns: 1,
      toolsInvolved: ['tool_a'],
      difficulty: 'easy',
      topics: ['general'],
      outcome: 'happy_path',
      source: 'gap_fill',
      priority: 5,
    },
  ];

  const mockTestCase: GeneratedTestCase = {
    input: 'Test question',
    expected: {
      response: 'Test answer',
      topics: ['general'],
      toolCalls: [{ name: 'tool_a', args: { id: '123' } }],
    },
    context: {
      provenance: {
        source: 'gap_fill',
        scenarioId: 'scenario-001',
      },
    },
    requiresReview: false,
  };

  async function collectResults<T>(gen: AsyncGenerator<T>): Promise<T[]> {
    const results: T[] = [];
    for await (const item of gen) {
      results.push(item);
    }
    return results;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockedBuildTaxonomy.mockResolvedValue(mockTaxonomy);
    mockedSampleScenarios.mockResolvedValue(mockScenarios);
    mockedGenerateTestCases.mockImplementation(async function* () {
      yield { testCase: mockTestCase, scenario: mockScenarios[0]! };
    });
    // Default: no augmentation. Tests that exercise it override per-case.
    mockedAugmentTestCases.mockImplementation(async function* () {
      // Empty generator
    });
  });

  describe('plugin definition', () => {
    it('should export plugin with name and start method', () => {
      expect(plugin.name).toBe('AgenticGenerator');
      expect(typeof plugin.start).toBe('function');
    });
  });

  describe('config schema', () => {
    it('should apply default model when not specified', () => {
      const config = configSchema.parse({
        totalTestCases: 10,
      });

      expect(config.modelId).toBe('anthropic.claude-sonnet-4-5-20250929-v1:0');
    });

    it('should allow overriding model', () => {
      const config = configSchema.parse({
        modelId: 'custom-model',
        totalTestCases: 5,
      });

      expect(config.modelId).toBe('custom-model');
    });

    it('should reject non-positive totalTestCases', () => {
      expect(() =>
        configSchema.parse({
          totalTestCases: 0,
        }),
      ).toThrow();

      expect(() =>
        configSchema.parse({
          totalTestCases: -1,
        }),
      ).toThrow();
    });

    it('should accept optional agent config', () => {
      const config = configSchema.parse({
        agent: {
          systemPrompt: 'You are helpful',
          tools: [{ name: 'tool1', description: 'A tool' }],
        },
        totalTestCases: 10,
      });

      expect(config.agent?.systemPrompt).toBe('You are helpful');
      expect(config.agent?.tools).toHaveLength(1);
    });

    it('should accept optional focus areas', () => {
      const config = configSchema.parse({
        totalTestCases: 10,
        focusAreas: ['billing', 'support'],
      });

      expect(config.focusAreas).toEqual(['billing', 'support']);
    });

    it('should accept optional taxonomy axes', () => {
      const config = configSchema.parse({
        totalTestCases: 10,
        taxonomyAxes: {
          turnCounts: [1, 2, 3, 4],
          difficulty: ['easy', 'hard'],
        },
      });

      expect(config.taxonomyAxes?.turnCounts).toEqual([1, 2, 3, 4]);
    });
  });

  describe('generate function', () => {
    describe('taxonomy stage', () => {
      it('should build taxonomy and write to S3', async () => {
        await collectResults(generateFn(defaultConfig, mockCtx));

        expect(mockedBuildTaxonomy).toHaveBeenCalledWith({
          modelId: defaultConfig.modelId,
          systemPrompt: undefined,
          tools: undefined,
          focusAreas: undefined,
          taxonomyAxes: undefined,
        });

        expect(mockedWriteS3Object).toHaveBeenCalledWith(
          'test-bucket',
          'taxonomy/test-run-123.json',
          expect.any(String),
        );
      });

      it('should fall back to default taxonomy on LLM error', async () => {
        mockedBuildTaxonomy.mockRejectedValue(new Error('LLM error'));
        mockedBuildDefaultTaxonomy.mockReturnValue(mockTaxonomy);

        const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

        await collectResults(generateFn(defaultConfig, mockCtx));

        expect(mockedBuildDefaultTaxonomy).toHaveBeenCalled();
        expect(consoleSpy).toHaveBeenCalledWith(
          `[${mockCtx.runId}] LLM taxonomy construction failed, using default taxonomy:`,
          'LLM error',
        );

        consoleSpy.mockRestore();
      });

      it('should pass agent config to taxonomy builder', async () => {
        const configWithAgent = {
          agent: {
            systemPrompt: 'Test prompt',
            tools: [{ name: 'test_tool', description: 'A test tool' }],
          },
          totalTestCases: 10,
        };

        await collectResults(generateFn(configSchema.parse(configWithAgent), mockCtx));

        expect(mockedBuildTaxonomy).toHaveBeenCalledWith(
          expect.objectContaining({
            systemPrompt: 'Test prompt',
            tools: [{ name: 'test_tool', description: 'A test tool' }],
          }),
        );
      });
    });

    describe('scenario sampling stage', () => {
      it('should sample scenarios and write to S3', async () => {
        await collectResults(generateFn(defaultConfig, mockCtx));

        expect(mockedSampleScenarios).toHaveBeenCalledWith({
          modelId: defaultConfig.modelId,
          taxonomy: mockTaxonomy,
          totalTestCases: 10,
          focusAreas: undefined,
        });

        expect(mockedWriteS3Object).toHaveBeenCalledWith(
          'test-bucket',
          'scenarios/test-run-123.json',
          expect.any(String),
        );
      });

      it('should pass focus areas to scenario sampler', async () => {
        const configWithFocus = configSchema.parse({
          totalTestCases: 10,
          focusAreas: ['billing', 'support'],
        });

        await collectResults(generateFn(configWithFocus, mockCtx));

        expect(mockedSampleScenarios).toHaveBeenCalledWith(
          expect.objectContaining({
            focusAreas: ['billing', 'support'],
          }),
        );
      });
    });

    describe('test case generation stage', () => {
      it('should generate test cases and yield results', async () => {
        const results = await collectResults(generateFn(defaultConfig, mockCtx));

        expect(results).toHaveLength(1);
        // requiresReview is moved into context by the plugin before yielding
        const result = results[0] as any;
        expect(result.input).toEqual(mockTestCase.input);
        expect(result.expected).toEqual(mockTestCase.expected);
        expect(result.context).toEqual({ ...mockTestCase.context, requiresReview: false });
        expect(result.requiresReview).toBeUndefined();
      });

      it('should pass all config to generator', async () => {
        const fullConfig = configSchema.parse({
          agent: {
            systemPrompt: 'System prompt',
            tools: [{ name: 'tool1', description: 'Tool 1' }],
          },
          totalTestCases: 20,
          seedExamples: [
            {
              input: 'Example input',
              expected: { response: 'Example output' },
            },
          ],
        });

        await collectResults(generateFn(fullConfig, mockCtx));

        expect(mockedGenerateTestCases).toHaveBeenCalledWith(
          expect.objectContaining({
            systemPrompt: 'System prompt',
            tools: [{ name: 'tool1', description: 'Tool 1' }],
            seedExamples: expect.any(Array),
          }),
        );
      });

      it('should handle multiple test cases', async () => {
        const testCases = [
          { ...mockTestCase, input: 'Q1' },
          { ...mockTestCase, input: 'Q2' },
          { ...mockTestCase, input: 'Q3' },
        ];

        mockedGenerateTestCases.mockImplementation(async function* () {
          for (const tc of testCases) {
            yield { testCase: tc, scenario: mockScenarios[0]! };
          }
        });

        const results = await collectResults(generateFn(defaultConfig, mockCtx));

        expect(results).toHaveLength(3);
        expect(results.map((r) => r.input)).toEqual(['Q1', 'Q2', 'Q3']);
      });
    });

    describe('augmentation stage', () => {
      const augmentedCase: GeneratedTestCase = {
        input: 'Different phrasing',
        expected: {
          response: 'Test answer',
          topics: ['general'],
          toolCalls: [{ name: 'tool_a', args: { id: '123' } }],
        },
        context: {
          provenance: {
            source: 'augmentation',
            scenarioId: 'scenario-001-rephrase',
            augmentationStrategy: 'rephrase',
            parentScenarioId: 'scenario-001',
          },
        },
        requiresReview: false,
      };

      it('does not run augmentor when augmentationStrategies is empty', async () => {
        const config = configSchema.parse({ totalTestCases: 1 });
        await collectResults(generateFn(config, mockCtx));
        expect(mockedAugmentTestCases).not.toHaveBeenCalled();
      });

      it('runs augmentor and yields augmented cases when strategies are set', async () => {
        mockedAugmentTestCases.mockImplementation(async function* () {
          yield { testCase: augmentedCase, parentCase: mockTestCase, strategy: 'rephrase' };
        });

        const config = configSchema.parse({
          totalTestCases: 1,
          agent: { systemPrompt: 'You are helpful' },
          augmentationStrategies: ['rephrase'],
        });
        const results = await collectResults(generateFn(config, mockCtx));

        expect(mockedAugmentTestCases).toHaveBeenCalledTimes(1);
        expect(results).toHaveLength(2); // 1 base + 1 augmented
        const sources = results.map((r) => r.context.provenance.source);
        expect(sources).toContain('gap_fill');
        expect(sources).toContain('augmentation');
      });

      it('passes only base cases (not pre-existing augmented ones) to augmentor', async () => {
        mockedAugmentTestCases.mockImplementation(async function* () {
          // empty
        });

        const config = configSchema.parse({
          totalTestCases: 1,
          agent: { systemPrompt: 'You are helpful' },
          augmentationStrategies: ['rephrase', 'edge_case'],
        });
        await collectResults(generateFn(config, mockCtx));

        const callArgs = mockedAugmentTestCases.mock.calls[0]![0];
        expect(callArgs.baseCases).toHaveLength(1);
        expect(callArgs.strategies).toEqual(['rephrase', 'edge_case']);
      });

      it('skips parameter_variation when no tools are provided (with warning)', async () => {
        const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
        mockedAugmentTestCases.mockImplementation(async function* () {
          // empty
        });

        const config = configSchema.parse({
          totalTestCases: 1,
          agent: { systemPrompt: 'You are helpful' },
          augmentationStrategies: ['rephrase', 'parameter_variation'],
        });
        await collectResults(generateFn(config, mockCtx));

        const callArgs = mockedAugmentTestCases.mock.calls[0]![0];
        expect(callArgs.strategies).toEqual(['rephrase']);
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('parameter_variation'));
        consoleSpy.mockRestore();
      });

      it('skips negative_case when no system prompt is provided (with warning)', async () => {
        const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
        mockedAugmentTestCases.mockImplementation(async function* () {
          // empty
        });

        const config = configSchema.parse({
          totalTestCases: 1,
          augmentationStrategies: ['rephrase', 'negative_case'],
        });
        await collectResults(generateFn(config, mockCtx));

        const callArgs = mockedAugmentTestCases.mock.calls[0]![0];
        expect(callArgs.strategies).toEqual(['rephrase']);
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('negative_case'));
        consoleSpy.mockRestore();
      });

      it('skips augmentation entirely if all strategies are filtered out', async () => {
        mockedAugmentTestCases.mockImplementation(async function* () {
          // empty
        });

        // No tools, no system prompt, only parameter_variation requested
        const config = configSchema.parse({
          totalTestCases: 1,
          augmentationStrategies: ['parameter_variation'],
        });
        await collectResults(generateFn(config, mockCtx));

        expect(mockedAugmentTestCases).not.toHaveBeenCalled();
      });

      it('runs review sampling over the merged base+augmented set', async () => {
        mockedAugmentTestCases.mockImplementation(async function* () {
          yield { testCase: augmentedCase, parentCase: mockTestCase, strategy: 'rephrase' };
        });

        const config = configSchema.parse({
          totalTestCases: 1,
          agent: { systemPrompt: 'You are helpful' },
          augmentationStrategies: ['rephrase'],
          reviewSampleRate: 1.0,
        });
        const results = await collectResults(generateFn(config, mockCtx));

        // Both base and augmented cases get flagged at rate=1.0
        // requiresReview is moved into context by the plugin before yielding
        expect(results.every((tc) => (tc as any).context?.requiresReview === true)).toBe(true);
      });
    });

    describe('review sampling stage', () => {
      function makeBatch(source: 'gap_fill' | 'focus_area' | 'failure_pattern', count: number): GeneratedTestCase[] {
        return Array.from({ length: count }, (_, i) => ({
          ...mockTestCase,
          input: `${source}-${i}`,
          context: { provenance: { source, scenarioId: `${source}-${i}` } },
        }));
      }

      function mockGenerationOf(cases: GeneratedTestCase[]): void {
        mockedGenerateTestCases.mockImplementation(async function* () {
          for (const tc of cases) {
            yield { testCase: tc, scenario: mockScenarios[0]! };
          }
        });
      }

      it('flags every yielded case at reviewSampleRate=1.0', async () => {
        mockGenerationOf([
          ...makeBatch('gap_fill', 4),
          ...makeBatch('focus_area', 2),
          ...makeBatch('failure_pattern', 1),
        ]);

        const config = configSchema.parse({ totalTestCases: 7, reviewSampleRate: 1.0 });
        const results = await collectResults(generateFn(config, mockCtx));

        expect(results).toHaveLength(7);
        expect(results.every((tc) => (tc as any).context?.requiresReview === true)).toBe(true);
      });

      it('flags zero cases at reviewSampleRate=0', async () => {
        mockGenerationOf([...makeBatch('gap_fill', 5), ...makeBatch('focus_area', 3)]);

        const config = configSchema.parse({ totalTestCases: 8, reviewSampleRate: 0 });
        const results = await collectResults(generateFn(config, mockCtx));

        expect(results).toHaveLength(8);
        expect(results.every((tc) => (tc as any).context?.requiresReview === false)).toBe(true);
      });

      it('stratifies across provenance sources at default rate (0.2)', async () => {
        // gap_fill=20, focus_area=4, failure_pattern=5.
        // ceil(0.2*20)=4, ceil(0.2*4)=1, ceil(0.2*5)=1.
        mockGenerationOf([
          ...makeBatch('gap_fill', 20),
          ...makeBatch('focus_area', 4),
          ...makeBatch('failure_pattern', 5),
        ]);

        const config = configSchema.parse({ totalTestCases: 29 });
        const results = await collectResults(generateFn(config, mockCtx));

        const flaggedBySource: Record<string, number> = {};
        for (const tc of results) {
          if ((tc as any).context?.requiresReview) {
            const source = tc.context.provenance.source;
            flaggedBySource[source] = (flaggedBySource[source] ?? 0) + 1;
          }
        }

        expect(flaggedBySource['gap_fill']).toBe(4);
        expect(flaggedBySource['focus_area']).toBe(1);
        expect(flaggedBySource['failure_pattern']).toBe(1);
      });

      it('uses default rate (0.2) when reviewSampleRate omitted', async () => {
        mockGenerationOf(makeBatch('gap_fill', 10));

        const config = configSchema.parse({ totalTestCases: 10 });
        expect(config.reviewSampleRate).toBe(0.2);

        const results = await collectResults(generateFn(config, mockCtx));
        // ceil(0.2*10)=2
        expect(results.filter((tc) => (tc as any).context?.requiresReview).length).toBe(2);
      });

      it('logs per-source review summary', async () => {
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
        mockGenerationOf([...makeBatch('gap_fill', 5), ...makeBatch('focus_area', 5)]);

        const config = configSchema.parse({ totalTestCases: 10, reviewSampleRate: 0.4 });
        await collectResults(generateFn(config, mockCtx));

        const reviewLog = consoleSpy.mock.calls.find((c) => String(c[0]).includes('Review sampling:'));
        expect(reviewLog).toBeDefined();
        expect(String(reviewLog![0])).toMatch(/gap_fill=2\/5/);
        expect(String(reviewLog![0])).toMatch(/focus_area=2\/5/);

        consoleSpy.mockRestore();
      });

      it('reports review-sampling progress', async () => {
        mockGenerationOf(makeBatch('gap_fill', 3));
        const config = configSchema.parse({ totalTestCases: 3, reviewSampleRate: 0.5 });

        await collectResults(generateFn(config, mockCtx));

        const progressCalls = mockCtx.reportProgress.mock.calls.map((c) => c[0]);
        expect(progressCalls.some((m: string) => m.includes('review sampling'))).toBe(true);
      });
    });

    describe('progress reporting', () => {
      it('should report progress at each stage', async () => {
        await collectResults(generateFn(defaultConfig, mockCtx));

        const progressCalls = mockCtx.reportProgress.mock.calls.map((c) => c[0]);
        expect(progressCalls).toContain('Resolving configuration inputs');
        expect(progressCalls).toContain('Building coverage taxonomy');
        expect(progressCalls).toContain('Taxonomy built, sampling scenarios');
        expect(progressCalls).toContain('Generated 1 scenarios, starting test case generation');
      });
    });

    describe('error handling', () => {
      it('should propagate scenario sampling errors', async () => {
        mockedSampleScenarios.mockRejectedValue(new Error('Sampling failed'));

        await expect(collectResults(generateFn(defaultConfig, mockCtx))).rejects.toThrow('Sampling failed');
      });

      it('should propagate test case generation errors', async () => {
        mockedGenerateTestCases.mockImplementation(async function* () {
          throw new Error('Generation failed');
        });

        await expect(collectResults(generateFn(defaultConfig, mockCtx))).rejects.toThrow('Generation failed');
      });
    });

    describe('S3 reference resolution (hybrid model)', () => {
      it('should resolve system prompt from S3', async () => {
        mockGetS3ObjectContent.mockResolvedValue({
          transformToString: () => Promise.resolve('System prompt from S3'),
        });

        const configWithS3Prompt = configSchema.parse({
          agent: {
            systemPrompt: { s3: 's3://my-bucket/prompts/system.txt' },
          },
          totalTestCases: 10,
        });

        await collectResults(generateFn(configWithS3Prompt, mockCtx));

        expect(mockGetS3ObjectContent).toHaveBeenCalledWith('my-bucket', 'prompts/system.txt');
        expect(mockedBuildTaxonomy).toHaveBeenCalledWith(
          expect.objectContaining({
            systemPrompt: 'System prompt from S3',
          }),
        );
      });

      it('should resolve tools from S3', async () => {
        const toolsFromS3 = [{ name: 's3_tool', description: 'Tool from S3' }];
        mockGetS3ObjectContent.mockResolvedValue({
          transformToString: () => Promise.resolve(JSON.stringify(toolsFromS3)),
        });

        const configWithS3Tools = configSchema.parse({
          agent: {
            tools: { s3: 's3://my-bucket/tools/definitions.json' },
          },
          totalTestCases: 10,
        });

        await collectResults(generateFn(configWithS3Tools, mockCtx));

        expect(mockGetS3ObjectContent).toHaveBeenCalledWith('my-bucket', 'tools/definitions.json');
        expect(mockedBuildTaxonomy).toHaveBeenCalledWith(
          expect.objectContaining({
            tools: toolsFromS3,
          }),
        );
      });

      it('should resolve seed examples from S3', async () => {
        const seedsFromS3 = [{ input: 'S3 input', expected: { response: 'S3 output' } }];
        mockGetS3ObjectContent.mockResolvedValue({
          transformToString: () => Promise.resolve(JSON.stringify(seedsFromS3)),
        });

        const configWithS3Seeds = configSchema.parse({
          agent: { systemPrompt: 'inline prompt' },
          totalTestCases: 10,
          seedExamples: { s3: 's3://my-bucket/seeds/examples.json' },
        });

        await collectResults(generateFn(configWithS3Seeds, mockCtx));

        expect(mockGetS3ObjectContent).toHaveBeenCalledWith('my-bucket', 'seeds/examples.json');
        expect(mockedGenerateTestCases).toHaveBeenCalledWith(
          expect.objectContaining({
            seedExamples: seedsFromS3,
          }),
        );
      });

      it('should use inline values when not S3 references', async () => {
        const configInline = configSchema.parse({
          agent: {
            systemPrompt: 'Inline prompt',
            tools: [{ name: 'inline_tool', description: 'Inline tool' }],
          },
          totalTestCases: 10,
        });

        await collectResults(generateFn(configInline, mockCtx));

        expect(mockGetS3ObjectContent).not.toHaveBeenCalled();
        expect(mockedBuildTaxonomy).toHaveBeenCalledWith(
          expect.objectContaining({
            systemPrompt: 'Inline prompt',
            tools: [{ name: 'inline_tool', description: 'Inline tool' }],
          }),
        );
      });

      it('should report progress when resolving inputs', async () => {
        await collectResults(generateFn(defaultConfig, mockCtx));

        const progressCalls = mockCtx.reportProgress.mock.calls.map((c) => c[0]);
        expect(progressCalls).toContain('Resolving configuration inputs');
      });

      it('throws a contextual error when S3 read fails', async () => {
        const sdkError = new Error('AccessDenied');
        mockGetS3ObjectContent.mockRejectedValue(sdkError);
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

        const configWithS3Prompt = configSchema.parse({
          agent: { systemPrompt: { s3: 's3://my-bucket/prompts/system.txt' } },
          totalTestCases: 10,
        });

        const err = await collectResults(generateFn(configWithS3Prompt, mockCtx)).catch((e: Error) => e);
        expect(err).toBeInstanceOf(Error);
        // Wrapper names the URI; SDK error survives on .cause to preserve
        // error.name and $metadata for downstream catches/CloudWatch.
        expect((err as Error).message).toContain('s3://my-bucket/prompts/system.txt');
        expect((err as Error).cause).toBe(sdkError);
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('s3://my-bucket/prompts/system.txt'),
          sdkError,
        );

        consoleSpy.mockRestore();
      });
    });
  });
});
