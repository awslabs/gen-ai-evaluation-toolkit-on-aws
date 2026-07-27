import { S3Client } from '@aws-sdk/client-s3';
import { EventBridgeClient } from '@aws-sdk/client-eventbridge';
import { z } from 'zod';
import { EnvVariable } from '../src/constants';
import { defineFilter } from '../src/filter';

describe('defineFilter', () => {
  const mockS3Send = jest.fn();
  const mockEventBridgeSend = jest.fn();
  const originalEnv = process.env;
  const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {
    throw new Error('process.exit called');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockS3Send.mockReset();
    mockEventBridgeSend.mockReset();

    S3Client.prototype.send = mockS3Send;
    EventBridgeClient.prototype.send = mockEventBridgeSend;

    mockEventBridgeSend.mockResolvedValue({ FailedEntryCount: 0 });

    process.env = { ...originalEnv };
    process.env[EnvVariable.INTERNAL_S3_BUCKET] = 'internal-bucket';
    process.env[EnvVariable.EVENT_BUS_ARN] = 'arn:aws:events:us-east-1:123456789012:event-bus/test-bus';

    console.log = jest.fn();
    console.error = jest.fn();
  });

  afterAll(() => {
    process.env = originalEnv;
    mockExit.mockRestore();
  });

  const createTriggerEvent = (config: Record<string, unknown> = {}) => ({
    taskToken: 'test-token',
    id: 'test-run-123',
    input: { bucket: 'input-bucket', prefix: 'input/' },
    output: { bucket: 'output-bucket', prefix: 'output/' },
    configuration: config,
  });

  const setupS3Mocks = (inputFiles: Array<{ key: string; content: unknown }>) => {
    // Mock listS3PrefixObjects
    mockS3Send.mockImplementation((command) => {
      const commandName = command.constructor.name;

      if (commandName === 'ListObjectsV2Command') {
        return Promise.resolve({
          Contents: inputFiles.map((f) => ({ Key: f.key })),
          NextContinuationToken: undefined,
        });
      }

      if (commandName === 'GetObjectCommand') {
        const key = command.input.Key;
        const file = inputFiles.find((f) => f.key === key);
        return Promise.resolve({
          Body: {
            transformToString: () => Promise.resolve(JSON.stringify(file?.content ?? {})),
          },
        });
      }

      if (commandName === 'PutObjectCommand') {
        return Promise.resolve({});
      }

      return Promise.resolve({});
    });
  };

  it('should return plugin with name and start function', () => {
    const plugin = defineFilter({
      name: 'TestFilter',
      configSchema: z.object({}),
      filter: async function* () {},
    });

    expect(plugin.name).toBe('TestFilter');
    expect(typeof plugin.start).toBe('function');
  });

  it('should load input test cases and pass them to filter', async () => {
    const inputFiles = [
      { key: 'input/test-case-1.json', content: { input: 'q1', expected: 'a1' } },
      { key: 'input/test-case-2.json', content: { input: 'q2', expected: 'a2' } },
    ];
    setupS3Mocks(inputFiles);

    let receivedTestCases: Array<{ key: string; data: unknown }> = [];

    const plugin = defineFilter({
      name: 'TestFilter',
      configSchema: z.object({}),
      filter: async function* (testCases) {
        receivedTestCases = testCases;
        for (const tc of testCases) {
          yield tc.data;
        }
      },
    });

    process.env[EnvVariable.CONFIG] = JSON.stringify(createTriggerEvent());

    await plugin.start();

    expect(receivedTestCases).toHaveLength(2);
    expect(receivedTestCases[0].key).toBe('input/test-case-1.json');
    expect(receivedTestCases[0].data).toEqual({ input: 'q1', expected: 'a1' });
  });

  it('should write yielded test cases to output', async () => {
    const inputFiles = [
      { key: 'input/test-case-1.json', content: { input: 'q1', expected: 'a1', valid: true } },
      { key: 'input/test-case-2.json', content: { input: 'q2', expected: 'a2', valid: false } },
    ];
    setupS3Mocks(inputFiles);

    const plugin = defineFilter({
      name: 'TestFilter',
      configSchema: z.object({}),
      filter: async function* (testCases) {
        for (const tc of testCases) {
          const data = tc.data as { valid: boolean };
          if (data.valid) {
            yield tc.data;
          }
        }
      },
    });

    process.env[EnvVariable.CONFIG] = JSON.stringify(createTriggerEvent());

    await plugin.start();

    // Count PutObject calls for test cases (not events)
    const putCalls = mockS3Send.mock.calls.filter(
      (call) => call[0].constructor.name === 'PutObjectCommand' && call[0].input?.Key?.includes('test-case'),
    );
    expect(putCalls).toHaveLength(1);
  });

  it('should apply Zod defaults to config', async () => {
    setupS3Mocks([]);

    let receivedConfig: { threshold: number } | undefined;

    const plugin = defineFilter({
      name: 'TestFilter',
      configSchema: z.object({
        threshold: z.number().default(0.8),
      }),
      filter: async function* (_, config) {
        receivedConfig = config;
      },
    });

    process.env[EnvVariable.CONFIG] = JSON.stringify(createTriggerEvent({}));

    await plugin.start();

    expect(receivedConfig?.threshold).toBe(0.8);
  });

  it('should emit SUCCESS event with kept/discarded counts', async () => {
    const inputFiles = [
      { key: 'input/test-case-1.json', content: { input: 'q1' } },
      { key: 'input/test-case-2.json', content: { input: 'q2' } },
      { key: 'input/test-case-3.json', content: { input: 'q3' } },
    ];
    setupS3Mocks(inputFiles);

    const plugin = defineFilter({
      name: 'TestFilter',
      configSchema: z.object({}),
      filter: async function* (testCases) {
        // Keep only first test case
        yield testCases[0].data;
      },
    });

    process.env[EnvVariable.CONFIG] = JSON.stringify(createTriggerEvent());

    await plugin.start();

    const successCall = mockEventBridgeSend.mock.calls.find((call) =>
      call[0].input?.Entries?.[0]?.Detail?.includes('success'),
    );
    expect(successCall).toBeDefined();

    const detail = successCall?.[0].input?.Entries?.[0]?.Detail;
    expect(detail).toContain('1 kept');
    expect(detail).toContain('2 discarded');
  });

  it('should emit ERROR event and exit on failure', async () => {
    setupS3Mocks([{ key: 'input/test.json', content: {} }]);

    const plugin = defineFilter({
      name: 'TestFilter',
      configSchema: z.object({}),
      filter: async function* () {
        throw new Error('Filter failed');
      },
    });

    process.env[EnvVariable.CONFIG] = JSON.stringify(createTriggerEvent());

    await expect(plugin.start()).rejects.toThrow('process.exit called');

    const errorCall = mockEventBridgeSend.mock.calls.find((call) =>
      call[0].input?.Entries?.[0]?.Detail?.includes('error'),
    );
    expect(errorCall).toBeDefined();
  });

  it('should skip non-json files when listing input', async () => {
    mockS3Send.mockImplementation((command) => {
      const commandName = command.constructor.name;

      if (commandName === 'ListObjectsV2Command') {
        return Promise.resolve({
          Contents: [{ Key: 'input/test.json' }, { Key: 'input/readme.md' }, { Key: 'input/data.txt' }],
          NextContinuationToken: undefined,
        });
      }

      if (commandName === 'GetObjectCommand') {
        return Promise.resolve({
          Body: {
            transformToString: () => Promise.resolve('{"input": "test"}'),
          },
        });
      }

      return Promise.resolve({});
    });

    let receivedCount = 0;

    const plugin = defineFilter({
      name: 'TestFilter',
      configSchema: z.object({}),
      filter: async function* (testCases) {
        receivedCount = testCases.length;
      },
    });

    process.env[EnvVariable.CONFIG] = JSON.stringify(createTriggerEvent());

    await plugin.start();

    expect(receivedCount).toBe(1); // Only .json file
  });
});
