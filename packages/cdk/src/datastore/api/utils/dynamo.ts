import { DdbWrapper } from '@datastore/api/ddb';
import { logErrorAndThrowInternalServer, logErrorAndThrowValidation } from '@common/api/exceptions/serviceExceptions';
import {
  AnnotationSchemaDdbItem,
  DatasetDdbItem,
  DatasetVersionDdbItem,
  DatastoreDdbPrimaryKey,
  EntityType,
  TestCaseAnnotationDdbItem,
} from '@datastore/api/types';
import { DynamoDBServiceException } from '@aws-sdk/client-dynamodb';
import { getEnvVariable } from '@common';
import { DS_DDB_PK, DS_DDB_SK, EnvVariable } from '@common/config';
import { NativeAttributeValue } from '@aws-sdk/lib-dynamodb';
import { DdbConditionalOperators, DdbConditionExpression } from '@common/dynamoUtils';

type SkFilterCondition =
  | {
      operator: DdbConditionalOperators.BETWEEN;
      values: [NativeAttributeValue, NativeAttributeValue]; // Only two values are accepted
    }
  | {
      operator:
        | DdbConditionalOperators.EQUAL_TO
        | DdbConditionalOperators.GREATER_THAN
        | DdbConditionalOperators.GREATER_THAN_OR_EQUAL_TO
        | DdbConditionalOperators.LESS_THAN
        | DdbConditionalOperators.LESS_THAN_OR_EQUAL_TO
        | DdbConditionalOperators.BEGINS_WITH;
      values: [NativeAttributeValue];
    };

export type QueryDatastoreDdbInput = {
  maxResults?: number;
  lastEvaluatedSk?: string;
  [DS_DDB_PK]: EntityType;
  [DS_DDB_SK]?: SkFilterCondition;
  filter?: DdbConditionExpression;
};

type DatastoreDdbItem = DatasetDdbItem | DatasetVersionDdbItem | AnnotationSchemaDdbItem | TestCaseAnnotationDdbItem;

export type QueryDatastoreDdbOutput<T extends DatastoreDdbItem> = {
  entities: T[];
  lastEvaluatedSk?: string;
};

/**
 * Function to query the datastore ddb
 * @param entityType entity type
 * @param entityId entity id
 * @param maxResults max no of results
 * @param lastEvaluatedSk last evaluated sort key
 * @param filter a filter expression to apply to the query
 * @returns The dataset ddb item
 */
export async function queryDatastoreDdb<T extends DatastoreDdbItem>({
  entityType,
  entityId,
  maxResults,
  lastEvaluatedSk,
  filter,
}: QueryDatastoreDdbInput): Promise<QueryDatastoreDdbOutput<T>> {
  const tableName = getEnvVariable(EnvVariable.DYNAMO_TABLE_NAME);

  const lastEvaluatedKey: DatastoreDdbPrimaryKey | undefined = lastEvaluatedSk
    ? { [DS_DDB_PK]: entityType, [DS_DDB_SK]: lastEvaluatedSk }
    : undefined;

  try {
    const queryCommandOutput = await DdbWrapper.getInstance(tableName).executeQuery({
      partitionKey: {
        key: DS_DDB_PK,
        value: entityType,
      },
      sortKeyCondition: entityId
        ? {
            key: DS_DDB_SK,
            ...entityId,
          }
        : undefined,
      limit: maxResults,
      exclusiveStartKey: lastEvaluatedKey,
      filter,
    });

    return {
      entities: (queryCommandOutput.Items ?? []) as T[],
      lastEvaluatedSk: (queryCommandOutput.LastEvaluatedKey as DatastoreDdbPrimaryKey | undefined)?.[DS_DDB_SK],
    };
  } catch (error) {
    handleDynamoErrorAndThrowServiceExceptions(error as DynamoDBServiceException);
  }
}

/**
 * Function to handle Dynamo Exceptions/Error that are returned by the SDK
 * @param errorOutput The Promised output type from the Query - Add other types as needed.
 * @returns never as Exception is logged and thrown
 */
export function handleDynamoErrorAndThrowServiceExceptions(errorOutput: DynamoDBServiceException): never {
  if (errorOutput.$metadata.httpStatusCode === 400) {
    logErrorAndThrowValidation({
      externalMessage: `Validation Exception with the Dynamo Request.`,
      internalMessage: `Dynamo Error with response: ${JSON.stringify(errorOutput)}`,
      externalizeExceptionMessage: true,
    });
  }

  logErrorAndThrowInternalServer({
    externalMessage: `Internal Service Failure`,
    internalMessage: `Dynamo Exception: ${JSON.stringify(errorOutput)}`,
    externalizeExceptionMessage: true,
  });
}
