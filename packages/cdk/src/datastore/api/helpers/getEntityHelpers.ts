import { EnvVariable } from '@common/config';
import { TestCase } from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import { GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { logErrorAndThrowResourceNotFound } from '@common/api/exceptions/serviceExceptions';
import {
  AnnotationSchemaDdbItem,
  DatasetDdbItem,
  DatasetVersionDdbItem,
  EntityType,
  TestCaseAnnotationDdbItem,
  TestCaseMetadata,
} from '@datastore/api/types';
import { getS3Client, queryDatastoreDdb } from '@datastore/api/utils';
import { TestCaseSchema } from '../validation';
import { parseS3TestCaseMetadata } from './parsers';
import { getTestCaseId } from './paths';
import { getEnvVariable } from '@common';
import { DdbConditionalOperators } from '@common/dynamoUtils';

/**
 * Function to get a dataset from the datastore
 * @param datasetId The dataset id to get
 * @returns The dataset ddb item
 */
export async function getDataset(datasetId: string): Promise<DatasetDdbItem> {
  const queryCommandOutput = await queryDatastoreDdb<DatasetDdbItem>({
    entityType: EntityType.DATASET,
    entityId: {
      operator: DdbConditionalOperators.EQUAL_TO,
      values: [datasetId],
    },
    maxResults: 1,
  });

  if (queryCommandOutput.entities.length === 1) {
    return queryCommandOutput.entities[0]!;
  }

  // Throws Resource not found when the dataset is not found.
  logErrorAndThrowResourceNotFound({
    externalMessage: `Dataset with id ${datasetId} not found`,
    internalMessage: `Query for datasetId: ${datasetId} results in: ${JSON.stringify(queryCommandOutput)}`,
  });
}

/**
 * Function to get a specific version of a given dataset from the datastore
 * @param datasetId The dataset id to get
 * @param version The version to get
 * @returns The datasetVersion item
 */
export async function getDatasetVersion(datasetId: string, version: number): Promise<DatasetVersionDdbItem> {
  const queryCommandOutput = await queryDatastoreDdb<DatasetVersionDdbItem>({
    entityType: EntityType.DATASET_VERSION,
    entityId: {
      operator: DdbConditionalOperators.EQUAL_TO,
      values: [`${datasetId}#${version}`],
    },
    maxResults: 1,
  });

  if (queryCommandOutput.entities.length === 1) {
    return queryCommandOutput.entities[0]!;
  }

  // Throws Resource not found when the dataset is not found.
  logErrorAndThrowResourceNotFound({
    externalMessage: `Version ${version} of Dataset ${datasetId} not found`,
    internalMessage: `Query for datasetId: ${datasetId} and version ${version} results in: ${JSON.stringify(queryCommandOutput)}`,
  });
}

/**
 * Reads test case from S3 at given path.
 * Also reads the metadata of the test case looking for (created-at, created-by, updated-at, updated-by)
 *
 * @returns test case
 */
export async function getTestCase(testCasePath: string): Promise<Omit<TestCase, 'testCaseId'>> {
  const bucketName = getEnvVariable(EnvVariable.S3_BUCKET_NAME);
  const testCaseId = getTestCaseId(testCasePath);

  try {
    const [metadata, contentResponse] = await Promise.all([
      getTestCaseMetadata(testCasePath),
      getS3Client().send(
        new GetObjectCommand({
          Bucket: bucketName,
          Key: testCasePath,
        }),
      ),
    ]);

    const stringContent = await contentResponse.Body?.transformToString();
    if (stringContent == null) {
      logErrorAndThrowResourceNotFound({ externalMessage: `test case ${testCaseId} not found` });
    }
    const testCase = TestCaseSchema.parse(JSON.parse(stringContent)) as Omit<TestCase, 'testCaseId'>;

    const { createdAt, createdBy } = metadata;
    if (createdBy != null) testCase.createdBy = createdBy;
    if (createdAt != null) testCase.createdAt = new Date(createdAt);

    return testCase;
  } catch (err) {
    logErrorAndThrowResourceNotFound({
      externalMessage: `test case ${testCaseId} not found`,
      internalMessage: `test case ${testCaseId} not found; got error: ${err}`,
    });
  }
}

export async function getTestCaseMetadata(testCasePath: string): Promise<TestCaseMetadata> {
  const s3Client = getS3Client();
  const bucketName = getEnvVariable(EnvVariable.S3_BUCKET_NAME);
  const testCaseId = getTestCaseId(testCasePath);

  try {
    const metadataResponse = await s3Client.send(
      new HeadObjectCommand({
        Bucket: bucketName,
        Key: testCasePath,
      }),
    );

    return parseS3TestCaseMetadata(metadataResponse.Metadata);
  } catch (err) {
    logErrorAndThrowResourceNotFound({
      externalMessage: `test case ${testCaseId} not found`,
      internalMessage: `test case ${testCaseId} not found; got error: ${err}`,
    });
  }
}

/**
 * Function to get an annotations schema from the datastore
 * @param name name of the annotation
 * @returns The annotation schema ddb item
 */
export async function getAnnotationSchema(name: string): Promise<AnnotationSchemaDdbItem> {
  const queryCommandOutput = await queryDatastoreDdb<AnnotationSchemaDdbItem>({
    entityType: EntityType.ANNOTATION_SCHEMA,
    entityId: {
      operator: DdbConditionalOperators.EQUAL_TO,
      values: [name],
    },
    maxResults: 1,
  });

  if (queryCommandOutput.entities.length === 1) {
    return queryCommandOutput.entities[0]!;
  }

  // Throws Resource not found when the annotation schema is not found.
  logErrorAndThrowResourceNotFound({
    externalMessage: `Annotation schema with with name ${name} not found`,
    internalMessage: `Query for annotation schema: ${name} results in: ${JSON.stringify(queryCommandOutput)}`,
  });
}

/**
 * Function to get test case annotations from the datastore
 * @param datasetId The dataset id
 * @param testCaseId The test case id
 * @returns The test case annotations ddb item
 */
export async function getTestCaseAnnotations(
  datasetId: string,
  testCaseId: string,
): Promise<TestCaseAnnotationDdbItem | undefined> {
  const queryCommandOutput = await queryDatastoreDdb<TestCaseAnnotationDdbItem>({
    entityType: EntityType.TEST_CASE_ANNOTATION,
    entityId: {
      operator: DdbConditionalOperators.EQUAL_TO,
      values: [`${datasetId}#${testCaseId}`],
    },
    maxResults: 1,
  });

  return queryCommandOutput.entities[0];
}
