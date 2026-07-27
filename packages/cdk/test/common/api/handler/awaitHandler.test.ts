import { EventBridgeEvent } from 'aws-lambda';
import { awaitHandler } from '@common/api/handler';
import { InProgressEvent, SuccessEvent, ErrorEvent } from '@src/plugins/contracts/handler/common';

const mockSend = jest.fn();

jest.mock('@aws-sdk/client-sfn', () => {
  return {
    SFNClient: jest.fn(() => ({
      send: mockSend,
    })),
    SendTaskSuccessCommand: jest.fn((payload) => payload),
    SendTaskFailureCommand: jest.fn((payload) => payload),
    SendTaskHeartbeatCommand: jest.fn((payload) => payload),
  };
});
jest.mock('aws-xray-sdk-core', () => ({ captureAWSv3Client: (e: unknown) => e }));

const baseEvent: Omit<EventBridgeEvent<string, object>, 'detail'> = {
  version: '0',
  id: 'test-id',
  'detail-type': 'test-detail-type',
  source: 'test-source',
  account: 'test-account',
  time: new Date().toISOString(),
  region: 'us-east-1',
  resources: [],
};

describe('awaitHandler', () => {
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;

  beforeAll(() => {
    console.log = jest.fn();
    console.error = jest.fn();
  });

  afterAll(() => {
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
  });

  beforeEach(() => {
    mockSend.mockReset();
  });

  it('should call sendTaskSuccess when success', async () => {
    const successEvent: EventBridgeEvent<string, SuccessEvent> = {
      ...baseEvent,
      detail: {
        taskToken: 'test-task-token',
        status: 'success',
        output: '{"test":"object"}',
      },
    };

    mockSend.mockResolvedValue({});

    await awaitHandler(successEvent);

    expect(mockSend).toHaveBeenCalledWith({
      status: successEvent.detail.status,
      taskToken: successEvent.detail.taskToken,
      output: successEvent.detail.output,
    });
  });

  it('should call sendTaskFailure when error', async () => {
    const errorEvent: EventBridgeEvent<string, ErrorEvent> = {
      ...baseEvent,
      detail: {
        taskToken: 'test-task-token',
        status: 'error',
        error: 'Test error message',
      },
    };

    await awaitHandler(errorEvent);

    expect(mockSend).toHaveBeenCalledWith({
      status: errorEvent.detail.status,
      taskToken: errorEvent.detail.taskToken,
      error: errorEvent.detail.error,
      cause: errorEvent.detail.cause,
    });
  });

  it('should handle missing result data when success', async () => {
    const successEvent: EventBridgeEvent<string, SuccessEvent> = {
      ...baseEvent,
      detail: {
        taskToken: 'test-task-token',
        status: 'success',
        output: undefined,
      },
    };

    await awaitHandler(successEvent);

    expect(mockSend).toHaveBeenCalledWith({
      taskToken: 'test-task-token',
      status: 'success',
      output: JSON.stringify({}),
    });
  });

  it('should call send heartbeat', async () => {
    const errorEvent: EventBridgeEvent<string, InProgressEvent> = {
      ...baseEvent,
      detail: {
        taskToken: 'test-task-token',
        status: 'inProgress',
        percentage: 50,
      },
    };

    await awaitHandler(errorEvent);

    expect(mockSend).toHaveBeenCalledWith({
      status: errorEvent.detail.status,
      percentage: errorEvent.detail.percentage,
      taskToken: errorEvent.detail.taskToken,
    });
  });

  it('should handle missing result data', async () => {
    const successEvent: EventBridgeEvent<string, SuccessEvent> = {
      ...baseEvent,
      detail: {
        taskToken: 'test-task-token',
        status: 'success',
        output: undefined,
      },
    };

    await awaitHandler(successEvent);

    expect(mockSend).toHaveBeenCalledWith({
      taskToken: 'test-task-token',
      status: 'success',
      output: JSON.stringify({}),
    });
  });

  it('should throw error if StepFunctions API call fails', async () => {
    const successEvent: EventBridgeEvent<string, SuccessEvent> = {
      ...baseEvent,
      detail: {
        taskToken: 'test-task-token',
        status: 'success',
        output: '{"test":"object"}',
      },
    };
    const mockError = new Error('API call failed');
    mockSend.mockRejectedValue(mockError);

    await expect(awaitHandler(successEvent)).rejects.toThrow(mockError);
  });
});
