import { listDatasetVersionsOperation } from '@datastore/api/handlers';
import { StringEnumLogicalComparator } from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';

const mockListDatasetVersions = jest.fn();
jest.mock('@datastore/api/helpers', () => ({
  listDatasetVersions: (...props: unknown[]) => mockListDatasetVersions(...props),
}));

const mockDatasetId = 'test-id';
const mockDatasetVersions = [
  {
    datasetId: mockDatasetId,
    version: 0,
    createdAt: '2023-12-20T10:00:00Z',
    createdBy: 'someone',
    s3Location: 'some-s3-location',
    annotations: { 'some-annotation': { value: 'value', annotatedAt: Date.now(), annotatedBy: 'some-user' } },
  },
  {
    datasetId: mockDatasetId,
    version: 1,
    createdAt: '2023-12-21T10:00:00Z',
    createdBy: 'someone',
    s3Location: 'some-s3-location',
  },
  {
    datasetId: mockDatasetId,
    version: 2,
    createdAt: '2023-12-22T10:00:00Z',
    createdBy: 'someone',
    s3Location: undefined,
  },
];

describe('listDatasetVersionsOperation', () => {
  const mockContext = { user: 'mock-user' };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should successfully list the versions of the given dataset', async () => {
    mockListDatasetVersions.mockResolvedValue({
      entities: mockDatasetVersions,
      lastEvaluatedSk: undefined,
    });

    const result = await listDatasetVersionsOperation({ datasetId: mockDatasetId }, mockContext);

    expect(result).toEqual({
      versions: mockDatasetVersions.map((version) => ({
        ...version,
        createdAt: new Date(version.createdAt),
        annotations: version.annotations
          ? Object.entries(version.annotations).map(([name, annotationContent]) => ({
              name,
              ...annotationContent,
              annotatedAt: new Date(annotationContent.annotatedAt),
            }))
          : undefined,
      })),
      nextToken: undefined,
    });
    expect(mockListDatasetVersions).toHaveBeenCalledWith({
      datasetId: mockDatasetId,
      maxResults: undefined,
      lastEvaluatedEntitySk: undefined,
    });
  });

  it('should support pagination', async () => {
    const maxItems = 2;
    const mockFirstPage = mockDatasetVersions.slice(0, maxItems);
    const mockSecondPage = mockDatasetVersions.slice(mockFirstPage.length, mockFirstPage.length + maxItems);
    mockListDatasetVersions
      .mockResolvedValueOnce({
        entities: mockFirstPage,
        lastEvaluatedSk: mockFirstPage[mockFirstPage.length - 1]!.datasetId,
      })
      .mockResolvedValueOnce({
        entities: mockSecondPage,
        lastEvaluatedSk: undefined,
      });

    const firstPage = await listDatasetVersionsOperation(
      { datasetId: mockDatasetId, maxResults: maxItems },
      mockContext,
    );

    expect(firstPage).toEqual({
      versions: mockFirstPage.map((version) => ({
        ...version,
        createdAt: new Date(version.createdAt),
        annotations: version.annotations
          ? Object.entries(version.annotations).map(([name, annotationContent]) => ({
              name,
              ...annotationContent,
              annotatedAt: new Date(annotationContent.annotatedAt),
            }))
          : undefined,
      })),
      nextToken: mockFirstPage[mockFirstPage.length - 1]!.datasetId,
    });
    expect(mockListDatasetVersions).toHaveBeenLastCalledWith({
      datasetId: mockDatasetId,
      maxResults: maxItems,
      lastEvaluatedEntitySk: undefined,
    });

    const secondPage = await listDatasetVersionsOperation(
      { datasetId: mockDatasetId, maxResults: maxItems },
      mockContext,
    );

    expect(secondPage).toEqual({
      versions: mockSecondPage.map((version) => ({
        ...version,
        createdAt: new Date(version.createdAt),
        annotations: version.annotations
          ? Object.entries(version.annotations).map(([name, annotationContent]) => ({
              name,
              ...annotationContent,
              annotatedAt: new Date(annotationContent.annotatedAt),
            }))
          : undefined,
      })),
      nextToken: undefined,
    });
    expect(mockListDatasetVersions).toHaveBeenLastCalledWith({
      datasetId: mockDatasetId,
      maxResults: maxItems,
      lastEvaluatedEntitySk: undefined,
    });
  });

  it('should support filtering', async () => {
    mockListDatasetVersions.mockResolvedValue({
      entities: mockDatasetVersions,
      lastEvaluatedSk: undefined,
    });
    const filter = {
      condition: {
        stringEnumCondition: {
          name: 'someAnnotation',
          comparator: StringEnumLogicalComparator.EQUAL_TO,
          value: 'someValue',
        },
      },
    };

    const result = await listDatasetVersionsOperation({ datasetId: mockDatasetId, filter }, mockContext);

    expect(result).toEqual({
      versions: mockDatasetVersions.map((version) => ({
        ...version,
        createdAt: new Date(version.createdAt),
        annotations: version.annotations
          ? Object.entries(version.annotations).map(([name, annotationContent]) => ({
              name,
              ...annotationContent,
              annotatedAt: new Date(annotationContent.annotatedAt),
            }))
          : undefined,
      })),
      nextToken: undefined,
    });
    expect(mockListDatasetVersions).toHaveBeenCalledWith({
      datasetId: mockDatasetId,
      maxResults: undefined,
      lastEvaluatedEntitySk: undefined,
      conditionExpression: filter,
    });
  });
});
