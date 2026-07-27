import { Readable } from 'stream';

jest.mock('../src/helpers', () => ({
  createBedrockBatchJob: jest.fn(),
  createModelInput: jest.fn((input, prompt, criteria, threshold) => ({
    modelInput: { messages: [{ content: [{ text: input }] }], prompt, criteria, threshold },
  })),
  waitUntilJobTerminates: jest.fn(),
  parseJobResponseValidatedTestCases: jest.fn(),
  getEnvVariable: jest.fn((key: string) => {
    const vars: Record<string, string> = {
      INTERNAL_S3_BUCKET: 'test-bucket',
      BEDROCK_ROLE_ARN: 'arn:aws:iam::123456789012:role/test-role',
    };
    return vars[key] ?? '';
  }),
}));

jest.mock('@genai-etk/plugin-gen-sdk', () => ({
  defineFilter: jest.fn((options) => ({
    name: options.name,
    start: jest.fn(),
    _filter: options.filter,
    _configSchema: options.configSchema,
  })),
  getS3ObjectContent: jest.fn(),
  writeS3Object: jest.fn(),
  InputTestCase: {},
}));

import {
  createBedrockBatchJob,
  createModelInput,
  waitUntilJobTerminates,
  parseJobResponseValidatedTestCases,
} from '../src/helpers';
import { getS3ObjectContent, writeS3Object } from '@genai-etk/plugin-gen-sdk';
import plugin from '../src/plugin';

const mockedCreateBedrockBatchJob = createBedrockBatchJob as jest.MockedFunction<typeof createBedrockBatchJob>;
const mockedWaitUntilJobTerminates = waitUntilJobTerminates as jest.MockedFunction<typeof waitUntilJobTerminates>;
const mockedParseJobResponseValidatedTestCases = parseJobResponseValidatedTestCases as jest.MockedFunction<
  typeof parseJobResponseValidatedTestCases
>;
const mockedGetS3ObjectContent = getS3ObjectContent as jest.MockedFunction<typeof getS3ObjectContent>;
const mockedWriteS3Object = writeS3Object as jest.MockedFunction<typeof writeS3Object>;

describe('LLMAsJudgeFilter plugin', () => {
  const mockCtx = {
    runId: 'test-run-123',
    reportProgress: jest.fn().mockResolvedValue(undefined),
    writeTestCase: jest.fn().mockResolvedValue(undefined),
    listInputFiles: jest.fn(),
    readInputFile: jest.fn(),
  };

  const defaultConfig = {
    model: 'global.anthropic.claude-haiku-4-5-20251001-v1:0',
    criteria: [
      'Question must be answerable from the provided context',
      'Answer must be accurate and complete',
      'Question should be clear and unambiguous',
    ],
    threshold: 0.8,
    prompt:
      'You are a quality assessor for educational content. Evaluate if the given question-answer pair meets all specified criteria. Return true only if all criteria are met, otherwise false.',
  };

  const filterFn = (plugin as unknown as { _filter: typeof plugin.start })._filter;
  const configSchema = (plugin as unknown as { _configSchema: { parse: (v: unknown) => typeof defaultConfig } })
    ._configSchema;

  function createTestCases(count: number) {
    return Array.from({ length: count }, (_, i) => ({
      key: `test-case-${i}.json`,
      data: { question: `Question ${i}?`, answer: `Answer ${i}` },
    }));
  }

  async function collectResults<T>(gen: AsyncGenerator<T>): Promise<T[]> {
    const results: T[] = [];
    for await (const item of gen) {
      results.push(item);
    }
    return results;
  }

  function setupSuccessfulBatchJob(validatedTestCases: Array<{ question: string; answer: string; valid: boolean }>) {
    mockedWriteS3Object.mockResolvedValue(undefined);
    mockedCreateBedrockBatchJob.mockResolvedValue('arn:aws:bedrock:us-east-1:123456789012:job/test-job-id');
    mockedWaitUntilJobTerminates.mockResolvedValue(undefined);
    mockedGetS3ObjectContent.mockResolvedValue(new Readable() as unknown as ReturnType<typeof getS3ObjectContent>);
    mockedParseJobResponseValidatedTestCases.mockImplementation(async function* () {
      for (const tc of validatedTestCases) {
        yield tc;
      }
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('plugin definition', () => {
    it('should export plugin with name and start method', () => {
      expect(plugin.name).toBe('LLMAsJudgeFilter');
      expect(typeof plugin.start).toBe('function');
    });
  });

  describe('config schema', () => {
    it('should apply defaults for empty config', () => {
      const config = configSchema.parse({});

      expect(config.model).toBe('global.anthropic.claude-haiku-4-5-20251001-v1:0');
      expect(config.threshold).toBe(0.8);
      expect(config.criteria).toHaveLength(3);
      expect(config.prompt).toContain('quality assessor');
    });

    it('should allow overriding all config values', () => {
      const customConfig = {
        model: 'custom-model',
        threshold: 0.5,
        criteria: ['Custom criterion'],
        prompt: 'Custom prompt',
      };

      const config = configSchema.parse(customConfig);

      expect(config).toEqual(customConfig);
    });

    it('should reject threshold outside 0-1 range', () => {
      expect(() => configSchema.parse({ threshold: 1.5 })).toThrow();
      expect(() => configSchema.parse({ threshold: -0.1 })).toThrow();
    });
  });

  describe('filter function', () => {
    describe('input validation', () => {
      it('should throw when no test cases provided', async () => {
        const generator = filterFn([], defaultConfig, mockCtx);
        await expect(collectResults(generator)).rejects.toThrow('No validation prompts were generated');
      });

      it('should throw when fewer than 100 test cases (Bedrock Batch minimum)', async () => {
        const generator = filterFn(createTestCases(50), defaultConfig, mockCtx);
        await expect(collectResults(generator)).rejects.toThrow('Cannot invoke batch job with less than 100 prompts');
      });
    });

    describe('batch job lifecycle', () => {
      it('should upload prompts, run batch job, and read results', async () => {
        setupSuccessfulBatchJob([{ question: 'Q?', answer: 'A', valid: true }]);

        await collectResults(filterFn(createTestCases(100), defaultConfig, mockCtx));

        expect(mockedWriteS3Object).toHaveBeenCalledWith('test-bucket', 'prompts/test-run-123.jsonl', expect.any(String));
        expect(mockedCreateBedrockBatchJob).toHaveBeenCalledWith(
          'test-run-123',
          's3://test-bucket/prompts/test-run-123.jsonl',
          's3://test-bucket/outputs/test-run-123/',
          defaultConfig.model,
        );
        expect(mockedWaitUntilJobTerminates).toHaveBeenCalled();
        expect(mockedGetS3ObjectContent).toHaveBeenCalledWith(
          'test-bucket',
          'outputs/test-run-123/test-job-id/test-run-123.jsonl.out',
        );
      });

      it('should report progress at each stage', async () => {
        setupSuccessfulBatchJob([]);

        await collectResults(filterFn(createTestCases(100), defaultConfig, mockCtx));

        const progressCalls = mockCtx.reportProgress.mock.calls.map((c) => c[0]);
        expect(progressCalls).toContain('Creating validation prompts from input test cases...');
        expect(progressCalls).toContain('Created 100 validation prompts for processing');
        expect(progressCalls).toContain('Bedrock validation batch job started');
        expect(progressCalls).toContain('Batch job completed, parsing validation results...');
      });

      it('should throw when job output is not found', async () => {
        mockedWriteS3Object.mockResolvedValue(undefined);
        mockedCreateBedrockBatchJob.mockResolvedValue('arn:aws:bedrock:us-east-1:123456789012:job/test-job-id');
        mockedWaitUntilJobTerminates.mockResolvedValue(undefined);
        mockedGetS3ObjectContent.mockResolvedValue(null as unknown as ReturnType<typeof getS3ObjectContent>);

        const generator = filterFn(createTestCases(100), defaultConfig, mockCtx);
        await expect(collectResults(generator)).rejects.toThrow('Job output not found');
      });
    });

    describe('test case filtering', () => {
      it('should yield only valid test cases, stripping the valid field', async () => {
        const validatedResults = [
          { question: 'Valid Q1?', answer: 'A1', valid: true },
          { question: 'Invalid Q?', answer: 'A', valid: false },
          { question: 'Valid Q2?', answer: 'A2', valid: true },
        ];
        setupSuccessfulBatchJob(validatedResults);

        const results = await collectResults(filterFn(createTestCases(100), defaultConfig, mockCtx));

        expect(results).toHaveLength(2);
        expect(results).toEqual([
          { question: 'Valid Q1?', answer: 'A1' },
          { question: 'Valid Q2?', answer: 'A2' },
        ]);
      });

      it('should return empty array when all test cases are invalid', async () => {
        setupSuccessfulBatchJob([
          { question: 'Q1?', answer: 'A1', valid: false },
          { question: 'Q2?', answer: 'A2', valid: false },
        ]);

        const results = await collectResults(filterFn(createTestCases(100), defaultConfig, mockCtx));

        expect(results).toHaveLength(0);
      });

      it('should create validation prompts for all input test cases', async () => {
        setupSuccessfulBatchJob([]);

        await collectResults(filterFn(createTestCases(100), defaultConfig, mockCtx));

        expect(createModelInput).toHaveBeenCalledTimes(100);
        expect(createModelInput).toHaveBeenCalledWith(
          expect.any(String),
          defaultConfig.prompt,
          defaultConfig.criteria,
          defaultConfig.threshold,
        );
      });
    });
  });
});
