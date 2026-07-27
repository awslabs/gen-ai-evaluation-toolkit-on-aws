import {
  getListGenerationsHandler,
  ListGenerationsServerInput,
  ListGenerationsServerOutput,
} from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import { ListExecutionsCommand } from '@aws-sdk/client-sfn';
import { Operation } from '@aws-smithy/server-common';
import { getEnvVariable, sfnClient } from '@src/common';
import { getApiGatewayHandler, HandlerContext } from '@src/common/api/apiGateway';
import { applyLambdaDecorators } from '@src/common/api/utils/lambdaWrapper';
import assert from 'assert';
import { APIGatewayProxyHandler } from 'aws-lambda';
import { mapExecution } from '../helper/mapExecution';

export const listGenerationOperation: Operation<
  ListGenerationsServerInput,
  ListGenerationsServerOutput,
  HandlerContext
> = async (input) => {
  const stateMachineArn = getEnvVariable((c) => c.GENERATION.WORKFLOW_ARN);

  const listCommand = new ListExecutionsCommand({
    stateMachineArn,
    maxResults: input.maxResults || 50,
    nextToken: input.nextToken,
  });

  const executionsResponse = await sfnClient().send(listCommand);

  assert(executionsResponse.executions, 'Executions missing in response');

  const jobs = executionsResponse.executions.map((execution) => mapExecution(execution));

  const result: ListGenerationsServerOutput = {
    jobs: jobs,
    nextToken: executionsResponse.nextToken,
  };

  return result;
};

export const lambdaHandler: APIGatewayProxyHandler = getApiGatewayHandler(
  getListGenerationsHandler(applyLambdaDecorators(listGenerationOperation)),
);
