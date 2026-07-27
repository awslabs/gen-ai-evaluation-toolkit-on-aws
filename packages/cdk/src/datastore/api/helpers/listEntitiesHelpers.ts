import {
  AnnotationSchemaDdbItem,
  DatasetDdbItem,
  DatasetVersionDdbItem,
  EntityType,
  TestCaseAnnotationDdbItem,
} from '@datastore/api/types';
import { QueryDatastoreDdbOutput, queryDatastoreDdb, getS3Client } from '@datastore/api/utils';
import { DdbConditionalOperators, DdbConditionExpression } from '@common/dynamoUtils';
import { AnnotationConditionExpression } from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import {
  toDdbConditionExpression,
  getDataset,
  getDatasetVersionS3Path,
  getTestCaseId,
  parseVersionString,
} from '@datastore/api/helpers';
import { ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getEnvVariable } from '@common';
import { EnvVariable } from '@common/config';

export type ListEntitiesInput = {
  maxResults?: number;
  lastEvaluatedSk?: string;
  includeArchived?: boolean;
};

export type ListDatasetVersionsInput = {
  datasetId: string;
  conditionExpression?: AnnotationConditionExpression;
} & ListEntitiesInput;

/**
 * Function to list datasets from the datastore
 * @param maxResults The maximum number of results to return
 * @param lastEvaluatedSk The last evaluated sort key to use for pagination
 * @returns The dataset ddb query response
 */
export async function listDatasets({
  maxResults,
  lastEvaluatedSk,
}: ListEntitiesInput): Promise<QueryDatastoreDdbOutput<DatasetDdbItem>> {
  return await queryDatastoreDdb<DatasetDdbItem>({
    maxResults,
    lastEvaluatedSk,
    entityType: EntityType.DATASET,
  });
}

/**
 * Function to list dataset versions from the datastore
 * @param datasetId The id of the dataset to list versions
 * @param maxResults The maximum number of results to return
 * @param lastEvaluatedSk The last evaluated sort key to use for pagination
 * @param conditionExpression The condition expression to filter the results
 * @returns The dataset ddb query response
 */
export async function listDatasetVersions({
  datasetId,
  maxResults,
  lastEvaluatedSk,
  conditionExpression,
}: ListDatasetVersionsInput): Promise<QueryDatastoreDdbOutput<DatasetVersionDdbItem>> {
  const filter = conditionExpression ? await toDdbConditionExpression(conditionExpression) : undefined;

  return await queryDatastoreDdb<DatasetVersionDdbItem>({
    maxResults,
    lastEvaluatedSk,
    entityType: EntityType.DATASET_VERSION,
    entityId: {
      operator: DdbConditionalOperators.BEGINS_WITH,
      values: [datasetId],
    },
    filter,
  });
}

/**
 * Generator that returns dataset versions item by item.
 *
 * Warning: This generator is meant to be used for streaming and is not to be exhausted since the number of items is unknown
 * and exhausting such a paginated list would be an anti-pattern.
 */
export async function* listDatasetVersionItems(datasetId: string) {
  let lastEvaluatedSk: string | undefined;
  do {
    const response = await listDatasetVersions({ datasetId, lastEvaluatedSk });
    lastEvaluatedSk = response.lastEvaluatedSk;
    yield* response.entities;
  } while (lastEvaluatedSk != null);
}

/**
 * Function to list all the defined annotation schemas
 * @param maxResults The maximum number of results to return
 * @param lastEvaluatedSk The last evaluated sort key to use for pagination
 * @param includeArchived Whether to include archived annotation schemas in the results
 * @returns The annotation schema ddb query response
 */
export async function listAnnotationSchemas({
  maxResults,
  lastEvaluatedSk,
  includeArchived,
}: ListEntitiesInput): Promise<QueryDatastoreDdbOutput<AnnotationSchemaDdbItem>> {
  // By default (undefined), filter out archived schemas
  // Only include archived schemas when includeArchived is explicitly true
  const filter: DdbConditionExpression | undefined = includeArchived
    ? undefined
    : {
        condition: {
          key: 'isArchived',
          operator: DdbConditionalOperators.EQUAL_TO,
          values: [false],
        },
      };

  return await queryDatastoreDdb<AnnotationSchemaDdbItem>({
    entityType: EntityType.ANNOTATION_SCHEMA,
    maxResults,
    lastEvaluatedSk,
    filter,
  });
}

/**
 * Function to list test case ids from the datastore S3 b ucket
 * @param datasetId The id of the dataset to list test cases
 * @param version The version of the dataset to list test cases
 * @param maxResults The maximum number of results to return
 * @param continuationToken The continuation token to use for pagination
 * @returns The list of test case ids and the continuation token
 */
export async function listTestCaseIdsFromS3({
  datasetId,
  version,
  maxResults,
  continuationToken,
}: {
  datasetId: string;
  version: string;
  maxResults?: number;
  continuationToken?: string;
}): Promise<{ testCaseIds: string[]; nextContinuationToken?: string }> {
  const dataset = await getDataset(datasetId);
  const datasetPath = getDatasetVersionS3Path(parseVersionString(version), dataset);
  const s3Client = getS3Client();
  const DatastoreS3Bucket = getEnvVariable(EnvVariable.S3_BUCKET_NAME);

  const { Contents, NextContinuationToken } = await s3Client.send(
    new ListObjectsV2Command({
      Bucket: DatastoreS3Bucket,
      Prefix: datasetPath,
      ContinuationToken: continuationToken,
      MaxKeys: maxResults,
    }),
  );

  const testCaseIds = (Contents ?? [])
    .map((obj) => obj.Key)
    .filter((key) => key != null)
    .map(getTestCaseId);

  return {
    testCaseIds,
    nextContinuationToken: NextContinuationToken,
  };
}

/**
 * Function to filter a lis of test case ids which satisfies a given condition expression
 * @param datasetId The id of the dataset to list test case annotations
 * @param testCaseIds a list of test case Ids to filter
 * @param conditionExpression The condition expression to filter the results
 * @returns test case Ids which satisfy the annotation condition
 */
export async function filterTestCases(
  datasetId: string,
  testCaseIds: string[],
  conditionExpression: AnnotationConditionExpression,
): Promise<string[]> {
  if (testCaseIds.length === 0) {
    return [];
  }

  const ddbConditionExpression = await toDdbConditionExpression(conditionExpression);
  const promises = testCaseIds.map(async (testCaseId) => {
    const result = await queryDatastoreDdb<TestCaseAnnotationDdbItem>({
      entityType: EntityType.TEST_CASE_ANNOTATION,
      entityId: {
        operator: DdbConditionalOperators.EQUAL_TO,
        values: [`${datasetId}#${testCaseId}`],
      },
      filter: ddbConditionExpression,
      maxResults: 1,
    });
    return result.entities.length > 0 ? testCaseId : undefined;
  });
  const resolvedPromises = await Promise.all(promises);
  return resolvedPromises.filter((testCaseId) => testCaseId !== undefined);
}
