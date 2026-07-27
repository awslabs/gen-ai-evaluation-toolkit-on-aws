import {
  getListDatasetsHandler,
  ListDatasetsServerInput,
  ListDatasetsServerOutput,
} from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import { Operation } from '@aws-smithy/server-common';
import { applyLambdaDecorators } from '@src/common/api/utils/lambdaWrapper';
import { APIGatewayProxyHandler } from 'aws-lambda';
import { getApiGatewayHandler, HandlerContext } from '@common/api/apiGateway';
import { listDatasets } from '../helpers';
import { log } from '../utils';

export const listDatasetsOperation: Operation<
  ListDatasetsServerInput,
  ListDatasetsServerOutput,
  HandlerContext
> = async (input, _context) => {
  const listDatasetsOutput = await listDatasets({
    maxResults: input.maxResults,
    lastEvaluatedSk: input.nextToken,
  });
  log.info(`Successfully fetched the list of datasets`);
  return {
    datasets: listDatasetsOutput.entities.map(
      ({ datasetId, name, description, createdAt, source, currentVersion, status }) => ({
        datasetId,
        name,
        description,
        createdAt: new Date(createdAt),
        source,
        currentVersion,
        status,
      }),
    ),
    nextToken: listDatasetsOutput.lastEvaluatedSk,
  };
};

export const lambdaHandler: APIGatewayProxyHandler = getApiGatewayHandler(
  getListDatasetsHandler(applyLambdaDecorators(listDatasetsOperation)),
);
