import {
  ListTestCasesServerInput,
  ListTestCasesServerOutput,
  getListTestCasesHandler,
} from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import { Operation } from '@aws-smithy/server-common';
import { HandlerContext, getApiGatewayHandler } from '@common/api/apiGateway';
import { filterTestCases, listTestCaseIdsFromS3 } from '@datastore/api/helpers';
import { applyLambdaDecorators } from '@src/common/api/utils/lambdaWrapper';
import { APIGatewayProxyHandler } from 'aws-lambda';

export const listTestCasesOperation: Operation<
  ListTestCasesServerInput,
  ListTestCasesServerOutput,
  HandlerContext
> = async (input) => {
  const { testCaseIds, nextContinuationToken } = await listTestCaseIdsFromS3({
    datasetId: input.datasetId,
    version: input.version,
    maxResults: input.maxResults,
    continuationToken: input.nextToken,
  });

  const testCaseIdsToReturn = input.filter
    ? await filterTestCases(input.datasetId, testCaseIds, input.filter)
    : testCaseIds;
  return {
    testCases: testCaseIdsToReturn.map((testCaseId) => ({ id: testCaseId })),
    nextToken: nextContinuationToken,
  };
};

export const lambdaHandler: APIGatewayProxyHandler = getApiGatewayHandler(
  getListTestCasesHandler(applyLambdaDecorators(listTestCasesOperation)),
);
