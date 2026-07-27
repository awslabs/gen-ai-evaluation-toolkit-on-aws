import {
  CreateDatasetServerInput,
  CreateDatasetServerOutput,
  getCreateDatasetHandler,
} from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import { Operation } from '@aws-smithy/server-common';
import { getApiGatewayHandler, HandlerContext } from '@common/api/apiGateway';
import { createDataset } from '@datastore/api/helpers';
import { log } from '@datastore/api/utils/logUtils';
import { applyLambdaDecorators } from '@src/common/api/utils/lambdaWrapper';
import { APIGatewayProxyHandler } from 'aws-lambda';

export const createDatasetOperation: Operation<
  CreateDatasetServerInput,
  CreateDatasetServerOutput,
  HandlerContext
> = async (input, context) => {
  log.info(`Creating dataset ${input.name}`);
  const { datasetId, name, description, createdAt, source, currentVersion, status } = await createDataset(
    input.name as string,
    context.user,
    input.description,
  );
  log.info(`Successfully Created dataset ${name} with id ${datasetId}`);
  return {
    datasetId,
    name,
    description,
    createdAt: new Date(createdAt),
    source,
    currentVersion,
    status,
  };
};

export const lambdaHandler: APIGatewayProxyHandler = getApiGatewayHandler(
  getCreateDatasetHandler(applyLambdaDecorators(createDatasetOperation)),
);
