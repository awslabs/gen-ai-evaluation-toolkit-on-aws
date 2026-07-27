import { S3Client } from '@aws-sdk/client-s3';
import { EventBridgeClient } from '@aws-sdk/client-eventbridge';
import { EnvVariable } from '../src/constants';
import { createPluginContext } from '../src/context';

describe('createPluginContext', () => {
  const mockS3Send = jest.fn();
  const mockEventBridgeSend = jest.fn();
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    mockS3Send.mockReset();
    mockEventBridgeSend.mockReset();

    S3Client.prototype.send = mockS3Send;
    EventBridgeClient.prototype.send = mockEventBridgeSend;

    process.env = { ...originalEnv };
    process.env[EnvVariable.INTERNAL_S3_BUCKET] = 'internal-bucket';
    process.env[EnvVariable.EVENT_BUS_ARN] = 'arn:aws:events:us-east-1:123456789012:event-bus/test-bus';

    console.log = jest.fn();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  const baseOptions = {
    taskToken: 'test-token',
    runId: 'test-run-123',
    output: { bucket: 'output-bucket', prefix: 'output/prefix/' },
    input: undefined,
  };

  describe('properties', () => {
    it('should expose runId', () => {
      const ctx = createPluginContext(baseOptions);
      expect(ctx.runId).toBe('test-run-123');
    });

    it('should expose internalBucket', () => {
      const ctx = createPluginContext(baseOptions);
      expect(ctx.internalBucket).toBe('internal-bucket');
    });

    it('should expose output', () => {
      const ctx = createPluginContext(baseOptions);
      expect(ctx.output).toEqual({ bucket: 'output-bucket', prefix: 'output/prefix/' });
    });

    it('should expose input when provided', () => {
      const ctx = createPluginContext({
        ...baseOptions,
        input: { bucket: 'input-bucket', prefix: 'input/prefix/' },
      });
      expect(ctx.input).toEqual({ bucket: 'input-bucket', prefix: 'input/prefix/' });
    });
  });

  describe('reportProgress', () => {
    it('should emit IN_PROGRESS event', async () => {
      mockEventBridgeSend.mockResolvedValueOnce({ FailedEntryCount: 0 });
      const ctx = createPluginContext(baseOptions);

      await ctx.reportProgress('Processing step 1');

      expect(mockEventBridgeSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            Entries: [
              expect.objectContaining({
                Detail: expect.stringContaining('inProgress'),
              }),
            ],
          }),
        }),
      );
    });
  });

  describe('writeArtifact', () => {
    it('should write to internal bucket with artifacts prefix', async () => {
      mockS3Send.mockResolvedValueOnce({});
      const ctx = createPluginContext(baseOptions);

      await ctx.writeArtifact('debug.json', '{"debug": true}');

      expect(mockS3Send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            Bucket: 'internal-bucket',
            Key: 'artifacts/test-run-123/debug.json',
            Body: '{"debug": true}',
          }),
        }),
      );
    });
  });

  describe('writeTestCase', () => {
    it('should write to output bucket', async () => {
      mockS3Send.mockResolvedValueOnce({});
      const ctx = createPluginContext(baseOptions);

      await ctx.writeTestCase('test-case-000001', { input: 'q', expected: 'a' });

      expect(mockS3Send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            Bucket: 'output-bucket',
            Key: 'output/prefix/test-case-000001.json',
            Body: JSON.stringify({ input: 'q', expected: 'a' }, null, 2),
          }),
        }),
      );
    });
  });

  describe('listInputFiles', () => {
    it('should throw error when input is not configured', async () => {
      const ctx = createPluginContext(baseOptions);

      await expect(async () => {
        for await (const _ of ctx.listInputFiles()) {
          // should throw before yielding
        }
      }).rejects.toThrow('No input location configured');
    });

    it('should list files from input bucket', async () => {
      mockS3Send.mockResolvedValueOnce({
        Contents: [{ Key: 'input/prefix/file1.json' }, { Key: 'input/prefix/file2.json' }],
        NextContinuationToken: undefined,
      });

      const ctx = createPluginContext({
        ...baseOptions,
        input: { bucket: 'input-bucket', prefix: 'input/prefix/' },
      });

      const files: Array<{ Key: string }> = [];
      for await (const file of ctx.listInputFiles()) {
        files.push(file);
      }

      expect(files).toHaveLength(2);
      expect(files[0].Key).toBe('input/prefix/file1.json');
    });
  });

  describe('readInputFile', () => {
    it('should throw error when input is not configured', async () => {
      const ctx = createPluginContext(baseOptions);

      await expect(ctx.readInputFile('some-key')).rejects.toThrow('No input location configured');
    });

    it('should read and parse JSON file', async () => {
      const mockBody = {
        transformToString: jest.fn().mockResolvedValue('{"input": "question", "expected": "answer"}'),
      };
      mockS3Send.mockResolvedValueOnce({ Body: mockBody });

      const ctx = createPluginContext({
        ...baseOptions,
        input: { bucket: 'input-bucket', prefix: 'input/prefix/' },
      });

      const result = await ctx.readInputFile('input/prefix/test-case.json');

      expect(result).toEqual({ input: 'question', expected: 'answer' });
    });

    it('should throw error for empty file', async () => {
      const mockBody = {
        transformToString: jest.fn().mockResolvedValue(''),
      };
      mockS3Send.mockResolvedValueOnce({ Body: mockBody });

      const ctx = createPluginContext({
        ...baseOptions,
        input: { bucket: 'input-bucket', prefix: 'input/prefix/' },
      });

      await expect(ctx.readInputFile('input/prefix/empty.json')).rejects.toThrow('Empty or missing file');
    });
  });
});
