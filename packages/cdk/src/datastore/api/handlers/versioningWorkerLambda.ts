import { EnvVariable } from '@common/config';
import { Dataset, DatasetStatus } from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import assert from 'assert';
import { SQSEvent } from 'aws-lambda';
import { DdbWrapper } from '../ddb';
import { getDataset, getS3HeadPath, getS3VersionPath } from '../helpers';
import { DatasetVersionDdbItem, EntityType } from '../types';
import { copyS3Directory, deleteS3Directory, log } from '../utils';
import { TriggerVersioningMessageSchema } from '../validation';
import { getEnvVariable } from '@common';

export async function handler(event: SQSEvent) {
  const [record] = event.Records;
  const { datasetId, triggeredBy } = TriggerVersioningMessageSchema.parse(JSON.parse(record!.body));

  // Get dataset status and latest version
  const dataset = await getDataset(datasetId);
  assert(dataset.status === DatasetStatus.FROZEN, 'Dataset is not frozen');

  const bucketName = getEnvVariable(EnvVariable.S3_BUCKET_NAME);
  const headS3Prefix = getS3HeadPath(datasetId);

  const newVersionNumber = (dataset.currentVersion ?? 0) + 1;
  const newVersionS3Prefix = getS3VersionPath(datasetId, newVersionNumber);

  let shouldUpdateCurrentVersion = false;

  try {
    log.info(`Started copying items from ${headS3Prefix} to ${newVersionS3Prefix}`);
    await copyS3Directory(bucketName, headS3Prefix, newVersionS3Prefix);
    log.info(`Done copying items for version ${newVersionNumber} of dataset "${datasetId}"`);

    const now = Date.now();
    // Create new version
    const newVersion: DatasetVersionDdbItem = {
      entityType: EntityType.DATASET_VERSION,
      entityId: `${datasetId}#${newVersionNumber}`,

      datasetId,
      version: newVersionNumber,
      s3Location: `s3://${bucketName}/${newVersionS3Prefix}`,

      createdAt: now,
      createdBy: triggeredBy,
      lastUpdatedAt: now,
    };

    await DdbWrapper.getInstance().putItem(newVersion);
    log.info(`Created new version ${newVersionNumber} for dataset "${datasetId}"`);

    shouldUpdateCurrentVersion = true;
  } catch (err) {
    log.error(`Error creating new version: ${err}`);

    await deleteS3Directory(bucketName, newVersionS3Prefix);
    log.info(`Rolled back created version ${newVersionNumber} for dataset "${datasetId}"`);
  }

  // Unfreeze dataset
  const datasetUpdate: Partial<Dataset> = { status: DatasetStatus.ACTIVE };
  if (shouldUpdateCurrentVersion) datasetUpdate.currentVersion = newVersionNumber;

  await DdbWrapper.getInstance().updateItem(EntityType.DATASET, datasetId, datasetUpdate);
  log.info(`Dataset "${datasetId}" set to active`);
}

export const lambdaHandler = handler;
