import { GetGenerationOutput, StepFunctionJobStatus } from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import { EnvVariable } from '@src/common/config';
import { getGenerationOperation } from '@src/generation/api/handlers/getGenerationLambda';
import { getExecutionDetails } from '@src/generation/api/helper/getExecutionDetails';
import { HandlerContext } from '@common/api/apiGateway';

jest.mock('@src/generation/api/helper/getExecutionDetails');

describe('getGenerationOperation', () => {
  const mockNow = new Date('2024-01-01T12:00:00Z');
  const context: HandlerContext = { user: 'user-name', requestTime: mockNow };

  beforeEach(() => {
    jest.resetAllMocks();

    process.env[EnvVariable.ACCOUNT_ID] = '123456789012';
    process.env[EnvVariable.REGION] = 'us-west-2';
    process.env[EnvVariable.GENERATION.WORKFLOW_ARN] =
      `arn:aws:states:us-west-2:123456789012:stateMachine:MyStateMachine`;
  });

  it('should call getExecutionDetails with the provided ID and return the result', async () => {
    const executionId = 'execution-id';
    const mockExecutionArn = `arn:aws:states:us-west-2:123456789012:execution:MyStateMachine:${executionId}`;
    const mockExecutionDetails: GetGenerationOutput = {
      id: executionId,
      status: StepFunctionJobStatus.SUCCEEDED,
      createdAt: new Date(),
      steps: [],
    };

    jest.mocked(getExecutionDetails).mockResolvedValue(mockExecutionDetails);

    const result = await getGenerationOperation({ id: executionId }, context);

    expect(getExecutionDetails).toHaveBeenCalledWith(mockExecutionArn);

    expect(result).toEqual(mockExecutionDetails);
  });
});
