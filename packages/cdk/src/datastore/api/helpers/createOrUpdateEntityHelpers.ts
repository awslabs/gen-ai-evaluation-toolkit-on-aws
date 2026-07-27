import {
  DatasetStatus,
  PutDatasetVersionAnnotationRequest,
  PutTestCaseAnnotationRequest,
} from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import { DdbWrapper } from '@datastore/api/ddb';
import {
  AnnotationContent,
  AnnotationSchemaDdbItem,
  AnnotationValueType,
  DatasetDdbItem,
  DatasetVersionDdbItem,
  EntityType,
  TestCaseAnnotationDdbItem,
} from '@datastore/api/types';
import { randomUUID } from 'crypto';
import { DS_DDB_PK, DS_DDB_SK } from '@common/config';
import { ConditionalCheckFailedException, ReturnValue } from '@aws-sdk/client-dynamodb';
import {
  logErrorAndThrowConflict,
  logErrorAndThrowResourceNotFound,
  logErrorAndThrowValidation,
} from '@common/api/exceptions/serviceExceptions';
import { getDatasetVersion, getTestCaseAnnotations } from '@datastore/api/helpers/getEntityHelpers';
import { log } from '@common/api/utils';
import { DdbConditionalOperators } from '@common/dynamoUtils';

const MAX_ANNOTATION_UPDATE_RETRIES = 3;

// Local interface for creating annotation schema
interface LocalCreateAnnotationSchemaRequest {
  name: string;
  description?: string;
  valueType: AnnotationValueType;
}

/**
 * Creates a new dataset and its initial version in the datastore
 * @param name name of the datastore
 * @param source source of the datastore
 * @param description description of the datastore
 * @returns the created dataset ddb item
 */
export async function createDataset(name: string, source: string, description?: string): Promise<DatasetDdbItem> {
  const datasetId = randomUUID();
  const currentTime = new Date().getTime();
  const datasetDdbItem: DatasetDdbItem = {
    entityType: EntityType.DATASET,
    entityId: datasetId,
    datasetId,
    name,
    description,
    createdAt: currentTime,
    source,
    status: DatasetStatus.ACTIVE,
  };

  await DdbWrapper.getInstance().putItem(datasetDdbItem);

  return datasetDdbItem;
}

/**
 * Creates a new annotation schema
 * @param schema annotation schema to save
 * @returns the created annotation schema ddb item
 */
export async function createAnnotationSchema(
  schema: LocalCreateAnnotationSchemaRequest & {
    createdBy: string;
  },
): Promise<AnnotationSchemaDdbItem> {
  // Validate valueType is a valid union type
  const valueType = schema.valueType;
  const valueTypeKeys = Object.keys(valueType);

  if (valueTypeKeys.length !== 1) {
    logErrorAndThrowValidation({
      externalMessage: 'Invalid valueType: Must contain exactly one of [number, string]',
      internalMessage: `Invalid valueType structure: ${JSON.stringify(valueType)}`,
    });
  }

  const valueTypeKey = valueTypeKeys[0];
  if (valueTypeKey !== 'number' && valueTypeKey !== 'string') {
    logErrorAndThrowValidation({
      externalMessage: `Invalid valueType: '${valueTypeKey}' is not a valid type. Must be one of [number, string]`,
      internalMessage: `Invalid valueType key: ${valueTypeKey}`,
    });
  }

  if (valueTypeKey === 'string') {
    const stringConfig = valueType.string;
    if (!stringConfig || !Array.isArray(stringConfig.enum)) {
      logErrorAndThrowValidation({
        externalMessage: 'Invalid string valueType: Must contain enum array',
        internalMessage: `Invalid string valueType structure: ${JSON.stringify(stringConfig)}`,
      });
    }
  }

  const currentTime = new Date().getTime();
  const annotationSchemaDdbItem: AnnotationSchemaDdbItem = {
    entityType: EntityType.ANNOTATION_SCHEMA,
    entityId: schema.name,
    ...schema,
    createdAt: currentTime,
    isArchived: false,
  };

  try {
    await DdbWrapper.getInstance().putItem(annotationSchemaDdbItem, {
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
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException) {
      logErrorAndThrowConflict({
        externalMessage: `Annotation Schema: '${schema.name}' already exists`,
        internalMessage: `Create request for schema '${schema.name}' failed due to conditional check failure. Error Message: ${err.message}`,
      });
    }

    throw err;
  }

  return annotationSchemaDdbItem;
}

/**
 * Archives an annotation schema
 * @param name name of the annotation schema to archive
 * @param shouldArchive whether to archive the annotation schema or not
 * @returns the updated annotation schema ddb item
 */
export async function archiveAnnotationSchema(name: string, shouldArchive = true): Promise<AnnotationSchemaDdbItem> {
  try {
    const resp = await DdbWrapper.getInstance().updateItem(
      EntityType.ANNOTATION_SCHEMA,
      name,
      {
        isArchived: shouldArchive,
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

    return resp!.Attributes as AnnotationSchemaDdbItem;
  } catch (error) {
    if (error instanceof ConditionalCheckFailedException) {
      logErrorAndThrowResourceNotFound({
        externalMessage: `Annotation Schema: ${name} not available`,
        internalMessage: `Archive request for schema ${name} failed due to conditional check failure. Error Message: ${error.message}`,
      });
    }

    throw error;
  }
}

async function updateAnnotations<T extends TestCaseAnnotationDdbItem | DatasetVersionDdbItem>(
  entityType: EntityType,
  entityId: string,
  lastUpdatedAt: number,
  updatedAnnotationMap: Record<string, AnnotationContent>,
): Promise<T> {
  const resp = await DdbWrapper.getInstance().updateItem(
    entityType,
    entityId,
    {
      annotations: updatedAnnotationMap,
      lastUpdatedAt: Date.now(),
    },
    {
      and: [
        // Updates the entry only if the entry exist and hasn't been updated after reading it.
        {
          condition: {
            key: 'lastUpdatedAt',
            operator: DdbConditionalOperators.EQUAL_TO,
            values: [lastUpdatedAt],
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
  return resp!.Attributes! as T;
}

async function createTestCaseAnnotationEntry(
  datasetId: string,
  testCaseId: string,
  annotationMap: Record<string, AnnotationContent>,
): Promise<TestCaseAnnotationDdbItem> {
  const newEntry: TestCaseAnnotationDdbItem = {
    [DS_DDB_PK]: EntityType.TEST_CASE_ANNOTATION,
    [DS_DDB_SK]: `${datasetId}#${testCaseId}`,
    datasetId: datasetId,
    testCaseId: testCaseId,
    annotations: annotationMap,
    lastUpdatedAt: Date.now(),
  };

  await DdbWrapper.getInstance().putItem(newEntry, {
    and: [
      // Creates the new entry only if not exists.
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
  return newEntry;
}

/**
 * Adds a new annotation to a given test case. If the annotation already exists, updates it.
 * @param annotation annotation to add
 * @param annotatedBy user who annotated the test case
 * @param retryCount number of retries done so far
 * @returns the updated test case annotation ddb item
 */
export async function putTestCaseAnnotation(
  annotation: PutTestCaseAnnotationRequest,
  annotatedBy: string,
  retryCount = 0,
): Promise<TestCaseAnnotationDdbItem> {
  const existingEntry = await getTestCaseAnnotations(annotation.datasetId, annotation.testCaseId);
  const newAnnotations = {
    [annotation.name]: {
      value: annotation.value,
      comment: annotation.comment,
      annotatedBy,
      annotatedAt: new Date().getTime(),
    },
  };

  try {
    if (existingEntry) {
      // Adds the new annotation into the existing annotationMap
      const updatedAnnotationMap = {
        ...existingEntry.annotations,
        ...newAnnotations,
      };
      return await updateAnnotations<TestCaseAnnotationDdbItem>(
        existingEntry.entityType,
        existingEntry.entityId,
        existingEntry.lastUpdatedAt,
        updatedAnnotationMap,
      );
    }

    return await createTestCaseAnnotationEntry(annotation.datasetId, annotation.testCaseId, newAnnotations);
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException) {
      if (retryCount < MAX_ANNOTATION_UPDATE_RETRIES) {
        return await putTestCaseAnnotation(annotation, annotatedBy, ++retryCount);
      }
      logErrorAndThrowConflict({
        externalMessage: `Failed to annotate the test case ${annotation.testCaseId} due to concurrent updates. Please try again.`,
      });
    }

    throw err;
  }
}

type RemoveAnnotationRequest = {
  annotationName: string;
  datasetId: string;
} & (
  | {
      version?: never;
      testCaseId: string;
    }
  | {
      version: number;
      testCaseId?: never;
    }
);

/**
 * Removes an annotation from a given test case or dataset version.
 * @param request annotation to remove
 * @param retryCount number of retries done so far
 * @returns the updated ddb item
 */
export async function removeAnnotation<T extends TestCaseAnnotationDdbItem | DatasetVersionDdbItem>(
  request: RemoveAnnotationRequest,
  retryCount = 0,
): Promise<T | undefined> {
  const existingEntry = request.testCaseId
    ? await getTestCaseAnnotations(request.datasetId, request.testCaseId)
    : await getDatasetVersion(request.datasetId, request.version!);
  if (
    !existingEntry ||
    !existingEntry.annotations ||
    !Object.hasOwn(existingEntry.annotations, request.annotationName)
  ) {
    log.warn(
      `The requested annotation to be deleted '${request.annotationName}' cannot be found in ${request.testCaseId ? `test case '${request.testCaseId}'` : `version '${request.version}'`} of dataset '${request.datasetId}'`,
    );
    return;
  }

  const { [request.annotationName]: _, ...remainingAnnotations } = existingEntry.annotations;
  try {
    return await updateAnnotations<T>(
      existingEntry.entityType,
      existingEntry.entityId,
      existingEntry.lastUpdatedAt,
      remainingAnnotations,
    );
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException) {
      if (retryCount < MAX_ANNOTATION_UPDATE_RETRIES) {
        return await removeAnnotation(request, ++retryCount);
      }
      logErrorAndThrowConflict({
        externalMessage: `Failed to remove annotation '${request.annotationName}' due to concurrent updates. Please try again.`,
      });
    }

    throw err;
  }
}

/**
 * Adds a new annotation to a given dataset version. If the annotation already exists, updates it.
 * @param annotation annotation to add
 * @param annotatedBy user who annotated the dataset version
 * @param retryCount number of retries done so far
 * @returns the updated dataset version ddb item
 */
export async function putDatasetVersionAnnotation(
  annotation: PutDatasetVersionAnnotationRequest,
  annotatedBy: string,
  retryCount = 0,
): Promise<DatasetVersionDdbItem> {
  const { datasetId, version, name: annotationName, ...annotationDetails } = annotation;
  const datasetVersion = await getDatasetVersion(datasetId, version);
  const annotations = datasetVersion.annotations ?? {};
  annotations[annotationName] = {
    ...annotationDetails,
    annotatedBy,
    annotatedAt: Date.now(),
  };

  try {
    return await updateAnnotations<DatasetVersionDdbItem>(
      datasetVersion.entityType,
      datasetVersion.entityId,
      datasetVersion.lastUpdatedAt,
      annotations,
    );
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException) {
      if (retryCount < MAX_ANNOTATION_UPDATE_RETRIES) {
        return await putDatasetVersionAnnotation(annotation, annotatedBy, ++retryCount);
      }
      logErrorAndThrowConflict({
        externalMessage: `Failed to annotate the dataset version ${version} due to concurrent updates. Please try again.`,
      });
    }

    throw err;
  }
}
