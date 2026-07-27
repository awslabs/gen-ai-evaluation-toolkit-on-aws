import { getEnvVariable } from '@common';
import { deleteTestCase } from '@src/datastore/api/handlers/deleteTestCaseLambda';
import { getS3HeadPath } from '@src/datastore/api/helpers';
import { getS3Client } from '@src/datastore/api/utils';
import path from 'path';

jest.mock('@datastore/api/helpers');
jest.mock('@datastore/api/utils');
jest.mock('@common');

describe('deleteTestCase', () => {
  const mockInput = {
    datasetId: 'dataset123',
    testCaseId: 'test123',
  };

  const mockBucketName = 'test-bucket';
  const mockHeadPath = 'datasets/dataset123/head';
  const mockContext = { user: 'some-user' };
  const mockSend = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup default mock implementations
    (getEnvVariable as jest.Mock).mockReturnValue(mockBucketName);
    (getS3Client as jest.Mock).mockReturnValue({ send: mockSend });
    (getS3HeadPath as jest.Mock).mockReturnValue(mockHeadPath);
    mockSend.mockResolvedValue({});
  });

  it('should successfully delete a test case', async () => {
    // Execute
    const result = await deleteTestCase(mockInput, mockContext);

    // Assert
    expect(result).toEqual({});
    expect(getS3HeadPath).toHaveBeenCalledWith('dataset123');
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        input: {
          Bucket: mockBucketName,
          Key: path.join(mockHeadPath, `${mockInput.testCaseId}.json`),
        },
      }),
    );
  });
});
