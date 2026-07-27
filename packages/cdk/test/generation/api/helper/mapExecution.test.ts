import { StepFunctionJobStatus } from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import { DescribeExecutionCommandOutput, ExecutionListItem, ExecutionStatus } from '@aws-sdk/client-sfn';
import { getEnvVariable, getExecutionArn, getExecutionId } from '@src/common';
import { EnvVariable } from '@src/common/config';
import { mapExecution, mapExecutionDetails } from '@src/generation/api/helper/mapExecution';

const mockExecutionId = 'execution-id';
const mockExecutionArn = `arn:aws:states:us-west-2:123456789012:execution:MyStateMachine:${mockExecutionId}`;

describe('mapExecution', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should map ExecutionListItem to GenerationJobListItem correctly', () => {
    const startDate = new Date('2025-01-01T12:00:00Z');
    const stopDate = new Date('2025-01-01T12:30:00Z');

    const mockExecution: ExecutionListItem = {
      executionArn: mockExecutionArn,
      status: ExecutionStatus.SUCCEEDED,
      startDate,
      stopDate,
      stateMachineArn: undefined,
      name: undefined,
    };

    const result = mapExecution(mockExecution);

    expect(result).toEqual({
      id: mockExecutionId,
      status: StepFunctionJobStatus.SUCCEEDED,
      createdAt: startDate,
      stoppedAt: stopDate,
      cause: undefined,
      error: undefined,
    });
  });

  it('should throw an error if executionArn is missing', () => {
    const mockExecution: ExecutionListItem = {
      status: ExecutionStatus.SUCCEEDED,
      startDate: new Date(),
      executionArn: undefined,
      stateMachineArn: undefined,
      name: undefined,
    };

    expect(() => mapExecution(mockExecution)).toThrow('Execution ARN missing');
  });

  it('should use FAILED status if status is undefined', () => {
    const mockExecution: ExecutionListItem = {
      executionArn: mockExecutionArn,
      startDate: new Date(),
      status: undefined,
      stateMachineArn: undefined,
      name: undefined,
    };

    const result = mapExecution(mockExecution);
    expect(result.status).toBe(StepFunctionJobStatus.FAILED);
  });

  it('should throw if startDate is missing', () => {
    const mockExecution: ExecutionListItem = {
      executionArn: mockExecutionArn,
      status: ExecutionStatus.RUNNING,
      stateMachineArn: undefined,
      name: undefined,
      startDate: undefined,
    };

    expect(() => mapExecution(mockExecution)).toThrow('Execution has no start date');
  });

  it('should map all possible execution statuses correctly', () => {
    const statusMappings = [
      { sfnStatus: ExecutionStatus.SUCCEEDED, expectedStatus: StepFunctionJobStatus.SUCCEEDED },
      { sfnStatus: ExecutionStatus.FAILED, expectedStatus: StepFunctionJobStatus.FAILED },
      { sfnStatus: ExecutionStatus.RUNNING, expectedStatus: StepFunctionJobStatus.RUNNING },
      { sfnStatus: ExecutionStatus.ABORTED, expectedStatus: StepFunctionJobStatus.ABORTED },
      { sfnStatus: ExecutionStatus.TIMED_OUT, expectedStatus: StepFunctionJobStatus.TIMED_OUT },
      { sfnStatus: ExecutionStatus.PENDING_REDRIVE, expectedStatus: StepFunctionJobStatus.PENDING_REDRIVE },
    ];

    statusMappings.forEach(({ sfnStatus, expectedStatus }) => {
      const mockExecution: ExecutionListItem = {
        executionArn: mockExecutionArn,
        status: sfnStatus,
        startDate: new Date(),
        stateMachineArn: undefined,
        name: undefined,
      };

      const result = mapExecution(mockExecution);
      expect(result.status).toBe(expectedStatus);
    });
  });
});

describe('mapExecutionDetails', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should map DescribeExecutionCommandOutput to GetGenerationOutput correctly', () => {
    const startDate = new Date('2025-01-01T12:00:00Z');
    const stopDate = new Date('2025-01-01T12:30:00Z');

    const mockInput = JSON.stringify({
      experimentName: 'exp-123',
      steps: [
        {
          plugin: 'test-plugin',
          configuration: { key: 'value' },
        },
      ],
    });

    const mockExecution: DescribeExecutionCommandOutput = {
      executionArn: mockExecutionArn,
      status: ExecutionStatus.SUCCEEDED,
      input: mockInput,
      startDate,
      stopDate,
      $metadata: {},
      stateMachineArn: undefined,
    };

    const result = mapExecutionDetails(mockExecution);

    expect(result).toEqual({
      id: mockExecutionId,
      status: StepFunctionJobStatus.SUCCEEDED,
      createdAt: startDate,
      stoppedAt: stopDate,
      cause: undefined,
      error: undefined,
      steps: [
        {
          plugin: 'test-plugin',
          configuration: { key: 'value' },
        },
      ],
    });
  });

  it('should throw an error if executionArn is missing', () => {
    const mockExecution: DescribeExecutionCommandOutput = {
      input: '{}',
      $metadata: {},
      executionArn: undefined,
      stateMachineArn: undefined,
      status: undefined,
      startDate: undefined,
    };

    expect(() => mapExecutionDetails(mockExecution)).toThrow('Execution ARN missing');
  });

  it('should throw an error if input is missing', () => {
    const mockExecution: DescribeExecutionCommandOutput = {
      executionArn: mockExecutionArn,
      $metadata: {},
      stateMachineArn: undefined,
      status: undefined,
      startDate: undefined,
    };

    expect(() => mapExecutionDetails(mockExecution)).toThrow('Execution input missing');
  });

  it('should throw an error if input is not valid according to schema', () => {
    const mockExecution: DescribeExecutionCommandOutput = {
      executionArn: mockExecutionArn,
      input: '{"invalid": "input"}', // Missing required 'name' and 'steps'
      $metadata: {},
      stateMachineArn: undefined,
      status: undefined,
      startDate: undefined,
    };

    expect(() => mapExecutionDetails(mockExecution)).toThrow();
  });

  it('should include error and cause information when present', () => {
    const mockInput = JSON.stringify({
      steps: [{ plugin: 'test-plugin', configuration: {} }],
    });

    const mockExecution: DescribeExecutionCommandOutput = {
      executionArn: mockExecutionArn,
      status: ExecutionStatus.FAILED,
      input: mockInput,
      startDate: new Date(),
      error: 'Lambda.ServiceException',
      cause: 'Something went wrong',
      $metadata: {},
      stateMachineArn: undefined,
    };

    const result = mapExecutionDetails(mockExecution);

    expect(result.error).toBe('Lambda.ServiceException');
    expect(result.cause).toBe('Something went wrong');
  });

  it('should handle complex nested configuration in steps', () => {
    const complexConfig = {
      stringValue: 'test',
      numberValue: 123,
      booleanValue: true,
      nullValue: null,
      arrayValue: [1, 'two', false],
      nestedObject: {
        key: 'value',
        nested: {
          deeper: [{ evenDeeper: true }],
        },
      },
    };

    const mockInput = JSON.stringify({
      steps: [
        {
          plugin: 'complex-plugin',
          configuration: complexConfig,
        },
      ],
    });

    const mockExecution: DescribeExecutionCommandOutput = {
      executionArn: mockExecutionArn,
      status: ExecutionStatus.SUCCEEDED,
      input: mockInput,
      startDate: new Date(),
      $metadata: {},
      stateMachineArn: undefined,
    };

    const result = mapExecutionDetails(mockExecution);

    expect(result.steps[0]?.configuration).toEqual(complexConfig);
  });

  it('gets execution id from ARN', () => {
    const id = 'execution-id';
    const arn = `arn:aws:states:us-west-2:123456789012:execution:MyStateMachine:${id}`;

    expect(getExecutionId(arn)).toEqual(id);
  });

  it('gets constructs execution ARN from id', () => {
    const id = 'execution-id';
    const accountId = `123456789012`;
    const region = 'us-west-2';
    const stateMachineName = 'MyStateMachine';

    const arn = `arn:aws:states:${region}:${accountId}:execution:${stateMachineName}:${id}`;

    process.env[EnvVariable.ACCOUNT_ID] = accountId;
    process.env[EnvVariable.REGION] = region;
    process.env[EnvVariable.GENERATION.WORKFLOW_ARN] =
      `arn:aws:states:us-west-2:123456789012:stateMachine:${stateMachineName}`;

    expect(
      getExecutionArn(
        id,
        getEnvVariable((env) => env.GENERATION.WORKFLOW_ARN),
      ),
    ).toEqual(arn);
  });
});
