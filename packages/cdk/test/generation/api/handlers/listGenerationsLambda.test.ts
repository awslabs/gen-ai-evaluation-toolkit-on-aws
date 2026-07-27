import { GenerationJobListItem, StepFunctionJobStatus } from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import { ExecutionListItem, ExecutionStatus, ListExecutionsCommand, SFNClient } from '@aws-sdk/client-sfn';
import { EnvVariable } from '@src/common/config';
import { listGenerationOperation } from '@src/generation/api/handlers/listGenerationsLambda';
import { mapExecution } from '@src/generation/api/helper/mapExecution';
import { HandlerContext } from '@common/api/apiGateway';

jest.mock('@aws-sdk/client-sfn');
jest.mock('aws-xray-sdk-core');
jest.mock('@src/generation/api/helper/mapExecution');

describe('listGenerationOperation', () => {
  const mockNow = new Date('2024-01-01T12:00:00Z');
  const context: HandlerContext = { user: 'user-name', requestTime: mockNow };
  const mockSend = jest.fn();
  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(ListExecutionsCommand).mockImplementation((...props) => props[0] as unknown as ListExecutionsCommand);
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

  it('should list state machine executions and map them to job items', async () => {
    const mockExecutions: [ExecutionListItem, ExecutionListItem] = [
      {
        name: 'one',
        stateMachineArn: 'arn:aws:states:us-west-2:123456789012:stateMachine:MyStateMachine',
        executionArn: 'arn:aws:states:us-west-2:123456789012:execution:MyStateMachine:execution-1',
        status: ExecutionStatus.RUNNING,
        startDate: new Date(),
      },
      {
        name: 'two',
        stateMachineArn: 'arn:aws:states:us-west-2:123456789012:stateMachine:MyStateMachine',
        executionArn: 'arn:aws:states:us-west-2:123456789012:execution:MyStateMachine:execution-2',
        status: ExecutionStatus.SUCCEEDED,
        startDate: new Date(),
        stopDate: new Date(),
      },
    ] as const;

    mockSend.mockResolvedValue({
      executions: mockExecutions,
      nextToken: 'next-token',
    });

    const mockMappedExecutions: GenerationJobListItem[] = [
      {
        id: mockExecutions[0].executionArn!.split(':').at(-1)!,
        status: StepFunctionJobStatus.RUNNING,
        createdAt: mockExecutions[0].startDate!,
      },
      {
        id: mockExecutions[1].executionArn!.split(':').at(-1)!,
        status: StepFunctionJobStatus.SUCCEEDED,
        createdAt: mockExecutions[1].startDate!,
        stoppedAt: mockExecutions[1].stopDate,
      },
    ];
    jest.mocked(mapExecution).mockImplementation((execution) => {
      return mockMappedExecutions.find(
        (item) => item.id === execution.executionArn!.split(':').at(-1)!,
      ) as GenerationJobListItem;
    });

    const input = {
      maxResults: 10,
      nextToken: 'current-token',
    };

    const result = await listGenerationOperation(input, context);

    expect(mockSend).toHaveBeenCalled();
    const commandArg = mockSend.mock.calls[0][0];
    expect(commandArg.stateMachineArn).toEqual(process.env.GENERATION_WORKFLOW_ARN);
    expect(commandArg.maxResults).toEqual(input.maxResults);
    expect(commandArg.nextToken).toEqual(input.nextToken);

    expect(mapExecution).toHaveBeenCalledTimes(mockExecutions.length);
    mockExecutions.forEach((execution) => {
      expect(mapExecution).toHaveBeenCalledWith(execution);
    });

    expect(result).toEqual({
      jobs: mockMappedExecutions,
      nextToken: 'next-token',
    });
  });

  it('should use default maxResults when not provided', async () => {
    mockSend.mockResolvedValue({
      executions: [],
      nextToken: undefined,
    });

    await listGenerationOperation({}, context);

    expect(mockSend).toHaveBeenCalled();
    const commandArg = mockSend.mock.calls[0][0];
    expect(commandArg.maxResults).toEqual(50);
  });
});
