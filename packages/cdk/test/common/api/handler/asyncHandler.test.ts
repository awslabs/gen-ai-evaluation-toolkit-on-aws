import { asyncHandler, StepFunctionInvocationEvent } from '@common/api/handler';
import { emitEvent } from '@src/common/eventBridgeUtils';
import { EnvVariable } from '@src/common/config';
import { WithTaskToken } from '@src/plugins/contracts/handler/common';

jest.mock('@src/common/eventBridgeUtils');

describe('asyncHandler', () => {
  const env = process.env;
  const mockEmitEvent = jest.mocked(emitEvent);

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      [EnvVariable.ASYNC_AWAIT_STEP.REQUEST_DETAIL_TYPE]: 'test-request-type',
      [EnvVariable.ASYNC_AWAIT_STEP.SOURCE]: 'test-source',
      [EnvVariable.ASYNC_AWAIT_STEP.RESPONSE_DETAIL_TYPE]: 'test-response-type',
      [EnvVariable.ASYNC_AWAIT_STEP.EVENT_BUS]: 'test-bus',
    };
  });

  afterEach(() => {
    process.env = env;
  });

  it('should successfully emit event with correct parameters', async () => {
    const mockEvent: StepFunctionInvocationEvent<WithTaskToken & { someData: string }> = {
      detail: {
        someData: 'test',
        taskToken: 'test-token',
        responseDetailType: 'original-response-type',
      },
      taskToken: 'test-token',
    };
    mockEmitEvent.mockResolvedValueOnce();

    await asyncHandler(mockEvent);

    expect(mockEmitEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: {
          ...mockEvent.detail,
          taskToken: mockEvent.taskToken,
          responseDetailType: 'test-response-type',
        },
        detailType: 'test-request-type',
        source: 'test-source',
      }),
    );
  });

  it('should handle emitEvent failure and log error', async () => {
    const mockEvent: StepFunctionInvocationEvent<WithTaskToken & { someData: string }> = {
      detail: {
        someData: 'test',
        taskToken: 'test-token',
        responseDetailType: 'original-response-type',
      },
      taskToken: 'test-token',
    };
    const mockError = new Error('Emission failed');
    mockEmitEvent.mockRejectedValueOnce(mockError);

    await expect(asyncHandler(mockEvent)).rejects.toThrow(mockError);
  });
});
