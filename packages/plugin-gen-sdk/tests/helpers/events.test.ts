import { EventBridgeClient } from '@aws-sdk/client-eventbridge';
import { EnvVariable, StatusType } from '../../src/constants';
import { emitEvent } from '../../src/helpers/events';

describe('emitEvent', () => {
  const mockSend = jest.fn();
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSend.mockReset();
    EventBridgeClient.prototype.send = mockSend;

    process.env = { ...originalEnv };
    process.env[EnvVariable.EVENT_BUS_ARN] = 'arn:aws:events:us-east-1:123456789012:event-bus/test-bus';
    process.env[EnvVariable.PLUGIN_NAME] = 'TestPlugin';

    console.error = jest.fn();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should send event with correct parameters', async () => {
    mockSend.mockResolvedValueOnce({ FailedEntryCount: 0 });

    await emitEvent({
      taskToken: 'test-token',
      status: StatusType.SUCCESS,
      message: 'Test message',
      error: undefined,
      cause: undefined,
    });

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          Entries: [
            expect.objectContaining({
              EventBusName: 'test-bus',
              Source: 'TestPlugin',
              Detail: expect.stringContaining('test-token'),
            }),
          ],
        }),
      }),
    );
  });

  it('should include error details when provided', async () => {
    mockSend.mockResolvedValueOnce({ FailedEntryCount: 0 });

    await emitEvent({
      taskToken: 'test-token',
      status: StatusType.ERROR,
      message: 'Error occurred',
      error: 'TestError',
      cause: 'Something went wrong',
    });

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          Entries: [
            expect.objectContaining({
              Detail: expect.stringContaining('TestError'),
            }),
          ],
        }),
      }),
    );
  });

  it('should log error when some events fail to send', async () => {
    mockSend.mockResolvedValueOnce({
      FailedEntryCount: 1,
      Entries: [{ ErrorCode: 'InternalError' }],
    });

    await emitEvent({
      taskToken: 'test-token',
      status: StatusType.IN_PROGRESS,
      message: 'Progress',
      error: undefined,
      cause: undefined,
    });

    expect(console.error).toHaveBeenCalledWith('Some events failed to send:', expect.any(Array));
  });

  it('should handle send errors gracefully', async () => {
    mockSend.mockRejectedValueOnce(new Error('Network error'));

    await emitEvent({
      taskToken: 'test-token',
      status: StatusType.SUCCESS,
      message: 'Test',
      error: undefined,
      cause: undefined,
    });

    expect(console.error).toHaveBeenCalledWith('Error sending event:', expect.any(Error));
  });

  it('should use default plugin name when PLUGIN_NAME is not set', async () => {
    delete process.env[EnvVariable.PLUGIN_NAME];
    mockSend.mockResolvedValueOnce({ FailedEntryCount: 0 });

    await emitEvent({
      taskToken: 'test-token',
      status: StatusType.SUCCESS,
      message: 'Test',
      error: undefined,
      cause: undefined,
    });

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          Entries: [
            expect.objectContaining({
              Source: 'TestCaseGenerationPlugin',
            }),
          ],
        }),
      }),
    );
  });
});
