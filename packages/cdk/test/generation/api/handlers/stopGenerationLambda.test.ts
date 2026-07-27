import { GetGenerationOutput, StepFunctionJobStatus } from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import { SFNClient, StopExecutionCommand } from '@aws-sdk/client-sfn';
import { EnvVariable } from '@src/common/config';
import { stopGenerationOperation } from '@src/generation/api/handlers/stopGenerationLambda';
import { getExecutionDetails } from '@src/generation/api/helper/getExecutionDetails';
import { HandlerContext } from '@common/api/apiGateway';

jest.mock('@aws-sdk/client-sfn');
jest.mock('aws-xray-sdk-core');
jest.mock('@src/generation/api/helper/getExecutionDetails');

describe('stopGenerationOperation', () => {
  const mockNow = new Date('2024-01-01T12:00:00Z');
  const context: HandlerContext = { user: 'user-name', requestTime: mockNow };
  const mockSend = jest.fn();
  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(StopExecutionCommand).mockImplementation((props) => props as unknown as StopExecutionCommand);
    jest.mocked(SFNClient).mockImplementation(
      () =>
        ({
          send: mockSend,
        }) as unknown as SFNClient,
    );

    process.env[EnvVariable.GENERATION.WORKFLOW_ARN] =
      'arn:aws:states:us-west-2:123456789012:stateMachine:MyStateMachine';
    process.env[EnvVariable.ACCOUNT_ID] = '123456789012';
    process.env[EnvVariable.REGION] = 'us-west-2';
  });

  it('should stop a state machine execution and return execution details with stop date', async () => {
    const executionId = 'execution-id';
    const mockExecutionArn = `arn:aws:states:us-west-2:123456789012:execution:MyStateMachine:${executionId}`;
    const stopDate = new Date();
    mockSend.mockResolvedValue({
      stopDate,
    });

    const mockExecutionDetails: GetGenerationOutput = {
      id: mockExecutionArn,
      status: StepFunctionJobStatus.ABORTED,
      createdAt: new Date(),
      stoppedAt: new Date(),
      steps: [],
    };
    jest.mocked(getExecutionDetails).mockResolvedValue(mockExecutionDetails);

    const result = await stopGenerationOperation({ id: executionId }, context);

    expect(mockSend).toHaveBeenCalled();
    const commandArg = mockSend.mock.calls[0][0];
    expect(commandArg.executionArn).toEqual(mockExecutionArn);
    expect(commandArg.cause).toEqual('Stopped by user request');

    expect(getExecutionDetails).toHaveBeenCalledWith(mockExecutionArn);
    expect(result).toEqual({
      ...mockExecutionDetails,
      stoppedAt: stopDate,
    });
  });
});
