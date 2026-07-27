import {
  DeleteTestCaseAnnotationServerInput,
  DeleteTestCaseAnnotationServerOutput,
  getDeleteTestCaseAnnotationHandler,
} from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import { Operation } from '@aws-smithy/server-common';
import { applyLambdaDecorators } from '@src/common/api/utils/lambdaWrapper';
import { APIGatewayProxyHandler } from 'aws-lambda';
import { getApiGatewayHandler, HandlerContext } from '@common/api/apiGateway';
import { removeAnnotation } from '../helpers';

export const deleteTestCaseAnnotationsOperation: Operation<
  DeleteTestCaseAnnotationServerInput,
  DeleteTestCaseAnnotationServerOutput,
  HandlerContext
> = async ({ datasetId, testCaseId, annotationName }, _context) => {
  await removeAnnotation({ datasetId, testCaseId, annotationName });
  return {};
};

export const lambdaHandler: APIGatewayProxyHandler = getApiGatewayHandler(
  getDeleteTestCaseAnnotationHandler(applyLambdaDecorators(deleteTestCaseAnnotationsOperation)),
);
