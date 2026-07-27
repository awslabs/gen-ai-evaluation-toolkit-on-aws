import { VERSION_HEAD, VERSION_LATEST } from '@common/config';
import { logErrorAndThrowResourceNotFound, logErrorAndThrowValidation } from '@common/api/exceptions/serviceExceptions';
import { DatasetVersion } from '../types';

export function getS3DatasetPath(datasetId: string): string {
  return `datasets/${datasetId}`;
}

export function getS3VersionPath(datasetId: string, version: number): string {
  return `${getS3DatasetPath(datasetId)}/versions/${version}`;
}

export function getS3HeadPath(datasetId: string): string {
  return `${getS3DatasetPath(datasetId)}/head`;
}

export function getDatasetVersionS3Path(
  version: DatasetVersion,
  { datasetId, currentVersion }: { datasetId: string; currentVersion?: number },
): string {
  if (version == VERSION_HEAD) return getS3HeadPath(datasetId);

  const latestVersion = currentVersion ?? 0;

  if (version == VERSION_LATEST) {
    if (latestVersion === 0) {
      logErrorAndThrowResourceNotFound({ externalMessage: `database does not have any versions` });
    }

    return getS3VersionPath(datasetId, latestVersion);
  }

  if (version <= 0) {
    logErrorAndThrowValidation({ externalMessage: `invalid version number ${version}` });
  }

  if (version > latestVersion) {
    logErrorAndThrowResourceNotFound({ externalMessage: `version ${version} does not exist` });
  }

  return getS3VersionPath(datasetId, version);
}

/**
 * Returns test case ID from its S3 path.
 * This gets the last part of the path and removes any existing extension
 */
export function getTestCaseId(testCasePath: string): string {
  return testCasePath
    .split('/')
    .at(-1)!
    .replace(/\.[^.]+$/, '');
}
