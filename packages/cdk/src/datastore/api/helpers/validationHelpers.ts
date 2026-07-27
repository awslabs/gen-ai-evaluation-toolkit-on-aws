import { Annotation } from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import {
  logErrorAndThrowResourceNotFound,
  logErrorAndThrowUnprocessableEntity,
  logErrorAndThrowValidation,
} from '@common/api/exceptions/serviceExceptions';
import { getAnnotationSchema, getDataset, getTestCaseMetadata } from '@datastore/api/helpers/getEntityHelpers';
import { getS3VersionPath } from '@datastore/api/helpers/paths';
import path from 'path';

/**
 * Asserts that the annotation value is valid according to the schema
 * @param annotation annotation value to validate
 */
export async function assertAnnotationValidity(annotation: Pick<Annotation, 'name' | 'value'>): Promise<void> {
  const schema = await getAnnotationSchema(annotation.name);
  if (schema.isArchived) {
    logErrorAndThrowUnprocessableEntity({
      externalMessage: `Annotation '${annotation.name}' cannot be used as it is archived.`,
    });
  }

  if (!!schema.valueType.number && !annotation.value.numericValue) {
    logErrorAndThrowValidation({
      externalMessage: `Annotation '${annotation.name}' expects a numeric value.`,
    });
  }

  if (
    !!schema.valueType.string &&
    !(annotation.value.stringValue && schema.valueType.string.enum.includes(annotation.value.stringValue))
  ) {
    logErrorAndThrowValidation({
      externalMessage: `Annotation '${annotation.name}' expects a value from the enumeration: [${schema.valueType.string.enum.join(', ')}].`,
    });
  }
}

/**
 * Function to check if a test case exists in a minted version of a given dataset
 * @param datasetId The dataset id to check
 * @param testCaseId The test case id to check
 * @returns boolean indicating if the test case exists
 */
export async function assertTestCaseExistence(datasetId: string, testCaseId: string): Promise<void> {
  const { currentVersion } = await getDataset(datasetId);
  if (!currentVersion) {
    logErrorAndThrowResourceNotFound({
      externalMessage: `Minted versions are not found in dataset '${datasetId}'.`,
    });
  }

  const s3SearchPaths = Array.from({ length: currentVersion }, (_, i) => getS3VersionPath(datasetId, i + 1)).map(
    (s3Prefix) => path.join(s3Prefix, `${testCaseId}.json`),
  );
  try {
    const checkPromises = s3SearchPaths.map((s3Path) => getTestCaseMetadata(s3Path));
    await Promise.any(checkPromises);
  } catch (_) {
    logErrorAndThrowResourceNotFound({
      externalMessage: `Test case '${testCaseId}' not found in any minted version of dataset '${datasetId}'.`,
    });
  }
}
