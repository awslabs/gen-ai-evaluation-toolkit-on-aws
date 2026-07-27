import {
  getStartGenerationHandler,
  StartGenerationServerInput,
  StartGenerationServerOutput,
} from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import { StartExecutionCommand } from '@aws-sdk/client-sfn';
import { Operation } from '@aws-smithy/server-common';
import { getEnvVariable, sfnClient } from '@src/common';
import { getApiGatewayHandler, HandlerContext } from '@src/common/api/apiGateway';
import { applyLambdaDecorators } from '@src/common/api/utils/lambdaWrapper';
import assert from 'assert';
import { APIGatewayProxyHandler } from 'aws-lambda';
import { getExecutionDetails } from '../helper/getExecutionDetails';

export const startGenerationOperation: Operation<
  StartGenerationServerInput,
  StartGenerationServerOutput,
  HandlerContext
> = async (input) => {
  const stateMachineArn = getEnvVariable((c) => c.GENERATION.WORKFLOW_ARN);

  const startExecutionCommand = new StartExecutionCommand({
    stateMachineArn,
    input: JSON.stringify(input),
  });

  const executionResponse = await sfnClient().send(startExecutionCommand);

  assert(executionResponse.executionArn, 'No executionArn in response');

  return await getExecutionDetails(executionResponse.executionArn);
};

export const lambdaHandler: APIGatewayProxyHandler = getApiGatewayHandler(
  getStartGenerationHandler(applyLambdaDecorators(startGenerationOperation)),
);
