import {
  DeleteDatasetVersionAnnotationServerInput,
  DeleteDatasetVersionAnnotationServerOutput,
  getDeleteDatasetVersionAnnotationHandler,
} from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import { Operation } from '@aws-smithy/server-common';
import { getApiGatewayHandler, HandlerContext } from '@common/api/apiGateway';
import { applyLambdaDecorators } from '@src/common/api/utils/lambdaWrapper';
import { APIGatewayProxyHandler } from 'aws-lambda';
import { removeAnnotation } from '../helpers';
import { log } from '../utils';

export const deleteDatasetVersionAnnotationOperation: Operation<
  DeleteDatasetVersionAnnotationServerInput,
  DeleteDatasetVersionAnnotationServerOutput,
  HandlerContext
> = async ({ datasetId, version, annotationName }) => {
  await removeAnnotation({ datasetId, version, annotationName });

  log.info(`Deleted annotation ${annotationName} for version ${version} of dataset ${datasetId}`);

  // No response
  return {};
};

export const lambdaHandler: APIGatewayProxyHandler = getApiGatewayHandler(
  getDeleteDatasetVersionAnnotationHandler(applyLambdaDecorators(deleteDatasetVersionAnnotationOperation)),
);
