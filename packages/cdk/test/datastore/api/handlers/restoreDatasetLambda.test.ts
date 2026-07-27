import { DatasetStatus } from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { SQSClient } from '@aws-sdk/client-sqs';
import { DdbWrapper } from '@datastore/api/ddb';
import { getDataset } from '@datastore/api/helpers';
import { DatasetDdbItem, EntityType } from '@datastore/api/types';
import { restoreDatasetOperation } from '@src/datastore/api/handlers/restoreDatasetLambda';
import { DdbConditionalOperators } from '@common/dynamoUtils';

jest.mock('@datastore/api/helpers');
jest.mock('@datastore/api/utils', () => ({
  assertRequiredEnvVariables: jest.fn(),
  log: { info: jest.fn() },
}));
jest.mock('@common/utils', () => ({
  getEnvVariable: () => 'env-value',
}));

jest.mock('aws-xray-sdk-core', () => ({ captureAWSv3Client: (e: unknown) => e }));
jest.mock('@aws-sdk/client-sqs');

describe('restoreDatasetLambda', () => {
  const mockContext = { user: '123' };

  const mockDdbWrapper = { updateItem: jest.fn() };

  const mockSqsSendResponse = { MessageId: 'asdf', $metadata: { requestId: '123' } };
  const mockSqsClient = { send: jest.fn(() => Promise.resolve(mockSqsSendResponse)) };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(DdbWrapper, 'getInstance').mockReturnValue(mockDdbWrapper as unknown as DdbWrapper);

    (SQSClient as jest.Mock).mockImplementation(() => mockSqsClient);
    mockDdbWrapper.updateItem.mockResolvedValue({});
  });

  it('should throw if dataset is frozen', async () => {
    (getDataset as jest.Mock).mockResolvedValue({ datasetId: 'test-id', currentVersion: 3 });
    mockDdbWrapper.updateItem.mockRejectedValue(
      new ConditionalCheckFailedException({ message: 'exception failed', $metadata: {} }),
    );

    await expect(restoreDatasetOperation({ datasetId: 'test-id', version: 1 }, mockContext)).rejects.toThrow(
      'Dataset is frozen',
    );
  });

  it('should process valid request successfully', async () => {
    const mockDataset: Partial<DatasetDdbItem> = {
      datasetId: 'test-id',
      currentVersion: 3,
      name: 'dataset',
      status: DatasetStatus.ACTIVE,
      createdAt: Date.now(),
    };
    (getDataset as jest.Mock).mockResolvedValue(mockDataset);

    const response = await restoreDatasetOperation({ datasetId: mockDataset.datasetId!, version: 1 }, mockContext);
    expect(response.dataset).toStrictEqual({
      ...mockDataset,
      status: DatasetStatus.FROZEN,
      createdAt: new Date(mockDataset.createdAt!),
    });
    expect(response.asyncContext).toStrictEqual({
      messageId: mockSqsSendResponse.MessageId,
      requestId: mockSqsSendResponse.$metadata.requestId,
    });

    expect(mockDdbWrapper.updateItem).toHaveBeenCalledWith(
      EntityType.DATASET,
      mockDataset.datasetId,
      { status: DatasetStatus.FROZEN },
      {
        condition: {
          key: 'status',
          operator: DdbConditionalOperators.EQUAL_TO,
          values: [DatasetStatus.ACTIVE],
        },
      },
    );

    expect(mockSqsClient.send).toHaveBeenCalled();
  });

  it('should throw if version is invalid', async () => {
    (getDataset as jest.Mock).mockResolvedValue({});
    await expect(restoreDatasetOperation({ datasetId: 'test-id', version: 5 }, mockContext)).rejects.toThrow(
      'Version 5 does not exist',
    );
  });

  it('should throw update errors', async () => {
    (getDataset as jest.Mock).mockResolvedValue({ datasetId: 'test-id', currentVersion: 3 });

    const err = new Error();
    mockDdbWrapper.updateItem.mockRejectedValue(err);

    await expect(restoreDatasetOperation({ datasetId: 'test-id', version: 1 }, mockContext)).rejects.toThrow(err);
  });
});
