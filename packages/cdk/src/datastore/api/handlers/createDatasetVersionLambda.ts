import {
  DatasetStatus,
  CreateDatasetVersionServerInput,
  CreateDatasetVersionServerOutput,
  getCreateDatasetVersionHandler,
} from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { Operation } from '@aws-smithy/server-common';
import { getEnvVariable, lazy } from '@common';
import { EnvVariable } from '@common/config';
import { HandlerContext, getApiGatewayHandler } from '@common/api/apiGateway';
import { applyLambdaDecorators } from '@src/common/api/utils/lambdaWrapper';
import { APIGatewayProxyHandler } from 'aws-lambda';
import * as AWSXRay from 'aws-xray-sdk-core';
import { getDataset } from '../helpers';
import { freezeDataset } from '../helpers/dataset';
import { TriggerVersioningMessage } from '../types';

const sqsClient = lazy(() => {
  const client = new SQSClient();
  AWSXRay.captureAWSv3Client(client);
  return client;
});

export const createDatasetVersionOperation: Operation<
  CreateDatasetVersionServerInput,
  CreateDatasetVersionServerOutput,
  HandlerContext
> = async (input, context) => {
  const datasetId = input.datasetId as string;

  const dataset = await getDataset(datasetId);

  await freezeDataset(datasetId);

  // Trigger versioning lambda
  const message: TriggerVersioningMessage = { datasetId, triggeredBy: context.user };

  const sqsResponse = await sqsClient().send(
    new SendMessageCommand({
      QueueUrl: getEnvVariable(EnvVariable.VERSIONING_SQS_URL),
      MessageBody: JSON.stringify(message),
    }),
  );

  return {
    dataset: { ...dataset, status: DatasetStatus.FROZEN, createdAt: new Date(dataset.createdAt) },
    asyncContext: { messageId: sqsResponse.MessageId, requestId: sqsResponse.$metadata.requestId },
  };
};

export const lambdaHandler: APIGatewayProxyHandler = getApiGatewayHandler(
  getCreateDatasetVersionHandler(applyLambdaDecorators(createDatasetVersionOperation)),
);
