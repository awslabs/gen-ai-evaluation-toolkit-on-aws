import {
  DeleteTestCaseServerInput,
  DeleteTestCaseServerOutput,
  getDeleteTestCaseHandler,
} from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { Operation } from '@aws-smithy/server-common';
import { getEnvVariable } from '@common';
import { EnvVariable } from '@common/config';
import { getApiGatewayHandler, HandlerContext } from '@common/api/apiGateway';
import { applyLambdaDecorators } from '@src/common/api/utils/lambdaWrapper';
import { APIGatewayProxyHandler } from 'aws-lambda';
import path from 'path';
import { getS3HeadPath } from '../helpers';
import { getS3Client } from '../utils';

export const deleteTestCase: Operation<DeleteTestCaseServerInput, DeleteTestCaseServerOutput, HandlerContext> = async (
  input,
) => {
  const datasetId = input.datasetId as string;
  const testCaseId = input.testCaseId as string;

  // Writes always go to head
  const headPath = getS3HeadPath(datasetId);
  const testCasePath = path.join(headPath, `${testCaseId}.json`);

  // Operation is idempotent, so if file not found it will succeed
  await getS3Client().send(
    new DeleteObjectCommand({
      Bucket: getEnvVariable(EnvVariable.S3_BUCKET_NAME),
      Key: testCasePath,
    }),
  );

  // No response
  return {};
};

export const lambdaHandler: APIGatewayProxyHandler = getApiGatewayHandler(
  getDeleteTestCaseHandler(applyLambdaDecorators(deleteTestCase)),
);
