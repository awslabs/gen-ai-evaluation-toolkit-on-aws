import {
  ConflictException,
  DatasetStatus,
  PutDatasetVersionAnnotationServerInput,
  ResourceNotFoundException,
  ValidationException,
} from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import {
  archiveAnnotationSchema,
  createAnnotationSchema,
  createDataset,
  putDatasetVersionAnnotation,
  putTestCaseAnnotation,
  removeAnnotation,
} from '@datastore/api/helpers';
import { DatasetVersionDdbItem, EntityType, TestCaseAnnotationDdbItem } from '@datastore/api/types';
import crypto from 'crypto';
import { DS_DDB_PK, DS_DDB_SK } from '@common/config';
import { ConditionalCheckFailedException, DynamoDBServiceException, ReturnValue } from '@aws-sdk/client-dynamodb';
import { getTestCaseAnnotations, getDatasetVersion } from '@datastore/api/helpers/getEntityHelpers';
import { DdbConditionalOperators } from '@common/dynamoUtils';
import { log } from '@common/api/utils';

jest.mock('@datastore/api/utils');

const mockPutItem = jest.fn();
const mockUpdateItem = jest.fn();
jest.mock('@datastore/api/ddb', () => ({
  DdbWrapper: {
    getInstance: jest.fn().mockReturnValue({
      putItem: (...props: unknown[]) => mockPutItem(...props),
      updateItem: (...props: unknown[]) => mockUpdateItem(...props),
    }),
  },
}));

jest.mock('@datastore/api/helpers/getEntityHelpers');
const mockGetTestCaseAnnotations = getTestCaseAnnotations as jest.MockedFunction<typeof getTestCaseAnnotations>;
const mockGetDatasetVersion = getDatasetVersion as jest.MockedFn<typeof getDatasetVersion>;

jest.mock('@common/api/utils');
const mockLogWarn = log.warn as jest.MockedFunction<typeof log.warn>;

const mockUUID = '123-123-123-123-123-123';
beforeEach(() => {
  jest.spyOn(crypto, 'randomUUID').mockReturnValue(mockUUID);
  jest.clearAllMocks();
  mockPutItem.mockReset();
});

describe('createDataset', () => {
  it('should create a dataset with all required fields', async () => {
    const name = 'test-dataset';
    const source = 'test-source';

    const result = await createDataset(name, source);

    const expectedDatasetItem = {
      entityType: EntityType.DATASET,
      entityId: mockUUID,
      datasetId: mockUUID,
      name,
      source,
      description: undefined,
      createdAt: expect.any(Number),
      currentVersion: undefined,
      status: DatasetStatus.ACTIVE,
    };

    expect(result).toEqual(expectedDatasetItem);

    expect(mockPutItem).toHaveBeenCalledWith(expectedDatasetItem);
  });

  it('should create a dataset with description', async () => {
    const name = 'test-dataset';
    const source = 'test-source';
    const description = 'test-description';

    const result = await createDataset(name, source, description);

    const expectedDatasetItem = {
      entityType: EntityType.DATASET,
      entityId: mockUUID,
      datasetId: mockUUID,
      name,
      source,
      description,
      createdAt: expect.any(Number),
      status: DatasetStatus.ACTIVE,
    };

    expect(result).toEqual(expectedDatasetItem);

    expect(mockPutItem).toHaveBeenCalledWith(expectedDatasetItem);
  });

  it('should throw error if DdbWrapper.putItem fails', async () => {
    const error = new Error('Database error');
    mockPutItem.mockRejectedValue(error);

    await expect(createDataset('name', 'source')).rejects.toThrow('Database error');
  });
});

describe('createAnnotationSchema', () => {
  const ifItemNotExistsCondition = {
    and: [
      {
        condition: {
          key: DS_DDB_PK,
          operator: DdbConditionalOperators.ATTRIBUTE_NOT_EXISTS,
        },
      },
      {
        condition: {
          key: DS_DDB_SK,
          operator: DdbConditionalOperators.ATTRIBUTE_NOT_EXISTS,
        },
      },
    ],
  };

  const mockSchema = {
    name: 'test-annotation-schema',
    valueType: { number: {} },
    createdBy: 'user-x',
    description: 'test-description',
  };

  // Helper function to create test schemas with invalid valueTypes
  // This function helps us bypass TypeScript's type checking for testing invalid inputs
  function createTestSchema(valueType: unknown): {
    name: string;
    valueType: unknown;
    createdBy: string;
    description: string;
  } {
    return {
      ...mockSchema,
      valueType: valueType,
    };
  }

  it('should create string enum type annotation schemas', async () => {
    const valueType = {
      string: {
        enum: ['test-value-1', 'test-value-2'],
      },
    };

    const result = await createAnnotationSchema({
      ...mockSchema,
      valueType,
    });

    const expectedAnnotationSchemaItem = {
      entityType: EntityType.ANNOTATION_SCHEMA,
      entityId: mockSchema.name,
      name: mockSchema.name,
      valueType,
      createdBy: mockSchema.createdBy,
      description: mockSchema.description,
      createdAt: expect.any(Number),
      isArchived: false,
    };

    expect(result).toEqual(expectedAnnotationSchemaItem);

    expect(mockPutItem).toHaveBeenCalledWith(expectedAnnotationSchemaItem, ifItemNotExistsCondition);
  });

  it('should create numeric annotation schemas', async () => {
    const result = await createAnnotationSchema(mockSchema);

    const expectedAnnotationSchemaItem = {
      entityType: EntityType.ANNOTATION_SCHEMA,
      entityId: mockSchema.name,
      name: mockSchema.name,
      valueType: mockSchema.valueType,
      createdBy: mockSchema.createdBy,
      description: mockSchema.description,
      createdAt: expect.any(Number),
      isArchived: false,
    };

    expect(result).toEqual(expectedAnnotationSchemaItem);

    expect(mockPutItem).toHaveBeenCalledWith(expectedAnnotationSchemaItem, ifItemNotExistsCondition);
  });

  it('should throw conflict exception if an annotation with same name exists', async () => {
    mockPutItem.mockRejectedValue(
      new ConditionalCheckFailedException({ message: 'Conditional Check Fail', $metadata: {} }),
    );

    await expect(createAnnotationSchema(mockSchema)).rejects.toThrow(ConflictException);
  });

  it('should throw error if any other error occurs', async () => {
    const error = new Error('Database error');
    mockPutItem.mockRejectedValue(error);

    await expect(createAnnotationSchema(mockSchema)).rejects.toThrow('Database error');
  });

  it('should throw ValidationException if valueType has an invalid key', async () => {
    const invalidSchema = createTestSchema({ invalidType: {} });

    await expect(createAnnotationSchema(invalidSchema)).rejects.toThrow(ValidationException);
    await expect(createAnnotationSchema(invalidSchema)).rejects.toThrow(
      "Invalid valueType: 'invalidType' is not a valid type. Must be one of [number, string]",
    );
    expect(mockPutItem).not.toHaveBeenCalled();
  });

  it('should throw ValidationException if valueType has multiple keys', async () => {
    const invalidSchema = createTestSchema({ number: {}, string: { enum: ['value1'] } });

    await expect(createAnnotationSchema(invalidSchema)).rejects.toThrow(ValidationException);
    await expect(createAnnotationSchema(invalidSchema)).rejects.toThrow(
      'Invalid valueType: Must contain exactly one of [number, string]',
    );
    expect(mockPutItem).not.toHaveBeenCalled();
  });

  it('should throw ValidationException if string valueType is missing enum array', async () => {
    const invalidSchema = createTestSchema({ string: {} });

    await expect(createAnnotationSchema(invalidSchema)).rejects.toThrow(ValidationException);
    await expect(createAnnotationSchema(invalidSchema)).rejects.toThrow(
      'Invalid string valueType: Must contain enum array',
    );
    expect(mockPutItem).not.toHaveBeenCalled();
  });

  it('should throw ValidationException if string valueType has non-array enum', async () => {
    const invalidSchema = createTestSchema({ string: { enum: 'not-an-array' } });

    await expect(createAnnotationSchema(invalidSchema)).rejects.toThrow(ValidationException);
    await expect(createAnnotationSchema(invalidSchema)).rejects.toThrow(
      'Invalid string valueType: Must contain enum array',
    );
    expect(mockPutItem).not.toHaveBeenCalled();
  });
});

describe('archiveAnnotationSchema', () => {
  const name = 'test-annotation-schema';
  const createdBy = 'user-x';
  const description = 'test-description';

  it('should archive annotation schema', async () => {
    const expectedAnnotationSchemaItem = {
      entityType: EntityType.ANNOTATION_SCHEMA,
      entityId: name,
      name,
      valueType: { numericType: {} },
      createdBy,
      description,
      createdAt: expect.any(Number),
      isArchived: true,
    };

    mockUpdateItem.mockResolvedValueOnce({ Attributes: expectedAnnotationSchemaItem });

    const result = await archiveAnnotationSchema(name);

    expect(result).toEqual(expectedAnnotationSchemaItem);

    expect(mockUpdateItem).toHaveBeenCalledWith(
      EntityType.ANNOTATION_SCHEMA,
      name,
      {
        isArchived: true,
      },
      {
        and: [
          {
            condition: {
              key: DS_DDB_PK,
              operator: DdbConditionalOperators.ATTRIBUTE_EXISTS,
            },
          },
          {
            condition: {
              key: DS_DDB_SK,
              operator: DdbConditionalOperators.ATTRIBUTE_EXISTS,
            },
          },
        ],
      },
      ReturnValue.ALL_NEW,
    );
  });

  it('should un-archive annotation schema if sha shouldArchive attribute is set to false', async () => {
    const expectedAnnotationSchemaItem = {
      entityType: EntityType.ANNOTATION_SCHEMA,
      entityId: name,
      name,
      valueType: { numericType: {} },
      createdBy,
      description,
      createdAt: expect.any(Number),
      isArchived: false,
    };

    mockUpdateItem.mockResolvedValueOnce({ Attributes: expectedAnnotationSchemaItem });

    const result = await archiveAnnotationSchema(name, false);

    expect(result).toEqual(expectedAnnotationSchemaItem);

    expect(mockUpdateItem).toHaveBeenCalledWith(
      EntityType.ANNOTATION_SCHEMA,
      name,
      {
        isArchived: false,
      },
      {
        and: [
          {
            condition: {
              key: DS_DDB_PK,
              operator: DdbConditionalOperators.ATTRIBUTE_EXISTS,
            },
          },
          {
            condition: {
              key: DS_DDB_SK,
              operator: DdbConditionalOperators.ATTRIBUTE_EXISTS,
            },
          },
        ],
      },
      ReturnValue.ALL_NEW,
    );
  });

  it('Should throw ResourceNotFoundException if the schema is not available', async () => {
    mockUpdateItem.mockRejectedValueOnce(
      new ConditionalCheckFailedException({ message: 'Condition Failed', $metadata: {} }),
    );
    await expect(archiveAnnotationSchema('non-existing-name')).rejects.toThrow(ResourceNotFoundException);
  });

  it('Should throw other DDB errors', async () => {
    mockUpdateItem.mockRejectedValueOnce(
      new DynamoDBServiceException({ name: 'some-ddb-error', $fault: 'client', $metadata: {} }),
    );
    await expect(archiveAnnotationSchema('some-name')).rejects.toThrow(DynamoDBServiceException);
  });
});

describe('putTestCaseAnnotation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  const datasetId = 'dataset1';
  const testCaseId = 'test1';

  const existingAnnotations = {
    [DS_DDB_PK]: EntityType.TEST_CASE_ANNOTATION,
    [DS_DDB_SK]: `${datasetId}#${testCaseId}`,
    datasetId: datasetId,
    testCaseId: testCaseId,
    annotations: {
      oldAnnotation: {
        value: {
          stringValue: 'oldValue',
        },
        comment: 'Old comment',
        annotatedBy: 'user2',
        annotatedAt: 1234567890,
      },
    },
    lastUpdatedAt: 1234567890,
  };

  const mockAnnotationFromUser = {
    datasetId,
    testCaseId,
    name: 'newAnnotation',
    value: {
      stringValue: 'newValue',
    },
    comment: 'New comment',
  };
  const mockAnnotatedBy = 'user1';

  it('should create a new annotations entry when no existing annotations', async () => {
    // Mock getTestCaseAnnotations to return null (no existing annotations)
    mockGetTestCaseAnnotations.mockResolvedValue(undefined);

    const expectedDdbItem = {
      [DS_DDB_PK]: EntityType.TEST_CASE_ANNOTATION,
      [DS_DDB_SK]: `${datasetId}#${testCaseId}`,
      datasetId: datasetId,
      testCaseId: testCaseId,
      annotations: {
        [mockAnnotationFromUser.name]: {
          value: mockAnnotationFromUser.value,
          comment: mockAnnotationFromUser.comment,
          annotatedBy: mockAnnotatedBy,
          annotatedAt: expect.any(Number),
        },
      },
      lastUpdatedAt: expect.any(Number),
    };

    const result = await putTestCaseAnnotation(mockAnnotationFromUser, mockAnnotatedBy);

    // Verify the structure of the created item
    expect(result).toEqual(expectedDdbItem);

    // Verify DdbWrapper.putItem was called with correct parameters
    expect(mockPutItem).toHaveBeenCalledWith(expectedDdbItem, {
      and: [
        {
          condition: {
            key: DS_DDB_PK,
            operator: DdbConditionalOperators.ATTRIBUTE_NOT_EXISTS,
          },
        },
        {
          condition: {
            key: DS_DDB_SK,
            operator: DdbConditionalOperators.ATTRIBUTE_NOT_EXISTS,
          },
        },
      ],
    });
  });

  it('should merge with existing annotations when present', async () => {
    mockGetTestCaseAnnotations.mockResolvedValue(existingAnnotations as TestCaseAnnotationDdbItem);

    const expectedDdbItem = {
      [DS_DDB_PK]: EntityType.TEST_CASE_ANNOTATION,
      [DS_DDB_SK]: `${datasetId}#${testCaseId}`,
      datasetId: datasetId,
      testCaseId: testCaseId,
      annotations: {
        ...existingAnnotations.annotations,
        [mockAnnotationFromUser.name]: {
          value: mockAnnotationFromUser.value,
          comment: mockAnnotationFromUser.comment,
          annotatedBy: mockAnnotatedBy,
          annotatedAt: expect.any(Number),
        },
      },
      lastUpdatedAt: expect.any(Number),
    };
    mockUpdateItem.mockResolvedValueOnce({ Attributes: expectedDdbItem });

    const result = await putTestCaseAnnotation(mockAnnotationFromUser, mockAnnotatedBy);

    // Verify the merged annotations
    expect(result).toEqual(expectedDdbItem);

    expect(mockUpdateItem).toHaveBeenLastCalledWith(
      existingAnnotations[DS_DDB_PK],
      existingAnnotations[DS_DDB_SK],
      { annotations: expectedDdbItem.annotations, lastUpdatedAt: expect.any(Number) },
      {
        and: [
          {
            condition: {
              key: 'lastUpdatedAt',
              operator: DdbConditionalOperators.EQUAL_TO,
              values: [existingAnnotations.lastUpdatedAt],
            },
          },
          {
            condition: {
              key: DS_DDB_PK,
              operator: DdbConditionalOperators.ATTRIBUTE_EXISTS,
            },
          },
          {
            condition: {
              key: DS_DDB_SK,
              operator: DdbConditionalOperators.ATTRIBUTE_EXISTS,
            },
          },
        ],
      },
      ReturnValue.ALL_NEW,
    );
  });

  it('Should throw conflict exception if the annotation update operation fails more than 3 times with ConditionalCheckFailedException', async () => {
    mockGetTestCaseAnnotations.mockResolvedValue(existingAnnotations as TestCaseAnnotationDdbItem);
    mockUpdateItem.mockRejectedValue(
      new ConditionalCheckFailedException({ message: 'Condition Failed', $metadata: {} }),
    );
    await expect(putTestCaseAnnotation(mockAnnotationFromUser, mockAnnotatedBy)).rejects.toThrow(ConflictException);
    expect(mockUpdateItem).toHaveBeenCalledTimes(4);
  });
});

describe('removeAnnotation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  const datasetId = 'dataset1';
  const version = 1;
  const testCaseId = 'test1';
  const annotationName = 'annotation';

  const existingAnnotations = {
    [DS_DDB_PK]: EntityType.TEST_CASE_ANNOTATION,
    [DS_DDB_SK]: `${datasetId}#${testCaseId}`,
    datasetId: datasetId,
    testCaseId: testCaseId,
    annotations: {
      annotation1: {
        value: {
          stringValue: 'value1',
        },
        comment: 'comment1',
        annotatedBy: 'user1',
        annotatedAt: 1234567890,
      },
      annotation2: {
        value: {
          stringValue: 'value2',
        },
        comment: 'comment2',
        annotatedBy: 'user2',
        annotatedAt: 1234567890,
      },
    },
    lastUpdatedAt: 1234567890,
  };

  it('should log a warning and return undefined if there are no annotations in the test case', async () => {
    mockGetTestCaseAnnotations.mockResolvedValue(undefined);

    const result = await removeAnnotation({
      datasetId,
      testCaseId,
      annotationName,
    });
    expect(result).toBeUndefined();
    expect(mockLogWarn).toHaveBeenCalledWith(
      `The requested annotation to be deleted '${annotationName}' cannot be found in test case '${testCaseId}' of dataset '${datasetId}'`,
    );
    expect(mockUpdateItem).not.toHaveBeenCalled();
    expect(mockGetDatasetVersion).not.toHaveBeenCalled();
  });

  it('should log a warning and return undefined if there are no annotations in the dataset version', async () => {
    mockGetDatasetVersion.mockResolvedValue({} as DatasetVersionDdbItem);

    const result = await removeAnnotation({
      datasetId,
      version,
      annotationName,
    });
    expect(result).toBeUndefined();
    expect(mockLogWarn).toHaveBeenCalledWith(
      `The requested annotation to be deleted '${annotationName}' cannot be found in version '${version}' of dataset '${datasetId}'`,
    );
    expect(mockUpdateItem).not.toHaveBeenCalled();
    expect(mockGetTestCaseAnnotations).not.toHaveBeenCalled();
  });

  it('should log a warning and return undefined if the requested annotation does not exist for the test case.', async () => {
    // Mock existing annotations
    const existingAnnotations = {
      annotations: {
        [annotationName]: {
          value: {
            stringValue: 'value',
          },
          comment: 'comment',
          annotatedBy: 'user',
          annotatedAt: 1234567890,
        },
      },
    };
    mockGetTestCaseAnnotations.mockResolvedValue(existingAnnotations as unknown as TestCaseAnnotationDdbItem);

    const result = await removeAnnotation({
      datasetId,
      testCaseId,
      annotationName: 'non-existing-annotation',
    });
    expect(result).toBeUndefined();
    expect(mockLogWarn).toHaveBeenCalledWith(
      `The requested annotation to be deleted 'non-existing-annotation' cannot be found in test case '${testCaseId}' of dataset '${datasetId}'`,
    );
    expect(mockUpdateItem).not.toHaveBeenCalled();
  });

  it('should log a warning and return undefined if the requested annotation does not exist for the given version', async () => {
    // Mock existing annotations
    const existingAnnotations = {
      annotations: {
        [annotationName]: {
          value: {
            stringValue: 'value',
          },
          comment: 'comment',
          annotatedBy: 'user',
          annotatedAt: 1234567890,
        },
      },
    };
    mockGetDatasetVersion.mockResolvedValue(existingAnnotations as unknown as DatasetVersionDdbItem);

    const result = await removeAnnotation({
      datasetId,
      version,
      annotationName: 'non-existing-annotation',
    });
    expect(result).toBeUndefined();
    expect(mockLogWarn).toHaveBeenCalledWith(
      `The requested annotation to be deleted 'non-existing-annotation' cannot be found in version '${version}' of dataset '${datasetId}'`,
    );
    expect(mockUpdateItem).not.toHaveBeenCalled();
  });

  it('should remove the annotation if it exists', async () => {
    mockGetTestCaseAnnotations.mockResolvedValue(existingAnnotations as TestCaseAnnotationDdbItem);

    const expectedDdbItem = {
      ...existingAnnotations,
      annotations: {
        annotation1: existingAnnotations.annotations.annotation1,
      },
    };

    mockUpdateItem.mockResolvedValueOnce({ Attributes: expectedDdbItem });

    const result = await removeAnnotation({
      datasetId,
      testCaseId,
      annotationName: 'annotation2',
    });

    expect(result).toEqual(expectedDdbItem);

    expect(mockUpdateItem).toHaveBeenCalledTimes(1);
  });

  it('Should retry to delete on conditional check failures.', async () => {
    mockGetTestCaseAnnotations.mockResolvedValue(existingAnnotations as TestCaseAnnotationDdbItem);
    mockUpdateItem.mockRejectedValue(
      new ConditionalCheckFailedException({ message: 'Condition Failed', $metadata: {} }),
    );

    await expect(
      removeAnnotation({
        datasetId,
        testCaseId,
        annotationName: 'annotation2',
      }),
    ).rejects.toThrow(ConflictException);
    expect(mockUpdateItem).toHaveBeenCalledTimes(4);
  });
});

describe('putDatasetVersionAnnotation', () => {
  const mockDatasetId = 'dataset-123';
  const mockVersion = 1;
  const mockAnnotationName = 'test-annotation';
  const mockUser = 'test-user';

  const mockInput: PutDatasetVersionAnnotationServerInput = {
    datasetId: mockDatasetId,
    version: mockVersion,
    name: mockAnnotationName,
    value: { numericValue: 1 },
    comment: 'some comment',
  };

  const mockDatasetVersion = {
    entityType: EntityType.DATASET_VERSION,
    entityId: 'version-123',
    datasetId: mockDatasetId,
    version: mockVersion,
    annotations: {
      'existing-annotation': {
        value: { numericValue: 123 },
        comment: 'Existing annotation',
        annotatedBy: 'other-user',
        annotatedAt: 1234567000,
      },
    },
    lastUpdatedAt: 123456,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should add new annotation to existing annotations', async () => {
    mockGetDatasetVersion.mockResolvedValue(mockDatasetVersion as unknown as DatasetVersionDdbItem);
    mockUpdateItem.mockResolvedValueOnce({ Attributes: {} });
    await putDatasetVersionAnnotation(mockInput, mockUser);

    expect(getDatasetVersion).toHaveBeenCalledWith(mockDatasetId, mockVersion);
    expect(mockUpdateItem).toHaveBeenCalledWith(
      EntityType.DATASET_VERSION,
      mockDatasetVersion.entityId,
      {
        annotations: {
          'existing-annotation': mockDatasetVersion.annotations['existing-annotation'],
          [mockAnnotationName]: {
            value: mockInput.value,
            comment: mockInput.comment,
            annotatedBy: mockUser,
            annotatedAt: expect.any(Number),
          },
        },
        lastUpdatedAt: expect.any(Number),
      },
      {
        and: [
          {
            condition: {
              key: 'lastUpdatedAt',
              operator: DdbConditionalOperators.EQUAL_TO,
              values: [mockDatasetVersion.lastUpdatedAt],
            },
          },
          {
            condition: {
              key: DS_DDB_PK,
              operator: DdbConditionalOperators.ATTRIBUTE_EXISTS,
            },
          },
          {
            condition: {
              key: DS_DDB_SK,
              operator: DdbConditionalOperators.ATTRIBUTE_EXISTS,
            },
          },
        ],
      },
      ReturnValue.ALL_NEW,
    );
  });

  it('should create annotations object if none exists', async () => {
    const versionWithoutAnnotations = {
      ...mockDatasetVersion,
      annotations: undefined,
    };
    mockGetDatasetVersion.mockResolvedValue(versionWithoutAnnotations as DatasetVersionDdbItem);
    mockUpdateItem.mockResolvedValueOnce({ Attributes: {} });

    await putDatasetVersionAnnotation(mockInput, mockUser);

    expect(mockUpdateItem.mock.lastCall[2]).toEqual({
      annotations: {
        [mockAnnotationName]: {
          value: mockInput.value,
          comment: mockInput.comment,
          annotatedBy: mockUser,
          annotatedAt: expect.any(Number),
        },
      },
      lastUpdatedAt: expect.any(Number),
    });
  });

  it('should override existing annotation with same name', async () => {
    const versionWithExistingAnnotation = {
      ...mockDatasetVersion,
      annotations: {
        [mockAnnotationName]: {
          value: { numericValue: 456 },
          comment: 'old comment',
          annotatedBy: 'old-user',
          annotatedAt: 1000000,
        },
      },
    };
    mockGetDatasetVersion.mockResolvedValue(versionWithExistingAnnotation as unknown as DatasetVersionDdbItem);
    mockUpdateItem.mockResolvedValueOnce({ Attributes: {} });

    await putDatasetVersionAnnotation(mockInput, mockUser);

    expect(mockUpdateItem.mock.lastCall[2]).toEqual({
      annotations: {
        [mockAnnotationName]: {
          value: mockInput.value,
          comment: mockInput.comment,
          annotatedBy: mockUser,
          annotatedAt: expect.any(Number),
        },
      },
      lastUpdatedAt: expect.any(Number),
    });
  });
});
