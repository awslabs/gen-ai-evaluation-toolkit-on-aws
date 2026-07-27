import { EnvVariable } from '@common/config';
import { DatasetStatus } from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import assert from 'assert';
import { SQSEvent } from 'aws-lambda';
import { DdbWrapper } from '../ddb';
import { getDataset, getS3HeadPath, getS3VersionPath } from '../helpers';
import { EntityType } from '../types';
import { copyS3Directory, deleteS3Directory } from '../utils';
import { TriggerRollbackMessageSchema } from '../validation';
import { getEnvVariable } from '@common';

export async function handler(event: SQSEvent) {
  const [record] = event.Records;
  const { datasetId, targetVersion } = TriggerRollbackMessageSchema.parse(JSON.parse(record!.body));

  const dataset = await getDataset(datasetId);
  assert(dataset.status === DatasetStatus.FROZEN, 'Dataset is not frozen');
  assert(targetVersion <= (dataset.currentVersion ?? 0), `Version ${targetVersion} does not exist`);

  const bucketName = getEnvVariable(EnvVariable.S3_BUCKET_NAME);
  const headPath = getS3HeadPath(datasetId);
  const headBackupPath = headPath + '-bk';
  const versionPath = getS3VersionPath(datasetId, targetVersion);

  // Clear any existing head backup
  await deleteS3Directory(bucketName, headBackupPath);

  // Make head backup
  await copyS3Directory(bucketName, headPath, headBackupPath);
  console.info(`Created backup for head of dataset "${datasetId}"`);

  try {
    // Clear head
    await deleteS3Directory(bucketName, headPath);
    console.info(`Cleared head of dataset "${datasetId}"`);

    // Copy version to head
    await copyS3Directory(bucketName, versionPath, headPath);
    console.info(`Copied version ${targetVersion} to head of dataset "${datasetId}"`);
  } catch (err) {
    console.error(`Error rolling back head of dataset "${datasetId}" to version ${targetVersion}:`, err);

    // Clear dirty head
    await deleteS3Directory(bucketName, headPath);
    console.info(`Cleared dirty head of dataset "${datasetId}"`);

    // Restore head backup
    await copyS3Directory(bucketName, headBackupPath, headPath);
    console.info(`Restored head of dataset "${datasetId}"`);
  }

  // Delete backup
  await deleteS3Directory(bucketName, headBackupPath);
  console.info(`Deleted head backup for dataset "${datasetId}"`);

  await DdbWrapper.getInstance().updateItem(EntityType.DATASET, datasetId, { status: DatasetStatus.ACTIVE });
  console.info(`Dataset ${datasetId} activated`);
}

export const lambdaHandler = handler;
