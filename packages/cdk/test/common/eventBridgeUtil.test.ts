import { EventBridge, PutEventsCommandOutput } from '@aws-sdk/client-eventbridge';
import { emitEvent } from '@src/common/eventBridgeUtils';

jest.mock('@aws-sdk/client-eventbridge');

describe('emitEvent', () => {
  const mockPutEvents = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(EventBridge).mockReturnValue({ putEvents: mockPutEvents } as unknown as EventBridge);
  });

  it('should successfully emit an event', async () => {
    const context = {
      detail: { test: 'data' },
      detailType: 'TEST_EVENT',
      eventBus: 'some/bus',
      source: 'test.source',
    };

    const mockResponse: PutEventsCommandOutput = {
      $metadata: {},
      FailedEntryCount: 0,
      Entries: [
        {
          EventId: '123',
        },
      ],
    };

    mockPutEvents.mockResolvedValueOnce(mockResponse);

    await emitEvent(context);

    expect(mockPutEvents).toHaveBeenCalledWith({
      Entries: [
        {
          Detail: JSON.stringify(context.detail),
          DetailType: context.detailType,
          Source: context.source,
          EventBusName: context.eventBus,
        },
      ],
    });
  });

  it('should throw error when FailedEntryCount is greater than 0', async () => {
    const context = {
      detail: { test: 'data' },
      detailType: 'TEST_EVENT',
      eventBus: 'some/bus',
      source: 'test.source',
    };

    const mockFailedResponse: PutEventsCommandOutput = {
      $metadata: {},
      FailedEntryCount: 1,
      Entries: [
        {
          ErrorCode: 'TestError',
          ErrorMessage: 'Test error message',
        },
      ],
    };

    mockPutEvents.mockResolvedValueOnce(mockFailedResponse);

    await expect(emitEvent(context)).rejects.toThrow(
      `Failed to send events: ${JSON.stringify(mockFailedResponse.Entries)}`,
    );
  });

  it('should handle and rethrow AWS SDK errors', async () => {
    const context = {
      detail: { test: 'data' },
      detailType: 'TEST_EVENT',
      eventBus: 'some/bus',
      source: 'test.source',
    };
    const testError = new Error('AWS SDK Error');
    mockPutEvents.mockRejectedValueOnce(testError);

    await expect(emitEvent(context)).rejects.toThrow('AWS SDK Error');
  });

  it('should handle complex detail objects', async () => {
    const complexDetail = {
      nested: {
        array: [1, 2, 3],
        object: {
          key: 'value',
        },
      },
      date: new Date('2023-01-01'),
    };
    const context = {
      detail: complexDetail,
      detailType: 'TEST_EVENT',
      eventBus: 'some/bus',
      source: 'test.source',
    };

    const mockResponse: PutEventsCommandOutput = {
      $metadata: {},
      FailedEntryCount: 0,
      Entries: [
        {
          EventId: '123',
        },
      ],
    };

    mockPutEvents.mockResolvedValueOnce(mockResponse);

    await emitEvent(context);

    expect(mockPutEvents).toHaveBeenCalledWith({
      Entries: [
        {
          Detail: JSON.stringify(context.detail),
          DetailType: context.detailType,
          Source: context.source,
          EventBusName: context.eventBus,
        },
      ],
    });
  });
});
