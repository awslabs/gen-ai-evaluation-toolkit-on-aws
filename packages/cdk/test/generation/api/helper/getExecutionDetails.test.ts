import { StepFunctionJobStatus } from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import { ExecutionStatus, SFNClient } from '@aws-sdk/client-sfn';
import { getExecutionDetails } from '@generation/api/helper/getExecutionDetails';
import { mapExecutionDetails } from '@generation/api/helper/mapExecution';
import { sfnClient } from '@src/common';

jest.mock('@src/common');
jest.mock('@src/generation/api/helper/mapExecution');

describe('getExecutionDetails', () => {
  const mockSend = jest.fn();

  beforeAll(() => {
    jest.mocked(sfnClient).mockReturnValue({ send: mockSend } as unknown as SFNClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch execution details and map them correctly', async () => {
    // Mock execution ARN
    const executionArn = 'arn:aws:states:us-east-1:123456789012:execution:MyStateMachine:execution1';

    // Mock Step Functions response
    const mockExecutionDetails = {
      executionArn,
      status: ExecutionStatus.SUCCEEDED,
      startDate: new Date('2025-03-28T10:00:00Z'),
      stopDate: new Date('2025-03-28T10:05:00Z'),
      input: JSON.stringify({
        name: 'Test Execution',
        steps: [{ plugin: 'test-plugin', configuration: { param1: 'value1' } }],
      }),
    };

    // Mock the expected output after mapping
    const expectedOutput = {
      id: executionArn,
      status: StepFunctionJobStatus.SUCCEEDED,
      createdAt: mockExecutionDetails.startDate,
      stoppedAt: mockExecutionDetails.stopDate,
      name: 'Test Execution',
      steps: [{ plugin: 'test-plugin', configuration: { param1: 'value1' } }],
    };

    // Setup the SFN client mock to return our mock execution details
    mockSend.mockResolvedValue(mockExecutionDetails);

    // Setup the mapExecutionDetails mock to return our expected output
    (mapExecutionDetails as jest.Mock).mockReturnValue(expectedOutput);

    // Call the function being tested
    const result = await getExecutionDetails(executionArn);

    // Verify the SFN client was called with the correct parameters
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ input: { executionArn } }));

    // Verify mapExecutionDetails was called with the correct parameters
    expect(mapExecutionDetails).toHaveBeenCalledWith(mockExecutionDetails);

    // Verify the result matches our expected output
    expect(result).toEqual(expectedOutput);
  });

  it('should handle errors from the SFN client', async () => {
    // Mock execution ARN
    const executionArn = 'arn:aws:states:us-east-1:123456789012:execution:MyStateMachine:execution1';

    // Setup the SFN client mock to throw an error
    const error = new Error('SFN client error');
    mockSend.mockRejectedValue(error);

    // Call the function being tested and expect it to throw
    await expect(getExecutionDetails(executionArn)).rejects.toThrow('SFN client error');

    // Verify the SFN client was called with the correct parameters
    expect(mockSend).toHaveBeenCalledTimes(1);

    // Verify mapExecutionDetails was not called
    expect(mapExecutionDetails).not.toHaveBeenCalled();
  });

  it('should handle missing execution details in response', async () => {
    // Mock execution ARN
    const executionArn = 'arn:aws:states:us-east-1:123456789012:execution:MyStateMachine:execution1';

    // Mock Step Functions response with missing fields
    const mockIncompleteExecutionDetails = {
      // Missing executionArn and other required fields
    };

    // Setup the SFN client mock to return incomplete execution details
    mockSend.mockResolvedValue(mockIncompleteExecutionDetails);

    // Setup the mapExecutionDetails mock to throw an error due to missing fields
    (mapExecutionDetails as jest.Mock).mockImplementation(() => {
      throw new Error('Execution ARN missing');
    });

    // Call the function being tested and expect it to throw
    await expect(getExecutionDetails(executionArn)).rejects.toThrow('Execution ARN missing');
  });
});
