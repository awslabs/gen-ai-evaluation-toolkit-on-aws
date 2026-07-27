import { listDatasetsOperation } from '@datastore/api/handlers';

// Mock the log utility
const mockLogInfo = jest.fn();
const mockLogError = jest.fn();
jest.mock('@datastore/api/utils', () => ({
  log: {
    info: (...props: unknown[]) => mockLogInfo(...props),
    error: (...props: unknown[]) => mockLogError(...props),
  },
}));

const mockListDatasets = jest.fn();
jest.mock('@datastore/api/helpers', () => ({
  listDatasets: (...props: unknown[]) => mockListDatasets(...props),
}));

const mockDatasets = [
  {
    datasetId: 'test-id',
    name: 'Test Dataset',
    description: 'Test Description',
    createdAt: '2023-12-20T10:00:00Z',
    source: 'test-source',
    currentVersion: '1.0',
    status: 'ACTIVE',
  },
  {
    datasetId: 'test-id',
    name: 'Test Dataset',
    description: 'Test Description',
    createdAt: '2023-12-20T10:00:00Z',
    source: 'test-source',
    currentVersion: '1.0',
    status: 'ACTIVE',
  },
  {
    datasetId: 'test-id',
    name: 'Test Dataset',
    description: 'Test Description',
    createdAt: '2023-12-20T10:00:00Z',
    source: 'test-source',
    currentVersion: '1.0',
    status: 'ACTIVE',
  },
];

describe('listDatasetsOperation', () => {
  const mockContext = { user: 'mock-user' };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should successfully list datasets', async () => {
    mockListDatasets.mockResolvedValue({
      entities: mockDatasets,
      lastEvaluatedSk: undefined,
    });

    const result = await listDatasetsOperation({}, mockContext);

    expect(result).toEqual({
      datasets: mockDatasets.map((dataset) => ({ ...dataset, createdAt: new Date(dataset.createdAt) })),
      nextToken: undefined,
    });
    expect(mockListDatasets).toHaveBeenCalledWith({
      maxResults: undefined,
      lastEvaluatedEntitySk: undefined,
    });
  });

  it('should support pagination', async () => {
    const maxItems = 2;
    const mockFirstPage = mockDatasets.slice(0, maxItems);
    const mockSecondPage = mockDatasets.slice(mockFirstPage.length, mockFirstPage.length + maxItems);
    mockListDatasets
      .mockResolvedValueOnce({
        entities: mockFirstPage,
        lastEvaluatedSk: mockFirstPage[mockFirstPage.length - 1]!.datasetId,
      })
      .mockResolvedValueOnce({
        entities: mockSecondPage,
        lastEvaluatedSk: undefined,
      });

    const firstPage = await listDatasetsOperation({ maxResults: maxItems }, mockContext);

    expect(firstPage).toEqual({
      datasets: mockFirstPage.map((dataset) => ({ ...dataset, createdAt: new Date(dataset.createdAt) })),
      nextToken: mockFirstPage[mockFirstPage.length - 1]!.datasetId,
    });
    expect(mockListDatasets).toHaveBeenLastCalledWith({
      maxResults: maxItems,
      lastEvaluatedEntitySk: undefined,
    });

    const secondPage = await listDatasetsOperation({ maxResults: maxItems }, mockContext);

    expect(secondPage).toEqual({
      datasets: mockSecondPage.map((dataset) => ({ ...dataset, createdAt: new Date(dataset.createdAt) })),
      nextToken: undefined,
    });
    expect(mockListDatasets).toHaveBeenLastCalledWith({
      maxResults: maxItems,
      lastEvaluatedEntitySk: undefined,
    });
  });
});
