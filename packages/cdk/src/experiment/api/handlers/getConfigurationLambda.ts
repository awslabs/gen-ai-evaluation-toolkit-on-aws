import {
  GetConfigurationServerInput,
  GetConfigurationServerOutput,
  getGetConfigurationHandler,
} from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import { Operation } from '@aws-smithy/server-common';
import { getApiGatewayHandler, HandlerContext } from '@common/api/apiGateway';
import { getConfiguration } from '@src/experiment/api/storage/workflowConfiguration';
import { log } from '@src/common/api/utils';

import { applyLambdaDecorators } from '@src/common/api/utils/lambdaWrapper';
import { APIGatewayProxyHandler } from 'aws-lambda';

export const getConfigurationOperation: Operation<
  GetConfigurationServerInput,
  GetConfigurationServerOutput,
  HandlerContext
> = async (input) => {
  log.info(`Get configuration for ${input.name} and version: ${input.version}`);
  const configuration = await getConfiguration(input.name, input.version);
  log.info(`Successfully fetched configuration ${configuration.name}`);
  return {
    configuration: configuration,
  };
};

export const lambdaHandler: APIGatewayProxyHandler = getApiGatewayHandler(
  getGetConfigurationHandler(applyLambdaDecorators(getConfigurationOperation)),
);
