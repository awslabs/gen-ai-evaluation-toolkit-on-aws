import {
  getUpdateConfigurationHandler,
  UpdateConfigurationServerInput,
  UpdateConfigurationServerOutput,
} from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import { Operation } from '@aws-smithy/server-common';
import { getApiGatewayHandler, HandlerContext } from '@common/api/apiGateway';
import { updateConfiguration } from '@src/experiment/api/storage/workflowConfiguration';
import { log } from '@src/common/api/utils';

import { applyLambdaDecorators } from '@src/common/api/utils/lambdaWrapper';
import { APIGatewayProxyHandler } from 'aws-lambda';

export const updateConfigurationOperation: Operation<
  UpdateConfigurationServerInput,
  UpdateConfigurationServerOutput,
  HandlerContext
> = async (input, context) => {
  log.info(`Updating configuration ${input.configuration.name}`);

  const configuration = await updateConfiguration(input.configuration, context);

  log.info(`Successfully Updated configuration ${configuration.name}`);

  return {
    configuration: configuration,
  };
};

export const lambdaHandler: APIGatewayProxyHandler = getApiGatewayHandler(
  getUpdateConfigurationHandler(applyLambdaDecorators(updateConfigurationOperation)),
);
