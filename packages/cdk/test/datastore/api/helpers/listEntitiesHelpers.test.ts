import { DdbConditionalOperators } from '@common/dynamoUtils';
import {
  getDataset,
  listAnnotationSchemas,
  listDatasets,
  listDatasetVersionItems,
  listDatasetVersions,
  toDdbConditionExpression,
  listTestCaseIdsFromS3,
  filterTestCases,
} from '@datastore/api/helpers';
import { EntityType } from '@datastore/api/types';
import { StringEnumLogicalComparator } from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import { getS3Client, queryDatastoreDdb } from '@datastore/api/utils';
import { getEnvVariable } from '@common';
import { VERSION_HEAD } from '@common/config';

jest.mock('@datastore/api/utils');
const mockQueryDatastoreDdb = queryDatastoreDdb as jest.Mock;
const mockGetS3Client = getS3Client as jest.Mock;

jest.mock('@datastore/api/helpers/annotationFilter');
const mockToDdbConditionExpression = toDdbConditionExpression as jest.Mock;

jest.mock('@datastore/api/helpers/getEntityHelpers');
const mockGetDataset = getDataset as jest.Mock;

jest.mock('@common');
const mockGetEnvVariable = getEnvVariable as jest.Mock;
mockGetEnvVariable.mockImplementation((env: string) => env);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('listDatasets', () => {
  const mockDatasets = [
    {
      entityType: EntityType.DATASET,
      entityId: 'test-dataset-id-1',
      // ... other dataset properties
    },
    {
      entityType: EntityType.DATASET,
      entityId: 'test-dataset-id-2',
      // ... other dataset properties
    },
    {
      entityType: EntityType.DATASET,
      entityId: 'test-dataset-id-3',
      // ... other dataset properties
    },
  ];

  it('should list datasets', async () => {
    mockQueryDatastoreDdb.mockResolvedValueOnce({
      entities: mockDatasets,
      lastEvaluatedSk: undefined,
    });

    const result = await listDatasets({});

    expect(result).toEqual({
      entities: mockDatasets,
      lastEvaluatedSk: undefined,
    });
    expect(mockQueryDatastoreDdb).toHaveBeenCalledWith({
      entityType: EntityType.DATASET,
      maxResults: undefined,
      lastEvaluatedSk: undefined,
    });
  });

  it('should support pagination', async () => {
    const maxItems = 2;
    const mockFirstPage = mockDatasets.slice(0, maxItems);
    const mockSecondPage = mockDatasets.slice(mockFirstPage.length, mockFirstPage.length + maxItems);
    mockQueryDatastoreDdb
      .mockResolvedValueOnce({
        entities: mockFirstPage,
        lastEvaluatedSk: mockFirstPage[mockFirstPage.length - 1]!.entityId,
      })
      .mockResolvedValueOnce({
        entities: mockSecondPage,
        lastEvaluatedSk: undefined,
      });

    const firstDatasetsPage = await listDatasets({ maxResults: mockFirstPage.length });

    expect(firstDatasetsPage).toEqual({
      entities: mockFirstPage,
      lastEvaluatedSk: mockFirstPage[mockFirstPage.length - 1]!.entityId,
    });
    expect(mockQueryDatastoreDdb).toHaveBeenLastCalledWith({
      entityType: EntityType.DATASET,
      maxResults: mockFirstPage.length,
      lastEvaluatedSk: undefined,
    });

    const secondDatasetsPage = await listDatasets({
      maxResults: mockFirstPage.length,
      lastEvaluatedSk: firstDatasetsPage.lastEvaluatedSk,
    });

    expect(secondDatasetsPage).toEqual({
      entities: mockSecondPage,
      lastEvaluatedSk: undefined,
    });
    expect(mockQueryDatastoreDdb).toHaveBeenLastCalledWith({
      entityType: EntityType.DATASET,
      maxResults: mockFirstPage.length,
      lastEvaluatedSk: mockFirstPage[mockFirstPage.length - 1]!.entityId,
    });
  });
});

describe('listDatasetVersions', () => {
  const mockDatasetId = 'test-dataset-id-1';
  const mockDatasetVersions = [
    {
      entityType: EntityType.DATASET_VERSION,
      entityId: `${mockDatasetId}#0`,
      // ... other dataset properties
    },
    {
      entityType: EntityType.DATASET_VERSION,
      entityId: `${mockDatasetId}#1`,
      // ... other dataset properties
    },
    {
      entityType: EntityType.DATASET_VERSION,
      entityId: `${mockDatasetId}#2`,
      // ... other dataset properties
    },
  ];

  it('should list dataset versions', async () => {
    mockQueryDatastoreDdb.mockResolvedValueOnce({
      entities: mockDatasetVersions,
      lastEvaluatedSk: undefined,
    });

    const result = await listDatasetVersions({ datasetId: mockDatasetId });

    expect(result).toEqual({
      entities: mockDatasetVersions,
      lastEvaluatedSk: undefined,
    });
    expect(mockQueryDatastoreDdb).toHaveBeenCalledWith({
      entityType: EntityType.DATASET_VERSION,
      entityId: {
        operator: DdbConditionalOperators.BEGINS_WITH,
        values: [mockDatasetId],
      },
      maxResults: undefined,
      lastEvaluatedSk: undefined,
    });
  });

  it('should support pagination', async () => {
    const maxItems = 2;
    const mockFirstPage = mockDatasetVersions.slice(0, maxItems);
    const mockSecondPage = mockDatasetVersions.slice(mockFirstPage.length, mockFirstPage.length + maxItems);
    mockQueryDatastoreDdb
      .mockResolvedValueOnce({
        entities: mockFirstPage,
        lastEvaluatedSk: mockFirstPage[mockFirstPage.length - 1]!.entityId,
      })
      .mockResolvedValueOnce({
        entities: mockSecondPage,
        lastEvaluatedSk: undefined,
      });

    const firstDatasetsPage = await listDatasetVersions({
      datasetId: mockDatasetId,
      maxResults: mockFirstPage.length,
    });

    expect(firstDatasetsPage).toEqual({
      entities: mockFirstPage,
      lastEvaluatedSk: mockFirstPage[mockFirstPage.length - 1]!.entityId,
    });
    expect(mockQueryDatastoreDdb).toHaveBeenLastCalledWith({
      entityType: EntityType.DATASET_VERSION,
      entityId: {
        operator: DdbConditionalOperators.BEGINS_WITH,
        values: [mockDatasetId],
      },
      maxResults: mockFirstPage.length,
      lastEvaluatedSk: undefined,
    });

    const secondDatasetsPage = await listDatasetVersions({
      datasetId: mockDatasetId,
      maxResults: mockFirstPage.length,
      lastEvaluatedSk: firstDatasetsPage.lastEvaluatedSk,
    });

    expect(secondDatasetsPage).toEqual({
      entities: mockSecondPage,
      lastEvaluatedSk: undefined,
    });
    expect(mockQueryDatastoreDdb).toHaveBeenLastCalledWith({
      entityType: EntityType.DATASET_VERSION,
      entityId: {
        operator: DdbConditionalOperators.BEGINS_WITH,
        values: [mockDatasetId],
      },
      maxResults: mockFirstPage.length,
      lastEvaluatedSk: mockFirstPage[mockFirstPage.length - 1]!.entityId,
    });
  });

  it('should support filtering with annotations', async () => {
    mockQueryDatastoreDdb.mockResolvedValueOnce({
      entities: mockDatasetVersions,
      lastEvaluatedSk: undefined,
    });
    const conditionExpression = {
      condition: {
        stringEnumCondition: {
          name: 'someAnnotation',
          comparator: StringEnumLogicalComparator.EQUAL_TO,
          value: 'someValue',
        },
      },
    };
    const expectedDdbFilter = {
      condition: {
        key: 'annotations.someAnnotation.value.stringValue',
        operator: DdbConditionalOperators.EQUAL_TO,
        values: ['someValue'],
      },
    };
    mockToDdbConditionExpression.mockReturnValueOnce(expectedDdbFilter);

    const result = await listDatasetVersions({ datasetId: mockDatasetId, conditionExpression });

    expect(result).toEqual({
      entities: mockDatasetVersions,
      lastEvaluatedSk: undefined,
    });
    expect(mockQueryDatastoreDdb).toHaveBeenCalledWith({
      entityType: EntityType.DATASET_VERSION,
      entityId: {
        operator: DdbConditionalOperators.BEGINS_WITH,
        values: [mockDatasetId],
      },
      maxResults: undefined,
      lastEvaluatedSk: undefined,
      filter: expectedDdbFilter,
    });
  });
});

describe('listDatasetVersionItems', () => {
  it('should yield all items from a single page', async () => {
    const mockVersions = [
      { id: 'v1', name: 'version1' },
      { id: 'v2', name: 'version2' },
    ];

    mockQueryDatastoreDdb.mockResolvedValueOnce({ entities: mockVersions });

    const results = [];
    for await (const version of listDatasetVersionItems('dataset1')) {
      results.push(version);
    }

    expect(results).toEqual(mockVersions);
    expect(mockQueryDatastoreDdb).toHaveBeenCalledTimes(1);
  });

  it('should handle multiple pages of results', async () => {
    const page1 = [{ id: 'v1', name: 'version1' }];
    const page2 = [{ id: 'v2', name: 'version2' }];
    const page3 = [{ id: 'v3', name: 'version3' }];

    mockQueryDatastoreDdb
      .mockResolvedValueOnce({
        entities: page1,
        lastEvaluatedSk: 'key1',
      })
      .mockResolvedValueOnce({
        entities: page2,
        lastEvaluatedSk: 'key2',
      })
      .mockResolvedValueOnce({
        entities: page3,
      });

    const results = [];
    for await (const version of listDatasetVersionItems('dataset1')) {
      results.push(version);
    }

    expect(results).toEqual([...page1, ...page2, ...page3]);
    expect(mockQueryDatastoreDdb).toHaveBeenCalledTimes(3);
  });

  it('should handle empty results', async () => {
    mockQueryDatastoreDdb.mockResolvedValueOnce({ entities: [] });

    const results = [];
    for await (const version of listDatasetVersionItems('dataset1')) {
      results.push(version);
    }

    expect(results).toEqual([]);
    expect(mockQueryDatastoreDdb).toHaveBeenCalledTimes(1);
  });
});

describe('listAnnotationSchemas', () => {
  const mockAnnotationSchemas = [
    {
      entityType: EntityType.ANNOTATION_SCHEMA,
      entityId: 'schema-1',
      isArchived: false,
      // ... other properties
    },
    {
      entityType: EntityType.ANNOTATION_SCHEMA,
      entityId: 'schema-2',
      isArchived: true,
      // ... other properties
    },
    {
      entityType: EntityType.ANNOTATION_SCHEMA,
      entityId: 'schema-3',
      isArchived: false,
      // ... other properties
    },
  ];

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  it('should list active schemas by default', async () => {
    const mockActiveSchemas = mockAnnotationSchemas.filter((schema) => !schema.isArchived);
    mockQueryDatastoreDdb.mockResolvedValueOnce({
      entities: mockActiveSchemas,
      lastEvaluatedSk: undefined,
    });

    const result = await listAnnotationSchemas({});

    expect(result).toEqual({
      entities: mockActiveSchemas,
      lastEvaluatedSk: undefined,
    });
    expect(mockQueryDatastoreDdb).toHaveBeenCalledWith({
      entityType: EntityType.ANNOTATION_SCHEMA,
      maxResults: undefined,
      lastEvaluatedSk: undefined,
      filter: {
        condition: {
          key: 'isArchived',
          operator: DdbConditionalOperators.EQUAL_TO,
          values: [false],
        },
      },
    });
  });

  it('should support pagination with default filtering', async () => {
    const mockActiveSchemas = mockAnnotationSchemas.filter((schema) => !schema.isArchived);
    const maxItems = 2;
    const mockFirstPage = mockActiveSchemas.slice(0, maxItems);
    const mockSecondPage = mockActiveSchemas.slice(mockFirstPage.length, mockFirstPage.length + maxItems);
    mockQueryDatastoreDdb
      .mockResolvedValueOnce({
        entities: mockFirstPage,
        lastEvaluatedSk: mockFirstPage[mockFirstPage.length - 1]!.entityId,
      })
      .mockResolvedValueOnce({
        entities: mockSecondPage,
        lastEvaluatedSk: undefined,
      });

    const firstSchemasPage = await listAnnotationSchemas({ maxResults: mockFirstPage.length });

    expect(firstSchemasPage).toEqual({
      entities: mockFirstPage,
      lastEvaluatedSk: mockFirstPage[mockFirstPage.length - 1]!.entityId,
    });
    expect(mockQueryDatastoreDdb).toHaveBeenLastCalledWith({
      entityType: EntityType.ANNOTATION_SCHEMA,
      maxResults: mockFirstPage.length,
      lastEvaluatedSk: undefined,
      filter: {
        condition: {
          key: 'isArchived',
          operator: DdbConditionalOperators.EQUAL_TO,
          values: [false],
        },
      },
    });

    const secondSchemasPage = await listAnnotationSchemas({
      maxResults: mockFirstPage.length,
      lastEvaluatedSk: firstSchemasPage.lastEvaluatedSk,
    });

    expect(secondSchemasPage).toEqual({
      entities: mockSecondPage,
      lastEvaluatedSk: undefined,
    });
    expect(mockQueryDatastoreDdb).toHaveBeenLastCalledWith({
      entityType: EntityType.ANNOTATION_SCHEMA,
      maxResults: mockFirstPage.length,
      lastEvaluatedSk: mockFirstPage[mockFirstPage.length - 1]!.entityId,
      filter: {
        condition: {
          key: 'isArchived',
          operator: DdbConditionalOperators.EQUAL_TO,
          values: [false],
        },
      },
    });
  });

  describe('includeArchived parameter behavior', () => {
    it('should filter out archived schemas when includeArchived is undefined (default behavior)', async () => {
      const mockActiveSchemas = mockAnnotationSchemas.filter((schema) => !schema.isArchived);
      mockQueryDatastoreDdb.mockResolvedValueOnce({
        entities: mockActiveSchemas,
        lastEvaluatedSk: undefined,
      });

      const result = await listAnnotationSchemas({});

      expect(result).toEqual({
        entities: mockActiveSchemas,
        lastEvaluatedSk: undefined,
      });
      expect(mockQueryDatastoreDdb).toHaveBeenCalledWith({
        entityType: EntityType.ANNOTATION_SCHEMA,
        maxResults: undefined,
        lastEvaluatedSk: undefined,
        filter: {
          condition: {
            key: 'isArchived',
            operator: DdbConditionalOperators.EQUAL_TO,
            values: [false],
          },
        }, // Filter applied by default
      });
    });

    it('should return all schemas when includeArchived is true', async () => {
      mockQueryDatastoreDdb.mockResolvedValueOnce({
        entities: mockAnnotationSchemas,
        lastEvaluatedSk: undefined,
      });

      const result = await listAnnotationSchemas({ includeArchived: true });

      expect(result).toEqual({
        entities: mockAnnotationSchemas,
        lastEvaluatedSk: undefined,
      });
      expect(mockQueryDatastoreDdb).toHaveBeenCalledWith({
        entityType: EntityType.ANNOTATION_SCHEMA,
        maxResults: undefined,
        lastEvaluatedSk: undefined,
        filter: undefined, // No filter applied
      });
    });

    it('should filter out archived schemas when includeArchived is false', async () => {
      const mockActiveSchemas = mockAnnotationSchemas.filter((schema) => !schema.isArchived);
      mockQueryDatastoreDdb.mockResolvedValueOnce({
        entities: mockActiveSchemas,
        lastEvaluatedSk: undefined,
      });

      const result = await listAnnotationSchemas({ includeArchived: false });

      expect(result).toEqual({
        entities: mockActiveSchemas,
        lastEvaluatedSk: undefined,
      });
      expect(mockQueryDatastoreDdb).toHaveBeenCalledWith({
        entityType: EntityType.ANNOTATION_SCHEMA,
        maxResults: undefined,
        lastEvaluatedSk: undefined,
        filter: {
          condition: {
            key: 'isArchived',
            operator: DdbConditionalOperators.EQUAL_TO,
            values: [false],
          },
        },
      });
    });

    it('should work with pagination when includeArchived is false', async () => {
      const mockActiveSchemas = [
        { entityType: EntityType.ANNOTATION_SCHEMA, entityId: 'active-1', isArchived: false },
        { entityType: EntityType.ANNOTATION_SCHEMA, entityId: 'active-2', isArchived: false },
      ];

      mockQueryDatastoreDdb.mockResolvedValueOnce({
        entities: mockActiveSchemas,
        lastEvaluatedSk: 'active-2',
      });

      const result = await listAnnotationSchemas({
        includeArchived: false,
        maxResults: 2,
        lastEvaluatedSk: 'previous-token',
      });

      expect(result).toEqual({
        entities: mockActiveSchemas,
        lastEvaluatedSk: 'active-2',
      });
      expect(mockQueryDatastoreDdb).toHaveBeenCalledWith({
        entityType: EntityType.ANNOTATION_SCHEMA,
        maxResults: 2,
        lastEvaluatedSk: 'previous-token',
        filter: {
          condition: {
            key: 'isArchived',
            operator: DdbConditionalOperators.EQUAL_TO,
            values: [false],
          },
        },
      });
    });
  });
});

describe('listTestCaseIdsFromS3', () => {
  const mockS3Send = jest.fn();
  mockGetS3Client.mockImplementation(() => ({
    send: mockS3Send,
  }));
  mockGetDataset.mockResolvedValue({ currentVersion: 2 });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should handle null Contents from S3', async () => {
    mockS3Send.mockResolvedValue({
      Contents: null,
      NextContinuationToken: null,
    });

    const result = await listTestCaseIdsFromS3({
      datasetId: 'test-dataset',
      version: VERSION_HEAD,
      maxResults: 10,
    });

    expect(result.testCaseIds).toHaveLength(0);
  });

  it('should handle null Keys in Contents', async () => {
    mockS3Send.mockResolvedValue({
      Contents: [{ Key: null }, { Key: 'dataset/1/test2.json' }, { Key: undefined }],
      NextContinuationToken: null,
    });

    const result = await listTestCaseIdsFromS3({
      datasetId: 'test-dataset',
      version: VERSION_HEAD,
      maxResults: 10,
    });

    expect(result.testCaseIds).toBeDefined();
    expect(result.testCaseIds).toHaveLength(1);
    expect(result.testCaseIds![0]).toBe('test2');
  });

  it('should handle pagination correctly', async () => {
    mockS3Send.mockResolvedValue({
      Contents: [{ Key: 'dataset/1/test1.json' }],
      NextContinuationToken: 'next-token',
    });

    const result = await listTestCaseIdsFromS3({
      datasetId: 'test-dataset',
      version: VERSION_HEAD,
      maxResults: 1,
      continuationToken: 'current-token',
    });
    expect(result.nextContinuationToken).toBe('next-token');
  });

  it('should handle empty Contents from S3', async () => {
    mockS3Send.mockResolvedValue({
      Contents: [],
      NextContinuationToken: null,
    });

    const result = await listTestCaseIdsFromS3({
      datasetId: 'test-dataset',
      version: VERSION_HEAD,
      maxResults: 10,
    });

    expect(result.testCaseIds).toHaveLength(0);
  });
});

describe('filterTestCases', () => {
  const mockAnnotationConditionExpression = {
    condition: {
      stringEnumCondition: {
        name: 'some-name',
        comparator: StringEnumLogicalComparator.EQUAL_TO,
        value: 'someValue',
      },
    },
  };
  const mockDdbCondition = {
    condition: {
      key: 'annotations.some-name.value.stringValue',
      operator: DdbConditionalOperators.EQUAL_TO,
      values: ['someValue'],
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should filter test cases based on annotation conditions', async () => {
    const datasetId = 'dataset123';
    const testCaseIds = ['test1', 'test2', 'test3'];

    mockToDdbConditionExpression.mockResolvedValueOnce(mockDdbCondition);

    mockQueryDatastoreDdb
      .mockResolvedValueOnce({ entities: [{ testCaseIds: 'test1' }] }) // test1 has matching annotation
      .mockResolvedValueOnce({ entities: [] }) // test2 has no matching annotation
      .mockResolvedValueOnce({ entities: [{ testCaseIds: 'test3' }] }); // test3 has matching annotation

    const result = await filterTestCases(datasetId, testCaseIds, mockAnnotationConditionExpression);

    expect(result).toEqual(['test1', 'test3']);
    expect(mockToDdbConditionExpression).toHaveBeenCalledTimes(1);
    testCaseIds.forEach((testCaseId, i) => {
      expect(mockQueryDatastoreDdb).toHaveBeenNthCalledWith(i + 1, {
        entityType: EntityType.TEST_CASE_ANNOTATION,
        entityId: {
          operator: DdbConditionalOperators.EQUAL_TO,
          values: [`${datasetId}#${testCaseId}`],
        },
        filter: mockDdbCondition,
        maxResults: 1,
      });
    });
  });

  it('should return empty array when no test cases match conditions', async () => {
    const datasetId = 'dataset123';
    const testCaseIds = ['test1', 'test2'];

    mockQueryDatastoreDdb.mockResolvedValue({ entities: [] });

    const result = await filterTestCases(datasetId, testCaseIds, mockAnnotationConditionExpression);

    expect(result).toEqual([]);
    expect(mockQueryDatastoreDdb).toHaveBeenCalledTimes(2);
  });

  it('should handle empty test case ids array', async () => {
    const datasetId = 'dataset123';
    const testCaseIds: string[] = [];

    const result = await filterTestCases(datasetId, testCaseIds, mockAnnotationConditionExpression);

    expect(result).toEqual([]);
    expect(mockToDdbConditionExpression).not.toHaveBeenCalled();
    expect(mockQueryDatastoreDdb).not.toHaveBeenCalled();
  });
});
