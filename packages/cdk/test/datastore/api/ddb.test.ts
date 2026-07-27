import { QueryCommand, QueryCommandOutput, TransactWriteCommandOutput } from '@aws-sdk/lib-dynamodb';
import { DS_DDB_PK, DS_DDB_SK } from '@common/config';
import { DdbConditionalOperators, DdbConditionExpression } from '@common/dynamoUtils';
import { DdbWrapper, DYNAMO_BATCH_WRITE_LIMIT, ExecuteQueryInput, ItemIdentifier } from '@datastore/api/ddb';
import { EntityType } from '@datastore/api/types';

jest.mock('aws-xray-sdk-core', () => ({ captureAWSv3Client: (e: unknown) => e }));

const mockSend = jest.fn();
jest.mock('@aws-sdk/lib-dynamodb', () => ({
  ...jest.requireActual('@aws-sdk/lib-dynamodb'),
  DynamoDBDocumentClient: {
    from: jest.fn().mockReturnValue({
      send: (...props: unknown[]) => mockSend(...props),
    }),
  },
}));

const tableName = 'test-table';

afterEach(() => {
  jest.clearAllMocks();
});

describe('getInstance', () => {
  it('should create a new instance when called for the first time', () => {
    const instance1 = DdbWrapper.getInstance(tableName);
    expect(instance1).toBeInstanceOf(DdbWrapper);
  });

  it('should return the same instance when called multiple times', () => {
    const instance1 = DdbWrapper.getInstance(tableName);
    const instance2 = DdbWrapper.getInstance(tableName);
    expect(instance1).toBe(instance2);
  });
});

describe('putItem', () => {
  const wrapper: DdbWrapper = DdbWrapper.getInstance(tableName);
  const testItem = { id: '123', name: 'test' };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should successfully put an item', async () => {
    const expectedResponse = {
      $metadata: { requestId: 'test-request-id' },
    };

    mockSend.mockResolvedValueOnce(expectedResponse);

    const result = await wrapper.putItem(testItem);

    expect(mockSend).toHaveBeenCalled();

    expect(result).toEqual(expectedResponse);
  });

  it('Should allow condition expressions', async () => {
    const conditionExpression: DdbConditionExpression = {
      condition: {
        operator: DdbConditionalOperators.EQUAL_TO,
        key: 'SomeKey',
        values: [123],
      },
    };

    await wrapper.putItem(testItem, conditionExpression);

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          ConditionExpression: '#SomeKey = :SomeKey_ForCond_0',
          ExpressionAttributeNames: { '#SomeKey': 'SomeKey' },
          ExpressionAttributeValues: { ':SomeKey_ForCond_0': 123 },
        }),
      }),
    );
  });

  it('Should handle key-only condition expressions', async () => {
    const conditionExpression: DdbConditionExpression = {
      condition: {
        operator: DdbConditionalOperators.ATTRIBUTE_EXISTS,
        key: 'SomeKey',
      },
    };

    await wrapper.putItem(testItem, conditionExpression);

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          ConditionExpression: 'attribute_exists(#SomeKey)',
          ExpressionAttributeNames: { '#SomeKey': 'SomeKey' },
          ExpressionAttributeValues: undefined,
        }),
      }),
    );
  });

  it('should throw an error when put operation fails', async () => {
    const error = new Error('DynamoDB error');

    mockSend.mockRejectedValueOnce(error);

    await expect(wrapper.putItem(testItem)).rejects.toThrow('DynamoDB error');
  });
});

describe('transactPutItems', () => {
  const wrapper: DdbWrapper = DdbWrapper.getInstance(tableName);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should successfully put items in a transaction', async () => {
    const mockItems = [
      { id: '1', data: 'test1' },
      { id: '2', data: 'test2' },
    ];

    const mockResponse: TransactWriteCommandOutput = {
      $metadata: {},
      ConsumedCapacity: [],
    };
    mockSend.mockResolvedValueOnce(mockResponse);

    const result = await wrapper.transactPutItems(mockItems, 3);
    expect(result).toEqual(mockResponse);
  });

  it('should throw error when items exceed limit', async () => {
    const mockItems = Array(101).fill({ id: '1', data: 'test' });

    await expect(wrapper.transactPutItems(mockItems, 3)).rejects.toThrow('Items array length is greater than 100');
  });

  it('should retry on failure up to maxRetries', async () => {
    const mockItems = [{ id: '1', data: 'test' }];
    const mockError = new Error('TransactionConflict');

    mockSend.mockRejectedValueOnce(mockError).mockRejectedValueOnce(mockError).mockResolvedValueOnce({ $metadata: {} });

    const result = await wrapper.transactPutItems(mockItems, 3);
    expect(result).toBeDefined();
    expect(mockSend).toHaveBeenCalledTimes(3);
  });

  it('should fail after exceeding maxRetries', async () => {
    const mockItems = [{ id: '1', data: 'test' }];
    const mockError = new Error('TransactionConflict');

    mockSend.mockRejectedValue(mockError);

    await expect(wrapper.transactPutItems(mockItems, 2)).rejects.toThrow('TransactionConflict');
  });
});

describe('executeQuery', () => {
  const wrapper: DdbWrapper = DdbWrapper.getInstance(tableName);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('Should query the table when a valid input is provided', async () => {
    const mockInput: ExecuteQueryInput = {
      partitionKey: {
        key: 'pk',
        value: 'pk-val',
      },
      sortKeyCondition: {
        key: 'sk',
        operator: DdbConditionalOperators.EQUAL_TO,
        values: ['sk-val'],
      },
      sortDescending: true,
      filter: {
        condition: {
          key: 'some-attr',
          operator: DdbConditionalOperators.EQUAL_TO,
          values: ['some-val'],
        },
      },
      exclusiveStartKey: {
        someKey: 'some-val',
      },
      limit: 2,
    };

    const mockOutput: QueryCommandOutput = {
      Items: [{ key1: 'val1' }, { key2: 'val2' }],
      $metadata: {},
    };
    mockSend.mockResolvedValueOnce(mockOutput);

    const result = await wrapper.executeQuery(mockInput);
    expect(result).toEqual(mockOutput);
    expect(mockSend.mock.lastCall[0]).toBeInstanceOf(QueryCommand);
    expect((mockSend.mock.lastCall[0] as QueryCommand).input.KeyConditionExpression).toEqual(
      '(#pk = :pk_ForCond_0) AND (#sk = :sk_ForCond_1)',
    );
    expect((mockSend.mock.lastCall[0] as QueryCommand).input.ExpressionAttributeValues).toEqual({
      ':pk_ForCond_0': 'pk-val',
      ':sk_ForCond_1': 'sk-val',
      ':some_attr_ForCond_0': 'some-val',
    });
    expect((mockSend.mock.lastCall[0] as QueryCommand).input.ExpressionAttributeNames).toEqual({
      '#pk': 'pk',
      '#sk': 'sk',
      '#some_attr': 'some-attr',
    });
    expect((mockSend.mock.lastCall[0] as QueryCommand).input.FilterExpression).toEqual(
      '#some_attr = :some_attr_ForCond_0',
    );
  });

  it('Should properly handle BETWEEN sort key filter operation', async () => {
    const mockInput: ExecuteQueryInput = {
      partitionKey: {
        key: 'pk',
        value: 'pk-val',
      },
      sortKeyCondition: {
        key: 'sk',
        operator: DdbConditionalOperators.BETWEEN,
        values: ['sk-val-1', 'sk-val-2'],
      },
      limit: 2,
    };

    const mockOutput: QueryCommandOutput = {
      Items: [{ key1: 'val1' }, { key2: 'val2' }],
      $metadata: {},
    };
    mockSend.mockResolvedValueOnce(mockOutput);

    const result = await wrapper.executeQuery(mockInput);
    expect(result).toEqual(mockOutput);
    expect(mockSend.mock.lastCall[0]).toBeInstanceOf(QueryCommand);
    expect((mockSend.mock.lastCall[0] as QueryCommand).input.KeyConditionExpression).toEqual(
      '(#pk = :pk_ForCond_0) AND (#sk BETWEEN :sk_1_ForCond_1 AND :sk_2_ForCond_1)',
    );
    expect((mockSend.mock.lastCall[0] as QueryCommand).input.ExpressionAttributeNames).toEqual({
      '#pk': 'pk',
      '#sk': 'sk',
    });
    expect((mockSend.mock.lastCall[0] as QueryCommand).input.ExpressionAttributeValues).toEqual({
      ':pk_ForCond_0': 'pk-val',
      ':sk_1_ForCond_1': 'sk-val-1',
      ':sk_2_ForCond_1': 'sk-val-2',
    });
  });

  it('Should query Gsi when a proper input is provided.', async () => {
    const mockInput: ExecuteQueryInput = {
      partitionKey: {
        key: 'pk',
        value: 'pk-val',
      },
      sortKeyCondition: {
        key: 'sk',
        operator: DdbConditionalOperators.BEGINS_WITH,
        values: ['sk-val'],
      },
      limit: 2,
      filter: {
        condition: {
          key: 'some-attr',
          operator: DdbConditionalOperators.EQUAL_TO,
          values: ['some-val'],
        },
      },
      secondaryIndexName: 'some-gsi',
    };

    const mockOutput: QueryCommandOutput = {
      Items: [{ key1: 'val1' }, { key2: 'val2' }],
      $metadata: {},
    };
    mockSend.mockResolvedValueOnce(mockOutput);

    const result = await wrapper.executeQuery(mockInput);
    expect(result).toEqual(mockOutput);
    expect(mockSend.mock.lastCall[0]).toBeInstanceOf(QueryCommand);
    expect((mockSend.mock.lastCall[0] as QueryCommand).input.KeyConditionExpression).toEqual(
      '(#pk = :pk_ForCond_0) AND (begins_with(#sk, :sk_ForCond_1))',
    );
    expect((mockSend.mock.lastCall[0] as QueryCommand).input.FilterExpression).toEqual(
      '#some_attr = :some_attr_ForCond_0',
    );
    expect((mockSend.mock.lastCall[0] as QueryCommand).input.ExpressionAttributeNames).toEqual({
      '#pk': 'pk',
      '#sk': 'sk',
      '#some_attr': 'some-attr',
    });
    expect((mockSend.mock.lastCall[0] as QueryCommand).input.ExpressionAttributeValues).toEqual({
      ':pk_ForCond_0': 'pk-val',
      ':sk_ForCond_1': 'sk-val',
      ':some_attr_ForCond_0': 'some-val',
    });
  });

  it('Should throw an error when executeQuery operation fails', async () => {
    const mockInput: ExecuteQueryInput = {
      partitionKey: {
        key: 'pk',
        value: 'pk-val',
      },
      sortKeyCondition: {
        key: 'sk',
        operator: DdbConditionalOperators.BETWEEN,
        values: ['sk-val-1', 'sk-val-2'],
      },
      limit: 2,
    };
    const error = new Error('DynamoDB error');

    mockSend.mockRejectedValueOnce(error);

    await expect(wrapper.executeQuery(mockInput)).rejects.toThrow('DynamoDB error');
  });
});

describe('DdbWrapper', () => {
  const wrapper = DdbWrapper.getInstance(tableName);

  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('updateItem', () => {
    it('should create correct update expression for single field update', async () => {
      const updateValues = { name: 'updated-name' };

      await wrapper.updateItem(EntityType.DATASET, '123', updateValues);

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: {
            TableName: tableName,
            Key: {
              [DS_DDB_PK]: EntityType.DATASET,
              [DS_DDB_SK]: '123',
            },
            UpdateExpression: 'SET #name = :nameForUpdate',
            ExpressionAttributeNames: { '#name': 'name' },
            ExpressionAttributeValues: { ':nameForUpdate': updateValues.name },
          },
        }),
      );
    });

    it('should create correct command for conditional update', async () => {
      const updateValues = { name: 'updated-name' };
      const condition: DdbConditionExpression = {
        condition: {
          key: 'name',
          operator: DdbConditionalOperators.EQUAL_TO,
          values: ['not-updated'],
        },
      };

      await wrapper.updateItem(EntityType.DATASET, '123', updateValues, condition);

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: {
            TableName: tableName,
            Key: {
              [DS_DDB_PK]: EntityType.DATASET,
              [DS_DDB_SK]: '123',
            },
            UpdateExpression: 'SET #name = :nameForUpdate',
            ConditionExpression: '#name = :name_ForCond_0',
            ExpressionAttributeNames: { '#name': 'name' },
            ExpressionAttributeValues: {
              ':nameForUpdate': updateValues.name,
              ':name_ForCond_0': 'not-updated',
            },
          },
        }),
      );
    });

    it('should create correct update expression for multiple fields update', async () => {
      const updateValues = {
        name: 'updated-name',
        description: 'updated-description',
      };

      await wrapper.updateItem(EntityType.DATASET, '123', updateValues);

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: {
            TableName: tableName,
            Key: {
              [DS_DDB_PK]: EntityType.DATASET,
              [DS_DDB_SK]: '123',
            },
            UpdateExpression: 'SET #description = :descriptionForUpdate, #name = :nameForUpdate',
            ExpressionAttributeNames: {
              '#name': 'name',
              '#description': 'description',
            },
            ExpressionAttributeValues: {
              ':nameForUpdate': updateValues.name,
              ':descriptionForUpdate': updateValues.description,
            },
          },
        }),
      );
    });

    it('should handle empty update values object', async () => {
      await wrapper.updateItem(EntityType.DATASET, '123', {});
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('should propagate DynamoDB errors', async () => {
      const error = new Error('DynamoDB error');
      mockSend.mockImplementationOnce(() => Promise.reject(error));

      const updateValues = { name: 'updated-name' };
      await expect(wrapper.updateItem(EntityType.DATASET, '123', updateValues)).rejects.toThrow('DynamoDB error');
    });
  });

  describe('deleteItems', () => {
    it('should make the right request to delete selected items', async () => {
      const items: ItemIdentifier[] = Array(10)
        .fill(0)
        .map((_, i) => ({ entityType: EntityType.DATASET, entityId: `id-${i}` }));

      await wrapper.deleteItems(items);

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: {
            RequestItems: {
              [tableName]: items.map((item) => ({
                DeleteRequest: {
                  Key: {
                    [DS_DDB_PK]: item.entityType,
                    [DS_DDB_SK]: item.entityId,
                  },
                },
              })),
            },
          },
        }),
      );
    });

    it('should handle empty array', async () => {
      await wrapper.deleteItems([]);
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('should reject for too much items', async () => {
      const items: ItemIdentifier[] = Array(DYNAMO_BATCH_WRITE_LIMIT + 1)
        .fill(0)
        .map((_, i) => ({ entityType: EntityType.DATASET, entityId: `id-${i}` }));

      await expect(wrapper.deleteItems(items)).rejects.toThrow();
      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  describe('deleteItem', () => {
    it('should call deleteItems', async () => {
      wrapper.deleteItems = jest.fn();
      const item = { entityType: EntityType.DATASET, entityId: `id` };

      await wrapper.deleteItem(item);
      expect(wrapper.deleteItems).toHaveBeenCalledWith([item]);
    });
  });
});
