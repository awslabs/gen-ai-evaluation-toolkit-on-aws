import { getS3Client, omit } from '@datastore/api/utils';
import { createTestCaseOperation } from '@src/datastore/api/handlers/createTestCaseLambda';
import { getDataset, getS3HeadPath, getTestCaseMetadata } from '@src/datastore/api/helpers';
import crypto from 'crypto';
import path from 'path';
import { getEnvVariable } from '@common';

jest.mock('@datastore/api/utils/s3');
jest.mock('@common');
jest.mock('@datastore/api/helpers/getEntityHelpers');

const mockDate = new Date('2025-01-01T00:00:00Z');
const mockEnvValue = 'env-value';
const mockUUID = '123-123-123-123-123-123';
const datasetId = 'dataset-id';

const mockSend = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();

  jest.spyOn(crypto, 'randomUUID').mockReturnValue(mockUUID);
  jest.useFakeTimers({ advanceTimers: false, now: mockDate });

  (getS3Client as jest.Mock).mockReturnValue({ send: mockSend });
  (getEnvVariable as jest.Mock).mockReturnValue(mockEnvValue);
  (getDataset as jest.Mock).mockResolvedValue({ datasetId }); // return value is not really used
});

describe('createTestCaseOperation', () => {
  const mockContext = { user: 'some-user' };
  const input = { datasetId, input: 'some-input', expected: 'some-output' };

  test('it creates a new test case', async () => {
    const output = await createTestCaseOperation(input, mockContext);

    expect(getTestCaseMetadata).not.toHaveBeenCalled();
    expect(mockSend).toHaveBeenCalledTimes(1);

    const sendInput = mockSend.mock.calls[0][0].input;
    expect(sendInput).toStrictEqual({
      Bucket: mockEnvValue,
      ContentType: 'application/json',
      Key: path.join(getS3HeadPath(datasetId), `${mockUUID}.json`),
      Metadata: {
        'created-at': mockDate.toISOString(),
        'created-by': mockContext.user,
      },
      Body: JSON.stringify(omit(input, ['datasetId'])),
    });

    expect(output).toStrictEqual({
      testCaseId: mockUUID,
      createdAt: mockDate,
      createdBy: mockContext.user,
    });

    expect(getDataset).toHaveBeenCalledWith(datasetId);
  });
});
