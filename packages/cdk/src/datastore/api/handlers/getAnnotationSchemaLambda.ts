import {
  GetAnnotationSchemaServerInput,
  GetAnnotationSchemaServerOutput,
  getGetAnnotationSchemaHandler,
} from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import { Operation } from '@aws-smithy/server-common';
import { applyLambdaDecorators } from '@src/common/api/utils/lambdaWrapper';
import { APIGatewayProxyHandler } from 'aws-lambda';
import { getApiGatewayHandler, HandlerContext } from '@common/api/apiGateway';
import { getAnnotationSchema } from '../helpers';
import { toSdkAnnotationValueType } from '@datastore/api/types';
import { log } from '../utils';

export const getAnnotationSchemaOperation: Operation<
  GetAnnotationSchemaServerInput,
  GetAnnotationSchemaServerOutput,
  HandlerContext
> = async (input, _context) => {
  log.info(`Fetching Annotation Schema "${input.annotationName}"`);
  const { name, description, createdAt, createdBy, valueType, isArchived } = await getAnnotationSchema(
    input.annotationName,
  );
  return {
    name,
    description,
    createdAt: new Date(createdAt),
    createdBy,
    valueType: toSdkAnnotationValueType(valueType),
    isArchived,
  };
};

export const lambdaHandler: APIGatewayProxyHandler = getApiGatewayHandler(
  getGetAnnotationSchemaHandler(applyLambdaDecorators(getAnnotationSchemaOperation)),
);
