import {
  PutDatasetVersionAnnotationServerInput,
  PutDatasetVersionAnnotationServerOutput,
  getPutDatasetVersionAnnotationHandler,
} from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import { Operation } from '@aws-smithy/server-common';
import { HandlerContext, getApiGatewayHandler } from '@common/api/apiGateway';
import { applyLambdaDecorators } from '@src/common/api/utils/lambdaWrapper';
import { APIGatewayProxyHandler } from 'aws-lambda';
import { assertAnnotationValidity, putDatasetVersionAnnotation } from '../helpers';

export const putDatasetVersionAnnotationOperation: Operation<
  PutDatasetVersionAnnotationServerInput,
  PutDatasetVersionAnnotationServerOutput,
  HandlerContext
> = async (input, context) => {
  await assertAnnotationValidity(input);

  const { annotations } = await putDatasetVersionAnnotation(input, context.user);
  const annotationContent = annotations![input.name]!;
  return {
    name: input.name,
    ...annotationContent,
    annotatedAt: new Date(annotationContent.annotatedAt),
  };
};

export const lambdaHandler: APIGatewayProxyHandler = getApiGatewayHandler(
  getPutDatasetVersionAnnotationHandler(applyLambdaDecorators(putDatasetVersionAnnotationOperation)),
);
