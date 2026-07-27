import {
  GetJobSchedulerServerInput,
  GetJobSchedulerServerOutput,
  getGetJobSchedulerHandler,
} from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import { GetScheduleCommand } from '@aws-sdk/client-scheduler';
import { Operation } from '@aws-smithy/server-common';
import { HandlerContext, getApiGatewayHandler } from '@common/api/apiGateway';
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

export const getJobSchedulerOperation: Operation<
  GetJobSchedulerServerInput,
  GetJobSchedulerServerOutput,
  HandlerContext
> = async (input, _context) => {
  log.info(`Getting job scheduler ${input.name}`);

  const schedulerName = input.name;

  const schedule = await schedulerClient().send(
    new GetScheduleCommand({
      Name: schedulerName,
      GroupName: EVALUATION_JOB_SCHEDULER_GROUP_NAME,
    }),
  );

  validateScheduleParameters(schedule, schedulerName);

  const cron = extractCronExpression(schedule.ScheduleExpression);
  const template = parseJobTemplate(schedule.Target.Input, schedulerName);
  const createdAt = schedule.CreationDate;

  return {
    name: schedulerName,
    cron,
    createdAt,
    ...template,
  };
};

export const lambdaHandler: APIGatewayProxyHandler = getApiGatewayHandler(
  getGetJobSchedulerHandler(applyLambdaDecorators(getJobSchedulerOperation)),
);
