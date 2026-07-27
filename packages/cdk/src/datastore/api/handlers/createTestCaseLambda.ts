import {
  CreateTestCaseServerInput,
  CreateTestCaseServerOutput,
  getCreateTestCaseHandler,
} from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { Operation } from '@aws-smithy/server-common';
import { getEnvVariable } from '@common';
import { EnvVariable } from '@common/config';
import { applyLambdaDecorators } from '@src/common/api/utils/lambdaWrapper';
import { APIGatewayProxyHandler } from 'aws-lambda';
import { randomUUID } from 'crypto';
import path from 'path';
import { getApiGatewayHandler, HandlerContext } from '@common/api/apiGateway';
import { getDataset, getS3HeadPath, toS3TestCaseMetadata } from '../helpers';
import { TestCaseMetadata } from '../types';
import { getS3Client } from '../utils';

export const createTestCaseOperation: Operation<
  CreateTestCaseServerInput,
  CreateTestCaseServerOutput,
  HandlerContext
> = async ({ datasetId, ...testCaseDetails }, context) => {
  // Assert dataset exists
  await getDataset(datasetId);

  const testCaseId = randomUUID();
  const testCaseFileName = `${testCaseId}.json`;

  const headPath = getS3HeadPath(datasetId!);
  const testCasePath = path.join(headPath, testCaseFileName);

  const metadata: TestCaseMetadata = {
    createdAt: new Date(),
    createdBy: context.user,
  };

  // Save test case with metadata
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: getEnvVariable(EnvVariable.S3_BUCKET_NAME),
      Key: testCasePath,
      Metadata: toS3TestCaseMetadata(metadata),
      ContentType: 'application/json',
      Body: JSON.stringify(testCaseDetails),
    }),
  );

  return { testCaseId, ...metadata };
};

export const lambdaHandler: APIGatewayProxyHandler = getApiGatewayHandler(
  getCreateTestCaseHandler(applyLambdaDecorators(createTestCaseOperation)),
);
