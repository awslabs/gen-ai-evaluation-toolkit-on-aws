import {
  getListConfigurationsHandler,
  ListConfigurationsServerInput,
  ListConfigurationsServerOutput,
} from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import { Operation } from '@aws-smithy/server-common';
import { getApiGatewayHandler, HandlerContext } from '@common/api/apiGateway';
import { applyLambdaDecorators } from '@src/common/api/utils/lambdaWrapper';
import { APIGatewayProxyHandler } from 'aws-lambda';
import { listConfigurations } from '../storage/workflowConfiguration';

export const listConfigurationsOperation: Operation<
  ListConfigurationsServerInput,
  ListConfigurationsServerOutput,
  HandlerContext
> = async (input, _context) => {
  const listConfigurationsOutput = await listConfigurations(input);

  return {
    configurations: listConfigurationsOutput.configurations,
    nextToken: listConfigurationsOutput.nextToken,
  };
};

export const lambdaHandler: APIGatewayProxyHandler = getApiGatewayHandler(
  getListConfigurationsHandler(applyLambdaDecorators(listConfigurationsOperation)),
);
