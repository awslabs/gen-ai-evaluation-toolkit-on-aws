import {
  GenAiEvaluationToolkitClient,
  CreateDatasetVersionCommand,
} from '@awssolutions/gen-ai-evaluation-toolkit-ts-client';
import { log } from '@common/api/utils';
import { getEnvVariable, lazy } from '@common';
import { EnvVariable } from '@config/index';
import * as AWSXRay from 'aws-xray-sdk-core';

type MintVersionEvent = {
  datasetId: string;
};

const dataStoreClient = lazy(() => {
  const client = new GenAiEvaluationToolkitClient({
    endpoint: getEnvVariable(EnvVariable.GENAI_ETK_URL),
  });
  AWSXRay.captureAWSv3Client(client);
  return client;
});

export async function createVersionHandler(event: MintVersionEvent): Promise<void> {
  const { datasetId } = event;

  await dataStoreClient().send(new CreateDatasetVersionCommand({ datasetId }));
  log.info(`Successfully initiated the minting process for ${datasetId}`);
}

export const lambdaHandler = createVersionHandler;
