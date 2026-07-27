import { Readable } from 'stream';

jest.mock('../src/helpers', () => ({
  createBedrockBatchJob: jest.fn(),
  createModelInput: jest.fn((chunk, prompt, questionsPerChunk) => ({
    modelInput: { messages: [{ content: [{ text: `<context>${chunk}</context>` }] }], prompt, questionsPerChunk },
  })),
  waitUntilJobTerminates: jest.fn(),
  parseJobResponseTestCases: jest.fn(),
  getEnvVariable: jest.fn((key: string) => {
    const vars: Record<string, string> = {
      INTERNAL_S3_BUCKET: 'test-bucket',
      BEDROCK_ROLE_ARN: 'arn:aws:iam::123456789012:role/test-role',
    };
    return vars[key] ?? '';
  }),
}));

jest.mock('@genai-etk/plugin-gen-sdk', () => {
  const { z } = jest.requireActual('zod');
  return {
    defineGenerator: jest.fn((options) => ({
      name: options.name,
      start: jest.fn(),
      _generate: options.generate,
      _configSchema: options.configSchema,
    })),
    S3ReferenceModel: z.object({
      bucket: z.string(),
      prefix: z.string(),
    }),
    getS3ObjectContent: jest.fn(),
    listS3PrefixObjects: jest.fn(),
    writeS3Object: jest.fn(),
  };
});

jest.mock('@langchain/textsplitters', () => ({
  RecursiveCharacterTextSplitter: jest.fn().mockImplementation(() => ({
    splitText: jest.fn().mockResolvedValue(['chunk1', 'chunk2']),
  })),
}));

import {
  createBedrockBatchJob,
  createModelInput,
  waitUntilJobTerminates,
  parseJobResponseTestCases,
} from '../src/helpers';
import { getS3ObjectContent, listS3PrefixObjects, writeS3Object } from '@genai-etk/plugin-gen-sdk';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import plugin from '../src/plugin';

const mockedCreateBedrockBatchJob = createBedrockBatchJob as jest.MockedFunction<typeof createBedrockBatchJob>;
const mockedWaitUntilJobTerminates = waitUntilJobTerminates as jest.MockedFunction<typeof waitUntilJobTerminates>;
const mockedParseJobResponseTestCases = parseJobResponseTestCases as jest.MockedFunction<
  typeof parseJobResponseTestCases
>;
const mockedGetS3ObjectContent = getS3ObjectContent as jest.MockedFunction<typeof getS3ObjectContent>;
const mockedListS3PrefixObjects = listS3PrefixObjects as jest.MockedFunction<typeof listS3PrefixObjects>;
const mockedWriteS3Object = writeS3Object as jest.MockedFunction<typeof writeS3Object>;
const MockedRecursiveCharacterTextSplitter = RecursiveCharacterTextSplitter as jest.MockedClass<
  typeof RecursiveCharacterTextSplitter
>;

describe('RAGGenerator plugin', () => {
  const mockCtx = {
    runId: 'test-run-123',
    reportProgress: jest.fn().mockResolvedValue(undefined),
    writeTestCase: jest.fn().mockResolvedValue(undefined),
    listInputFiles: jest.fn(),
    readInputFile: jest.fn(),
  };

  const defaultConfig = {
    documentSource: { bucket: 'source-bucket', prefix: 'documents/' },
    chunk: { size: 1024, overlap: 128 },
    question: {
      model: 'global.anthropic.claude-haiku-4-5-20251001-v1:0',
      questionsPerChunk: 3,
      prompt: 'Generate questions',
    },
  };

  const generateFn = (plugin as unknown as { _generate: typeof plugin.start })._generate;
  const configSchema = (plugin as unknown as { _configSchema: { parse: (v: unknown) => typeof defaultConfig } })
    ._configSchema;

  async function collectResults<T>(gen: AsyncGenerator<T>): Promise<T[]> {
    const results: T[] = [];
    for await (const item of gen) {
      results.push(item);
    }
    return results;
  }

  function createMockS3Objects(count: number) {
    return Array.from({ length: count }, (_, i) => ({ Key: `doc-${i}.txt` }));
  }

  function setupSuccessfulBatchJob(testCases: Array<{ input: string; expected: string; context: string[] }>) {
    mockedWriteS3Object.mockResolvedValue(undefined);
    mockedCreateBedrockBatchJob.mockResolvedValue('arn:aws:bedrock:us-east-1:123456789012:job/test-job-id');
    mockedWaitUntilJobTerminates.mockResolvedValue(undefined);
    mockedGetS3ObjectContent.mockImplementation(async (bucket, key) => {
      if (key.includes('outputs/')) {
        return new Readable() as unknown as ReturnType<typeof getS3ObjectContent>;
      }
      return {
        transformToString: jest.fn().mockResolvedValue('document content'),
      } as unknown as ReturnType<typeof getS3ObjectContent>;
    });
    mockedParseJobResponseTestCases.mockImplementation(async function* () {
      for (const tc of testCases) {
        yield tc;
      }
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    MockedRecursiveCharacterTextSplitter.mockImplementation(
      () =>
        ({
          splitText: jest.fn().mockResolvedValue(['chunk1', 'chunk2']),
        }) as unknown as RecursiveCharacterTextSplitter,
    );
  });

  describe('plugin definition', () => {
    it('should export plugin with name and start method', () => {
      expect(plugin.name).toBe('RAGGenerator');
      expect(typeof plugin.start).toBe('function');
    });
  });

  describe('config schema', () => {
    it('should require documentSource', () => {
      expect(() => configSchema.parse({})).toThrow();
    });

    it('should apply defaults for chunk and question settings', () => {
      const config = configSchema.parse({
        documentSource: { bucket: 'bucket', prefix: 'prefix/' },
      });

      expect(config.chunk.size).toBe(1024);
      expect(config.chunk.overlap).toBe(128);
      expect(config.question.model).toBe('global.anthropic.claude-haiku-4-5-20251001-v1:0');
      expect(config.question.questionsPerChunk).toBe(3);
    });

    it('should allow overriding all config values', () => {
      const customConfig = {
        documentSource: { bucket: 'custom-bucket', prefix: 'custom/' },
        chunk: { size: 2048, overlap: 256 },
        question: { model: 'custom-model', questionsPerChunk: 5, prompt: 'Custom prompt' },
      };

      const config = configSchema.parse(customConfig);

      expect(config.chunk.size).toBe(2048);
      expect(config.question.questionsPerChunk).toBe(5);
    });
  });

  describe('generate function', () => {
    describe('document chunking', () => {
      it('should read documents from source bucket and chunk them', async () => {
        mockedListS3PrefixObjects.mockImplementation(async function* () {
          yield* createMockS3Objects(50);
        });
        setupSuccessfulBatchJob([]);

        await collectResults(generateFn(defaultConfig, mockCtx));

        expect(mockedListS3PrefixObjects).toHaveBeenCalledWith('source-bucket', 'documents/');
        expect(mockedGetS3ObjectContent).toHaveBeenCalledWith('source-bucket', 'doc-0.txt');
        expect(MockedRecursiveCharacterTextSplitter).toHaveBeenCalledWith({
          chunkSize: 1024,
          chunkOverlap: 128,
        });
      });

      it('should skip empty files', async () => {
        mockedListS3PrefixObjects.mockImplementation(async function* () {
          yield { Key: 'empty.txt' };
          yield { Key: 'valid.txt' };
        });
        mockedGetS3ObjectContent
          .mockResolvedValueOnce({
            transformToString: jest.fn().mockResolvedValue(''),
          } as unknown as ReturnType<typeof getS3ObjectContent>)
          .mockResolvedValueOnce({
            transformToString: jest.fn().mockResolvedValue('content'),
          } as unknown as ReturnType<typeof getS3ObjectContent>);
        MockedRecursiveCharacterTextSplitter.mockImplementation(
          () =>
            ({
              splitText: jest.fn().mockResolvedValue(Array(100).fill('chunk')),
            }) as unknown as RecursiveCharacterTextSplitter,
        );
        setupSuccessfulBatchJob([]);

        await collectResults(generateFn(defaultConfig, mockCtx));

        expect(createModelInput).toHaveBeenCalledTimes(100);
      });
    });

    describe('input validation', () => {
      it('should throw when no chunks are generated', async () => {
        mockedListS3PrefixObjects.mockImplementation(async function* () {
          // empty
        });

        const generator = generateFn(defaultConfig, mockCtx);
        await expect(collectResults(generator)).rejects.toThrow('No chunks were generated');
      });

      it('should throw when fewer than 100 chunks (Bedrock Batch minimum)', async () => {
        mockedListS3PrefixObjects.mockImplementation(async function* () {
          yield { Key: 'doc.txt' };
        });
        mockedGetS3ObjectContent.mockResolvedValue({
          transformToString: jest.fn().mockResolvedValue('content'),
        } as unknown as ReturnType<typeof getS3ObjectContent>);
        MockedRecursiveCharacterTextSplitter.mockImplementation(
          () =>
            ({
              splitText: jest.fn().mockResolvedValue(['chunk1', 'chunk2']),
            }) as unknown as RecursiveCharacterTextSplitter,
        );

        const generator = generateFn(defaultConfig, mockCtx);
        await expect(collectResults(generator)).rejects.toThrow('Cannot invoke batch job with less than 100 chunks');
      });
    });

    describe('batch job lifecycle', () => {
      beforeEach(() => {
        mockedListS3PrefixObjects.mockImplementation(async function* () {
          yield* createMockS3Objects(50);
        });
        MockedRecursiveCharacterTextSplitter.mockImplementation(
          () =>
            ({
              splitText: jest.fn().mockResolvedValue(['chunk1', 'chunk2']),
            }) as unknown as RecursiveCharacterTextSplitter,
        );
      });

      it('should upload chunks, run batch job, and read results', async () => {
        setupSuccessfulBatchJob([]);

        await collectResults(generateFn(defaultConfig, mockCtx));

        expect(mockedWriteS3Object).toHaveBeenCalledWith(
          'test-bucket',
          'chunks/test-run-123.jsonl',
          expect.any(String),
        );
        expect(mockedCreateBedrockBatchJob).toHaveBeenCalledWith(
          'test-run-123',
          's3://test-bucket/chunks/test-run-123.jsonl',
          's3://test-bucket/outputs/test-run-123/',
          defaultConfig.question.model,
        );
        expect(mockedWaitUntilJobTerminates).toHaveBeenCalled();
      });

      it('should report progress at each stage', async () => {
        setupSuccessfulBatchJob([]);

        await collectResults(generateFn(defaultConfig, mockCtx));

        const progressCalls = mockCtx.reportProgress.mock.calls.map((c) => c[0]);
        expect(progressCalls).toContain('Reading and chunking documents...');
        expect(progressCalls).toContain('Created 100 chunks for processing');
        expect(progressCalls).toContain('Bedrock batch job started');
        expect(progressCalls).toContain('Batch job completed, parsing results...');
      });

      it('should throw when job output is not found', async () => {
        mockedWriteS3Object.mockResolvedValue(undefined);
        mockedCreateBedrockBatchJob.mockResolvedValue('arn:aws:bedrock:us-east-1:123456789012:job/test-job-id');
        mockedWaitUntilJobTerminates.mockResolvedValue(undefined);
        mockedGetS3ObjectContent
          .mockResolvedValue({
            transformToString: jest.fn().mockResolvedValue('content'),
          } as unknown as ReturnType<typeof getS3ObjectContent>)
          .mockResolvedValueOnce({
            transformToString: jest.fn().mockResolvedValue('content'),
          } as unknown as ReturnType<typeof getS3ObjectContent>);

        // Last call returns null (job output not found)
        mockedGetS3ObjectContent.mockImplementation(async (bucket, key) => {
          if (key.includes('outputs/')) {
            return null as unknown as ReturnType<typeof getS3ObjectContent>;
          }
          return {
            transformToString: jest.fn().mockResolvedValue('content'),
          } as unknown as ReturnType<typeof getS3ObjectContent>;
        });

        const generator = generateFn(defaultConfig, mockCtx);
        await expect(collectResults(generator)).rejects.toThrow('Job output not found');
      });
    });

    describe('test case generation', () => {
      beforeEach(() => {
        mockedListS3PrefixObjects.mockImplementation(async function* () {
          yield* createMockS3Objects(50);
        });
        MockedRecursiveCharacterTextSplitter.mockImplementation(
          () =>
            ({
              splitText: jest.fn().mockResolvedValue(['chunk1', 'chunk2']),
            }) as unknown as RecursiveCharacterTextSplitter,
        );
      });

      it('should yield all test cases from batch job response', async () => {
        const testCases = [
          { input: 'Q1?', expected: 'A1', context: ['ctx1'] },
          { input: 'Q2?', expected: 'A2', context: ['ctx2'] },
        ];
        setupSuccessfulBatchJob(testCases);

        const results = await collectResults(generateFn(defaultConfig, mockCtx));

        expect(results).toEqual(testCases);
      });

      it('should create model input for each chunk', async () => {
        setupSuccessfulBatchJob([]);

        await collectResults(generateFn(defaultConfig, mockCtx));

        expect(createModelInput).toHaveBeenCalledWith('chunk1', defaultConfig.question.prompt, 3);
        expect(createModelInput).toHaveBeenCalledWith('chunk2', defaultConfig.question.prompt, 3);
      });
    });
  });
});
