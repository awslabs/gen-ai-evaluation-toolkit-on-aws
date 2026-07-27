import { S3Client } from '@aws-sdk/client-s3';
import { EventBridgeClient } from '@aws-sdk/client-eventbridge';
import { z } from 'zod';
import { EnvVariable } from '../src/constants';
import { defineGenerator } from '../src/generator';

describe('defineGenerator', () => {
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

    mockS3Send.mockResolvedValue({});
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
    output: { bucket: 'output-bucket', prefix: 'output/' },
    configuration: config,
  });

  it('should return plugin with name and start function', () => {
    const plugin = defineGenerator({
      name: 'TestGenerator',
      configSchema: z.object({}),
      generate: async function* () {},
    });

    expect(plugin.name).toBe('TestGenerator');
    expect(typeof plugin.start).toBe('function');
  });

  it('should yield test cases and write them to S3', async () => {
    const testCases = [
      { input: 'q1', expected: 'a1' },
      { input: 'q2', expected: 'a2' },
    ];

    const plugin = defineGenerator({
      name: 'TestGenerator',
      configSchema: z.object({}),
      generate: async function* () {
        for (const tc of testCases) {
          yield tc;
        }
      },
    });

    process.env[EnvVariable.CONFIG] = JSON.stringify(createTriggerEvent());

    await plugin.start();

    // Should write 2 test cases
    const s3Calls = mockS3Send.mock.calls.filter(
      (call) => call[0].input?.Key?.includes('test-case'),
    );
    expect(s3Calls).toHaveLength(2);
  });

  it('should apply Zod defaults to config', async () => {
    let receivedConfig: { value: number } | undefined;

    const plugin = defineGenerator({
      name: 'TestGenerator',
      configSchema: z.object({
        value: z.number().default(42),
      }),
      generate: async function* (config) {
        receivedConfig = config;
      },
    });

    process.env[EnvVariable.CONFIG] = JSON.stringify(createTriggerEvent({}));

    await plugin.start();

    expect(receivedConfig?.value).toBe(42);
  });

  it('should emit SUCCESS event on completion', async () => {
    const plugin = defineGenerator({
      name: 'TestGenerator',
      configSchema: z.object({}),
      generate: async function* () {
        yield { input: 'q', expected: 'a' };
      },
    });

    process.env[EnvVariable.CONFIG] = JSON.stringify(createTriggerEvent());

    await plugin.start();

    const successCall = mockEventBridgeSend.mock.calls.find((call) =>
      call[0].input?.Entries?.[0]?.Detail?.includes('success'),
    );
    expect(successCall).toBeDefined();
  });

  it('should emit ERROR event and exit on failure', async () => {
    const plugin = defineGenerator({
      name: 'TestGenerator',
      configSchema: z.object({}),
      generate: async function* () {
        throw new Error('Generation failed');
      },
    });

    process.env[EnvVariable.CONFIG] = JSON.stringify(createTriggerEvent());

    await expect(plugin.start()).rejects.toThrow('process.exit called');

    const errorCall = mockEventBridgeSend.mock.calls.find((call) =>
      call[0].input?.Entries?.[0]?.Detail?.includes('error'),
    );
    expect(errorCall).toBeDefined();
  });

  it('should report progress periodically', async () => {
    const plugin = defineGenerator({
      name: 'TestGenerator',
      configSchema: z.object({}),
      generate: async function* () {
        // Generate 55 items to trigger progress at 50
        for (let i = 0; i < 55; i++) {
          yield { input: `q${i}`, expected: `a${i}` };
        }
      },
    });

    process.env[EnvVariable.CONFIG] = JSON.stringify(createTriggerEvent());

    await plugin.start();

    const progressCalls = mockEventBridgeSend.mock.calls.filter((call) =>
      call[0].input?.Entries?.[0]?.Detail?.includes('inProgress'),
    );
    // Should have at least start progress + one batch progress (at 50 items)
    expect(progressCalls.length).toBeGreaterThanOrEqual(2);
  });
});
