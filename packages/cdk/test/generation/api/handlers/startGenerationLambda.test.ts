import { GetGenerationOutput, StepFunctionJobStatus } from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import { EnvVariable } from '@src/common/config';
import { startGenerationOperation } from '@src/generation/api/handlers/startGenerationLambda';
import { getExecutionDetails } from '@src/generation/api/helper/getExecutionDetails';
import { HandlerContext } from '@common/api/apiGateway';

jest.mock('@aws-sdk/client-sfn');
jest.mock('aws-xray-sdk-core');
jest.mock('@src/generation/api/helper/getExecutionDetails');

describe('startGenerationOperation', () => {
  const mockNow = new Date('2024-01-01T12:00:00Z');
  const context: HandlerContext = { user: 'user-name', requestTime: mockNow };
  const mockSend = jest.fn();

  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(StartExecutionCommand).mockImplementation((props) => props as unknown as StartExecutionCommand);
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

  afterEach(() => {
    delete process.env.GENERATION_WORKFLOW_ARN;
  });

  it('should start a state machine execution and return execution details', async () => {
    const executionId = 'execution-id';
    const mockExecutionArn = `arn:aws:states:us-west-2:123456789012:execution:MyStateMachine:${executionId}`;
    mockSend.mockResolvedValue({
      executionArn: mockExecutionArn,
    });

    const mockExecutionDetails: GetGenerationOutput = {
      id: executionId,
      status: StepFunctionJobStatus.RUNNING,
      createdAt: new Date(),
      name: 'MyTestJob',
      steps: [],
    };
    jest.mocked(getExecutionDetails).mockResolvedValue(mockExecutionDetails);

    const input = {
      name: 'MyTestJob',
      steps: [],
    };

    const result = await startGenerationOperation(input, context);

    expect(mockSend).toHaveBeenCalled();
    const commandArg = mockSend.mock.calls[0][0];
    expect(commandArg.input).toEqual(JSON.stringify(input));
    expect(commandArg.stateMachineArn).toEqual(process.env.GENERATION_WORKFLOW_ARN);
    expect(getExecutionDetails).toHaveBeenCalledWith(mockExecutionArn);
    expect(result).toEqual(mockExecutionDetails);
  });

  it('should throw an error when executionArn is missing from response', async () => {
    mockSend.mockResolvedValue({});
    const input = {
      name: 'MyTestJob',
      steps: [],
    };

    await expect(startGenerationOperation(input, context)).rejects.toThrow('No executionArn in response');
    expect(mockSend).toHaveBeenCalled();
  });
});
