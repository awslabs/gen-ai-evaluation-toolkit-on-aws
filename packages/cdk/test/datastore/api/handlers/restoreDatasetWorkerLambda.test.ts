import { Dataset, DatasetStatus } from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import { DdbWrapper } from '@src/datastore/api/ddb';
import { handler } from '@src/datastore/api/handlers/restoreDatasetWorkerLambda';
import { getDataset } from '@src/datastore/api/helpers';
import { EntityType, TriggerRollbackMessage } from '@src/datastore/api/types';
import { copyS3Directory, deleteS3Directory } from '@src/datastore/api/utils';
import { SQSEvent } from 'aws-lambda';
import { getEnvVariable } from '@common';

jest.mock('@datastore/api/helpers/getEntityHelpers');
jest.mock('@datastore/api/utils');
jest.mock('@common');

describe('handler', () => {
  const mockDataset: Partial<Dataset> = {
    datasetId: '31520ca5-3e30-46d8-b179-acf73cccf2f5', // Random UUID v4
    status: DatasetStatus.FROZEN,
    currentVersion: 5,
  };

  const mockDdbWrapper = { updateItem: jest.fn() };

  const mockMessage: TriggerRollbackMessage = {
    datasetId: '31520ca5-3e30-46d8-b179-acf73cccf2f5',
    targetVersion: 2,
    triggeredBy: 'test-user',
  };

  const mockEvent = { Records: [{ body: JSON.stringify(mockMessage) }] } as unknown as SQSEvent;

  beforeEach(() => {
    jest.clearAllMocks();
    (getEnvVariable as jest.Mock).mockReturnValue('env-value');

    (copyS3Directory as jest.Mock).mockResolvedValue(undefined);
    (deleteS3Directory as jest.Mock).mockResolvedValue(undefined);

    (getDataset as jest.Mock).mockResolvedValue(mockDataset);
    jest.spyOn(DdbWrapper, 'getInstance').mockReturnValue(mockDdbWrapper as unknown as DdbWrapper);
    mockDdbWrapper.updateItem.mockResolvedValue({});
  });

  it('should successfully rollback dataset to target version', async () => {
    await handler(mockEvent);

    expect(deleteS3Directory).toHaveBeenCalledTimes(3); // head backup clear, head clear, final backup clear
    expect(copyS3Directory).toHaveBeenCalledTimes(2); // backup creation, version to head
    expect(DdbWrapper.getInstance().updateItem).toHaveBeenCalledWith(EntityType.DATASET, mockDataset.datasetId, {
      status: DatasetStatus.ACTIVE,
    });
  });

  it('should restore backup if rollback fails', async () => {
    (copyS3Directory as jest.Mock)
      .mockResolvedValueOnce(undefined) // First call succeeds (backup creation)
      .mockRejectedValueOnce(new Error('Copy failed')); // Second call fails (version to head)

    await handler(mockEvent);

    expect(deleteS3Directory).toHaveBeenCalledTimes(4); // head backup clear, head clear, dirty head clear, head backup clear
    expect(copyS3Directory).toHaveBeenCalledTimes(3); // backup creation, failed copy, restore
    expect(DdbWrapper.getInstance().updateItem).toHaveBeenCalledWith(EntityType.DATASET, mockDataset.datasetId, {
      status: DatasetStatus.ACTIVE,
    });
  });

  it('should throw error for invalid target version', async () => {
    (getDataset as jest.Mock).mockResolvedValue({ ...mockDataset, currentVersion: 1 });
    await expect(handler(mockEvent)).rejects.toThrow('Version 2 does not exist');

    (getDataset as jest.Mock).mockResolvedValue({ ...mockDataset, currentVersion: undefined });
    await expect(handler(mockEvent)).rejects.toThrow('Version 2 does not exist');
  });

  it('should throw error for non-frozen dataset', async () => {
    (getDataset as jest.Mock).mockResolvedValue({ ...mockDataset, status: DatasetStatus.ACTIVE });
    await expect(handler(mockEvent)).rejects.toThrow('Dataset is not frozen');
  });
});
