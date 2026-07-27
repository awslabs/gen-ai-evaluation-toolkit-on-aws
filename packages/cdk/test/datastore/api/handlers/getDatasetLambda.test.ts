import { getDatasetOperation } from '@datastore/api/handlers';

// Mock the log utility
const mockLogInfo = jest.fn();
const mockLogError = jest.fn();
jest.mock('@common/api/utils/logUtils', () => ({
  log: {
    info: (...props: unknown[]) => mockLogInfo(...props),
    error: (...props: unknown[]) => mockLogError(...props),
  },
}));

const mockGetDataset = jest.fn();
jest.mock('@datastore/api/helpers/getEntityHelpers', () => ({
  getDataset: (...props: unknown[]) => mockGetDataset(...props),
}));

describe('getDatasetOperation', () => {
  const mockContext = { user: 'mock-user' };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should throw validation error when datasetId is not provided', async () => {
    const input = { datasetId: '' };

    await expect(getDatasetOperation(input, mockContext)).rejects.toThrow('Required input "datasetId" not found');

    expect(mockLogError).toHaveBeenCalledWith('Required input "datasetId" not found');
  });

  it('should successfully return dataset when valid datasetId is provided', async () => {
    const input = { datasetId: 'test-id' };
    const mockDataset = {
      datasetId: 'test-id',
      name: 'Test Dataset',
      description: 'Test Description',
      createdAt: '2023-12-20T10:00:00Z',
      source: 'test-source',
      currentVersion: '1.0',
      status: 'ACTIVE',
    };
    mockGetDataset.mockResolvedValue(mockDataset);

    const result = await getDatasetOperation(input, mockContext);

    expect(result).toEqual({
      ...mockDataset,
      createdAt: new Date(mockDataset.createdAt),
    });
    expect(mockGetDataset).toHaveBeenCalledWith('test-id');
  });
});
