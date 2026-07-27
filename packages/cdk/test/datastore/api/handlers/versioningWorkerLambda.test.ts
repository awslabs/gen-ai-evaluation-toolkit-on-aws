import { Dataset, DatasetStatus } from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import { DdbWrapper } from '@datastore/api/ddb';
import * as helpers from '@datastore/api/helpers';
import { EntityType } from '@datastore/api/types';
import * as utils from '@datastore/api/utils';
import { handler } from '@src/datastore/api/handlers/versioningWorkerLambda';
import { SQSEvent } from 'aws-lambda';
import { getEnvVariable } from '@common';

// Mock the log utility
const mockLogInfo = jest.fn();
const mockLogError = jest.fn();
jest.mock('@datastore/api/utils/logUtils', () => ({
  log: {
    info: (...props: unknown[]) => mockLogInfo(...props),
    error: (...props: unknown[]) => mockLogError(...props),
  },
}));

jest.mock('@datastore/api/helpers');
jest.mock('@datastore/api/ddb');
jest.mock('@datastore/api/utils');
jest.mock('@common');

describe('handler', () => {
  const mockDataset: Partial<Dataset> = {
    datasetId: '31520ca5-3e30-46d8-b179-acf73cccf2f5', // Random UUID v4
    status: DatasetStatus.FROZEN,
    currentVersion: 1,
  };

  const mockEvent = {
    Records: [
      {
        body: JSON.stringify({
          datasetId: mockDataset.datasetId,
          triggeredBy: 'test-user',
        }),
      },
    ],
  } as unknown as SQSEvent;

  beforeEach(() => {
    jest.clearAllMocks();
    (helpers.getDataset as jest.Mock).mockResolvedValue(mockDataset);
    (getEnvVariable as jest.Mock).mockReturnValue('test-bucket');
    (utils.copyS3Directory as jest.Mock).mockResolvedValue(undefined);
    (DdbWrapper.getInstance as jest.Mock).mockReturnValue({
      putItem: jest.fn().mockResolvedValue(undefined),
      updateItem: jest.fn().mockResolvedValue(undefined),
    });
  });

  it('should successfully create new version and update dataset', async () => {
    await handler(mockEvent);

    expect(utils.copyS3Directory).toHaveBeenCalled();
    expect(DdbWrapper.getInstance().putItem).toHaveBeenCalledWith(
      expect.objectContaining({
        datasetId: mockDataset.datasetId,
        version: 2,
      }),
    );
    expect(DdbWrapper.getInstance().updateItem).toHaveBeenCalledWith(
      'DATASET',
      mockDataset.datasetId,
      expect.objectContaining({
        status: DatasetStatus.ACTIVE,
        currentVersion: 2,
      }),
    );
    expect(utils.deleteS3Directory).not.toHaveBeenCalled();
  });

  it('should throw error if dataset does not exist', async () => {
    (helpers.getDataset as jest.Mock).mockResolvedValue(null);

    await expect(handler(mockEvent)).rejects.toThrow();
  });

  it('should throw error if dataset is not frozen', async () => {
    (helpers.getDataset as jest.Mock).mockResolvedValue({
      ...mockDataset,
      status: DatasetStatus.ACTIVE,
    });

    await expect(handler(mockEvent)).rejects.toThrow();
  });

  it('should handle S3 copy failure', async () => {
    (utils.copyS3Directory as jest.Mock).mockRejectedValue(new Error('Copy failed'));

    await handler(mockEvent);

    expect(utils.deleteS3Directory).toHaveBeenCalled();
    expect(DdbWrapper.getInstance().updateItem).toHaveBeenCalledWith(EntityType.DATASET, mockDataset.datasetId, {
      status: DatasetStatus.ACTIVE,
    });
  });

  it('should handle dataset with no current version', async () => {
    (helpers.getDataset as jest.Mock).mockResolvedValue({
      ...mockDataset,
      currentVersion: undefined,
    });

    await handler(mockEvent);

    expect(DdbWrapper.getInstance().putItem).toHaveBeenCalledWith(
      expect.objectContaining({
        version: 1,
      }),
    );
  });
});
