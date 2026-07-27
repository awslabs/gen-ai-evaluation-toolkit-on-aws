import { DS_DDB_PK, DS_DDB_SK, VERSION_HEAD, VERSION_LATEST } from '@common/config';
import {
  AnnotationValue,
  DatasetStatus,
  AnnotationValueType as SdkAnnotationValueType,
} from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import z from 'zod';
import { TestCaseMetadataSchema, TriggerRollbackMessageSchema, TriggerVersioningMessageSchema } from './validation';
import { logErrorAndThrowValidation } from '@src/common/api/exceptions/serviceExceptions';

export type AnnotationValueType = NumberMember | StringMember;

export type NumberMember = {
  number: Unit;
  string?: never;
  $unknown?: never;
};
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Unit {}

export type StringMember = {
  number?: never;
  string: StringConfigurations;
  $unknown?: never;
};
export interface StringConfigurations {
  /**
   * Allowed enum values for string annotations, enforcing controlled vocabulary
   * @public
   */
  enum: string[];
}

// Conversion functions between local and SDK AnnotationValueType
export function toSdkAnnotationValueType(local: AnnotationValueType): SdkAnnotationValueType {
  if ('number' in local) {
    return { numericType: local.number } as SdkAnnotationValueType;
  }
  if ('string' in local) {
    return { stringType: local.string } as SdkAnnotationValueType;
  }
  throw new Error('Invalid AnnotationValueType');
}

export function fromSdkAnnotationValueType(sdk: SdkAnnotationValueType): AnnotationValueType {
  if ('numericType' in sdk && sdk.numericType !== undefined) {
    return { number: sdk.numericType } as AnnotationValueType;
  }
  if ('stringType' in sdk && sdk.stringType !== undefined) {
    return { string: sdk.stringType } as AnnotationValueType;
  }
  logErrorAndThrowValidation({
    externalMessage: 'Invalid valueType: Must contain exactly one of [numericType, stringType]',
    internalMessage: `Invalid valueType structure: ${JSON.stringify(sdk)}`,
  });
}

export enum EntityType {
  DATASET = 'DATASET',
  DATASET_VERSION = 'DATASET_VERSION',
  ANNOTATION_SCHEMA = 'ANNOTATION_SCHEMA',
  TEST_CASE_ANNOTATION = 'TEST_CASE_ANNOTATION',
}

export type DatastoreDdbPrimaryKey = {
  [DS_DDB_PK]: EntityType;
  [DS_DDB_SK]: string;
};

export type DatasetDdbItem = DatastoreDdbPrimaryKey & {
  [DS_DDB_PK]: EntityType.DATASET;
  datasetId: string;
  name: string;
  description?: string;
  currentVersion?: number;
  createdAt: number;
  source: string;
  status: DatasetStatus;
};

export type AnnotationContent = {
  value: AnnotationValue;
  comment?: string;
  annotatedBy: string;
  annotatedAt: number;
};

export type DatasetVersionDdbItem = DatastoreDdbPrimaryKey & {
  [DS_DDB_PK]: EntityType.DATASET_VERSION;
  datasetId: string;
  version: number;
  createdAt: number;
  createdBy: string;
  s3Location?: string;
  annotations?: Record<string, AnnotationContent>;
  lastUpdatedAt: number;
};

export type AnnotationSchemaDdbItem = DatastoreDdbPrimaryKey & {
  [DS_DDB_PK]: EntityType.ANNOTATION_SCHEMA;
  name: string;
  description?: string;
  isArchived: boolean;
  createdAt: number;
  createdBy: string;
  valueType: AnnotationValueType;
};

export type TestCaseAnnotationDdbItem = DatastoreDdbPrimaryKey & {
  [DS_DDB_PK]: EntityType.TEST_CASE_ANNOTATION;
  datasetId: string;
  testCaseId: string;
  annotations: Record<string, AnnotationContent>;
  lastUpdatedAt: number;
};

export type TriggerVersioningMessage = z.infer<typeof TriggerVersioningMessageSchema>;
export type TriggerRollbackMessage = z.infer<typeof TriggerRollbackMessageSchema>;

export type DatasetVersion = typeof VERSION_HEAD | typeof VERSION_LATEST | number;

export type TestCaseMetadata = z.infer<typeof TestCaseMetadataSchema>;

export type Nullable<T> = T | null | undefined;
