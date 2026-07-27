import {
  CreateAnnotationSchemaServerInput,
  CreateAnnotationSchemaServerOutput,
  getCreateAnnotationSchemaHandler,
} from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import { Operation } from '@aws-smithy/server-common';
import { getApiGatewayHandler, HandlerContext } from '@common/api/apiGateway';
import { createAnnotationSchema } from '@datastore/api/helpers';
import { toSdkAnnotationValueType, fromSdkAnnotationValueType } from '@datastore/api/types';
import { log } from '@datastore/api/utils/logUtils';
import { applyLambdaDecorators } from '@src/common/api/utils/lambdaWrapper';
import { APIGatewayProxyHandler } from 'aws-lambda';

export const createAnnotationSchemaOperation: Operation<
  CreateAnnotationSchemaServerInput,
  CreateAnnotationSchemaServerOutput,
  HandlerContext
> = async (input, context) => {
  log.info(`Creating Annotation Schema: ${input.name}`);
  const { name, valueType, description, createdBy, createdAt, isArchived } = await createAnnotationSchema({
    ...input,
    valueType: fromSdkAnnotationValueType(input.valueType),
    createdBy: context.user,
  });

  log.info(`Successfully Created Annotation Schema: ${name}`);
  return {
    name,
    description,
    valueType: toSdkAnnotationValueType(valueType),
    createdBy,
    createdAt: new Date(createdAt),
    isArchived,
  };
};

export const lambdaHandler: APIGatewayProxyHandler = getApiGatewayHandler(
  getCreateAnnotationSchemaHandler(applyLambdaDecorators(createAnnotationSchemaOperation)),
);
