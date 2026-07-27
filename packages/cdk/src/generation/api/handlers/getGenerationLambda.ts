import {
  GetGenerationServerInput,
  GetGenerationServerOutput,
  getGetGenerationHandler,
} from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import { Operation } from '@aws-smithy/server-common';
import { getEnvVariable, getExecutionArn } from '@src/common';
import { getApiGatewayHandler, HandlerContext } from '@src/common/api/apiGateway';
import { applyLambdaDecorators } from '@src/common/api/utils/lambdaWrapper';
import { APIGatewayProxyHandler } from 'aws-lambda';
import { getExecutionDetails } from '../helper/getExecutionDetails';

export const getGenerationOperation: Operation<
  GetGenerationServerInput,
  GetGenerationServerOutput,
  HandlerContext
> = async (input) => {
  return getExecutionDetails(
    getExecutionArn(
      input.id,
      getEnvVariable((env) => env.GENERATION.WORKFLOW_ARN),
    ),
  );
};

export const lambdaHandler: APIGatewayProxyHandler = getApiGatewayHandler(
  getGetGenerationHandler(applyLambdaDecorators(getGenerationOperation)),
);
