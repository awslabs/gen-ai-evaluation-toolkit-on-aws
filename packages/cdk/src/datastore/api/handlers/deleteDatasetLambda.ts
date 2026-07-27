import {
  DeleteDatasetServerInput,
  DeleteDatasetServerOutput,
  getDeleteDatasetHandler,
} from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import { Operation } from '@aws-smithy/server-common';
import { getEnvVariable } from '@common';
import { EnvVariable } from '@common/config';
import { getApiGatewayHandler, HandlerContext } from '@common/api/apiGateway';
import { applyLambdaDecorators } from '@src/common/api/utils/lambdaWrapper';
import { APIGatewayProxyHandler } from 'aws-lambda';
import { DdbWrapper, DYNAMO_BATCH_WRITE_LIMIT } from '../ddb';
import { getDataset, getS3DatasetPath, listDatasetVersionItems } from '../helpers';
import { freezeDataset } from '../helpers/dataset';
import { chunkGenerator, deleteS3Directory, log, processUntilExhausted } from '../utils';

export const deleteDatasetOperation: Operation<
  DeleteDatasetServerInput,
  DeleteDatasetServerOutput,
  HandlerContext
> = async ({ datasetId }) => {
  const dataset = await getDataset(datasetId).catch(() => undefined); // Return undefined if dataset does not exist

  // Idempotent deletion, in footsteps of S3 and Dynamo deletion default behavior
  if (dataset == null) {
    log.warn(`Attempting to delete non-existent dataset "${datasetId}"`);
    return {};
  }

  await freezeDataset(datasetId);

  log.info(`Deleting dataset "${datasetId}"...`);

  // Deletion while paginating misses pagination order and can cause some items to be missed
  // so it must be done in a loop to make sure all items are deleted properly
  await processUntilExhausted(async (repeat) => {
    // Delete versions
    for await (const versions of chunkGenerator(listDatasetVersionItems(datasetId), DYNAMO_BATCH_WRITE_LIMIT)) {
      await DdbWrapper.getInstance().deleteItems(versions);
      repeat();
    }
  });
  log.info(`Deleted all DDB version items for "${datasetId}" dataset`);

  // Delete dataset item from dynamo
  await DdbWrapper.getInstance().deleteItem(dataset);
  log.info(`Deleted DDB item for dataset "${datasetId}"`);

  // Clear S3
  await deleteS3Directory(getEnvVariable(EnvVariable.S3_BUCKET_NAME), getS3DatasetPath(datasetId));
  log.info(`Deleted all S3 content for dataset "${datasetId}"`);

  // No response
  return {};
};

export const lambdaHandler: APIGatewayProxyHandler = getApiGatewayHandler(
  getDeleteDatasetHandler(applyLambdaDecorators(deleteDatasetOperation)),
);
