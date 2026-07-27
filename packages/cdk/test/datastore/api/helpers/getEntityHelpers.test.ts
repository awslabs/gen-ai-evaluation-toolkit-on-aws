import { ResourceNotFoundException, TestCase } from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import { GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import {
  getAnnotationSchema,
  getDataset,
  getDatasetVersion,
  getTestCase,
  getTestCaseAnnotations,
  getTestCaseMetadata,
} from '@datastore/api/helpers';
import { EntityType } from '@datastore/api/types';
import { getS3Client, queryDatastoreDdb } from '@datastore/api/utils';
import { getEnvVariable } from '@common';
import { DdbConditionalOperators } from '@common/dynamoUtils';

jest.mock('@datastore/api/utils');
jest.mock('@common');

const mockEnvValue = 'env-value';
beforeEach(() => {
  jest.clearAllMocks();
  (getEnvVariable as jest.Mock).mockReturnValue(mockEnvValue);
});

describe('getDataset', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return dataset when found', async () => {
    const mockDataset = {
      datasetId: 'test-dataset-id',
      // ... other dataset properties
    };

    (queryDatastoreDdb as jest.Mock).mockResolvedValueOnce({
      entities: [mockDataset],
    });

    const result = await getDataset(mockDataset.datasetId);

    expect(result).toEqual(mockDataset);
    expect(queryDatastoreDdb).toHaveBeenCalledWith({
      entityType: EntityType.DATASET,
      entityId: {
        operator: DdbConditionalOperators.EQUAL_TO,
        values: [mockDataset.datasetId],
      },
      maxResults: 1,
    });
  });

  it('should throw ResourceNotFoundException when dataset not found', async () => {
    (queryDatastoreDdb as jest.Mock).mockResolvedValueOnce({
      entities: [],
    });

    await expect(() => getDataset('non-existent-id')).rejects.toThrow(ResourceNotFoundException);
  });
});

describe('getDatasetVersion', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  it('should return dataset version when found', async () => {
    const mockDatasetVersion = {
      datasetId: 'test-dataset-id',
      version: 0,
      // ... other version properties
    };

    (queryDatastoreDdb as jest.Mock).mockResolvedValueOnce({
      entities: [mockDatasetVersion],
    });

    const result = await getDatasetVersion(mockDatasetVersion.datasetId, mockDatasetVersion.version);

    expect(result).toEqual(mockDatasetVersion);
    expect(queryDatastoreDdb).toHaveBeenCalledWith({
      entityType: EntityType.DATASET_VERSION,
      entityId: {
        operator: DdbConditionalOperators.EQUAL_TO,
        values: [`${mockDatasetVersion.datasetId}#${mockDatasetVersion.version}`],
      },
      maxResults: 1,
    });
  });

  it('should throw ResourceNotFoundException when dataset not found', async () => {
    (queryDatastoreDdb as jest.Mock).mockResolvedValueOnce({
      entities: [],
    });

    await expect(() => getDatasetVersion('non-existent-id', 0)).rejects.toThrow(ResourceNotFoundException);
  });
});

describe('getTestCase', () => {
  const mockSend = jest.fn();
  const testCasePath = 'path/to/testCase123';
  const mockTestCase: Omit<TestCase, 'testCaseId'> = { input: 'Some input', expected: 'some-output' };

  beforeEach(() => {
    jest.clearAllMocks();
    (getS3Client as jest.Mock).mockReturnValue({ send: mockSend });
  });

  it('should successfully retrieve and parse a test case with metadata', async () => {
    // Setup
    const mockMetadata = {
      'created-at': '2024-01-01',
      'created-by': 'user1',
    };

    mockSend.mockImplementation((command) => {
      if (command instanceof HeadObjectCommand) return Promise.resolve({ Metadata: mockMetadata });

      if (command instanceof GetObjectCommand) {
        return Promise.resolve({
          Body: {
            transformToString: async () => JSON.stringify(mockTestCase),
          },
        });
      }
    });

    // Execute
    const result = await getTestCase(testCasePath);

    // Assert
    expect(result).toEqual({
      ...mockTestCase,
      createdAt: new Date('2024-01-01'),
      createdBy: 'user1',
    });
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it('should throw when content is null', async () => {
    // Setup
    mockSend.mockImplementation((command) => {
      if (command instanceof HeadObjectCommand) {
        return Promise.resolve({});
      }
      if (command instanceof GetObjectCommand) {
        return Promise.resolve({ Body: null });
      }
    });

    // Execute & Assert
    await expect(getTestCase(testCasePath)).rejects.toThrow('test case testCase123 not found');
  });

  it('should handle S3 errors', async () => {
    // Setup
    mockSend.mockRejectedValue(new Error('S3 Error'));

    // Execute & Assert
    await expect(getTestCase(testCasePath)).rejects.toThrow('test case testCase123 not found');
  });

  it('should handle missing metadata', async () => {
    // Setup
    mockSend.mockImplementation((command) => {
      if (command instanceof HeadObjectCommand) {
        return Promise.resolve({});
      }
      if (command instanceof GetObjectCommand) {
        return Promise.resolve({
          Body: {
            transformToString: async () => JSON.stringify(mockTestCase),
          },
        });
      }
    });

    // Execute
    const result = await getTestCase(testCasePath);

    // Assert
    expect(result).toEqual(mockTestCase);
    expect(mockSend).toHaveBeenCalledTimes(2);
  });
});

describe('getTestCaseMetadata', () => {
  const testPath = 'test/case/123';
  const mockSend = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (getS3Client as jest.Mock).mockReturnValue({ send: mockSend });
  });

  test('should return full metadata when all fields are present', async () => {
    const metadata = {
      'created-at': '2024-01-01',
      'created-by': 'user1',
      'irrelevant-field': 'ignored',
    };

    mockSend.mockResolvedValueOnce({ Metadata: metadata });

    const result = await getTestCaseMetadata(testPath);

    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ input: { Bucket: mockEnvValue, Key: testPath } }));
    expect(result).toStrictEqual({
      createdAt: new Date(metadata['created-at']),
      createdBy: 'user1',
    });
  });

  test('should return empty object when no matching fields exist', async () => {
    const metadata = { 'other-field': 'value' };

    mockSend.mockResolvedValueOnce({ Metadata: metadata });

    const result = await getTestCaseMetadata(testPath);

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        input: {
          Bucket: mockEnvValue,
          Key: testPath,
        },
      }),
    );
    expect(result).toEqual({});
  });

  test('should throw ResourceNotFound when S3 request fails', async () => {
    const error = new Error('S3 Error');
    mockSend.mockRejectedValueOnce(error);

    await expect(getTestCaseMetadata(testPath)).rejects.toThrow();
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        input: {
          Bucket: mockEnvValue,
          Key: testPath,
        },
      }),
    );
  });
});

describe('getAnnotationSchema', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return the schema when found', async () => {
    const mockAnnotationSchema = {
      name: 'mock-annotation-schema',
      // ... other properties
    };

    (queryDatastoreDdb as jest.Mock).mockResolvedValueOnce({
      entities: [mockAnnotationSchema],
    });

    const result = await getAnnotationSchema(mockAnnotationSchema.name);

    expect(result).toEqual(mockAnnotationSchema);
    expect(queryDatastoreDdb).toHaveBeenCalledWith({
      entityType: EntityType.ANNOTATION_SCHEMA,
      entityId: {
        operator: DdbConditionalOperators.EQUAL_TO,
        values: [mockAnnotationSchema.name],
      },
      maxResults: 1,
    });
  });

  it('should throw ResourceNotFoundException when dataset not found', async () => {
    (queryDatastoreDdb as jest.Mock).mockResolvedValueOnce({
      entities: [],
    });

    await expect(() => getAnnotationSchema('non-existent-schema-name')).rejects.toThrow(ResourceNotFoundException);
  });
});

describe('getTestCaseAnnotations', () => {
  const datasetId = 'dataset-123';
  const testCaseId = 'testcase-456';
  it('Should return test case annotations if available', async () => {
    const mockTestCaseAnnotations = {
      //.. annotations
    };

    (queryDatastoreDdb as jest.Mock).mockResolvedValueOnce({
      entities: [mockTestCaseAnnotations],
    });

    const result = await getTestCaseAnnotations(datasetId, testCaseId);

    expect(result).toEqual(mockTestCaseAnnotations);
    expect(queryDatastoreDdb).toHaveBeenCalledWith({
      entityType: EntityType.TEST_CASE_ANNOTATION,
      entityId: {
        operator: DdbConditionalOperators.EQUAL_TO,
        values: [`${datasetId}#${testCaseId}`],
      },
      maxResults: 1,
    });
  });

  it('should return undefined if annotations are not found for the given test case', async () => {
    (queryDatastoreDdb as jest.Mock).mockResolvedValueOnce({
      entities: [],
    });
    const result = await getTestCaseAnnotations(datasetId, testCaseId);
    expect(result).toBeUndefined();
  });
});
