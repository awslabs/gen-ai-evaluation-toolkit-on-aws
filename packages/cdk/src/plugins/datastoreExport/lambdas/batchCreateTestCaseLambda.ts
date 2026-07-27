import { log } from '@common/api/utils';
import { getS3Client } from '@common/api/utils/s3';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { TestCaseSchema } from '@datastore/api/validation';
import { logErrorAndThrowUnprocessableEntity } from '@common/api/exceptions/serviceExceptions';
import { GenAiEvaluationToolkitClient, CreateTestCaseCommand } from '@awssolutions/gen-ai-evaluation-toolkit-ts-client';
import { getEnvVariable, lazy } from '@common';
import { EnvVariable } from '@config/index';
import * as AWSXRay from 'aws-xray-sdk-core';

type BatchCreateTestCaseEvent = {
  bucket: string;
  objectKeys: string[];
  datasetId: string;
};

const dataStoreClient = lazy(() => {
  const client = new GenAiEvaluationToolkitClient({
    endpoint: getEnvVariable(EnvVariable.GENAI_ETK_URL),
  });
  AWSXRay.captureAWSv3Client(client);
  return client;
});

export async function batchCreateTestCaseHandler(event: BatchCreateTestCaseEvent): Promise<void> {
  const { bucket, objectKeys, datasetId } = event;
  const s3Client = getS3Client();

  const promises = objectKeys.map(async (objectKey) => {
    log.info(`Creating a test case from ${objectKey} in ${event.bucket}`);
    const contentResponse = await s3Client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: objectKey,
      }),
    );
    log.info(`Successfully retrieved ${objectKey} from ${bucket}`);

    const stringContent = await contentResponse.Body?.transformToString();
    if (stringContent == null) {
      logErrorAndThrowUnprocessableEntity({ externalMessage: `Object ${objectKey} in ${bucket} is empty.` });
    }

    const testCaseContent = TestCaseSchema.parse(JSON.parse(stringContent));
    const { testCaseId } = await dataStoreClient().send(
      new CreateTestCaseCommand({
        datasetId,
        ...testCaseContent,
      }),
    );
    log.info(`Test case ${testCaseId} created successfully.`);
  });

  await Promise.all(promises);
}

export const lambdaHandler = batchCreateTestCaseHandler;
