import {
  getListAnnotationSchemasHandler,
  ListAnnotationSchemasServerInput,
  ListAnnotationSchemasServerOutput,
} from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import { Operation } from '@aws-smithy/server-common';
import { applyLambdaDecorators } from '@src/common/api/utils/lambdaWrapper';
import { APIGatewayProxyHandler } from 'aws-lambda';
import { getApiGatewayHandler, HandlerContext } from '@common/api/apiGateway';
import { listAnnotationSchemas } from '../helpers';
import { toSdkAnnotationValueType } from '@datastore/api/types';

export const listAnnotationsSchemasOperation: Operation<
  ListAnnotationSchemasServerInput,
  ListAnnotationSchemasServerOutput,
  HandlerContext
> = async (input) => {
  const listAnnotationSchemasOutput = await listAnnotationSchemas({
    maxResults: input.maxResults,
    lastEvaluatedSk: input.nextToken,
    includeArchived: input.includeArchived,
  });
  return {
    annotationSchemas: listAnnotationSchemasOutput.entities.map(
      ({ name, description, createdAt, createdBy, isArchived, valueType }) => ({
        name,
        description,
        createdAt: new Date(createdAt),
        createdBy,
        isArchived,
        valueType: toSdkAnnotationValueType(valueType),
      }),
    ),
    nextToken: listAnnotationSchemasOutput.lastEvaluatedSk,
  };
};

export const lambdaHandler: APIGatewayProxyHandler = getApiGatewayHandler(
  getListAnnotationSchemasHandler(applyLambdaDecorators(listAnnotationsSchemasOperation)),
);
