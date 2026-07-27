import {
  GetDatasetServerInput,
  GetDatasetServerOutput,
  getGetDatasetHandler,
} from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import { Operation } from '@aws-smithy/server-common';
import { logErrorAndThrowValidation } from '@common/api/exceptions/serviceExceptions';
import { applyLambdaDecorators } from '@src/common/api/utils/lambdaWrapper';
import { APIGatewayProxyHandler } from 'aws-lambda';
import { getApiGatewayHandler, HandlerContext } from '@common/api/apiGateway';
import { getDataset } from '../helpers';
import { log } from '../utils';

export const getDatasetOperation: Operation<GetDatasetServerInput, GetDatasetServerOutput, HandlerContext> = async (
  input,
  _context,
) => {
  if (!input.datasetId) {
    logErrorAndThrowValidation({
      externalMessage: 'Required input "datasetId" not found',
    });
  }

  log.info(`Fetching dataset ${input.datasetId}`);
  const { datasetId, name, description, createdAt, source, currentVersion, status } = await getDataset(input.datasetId);
  log.info(`Successfully fetched dataset ${name} with id ${datasetId}`);
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
  getGetDatasetHandler(applyLambdaDecorators(getDatasetOperation)),
);
