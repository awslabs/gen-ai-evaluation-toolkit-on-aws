import { createDatasetOperation } from '@datastore/api/handlers';

// Mock the log utility
const mockLogInfo = jest.fn();
jest.mock('@datastore/api/utils/logUtils', () => ({
  log: {
    info: (...props: unknown[]) => mockLogInfo(...props),
  },
}));

// Mock the createDataset function
const mockCreateDataset = jest.fn();
jest.mock('@datastore/api/helpers/createOrUpdateEntityHelpers', () => ({
  createDataset: (...props: unknown[]) => mockCreateDataset(...props),
}));

describe('createDatasetOperation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should successfully create a dataset and return the correct output', async () => {
    const mockInput = {
      name: 'Test Dataset',
      description: 'Test Description',
    };

    const mockContext = {
      user: 'testUser',
    };

    const mockDatasetResponse = {
      datasetId: 'dataset-123',
      name: 'Test Dataset',
      description: 'Test Description',
      createdAt: new Date('2023-12-20T10:00:00Z'),
      source: 'some-source',
      currentVersion: undefined,
    };

    mockCreateDataset.mockResolvedValue(mockDatasetResponse);

    const result = await createDatasetOperation(mockInput, mockContext);

    expect(mockCreateDataset).toHaveBeenCalledWith(mockInput.name, mockContext.user, mockInput.description);

    expect(result).toEqual(mockDatasetResponse);

    expect(mockLogInfo).toHaveBeenCalledWith('Creating dataset Test Dataset');
    expect(mockLogInfo).toHaveBeenCalledWith(
      `Successfully Created dataset ${mockDatasetResponse.name} with id ${mockDatasetResponse.datasetId}`,
    );
  });

  it('should handle missing description', async () => {
    const mockInput = {
      name: 'Test Dataset',
    };

    const mockContext = {
      user: 'testUser',
    };

    const mockDatasetResponse = {
      datasetId: 'dataset-123',
      name: 'Test Dataset',
      description: undefined,
      createdAt: new Date('2023-12-20T10:00:00Z'),
      source: 'some-source',
      currentVersion: undefined,
    };

    mockCreateDataset.mockResolvedValue(mockDatasetResponse);

    const result = await createDatasetOperation(mockInput, mockContext);

    expect(mockCreateDataset).toHaveBeenCalledWith(mockInput.name, mockContext.user, undefined);

    expect(result.description).toBeUndefined();
  });

  it('should throw an error when createDataset fails', async () => {
    const mockInput = {
      name: 'Test Dataset',
    };

    const mockContext = {
      user: 'testUser',
    };

    const error = new Error('Failed to create dataset');
    mockCreateDataset.mockRejectedValue(error);

    await expect(createDatasetOperation(mockInput, mockContext)).rejects.toThrow(error.message);
  });
});
