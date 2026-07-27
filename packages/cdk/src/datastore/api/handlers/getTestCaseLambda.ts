import {
  Annotation,
  GetTestCaseServerInput,
  GetTestCaseServerOutput,
  getGetTestCaseHandler,
} from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import { Operation } from '@aws-smithy/server-common';
import { HandlerContext, getApiGatewayHandler } from '@common/api/apiGateway';
import { applyLambdaDecorators } from '@src/common/api/utils/lambdaWrapper';
import { APIGatewayProxyHandler } from 'aws-lambda';
import path from 'path';
import {
  getDataset,
  getDatasetVersionS3Path,
  getTestCase,
  getTestCaseAnnotations,
  parseVersionString,
} from '../helpers';

export const getTestCaseOperation: Operation<GetTestCaseServerInput, GetTestCaseServerOutput, HandlerContext> = async (
  input,
) => {
  const datasetId = input.datasetId;
  const version = parseVersionString(input.version);
  const testCaseId = input.testCaseId;

  const dataset = await getDataset(datasetId);
  const versionPath = getDatasetVersionS3Path(version, dataset);

  const testCasePath = path.join(versionPath, `${testCaseId}.json`);
  const [testCaseContent, annotationsDdbItem] = await Promise.all([
    getTestCase(testCasePath),
    getTestCaseAnnotations(input.datasetId, input.testCaseId),
  ]);
  const annotations = annotationsDdbItem
    ? (Object.entries(annotationsDdbItem.annotations).map(([name, annotationContent]) => ({
        name,
        ...annotationContent,
        annotatedAt: new Date(annotationContent.annotatedAt),
      })) as Annotation[])
    : undefined;

  return {
    ...testCaseContent,
    testCaseId,
    annotations,
  };
};

export const lambdaHandler: APIGatewayProxyHandler = getApiGatewayHandler(
  getGetTestCaseHandler(applyLambdaDecorators(getTestCaseOperation)),
);
