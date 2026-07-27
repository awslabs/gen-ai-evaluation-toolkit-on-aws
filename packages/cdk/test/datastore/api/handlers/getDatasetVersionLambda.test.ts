import { VERSION_LATEST } from '@common/config';
import { getDatasetVersionOperation } from '@datastore/api/handlers';

// Mock the log utility
jest.mock('@datastore/api/utils/logUtils', () => ({
  log: {
    info: jest.fn(),
    error: jest.fn(),
  },
}));

const mockGetDatasetVersion = jest.fn();
const mockGetDataset = jest.fn();

jest.mock('@datastore/api/helpers/getEntityHelpers', () => ({
  getDatasetVersion: (...args: unknown[]) => mockGetDatasetVersion(...args),
  getDataset: (...args: unknown[]) => mockGetDataset(...args),
}));

describe('getDatasetVersionOperation', () => {
  const mockContext = { user: 'mock-user' };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should throw error when version is invalid', async () => {
    const datasetId = 'some-id';

    // Invalid versions
    const invalidVersions = ['head', '-1', '0', 'some-other-string'];
    for (const version of invalidVersions) {
      await expect(getDatasetVersionOperation({ datasetId, version }, mockContext)).rejects.toThrow();
    }
  });

  it('should successfully return the dataset version when valid datasetId and version is provided', async () => {
    const input = { datasetId: 'test-id', version: '1' };
    const mockDatasetVersion = {
      datasetId: input.datasetId,
      version: input.version,
      createdAt: '2023-12-20T10:00:00Z',
      createdBy: 'test-source',
      s3Location: 'some-s3-location',
      annotations: { 'some-annotation': { value: 'value', annotatedAt: Date.now(), annotatedBy: 'some-user' } },
    };
    mockGetDatasetVersion.mockResolvedValue(mockDatasetVersion);

    const result = await getDatasetVersionOperation(input, mockContext);

    expect(result).toEqual({
      ...mockDatasetVersion,
      createdAt: new Date(mockDatasetVersion.createdAt),
      annotations: [
        {
          name: 'some-annotation',
          ...mockDatasetVersion.annotations['some-annotation'],
          annotatedAt: new Date(mockDatasetVersion.annotations['some-annotation'].annotatedAt),
        },
      ],
    });
    expect(mockGetDatasetVersion).toHaveBeenCalledWith(input.datasetId, parseInt(input.version));
  });

  it('gets latest version number', async () => {
    const latestVersion = 123;
    mockGetDataset.mockResolvedValue({ currentVersion: latestVersion });

    const datasetId = 'some-id';
    const mockVersion = {
      datasetId: datasetId,
      version: latestVersion,
      createdAt: new Date().toISOString(),
      createdBy: 'test-source',
      s3Location: 'some-s3-location',
    };
    mockGetDatasetVersion.mockResolvedValue(mockVersion);

    const result = await getDatasetVersionOperation({ datasetId, version: VERSION_LATEST }, mockContext);
    expect(result).toStrictEqual({
      ...mockVersion,
      createdAt: new Date(mockVersion.createdAt),
      annotations: undefined,
    });

    expect(mockGetDataset).toHaveBeenCalledTimes(1);
    expect(mockGetDatasetVersion).toHaveBeenCalledWith(datasetId, latestVersion);
  });

  it('fails if dataset has no versions', async () => {
    const datasetId = 'some-id';
    const latestVersion = 0;
    mockGetDataset.mockResolvedValue({ currentVersion: latestVersion });

    await expect(getDatasetVersionOperation({ datasetId, version: VERSION_LATEST }, mockContext)).rejects.toThrow(
      'Dataset has no versions',
    );
  });
});
