import {
  getPutTestCaseAnnotationHandler,
  PutTestCaseAnnotationServerInput,
  PutTestCaseAnnotationServerOutput,
} from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import { Operation } from '@aws-smithy/server-common';
import { getApiGatewayHandler, HandlerContext } from '@common/api/apiGateway';
import { assertAnnotationValidity, assertTestCaseExistence, putTestCaseAnnotation } from '@datastore/api/helpers';
import { applyLambdaDecorators } from '@src/common/api/utils/lambdaWrapper';
import { APIGatewayProxyHandler } from 'aws-lambda';

export const putTestCaseAnnotationOperation: Operation<
  PutTestCaseAnnotationServerInput,
  PutTestCaseAnnotationServerOutput,
  HandlerContext
> = async (input, context) => {
  await assertAnnotationValidity(input);
  await assertTestCaseExistence(input.datasetId, input.testCaseId);

  const { annotations } = await putTestCaseAnnotation(input, context.user);
  const annotationContent = annotations[input.name]!;
  return {
    name: input.name,
    ...annotationContent,
    annotatedAt: new Date(annotationContent.annotatedAt),
  };
};

export const lambdaHandler: APIGatewayProxyHandler = getApiGatewayHandler(
  getPutTestCaseAnnotationHandler(applyLambdaDecorators(putTestCaseAnnotationOperation)),
);
