import {
  CreateJobSchedulerServerInput,
  CreateJobSchedulerServerOutput,
  getCreateJobSchedulerHandler,
} from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import { CreateScheduleCommand } from '@aws-sdk/client-scheduler';
import { Operation } from '@aws-smithy/server-common';
import { getEnvVariable, schedulerClient } from '@common';
import { getApiGatewayHandler, HandlerContext } from '@common/api/apiGateway';
import { logErrorAndThrowValidation } from '@common/api/exceptions/serviceExceptions';
import { log } from '@common/api/utils';
import { applyLambdaDecorators } from '@src/common/api/utils/lambdaWrapper';
import { APIGatewayProxyHandler } from 'aws-lambda';
import { randomUUID } from 'crypto';
import { EVALUATION_JOB_SCHEDULER_GROUP_NAME } from '@src/common/constants';
import { validateJobSchedulerConfiguration } from '../helper/validateJobSchedulerConfiguration';

/**
 * Payload stored in EventBridge Scheduler Target Input.
 * Matches the shape expected by evaluator_api.scheduler_handler.handler.
 *
 * scheduleName + time are used by the handler to derive deterministic job/report IDs,
 * making EventBridge retry invocations idempotent (same IDs → ExecutionAlreadyExists in SF).
 * The <aws.scheduler.scheduled-time> token is resolved by EventBridge Scheduler at invocation time.
 */
interface SchedulerTargetPayload {
  scheduleName: string;
  time: string;
  jobType: string;
  evaluatorName: string;
  testCases?: object;
  scorers?: object;
  app?: object;
  sourceReportId?: string;
  testResults?: object[];
  experimentName?: string;
}

export const createJobSchedulerOperation: Operation<
  CreateJobSchedulerServerInput,
  CreateJobSchedulerServerOutput,
  HandlerContext
> = async (input, context) => {
  const scheduleName = randomUUID();

  log.info(`Creating job schedule ${scheduleName}`);

  // Validate the job template using the same rules as direct job submissions.
  // Without this check, schedulers can be created with malformed configurations
  // that only fail when the schedule fires.
  const validationErrors = validateJobSchedulerConfiguration(input);
  if (validationErrors.length > 0) {
    logErrorAndThrowValidation({
      externalMessage: validationErrors.join('; '),
    });
  }

  const targetPayload: SchedulerTargetPayload = {
    scheduleName,
    time: '<aws.scheduler.scheduled-time>',
    jobType: input.jobType,
    evaluatorName: input.evaluatorName,
    ...(input.testCases && { testCases: input.testCases }),
    ...(input.scorers && { scorers: input.scorers }),
    ...(input.app && { app: input.app }),
    ...(input.sourceReportId && { sourceReportId: input.sourceReportId }),
    ...(input.testResults && { testResults: input.testResults }),
    ...(input.experimentName && { experimentName: input.experimentName }),
  };

  await schedulerClient().send(
    new CreateScheduleCommand({
      Name: scheduleName,
      ScheduleExpression: `cron(${input.cron})`,
      FlexibleTimeWindow: { Mode: 'OFF' },
      Target: {
        Arn: getEnvVariable((e) => e.TARGET_LAMBDA_ARN),
        RoleArn: getEnvVariable((e) => e.SCHEDULER_ROLE_ARN),
        Input: JSON.stringify(targetPayload),
        RetryPolicy: {
          MaximumRetryAttempts: 3,
        },
      },
      Description: `Schedule for job: ${scheduleName}`,
      GroupName: EVALUATION_JOB_SCHEDULER_GROUP_NAME,
    }),
  );

  log.info(`Successfully created job schedule ${scheduleName}`);
  return {
    name: scheduleName,
    cron: input.cron,
    jobType: input.jobType,
    evaluatorName: input.evaluatorName,
    testCases: input.testCases,
    scorers: input.scorers,
    app: input.app,
    sourceReportId: input.sourceReportId,
    testResults: input.testResults,
    experimentName: input.experimentName,
    createdAt: context.requestTime,
  };
};

export const lambdaHandler: APIGatewayProxyHandler = getApiGatewayHandler(
  getCreateJobSchedulerHandler(applyLambdaDecorators(createJobSchedulerOperation)),
);
