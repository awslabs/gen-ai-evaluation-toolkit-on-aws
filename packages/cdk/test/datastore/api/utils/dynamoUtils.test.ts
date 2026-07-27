import { InternalServerException, ValidationException } from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import { EntityType } from '@datastore/api/types';
import { handleDynamoErrorAndThrowServiceExceptions, queryDatastoreDdb } from '@datastore/api/utils';
import { DynamoDBServiceException } from '@aws-sdk/client-dynamodb';
import { DdbConditionalOperators, DdbConditionExpression } from '@common/dynamoUtils';

// Mock the logging/error functions
const mockLogErrorAndThrowValidation = jest.fn().mockImplementation(() => {
  throw new ValidationException({ message: 'Validation Exception' });
});
const mockLogErrorAndThrowInternalServer = jest.fn().mockImplementation(() => {
  throw new InternalServerException({ message: 'Internal Server Exception' });
});
jest.mock('@common/api/exceptions/serviceExceptions', () => ({
  logErrorAndThrowValidation: (...props: unknown[]) => mockLogErrorAndThrowValidation(...props),
  logErrorAndThrowInternalServer: (...props: unknown[]) => mockLogErrorAndThrowInternalServer(...props),
}));

jest.mock('@common', () => ({
  getEnvVariable: jest.fn().mockImplementation((env: string) => env),
}));

const mockExecuteQuery = jest.fn();
jest.mock('@datastore/api/ddb', () => ({
  DdbWrapper: {
    getInstance: jest.fn().mockReturnValue({
      executeQuery: (...props: unknown[]) => mockExecuteQuery(...props),
    }),
  },
}));

describe('handleDynamoErrorAndThrowServiceExceptions', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  it('should throw validation error when status code is 400', () => {
    const mockError: DynamoDBServiceException = {
      $metadata: {
        httpStatusCode: 400,
      },
      name: 'ValidationException',
      message: 'Validation error occurred',
    } as DynamoDBServiceException;

    expect(() => handleDynamoErrorAndThrowServiceExceptions(mockError)).toThrow(ValidationException);

    expect(mockLogErrorAndThrowValidation).toHaveBeenCalledWith({
      externalMessage: 'Validation Exception with the Dynamo Request.',
      internalMessage: expect.stringContaining('Dynamo Error with response:'),
      externalizeExceptionMessage: true,
    });
  });

  it('should throw internal server error when status code is not 400', () => {
    const mockError: DynamoDBServiceException = {
      $metadata: {
        httpStatusCode: 500,
      },
      name: 'InternalServerError',
      message: 'Internal error occurred',
    } as DynamoDBServiceException;

    expect(() => handleDynamoErrorAndThrowServiceExceptions(mockError)).toThrow(InternalServerException);

    expect(mockLogErrorAndThrowInternalServer).toHaveBeenCalledWith({
      externalMessage: 'Internal Service Failure',
      internalMessage: expect.stringContaining('Dynamo Exception:'),
      externalizeExceptionMessage: true,
    });
  });
});

describe('queryDatastoreDdb', () => {
  const mockEntities = [
    {
      entityType: EntityType.DATASET,
      entityId: 'test-dataset-id-1',
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

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  it('should query datastore DDB and return entities', async () => {
    mockExecuteQuery.mockResolvedValueOnce({
      Items: mockEntities,
      LastEvaluatedKey: undefined,
    });

    const result = await queryDatastoreDdb({ entityType: EntityType.DATASET });

    expect(result).toEqual({
      entities: mockEntities,
      lastEvaluatedSk: undefined,
    });
    expect(mockExecuteQuery).toHaveBeenCalledWith({
      partitionKey: {
        key: 'entityType',
        value: EntityType.DATASET,
      },
      limit: undefined,
      exclusiveStartKey: undefined,
    });
  });

  it('should support pagination', async () => {
    const maxItems = 2;
    const mockFirstPage = mockEntities.slice(0, maxItems);
    const mockSecondPage = mockEntities.slice(mockFirstPage.length, mockFirstPage.length + maxItems);
    mockExecuteQuery
      .mockResolvedValueOnce({
        Items: mockFirstPage,
        LastEvaluatedKey: {
          entityType: mockFirstPage[mockFirstPage.length - 1]!.entityType,
          entityId: mockFirstPage[mockFirstPage.length - 1]!.entityId,
        },
      })
      .mockResolvedValueOnce({
        Items: mockSecondPage,
        LastEvaluatedKey: undefined,
      });

    const firstDatasetsPage = await queryDatastoreDdb({
      entityType: EntityType.DATASET,
      maxResults: mockFirstPage.length,
    });

    expect(firstDatasetsPage).toEqual({
      entities: mockFirstPage,
      lastEvaluatedSk: mockFirstPage[mockFirstPage.length - 1]!.entityId,
    });
    expect(mockExecuteQuery).toHaveBeenLastCalledWith({
      partitionKey: {
        key: 'entityType',
        value: EntityType.DATASET,
      },
      limit: mockFirstPage.length,
      exclusiveStartKey: undefined,
    });

    const secondDatasetsPage = await queryDatastoreDdb({
      entityType: EntityType.DATASET,
      maxResults: mockFirstPage.length,
      lastEvaluatedSk: firstDatasetsPage.lastEvaluatedSk,
    });

    expect(secondDatasetsPage).toEqual({
      entities: mockSecondPage,
      lastEvaluatedSk: undefined,
    });
    expect(mockExecuteQuery).toHaveBeenLastCalledWith({
      partitionKey: {
        key: 'entityType',
        value: EntityType.DATASET,
      },
      limit: mockFirstPage.length,
      exclusiveStartKey: {
        entityType: EntityType.DATASET,
        entityId: firstDatasetsPage.lastEvaluatedSk,
      },
    });
  });

  it('should handle DynamoDB errors', async () => {
    const mockError = new Error('DynamoDB error');
    mockExecuteQuery.mockRejectedValueOnce(mockError);

    await expect(() => queryDatastoreDdb({ entityType: EntityType.DATASET })).rejects.toThrow();
  });

  it('Should allow passing a filter expression', async () => {
    mockExecuteQuery.mockResolvedValueOnce({
      Items: mockEntities,
      LastEvaluatedKey: undefined,
    });
    const filter: DdbConditionExpression = {
      condition: { key: 'someKey', operator: DdbConditionalOperators.EQUAL_TO, values: ['someValue'] },
    };

    const result = await queryDatastoreDdb({ entityType: EntityType.DATASET, filter });

    expect(result).toEqual({
      entities: mockEntities,
      lastEvaluatedSk: undefined,
    });
    expect(mockExecuteQuery).toHaveBeenCalledWith({
      partitionKey: {
        key: 'entityType',
        value: EntityType.DATASET,
      },
      limit: undefined,
      exclusiveStartKey: undefined,
      filter,
    });
  });
});
