import {
  StopGenerationServerInput,
  StopGenerationServerOutput,
  getStopGenerationHandler,
} from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import { StopExecutionCommand } from '@aws-sdk/client-sfn';
import { Operation } from '@aws-smithy/server-common';
import { getEnvVariable, getExecutionArn, sfnClient } from '@src/common';
import { HandlerContext, getApiGatewayHandler } from '@src/common/api/apiGateway';
import { applyLambdaDecorators } from '@src/common/api/utils/lambdaWrapper';
import { APIGatewayProxyHandler } from 'aws-lambda';
import { getExecutionDetails } from '../helper/getExecutionDetails';

export const stopGenerationOperation: Operation<
  StopGenerationServerInput,
  StopGenerationServerOutput,
  HandlerContext
> = async (input) => {
  const executionArn = getExecutionArn(
    input.id,
    getEnvVariable((env) => env.GENERATION.WORKFLOW_ARN),
  );

  const stopCommand = new StopExecutionCommand({
    executionArn,
    cause: input.cause ?? 'Stopped by user request',
    error: input.error,
  });

  const response = await sfnClient().send(stopCommand);

  const executionDetails = await getExecutionDetails(executionArn);

  return {
    ...executionDetails,
    stoppedAt: response.stopDate,
  };
};

export const lambdaHandler: APIGatewayProxyHandler = getApiGatewayHandler(
  getStopGenerationHandler(applyLambdaDecorators(stopGenerationOperation)),
);
