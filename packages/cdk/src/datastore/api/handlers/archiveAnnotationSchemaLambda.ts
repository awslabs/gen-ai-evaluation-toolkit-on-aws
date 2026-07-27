import {
  ArchiveAnnotationSchemaServerInput,
  ArchiveAnnotationSchemaServerOutput,
  getArchiveAnnotationSchemaHandler,
} from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import { Operation } from '@aws-smithy/server-common';
import { getApiGatewayHandler, HandlerContext } from '@common/api/apiGateway';
import { archiveAnnotationSchema } from '@datastore/api/helpers';
import { toSdkAnnotationValueType } from '@datastore/api/types';
import { applyLambdaDecorators } from '@src/common/api/utils/lambdaWrapper';
import { APIGatewayProxyHandler } from 'aws-lambda';

export const archiveAnnotationSchemaOperation: Operation<
  ArchiveAnnotationSchemaServerInput,
  ArchiveAnnotationSchemaServerOutput,
  HandlerContext
> = async (input) => {
  const { name, valueType, description, createdBy, createdAt, isArchived } = await archiveAnnotationSchema(
    input.annotationName,
    !input.restore,
  );
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
  getArchiveAnnotationSchemaHandler(applyLambdaDecorators(archiveAnnotationSchemaOperation)),
);
