import {
  CreateConfigurationServerInput,
  CreateConfigurationServerOutput,
  getCreateConfigurationHandler,
} from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import { Operation } from '@aws-smithy/server-common';
import { getApiGatewayHandler, HandlerContext } from '@common/api/apiGateway';
import { createConfiguration } from '@src/experiment/api/storage/workflowConfiguration';
import { log } from '@src/common/api/utils';
import { applyLambdaDecorators } from '@src/common/api/utils/lambdaWrapper';
import { APIGatewayProxyHandler } from 'aws-lambda';

export const createConfigurationOperation: Operation<
  CreateConfigurationServerInput,
  CreateConfigurationServerOutput,
  HandlerContext
> = async (input, context) => {
  log.info(`Creating configuration ${input.configuration.name}`);

  const configuration = await createConfiguration(input.configuration, context);

  log.info(`Successfully Created configuration ${configuration.name}`);

  return {
    configuration: configuration,
  };
};

export const lambdaHandler: APIGatewayProxyHandler = getApiGatewayHandler(
  getCreateConfigurationHandler(applyLambdaDecorators(createConfigurationOperation)),
);
