import { batchCreateTestCaseHandler } from '@plugins/datastoreExport/lambdas';
import { TestCaseSchema } from '@datastore/api/validation';
import { getS3Client } from '@common/api/utils/s3';
import { logErrorAndThrowUnprocessableEntity } from '@common/api/exceptions/serviceExceptions';
import { GenAiEvaluationToolkitClient } from '@awssolutions/gen-ai-evaluation-toolkit-ts-client';
import { EnvVariable } from '@common/config';

// Mock external dependencies
jest.mock('@common/api/utils');

jest.mock('@datastore/api/validation');

jest.mock('@common/api/exceptions/serviceExceptions');
const mockLogErrorAndThrowUnprocessableEntity = logErrorAndThrowUnprocessableEntity as jest.MockedFn<
  typeof logErrorAndThrowUnprocessableEntity
>;
mockLogErrorAndThrowUnprocessableEntity.mockImplementation(() => {
  throw new Error('Unprocessable entity');
});

// Mock S3 client
jest.mock('@common/api/utils/s3');
const mockS3Send = jest.fn();
const mockS3Client = {
  send: (...props: unknown[]) => mockS3Send(...props),
};
(getS3Client as jest.Mock).mockReturnValue(mockS3Client);

// Mock GenAiETK client
const mockSend = jest.fn();
GenAiEvaluationToolkitClient.prototype.send = mockSend;

const mockUrl = 'https://genai-etk-api.example.com';
jest.mock('@common', () => ({
  ...jest.requireActual('@common'),
  getEnvVariable: (env: string) => (env === EnvVariable.GENAI_ETK_URL ? mockUrl : env),
}));

describe('createTestCaseLambda handler', () => {
  const mockEvent = {
    bucket: 'test-bucket',
    objectKeys: ['test-object-key-1.json', 'test-object-key-2.json', 'test-object-key-3.json'],
    datasetId: 'test-dataset-id',
  };

  const mockTestCaseContents = mockEvent.objectKeys.map((key) => ({
    name: `Test Case in ${key}`,
    description: 'Test case description',
    inputs: { input1: 'value1' },
    expectedOutputs: { output1: 'expected1' },
  }));

  const mockTestCaseId = 'test-case-id-123';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should successfully create a test cases', async () => {
    mockTestCaseContents.forEach((mockContent) => {
      mockS3Send.mockResolvedValueOnce({
        Body: {
          transformToString: jest.fn().mockResolvedValue(JSON.stringify(mockContent)),
        },
      });
    });
    (TestCaseSchema.parse as jest.Mock).mockImplementation((obj: unknown) => obj);

    // Mock GenAiETK client response
    const mockGenAiETKResponse = { testCaseId: mockTestCaseId };
    mockSend.mockResolvedValue(mockGenAiETKResponse);

    await batchCreateTestCaseHandler(mockEvent);

    // Verify S3 object was retrieved
    expect(mockS3Send).toHaveBeenCalledTimes(mockEvent.objectKeys.length);
    mockEvent.objectKeys.forEach((key, idx) => {
      expect(mockS3Send).toHaveBeenNthCalledWith(
        idx + 1,
        expect.objectContaining({
          input: {
            Bucket: mockEvent.bucket,
            Key: key,
          },
        }),
      );
      expect(TestCaseSchema.parse).toHaveBeenCalledWith(mockTestCaseContents[idx]);
    });

    // Verify GenAiETK client was called with correct parameters
    expect(mockSend).toHaveBeenCalledTimes(mockEvent.objectKeys.length);
    mockEvent.objectKeys.forEach((_key, idx) =>
      expect(mockSend).toHaveBeenNthCalledWith(
        idx + 1,
        expect.objectContaining({
          input: {
            datasetId: mockEvent.datasetId,
            ...mockTestCaseContents[idx],
          },
        }),
      ),
    );
  });

  it('should throw an error when S3 object is empty', async () => {
    // Mock empty S3 object
    mockS3Send.mockResolvedValue({
      Body: {
        transformToString: jest.fn().mockResolvedValue(null),
      },
    });

    await expect(batchCreateTestCaseHandler(mockEvent)).rejects.toThrow('Unprocessable entity');
  });

  it('should throw an error when test case content is invalid', async () => {
    // Mock S3 object with invalid content
    mockS3Send.mockResolvedValue({
      Body: {
        transformToString: jest.fn().mockResolvedValue('{"invalid": "content"}'),
      },
    });

    // Mock schema validation error
    const validationError = new Error('Invalid test case schema');
    (TestCaseSchema.parse as jest.Mock).mockImplementation(() => {
      throw validationError;
    });

    await expect(batchCreateTestCaseHandler(mockEvent)).rejects.toThrow();
  });
});
