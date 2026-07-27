import { DS_DDB_PK, DS_DDB_SK, EnvVariable } from '@common/config';
import {
  DynamoDBClient,
  DynamoDBServiceException,
  ReturnConsumedCapacity,
  ReturnItemCollectionMetrics,
  ReturnValue,
  TransactWriteItem,
} from '@aws-sdk/client-dynamodb';
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
  NativeAttributeValue,
  PutCommand,
  PutCommandInput,
  PutCommandOutput,
  QueryCommand,
  QueryCommandInput,
  QueryCommandOutput,
  TransactWriteCommand,
  TransactWriteCommandOutput,
  UpdateCommand,
  UpdateCommandInput,
  UpdateCommandOutput,
} from '@aws-sdk/lib-dynamodb';
import assert from 'assert';
import { EntityType } from './types';
import { log } from './utils/logUtils';
import { getEnvVariable } from '@common';
import {
  buildDdbConditionExpression,
  buildKeyConditionExpression,
  buildUpdateExpression,
  DdbAttribute,
  DdbConditionExpression,
  SortKeyQueryCondition,
} from '@common/dynamoUtils';
import AWSXRay from 'aws-xray-sdk-core';

export const DYNAMO_TRANSACT_ITEMS_LIMIT = 100;
export const DYNAMO_BATCH_WRITE_LIMIT = 25;

type DdbItem = Record<string, NativeAttributeValue>;

/**
 * Execute Query Input
 */
export interface ExecuteQueryInput {
  partitionKey: DdbAttribute;
  sortKeyCondition?: SortKeyQueryCondition;
  sortDescending?: boolean;
  filter?: DdbConditionExpression;
  secondaryIndexName?: string;
  exclusiveStartKey?: Record<string, NativeAttributeValue>;
  consistentRead?: boolean;
  limit?: number;
  projectionExpression?: string;
}

export type ItemIdentifier = { [DS_DDB_PK]: EntityType; [DS_DDB_SK]: string };

export class DdbWrapper {
  private readonly dynamodb: DynamoDBDocumentClient;
  private readonly tableName: string;
  private static instance: DdbWrapper | undefined;

  private constructor(tableName: string) {
    const client = new DynamoDBClient();
    // Instrument the client with X-Ray
    AWSXRay.captureAWSv3Client(client);

    this.dynamodb = DynamoDBDocumentClient.from(client, {
      marshallOptions: {
        // removes undefined values from JS arrays/ Sets/ objects when marshalling to DynamoDB lists/ sets/ maps respectively.
        removeUndefinedValues: true,
      },
    });
    this.tableName = tableName;
  }

  public static getInstance(tableName?: string): DdbWrapper {
    if (tableName == null) tableName = getEnvVariable(EnvVariable.DYNAMO_TABLE_NAME);

    if (!DdbWrapper.instance) {
      DdbWrapper.instance = new DdbWrapper(tableName);
    }
    return DdbWrapper.instance;
  }

  public async putItem<T extends DdbItem>(
    item: T,
    conditionExpression?: DdbConditionExpression,
  ): Promise<PutCommandOutput> {
    const commandInput: PutCommandInput = {
      TableName: this.tableName,
      Item: item,
    };
    if (conditionExpression) {
      const { expression, expressionAttributeNames, expressionAttributeValues } =
        buildDdbConditionExpression(conditionExpression);
      commandInput.ConditionExpression = expression;
      commandInput.ExpressionAttributeNames = expressionAttributeNames;
      // empty objects are not allowed for ExpressionAttributeValues property.
      commandInput.ExpressionAttributeValues =
        Object.keys(expressionAttributeValues).length > 0 ? expressionAttributeValues : undefined;
    }

    const command = new PutCommand(commandInput);
    return await this.dynamodb.send(command);
  }

  /**
   * Function to PUT one or more items as a transaction. Based on available WCUs, this command could be throttled
   * @see https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/dynamodb/command/TransactWriteItemsCommand/
   * @param items Array of TransactionWriteItem[]
   * @param maxRetries number of retries that should be performed before returning a failure
   * @returns TransactWriteCommandOutput
   */
  public async transactPutItems<T extends DdbItem>(
    items: T[],
    maxRetries: number,
  ): Promise<TransactWriteCommandOutput> {
    log.info(`starting transactPutItems with ${items.length} items`);
    if (items.length >= DYNAMO_TRANSACT_ITEMS_LIMIT) {
      throw new Error('Items array length is greater than 100. This is not supported by DynamoDB');
    }

    // Start attempt at 1 and allow retries to be exhausted
    const attempt = 1;

    log.info(`Starting marshallTransactPutItems...`);
    const marshalledItems = this.marshallTransactPutItems(items);

    log.info(`marshalling of items is complete. Creating & Sending TransactWriteCommand`);
    // allowNullValues is always set to False since this is a put item operation
    return await this.transactWriteItems(marshalledItems, attempt, maxRetries, false);
  }

  /**
   * Creates and Executes a query command based on the input params
   * Usage notes:
   * Filter can only contain non-primary key attributes.
   * Consistent reads aren't available when using GSIs and consistentRead value in input would be ignored in this case
   * @see https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-dynamodb/classes/querycommand.html
   * @param input ExecuteQueryInput
   * @returns QueryCommandOutput response
   */
  public async executeQuery(input: ExecuteQueryInput): Promise<QueryCommandOutput> {
    log.debug(`executeQuery: ${JSON.stringify(input)}`);

    const {
      expression: keyConditionExpression,
      expressionAttributeNames: keyConditionExpressionAttributeNames,
      expressionAttributeValues: keyConditionExpressionAttributeValues,
    } = buildKeyConditionExpression(input.partitionKey, input.sortKeyCondition);

    const queryCommandInput: QueryCommandInput = {
      TableName: this.tableName,
      KeyConditionExpression: keyConditionExpression,
      ExpressionAttributeValues: keyConditionExpressionAttributeValues,
      ExpressionAttributeNames: keyConditionExpressionAttributeNames,
      ProjectionExpression: input.projectionExpression,
    };

    // Set ScanIndexForward if input.sortDescending is provided
    if (input.sortDescending !== undefined) {
      queryCommandInput.ScanIndexForward = !input.sortDescending;
    }

    // Set ExclusiveStartKey if present to support pagination
    if (input.exclusiveStartKey) {
      queryCommandInput.ExclusiveStartKey = input.exclusiveStartKey;
    }

    // Build and Add FilterExpression if filters exists in input
    if (input.filter) {
      const {
        expression: filterExpression,
        expressionAttributeNames: filterExpressionAttributeNames,
        expressionAttributeValues: filterExpressionAttributeValues,
      } = buildDdbConditionExpression(input.filter);
      queryCommandInput.FilterExpression = filterExpression;
      queryCommandInput.ExpressionAttributeNames = {
        ...queryCommandInput.ExpressionAttributeNames,
        ...filterExpressionAttributeNames,
      };
      queryCommandInput.ExpressionAttributeValues = {
        ...queryCommandInput.ExpressionAttributeValues,
        ...filterExpressionAttributeValues,
      };
    }

    // Add limit (number of records pulled) if defined
    if (input.limit && input.limit > 0) {
      queryCommandInput.Limit = input.limit;
    }

    // Use GSI if provided with appropriate PK and SK. Otherwise, use Table PK/SK with ability to provide consistent read
    if (input.secondaryIndexName) {
      queryCommandInput.IndexName = input.secondaryIndexName;
      log.debug(`Querying with GSI: ${input.secondaryIndexName}`);
    } else {
      log.debug(`Querying with Table Keys`);
      queryCommandInput.ConsistentRead = input.consistentRead ?? true;
      log.debug(`With Consistent Read as: ${input.consistentRead ?? true}`);
    }

    log.debug(
      `Querying items in DDB table: ${this.tableName} with QueryCommandInput: ${JSON.stringify(queryCommandInput)}`,
    );
    const command = new QueryCommand(queryCommandInput);

    return await this.dynamodb.send(command);
  }

  /**
   * Function to create an Array of TransactWriteItem Put Objects
   * @param input Attributes[]
   * @returns TransactWriteItem[] Array of TransactWriteItem with Put Objects
   */
  private marshallTransactPutItems(input: DdbItem[]): TransactWriteItem[] {
    return input.map((item) => {
      return {
        Put: {
          Item: item,
          TableName: this.tableName,
        },
      } as TransactWriteItem;
    });
  }

  /**
   * Writes items as a Transaction to DynamoDB with retries for Put and Update
   * @param items TransactionWriteItem[]
   * @param attempt number of batches to divide a transaction
   * @param maxRetries number of max retries
   * @param allowNullValues Boolean to show if null values should be allowed.
   * @return info about the status of the call.
   */
  private async transactWriteItems(
    items: TransactWriteItem[],
    attempt: number,
    maxRetries: number,
    allowNullValues?: undefined | boolean,
  ): Promise<TransactWriteCommandOutput> {
    try {
      const command = new TransactWriteCommand({
        TransactItems: items,
        ReturnConsumedCapacity: ReturnConsumedCapacity.TOTAL,
        ReturnItemCollectionMetrics: ReturnItemCollectionMetrics.SIZE,
      });
      const response = await this.dynamodb.send(command);
      log.info(`Received Successful transactWriteItems response from DynamoDB`);
      return response;
    } catch (error) {
      if (attempt <= maxRetries) {
        log.info(`Starting attempt ${attempt} of transactWriteItems`);
        // Dynamo recommends exponential retries so adding wait time before trying again
        const waitTime = Math.pow(2, attempt - 1) * 100;
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        return await this.transactWriteItems(items, attempt + 1, maxRetries, allowNullValues);
      } else {
        log.error(`DynamoDB transactWriteItems failed after ${maxRetries} retries.`);
        log.error((error as DynamoDBServiceException).message);
        throw error;
      }
    }
  }

  async updateItem(
    entityType: EntityType,
    entityId: string,
    updateValues: Record<string, NativeAttributeValue>,
    conditionExpression?: DdbConditionExpression,
    returnValues?: ReturnValue,
  ): Promise<UpdateCommandOutput | undefined> {
    if (Object.keys(updateValues).length == 0) return;

    const {
      expression: updateExpression,
      expressionAttributeNames: updateExpressionAttributeNames,
      expressionAttributeValues: updateExpressionAttributeValues,
    } = buildUpdateExpression(updateValues);

    const updateRequest: UpdateCommandInput = {
      TableName: this.tableName,
      Key: {
        [DS_DDB_PK]: entityType,
        [DS_DDB_SK]: entityId,
      },
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: updateExpressionAttributeNames,
      ExpressionAttributeValues: updateExpressionAttributeValues,
      ReturnValues: returnValues,
    };

    if (conditionExpression) {
      const {
        expression: updateCondition,
        expressionAttributeNames: conditionExpressionAttributeNames,
        expressionAttributeValues: conditionExpressionAttributeValues,
      } = buildDdbConditionExpression(conditionExpression);

      updateRequest.ConditionExpression = updateCondition;
      updateRequest.ExpressionAttributeNames = {
        ...updateRequest.ExpressionAttributeNames,
        ...conditionExpressionAttributeNames,
      };
      updateRequest.ExpressionAttributeValues = {
        ...updateRequest.ExpressionAttributeValues,
        ...conditionExpressionAttributeValues,
      };
    }

    return await this.dynamodb.send(new UpdateCommand(updateRequest));
  }

  /**
   * Deletes given items in a batch write operation.
   * Items length must not exceed DYNAMO_BATCH_WRITE_LIMIT, throws assertion error otherwise.
   *
   * @param items items to be deleted
   */
  async deleteItems(items: ItemIdentifier[]) {
    assert(items.length <= DYNAMO_BATCH_WRITE_LIMIT, "Provided items exceed dynamo's batch write limit");
    if (items.length == 0) return;

    const command = new BatchWriteCommand({
      RequestItems: {
        [this.tableName]: items.map((item) => ({
          DeleteRequest: {
            Key: {
              [DS_DDB_PK]: item.entityType,
              [DS_DDB_SK]: item.entityId,
            },
          },
        })),
      },
    });

    await this.dynamodb.send(command);
  }

  /**
   * Syntactic sugar for deleteItems([item])
   */
  async deleteItem(item: ItemIdentifier) {
    await this.deleteItems([item]);
  }
}
