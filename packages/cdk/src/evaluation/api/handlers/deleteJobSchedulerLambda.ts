import {
  DeleteJobSchedulerServerInput,
  DeleteJobSchedulerServerOutput,
  getDeleteJobSchedulerHandler,
} from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import { DeleteScheduleCommand, GetScheduleCommand } from '@aws-sdk/client-scheduler';
import { Operation } from '@aws-smithy/server-common';
import { getApiGatewayHandler, HandlerContext } from '@common/api/apiGateway';
import { log } from '@common/api/utils';
import { applyLambdaDecorators } from '@src/common/api/utils/lambdaWrapper';
import { APIGatewayProxyHandler } from 'aws-lambda';
import { EVALUATION_JOB_SCHEDULER_GROUP_NAME } from '@src/common/constants';
import {
  validateScheduleParameters,
  extractCronExpression,
  parseJobTemplate,
} from '../utils/evaluationJobSchedulerUtils';
import { schedulerClient } from '@src/common';

export const deleteJobSchedulerOperation: Operation<
  DeleteJobSchedulerServerInput,
  DeleteJobSchedulerServerOutput,
  HandlerContext
> = async (input, _context) => {
  log.info(`Deleting job scheduler ${input.name}`);

  const scheduleName = input.name;

  const getResult = await schedulerClient().send(
    new GetScheduleCommand({
      Name: scheduleName,
      GroupName: EVALUATION_JOB_SCHEDULER_GROUP_NAME,
    }),
  );

  validateScheduleParameters(getResult, scheduleName);

  const cron = extractCronExpression(getResult.ScheduleExpression);
  const createdAt = getResult.CreationDate;
  const template = parseJobTemplate(getResult.Target.Input, scheduleName);

  await schedulerClient().send(
    new DeleteScheduleCommand({
      Name: scheduleName,
      GroupName: EVALUATION_JOB_SCHEDULER_GROUP_NAME,
    }),
  );

  log.info(`Successfully deleted job scheduler ${scheduleName}`);

  return {
    name: scheduleName,
    cron,
    createdAt,
    ...template,
  };
};

export const lambdaHandler: APIGatewayProxyHandler = getApiGatewayHandler(
  getDeleteJobSchedulerHandler(applyLambdaDecorators(deleteJobSchedulerOperation)),
);
