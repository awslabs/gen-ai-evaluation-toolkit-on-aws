import {
  DatasetStatus,
  RestoreDatasetServerInput,
  RestoreDatasetServerOutput,
  getRestoreDatasetHandler,
} from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { Operation } from '@aws-smithy/server-common';
import { getEnvVariable, lazy } from '@common';
import { logErrorAndThrowUnprocessableEntity } from '@common/api/exceptions/serviceExceptions';
import { EnvVariable } from '@common/config';
import { HandlerContext, getApiGatewayHandler } from '@common/api/apiGateway';
import { applyLambdaDecorators } from '@src/common/api/utils/lambdaWrapper';
import { APIGatewayProxyHandler } from 'aws-lambda';
import * as AWSXRay from 'aws-xray-sdk-core';
import { getDataset } from '../helpers';
import { freezeDataset } from '../helpers/dataset';
import { TriggerRollbackMessage } from '../types';

const sqsClient = lazy(() => {
  const client = new SQSClient();
  AWSXRay.captureAWSv3Client(client);
  return client;
});

export const restoreDatasetOperation: Operation<
  RestoreDatasetServerInput,
  RestoreDatasetServerOutput,
  HandlerContext
> = async (input, context) => {
  const datasetId = input.datasetId as string;
  const version = input.version as number;

  const dataset = await getDataset(datasetId);

  const latestVersion = dataset.currentVersion ?? 0;
  if (version > latestVersion) {
    logErrorAndThrowUnprocessableEntity({ externalMessage: `Version ${version} does not exist` });
  }

  await freezeDataset(datasetId);

  // Trigger rollback lambda
  const message: TriggerRollbackMessage = { datasetId, targetVersion: version, triggeredBy: context.user };

  const sqsResponse = await sqsClient().send(
    new SendMessageCommand({
      QueueUrl: getEnvVariable(EnvVariable.ROLLBACK_SQS_URL),
      MessageBody: JSON.stringify(message),
    }),
  );

  return {
    dataset: { ...dataset, status: DatasetStatus.FROZEN, createdAt: new Date(dataset.createdAt) },
    asyncContext: { messageId: sqsResponse.MessageId, requestId: sqsResponse.$metadata.requestId },
  };
};

export const lambdaHandler: APIGatewayProxyHandler = getApiGatewayHandler(
  getRestoreDatasetHandler(applyLambdaDecorators(restoreDatasetOperation)),
);
