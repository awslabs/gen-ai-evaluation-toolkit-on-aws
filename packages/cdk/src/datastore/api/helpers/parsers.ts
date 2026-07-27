import { VERSION_HEAD, VERSION_LATEST } from '@common/config';
import { camelCase, paramCase } from 'change-case';
import { DatasetVersion, Nullable, TestCaseMetadata } from '../types';
import { TestCaseMetadataSchema } from '../validation';

export function parseVersionString(version: string): DatasetVersion {
  if (version == VERSION_HEAD) return version;
  if (version == VERSION_LATEST) return version;
  return parseInt(version, 10);
}

/**
 * Transforms s3 metadata into test case metadata.
 * Only transformation that happens is changing keys to camel case since s3 metadata keys must be in kebab case.
 */
export function parseS3TestCaseMetadata(s3Metadata: Nullable<Record<string, string>>): TestCaseMetadata {
  const entries = Object.entries(s3Metadata ?? {});
  const metadataEntries = entries.map(([headerName, headerValue]) => [camelCase(headerName), headerValue]);
  return TestCaseMetadataSchema.parse(Object.fromEntries(metadataEntries));
}

/**
 * Transforms test case metadata into s3 metadata.
 * This does the following transformations:
 *  - Change keys to kebab case (aka param case)
 *  - Transform date into ISO string
 */
export function toS3TestCaseMetadata(metadata: TestCaseMetadata): Record<string, string> {
  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => {
      if (value instanceof Date) value = value.toISOString();
      return [paramCase(key), String(value)];
    }),
  );
}
