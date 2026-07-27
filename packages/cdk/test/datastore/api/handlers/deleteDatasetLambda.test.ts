import { getEnvVariable } from '@common';
import { DdbWrapper, DYNAMO_BATCH_WRITE_LIMIT } from '@src/datastore/api/ddb';
import { deleteDatasetOperation } from '@src/datastore/api/handlers/deleteDatasetLambda';
import { freezeDataset, getDataset, listDatasetVersionItems } from '@src/datastore/api/helpers';
import { deleteS3Directory } from '@src/datastore/api/utils';

jest.mock('@src/datastore/api/ddb');
jest.mock('@src/datastore/api/utils/s3');
jest.mock('@common');
jest.mock('@src/datastore/api/helpers/getEntityHelpers');
jest.mock('@src/datastore/api/helpers/listEntitiesHelpers');
jest.mock('@src/datastore/api/helpers/dataset');

describe('deleteDatasetOperation', () => {
  const mockDatasetId = 'test-dataset-123';
  const mockEnvValue = 'env-value';
  const mockDataset = { id: mockDatasetId, name: 'Test Dataset' };
  const mockContext = { user: 'some-user' };

  const mockDeleteItems = jest.fn();
  const mockDeleteItem = jest.fn();
  const mockUpdateItem = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    (DdbWrapper.getInstance as jest.Mock).mockReturnValue({
      deleteItems: mockDeleteItems,
      deleteItem: mockDeleteItem,
      updateItem: mockUpdateItem,
    });

    (getDataset as jest.Mock).mockResolvedValue(mockDataset);
    (getEnvVariable as jest.Mock).mockReturnValue(mockEnvValue);
    (deleteS3Directory as jest.Mock).mockResolvedValue(undefined);
    (listDatasetVersionItems as jest.Mock).mockImplementation(async function* () {});
  });

  it('should successfully delete dataset with no versions', async () => {
    await deleteDatasetOperation({ datasetId: mockDatasetId }, mockContext);

    expect(getDataset).toHaveBeenCalledWith(mockDatasetId);
    expect(freezeDataset).toHaveBeenCalledWith(mockDatasetId);
    expect(listDatasetVersionItems).toHaveBeenCalledWith(mockDatasetId);
    expect(mockDeleteItem).toHaveBeenCalledWith(mockDataset);
    expect(deleteS3Directory).toHaveBeenCalledWith(mockEnvValue, expect.stringContaining(mockDatasetId));
  });

  it('should handle dataset versions deletion in batches', async () => {
    // Mock version items
    const versionItems = Array(DYNAMO_BATCH_WRITE_LIMIT + 1)
      .fill(null)
      .map((_, i) => ({
        id: `version-${i}`,
        datasetId: mockDatasetId,
      }));

    (listDatasetVersionItems as jest.Mock).mockImplementationOnce(async function* () {
      yield* versionItems;
    });

    await deleteDatasetOperation({ datasetId: mockDatasetId }, mockContext);

    // Expect deleteItems to be called multiple times with correct batch sizes
    expect(mockDeleteItems).toHaveBeenCalledTimes(2);
    expect(mockDeleteItems.mock.calls[0][0]).toHaveLength(DYNAMO_BATCH_WRITE_LIMIT);
    expect(mockDeleteItems.mock.calls[1][0]).toHaveLength(1);
  });

  it('should handle non-existent dataset gracefully', async () => {
    (getDataset as jest.Mock).mockRejectedValue(new Error('Dataset not found'));
    let result = await deleteDatasetOperation({ datasetId: mockDatasetId }, mockContext);
    expect(result).toEqual({});

    (getDataset as jest.Mock).mockResolvedValue(null);
    result = await deleteDatasetOperation({ datasetId: mockDatasetId }, mockContext);
    expect(result).toEqual({});

    expect(mockDeleteItems).not.toHaveBeenCalled();
    expect(mockDeleteItem).not.toHaveBeenCalled();
    expect(deleteS3Directory).not.toHaveBeenCalled();
  });
});
