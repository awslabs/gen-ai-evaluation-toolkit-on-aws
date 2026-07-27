import {
  UpdateJobSchedulerServerInput,
  UpdateJobSchedulerServerOutput,
  getUpdateJobSchedulerHandler,
} from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import { GetScheduleCommand, UpdateScheduleCommand } from '@aws-sdk/client-scheduler';
import { Operation } from '@aws-smithy/server-common';
import { getEnvVariable, schedulerClient } from '@common';
import { HandlerContext, getApiGatewayHandler } from '@common/api/apiGateway';
import { logErrorAndThrowValidation } from '@common/api/exceptions/serviceExceptions';
import { log } from '@common/api/utils';
import { applyLambdaDecorators } from '@src/common/api/utils/lambdaWrapper';
import { APIGatewayProxyHandler } from 'aws-lambda';
import { EVALUATION_JOB_SCHEDULER_GROUP_NAME } from '@src/common/constants';
import {
  extractCronExpression,
  validateScheduleParameters,
  parseJobTemplate,
  ParsedJobTemplate,
} from '../utils/evaluationJobSchedulerUtils';
import { validateJobSchedulerConfiguration } from '../helper/validateJobSchedulerConfiguration';

/**
 * Merge update input over existing template. Input fields override existing;
 * undefined input fields keep existing values.
 */
function mergeTemplate(existing: ParsedJobTemplate, input: UpdateJobSchedulerServerInput): ParsedJobTemplate {
  return {
    jobType: input.jobType ?? existing.jobType,
    evaluatorName: input.evaluatorName ?? existing.evaluatorName,
    ...(input.testCases !== undefined
      ? { testCases: input.testCases }
      : existing.testCases && { testCases: existing.testCases }),
    ...(input.scorers !== undefined ? { scorers: input.scorers } : existing.scorers && { scorers: existing.scorers }),
    ...(input.app !== undefined ? { app: input.app } : existing.app && { app: existing.app }),
    ...(input.sourceReportId !== undefined
      ? { sourceReportId: input.sourceReportId }
      : existing.sourceReportId && { sourceReportId: existing.sourceReportId }),
    ...(input.testResults !== undefined
      ? { testResults: input.testResults }
      : existing.testResults && { testResults: existing.testResults }),
    ...(input.experimentName !== undefined
      ? { experimentName: input.experimentName }
      : existing.experimentName && { experimentName: existing.experimentName }),
  };
}

export const updateJobSchedulerOperation: Operation<
  UpdateJobSchedulerServerInput,
  UpdateJobSchedulerServerOutput,
  HandlerContext
> = async (input, _context) => {
  log.info(`Updating job scheduler ${input.name}`);

  const schedulerName = input.name;

  const existing = await schedulerClient().send(
    new GetScheduleCommand({
      Name: schedulerName,
      GroupName: EVALUATION_JOB_SCHEDULER_GROUP_NAME,
    }),
  );

  validateScheduleParameters(existing, schedulerName);

  const existingTemplate = parseJobTemplate(existing.Target.Input, schedulerName);
  const existingCron = extractCronExpression(existing.ScheduleExpression);

  const updatedTemplate = mergeTemplate(existingTemplate, input);
  const updatedCron = input.cron ?? existingCron;

  // Validate the merged job template using the same rules as direct job submissions.
  // Validating post-merge catches invalid combinations (e.g. switching jobType to FULL
  // without providing scorers) that would otherwise only fail when the schedule
  // fires.
  const validationErrors = validateJobSchedulerConfiguration(updatedTemplate);
  if (validationErrors.length > 0) {
    logErrorAndThrowValidation({
      externalMessage: validationErrors.join('; '),
    });
  }

  await schedulerClient().send(
    new UpdateScheduleCommand({
      Name: schedulerName,
      ScheduleExpression: `cron(${updatedCron})`,
      FlexibleTimeWindow: existing.FlexibleTimeWindow,
      Target: {
        Arn: getEnvVariable((e) => e.TARGET_LAMBDA_ARN),
        RoleArn: getEnvVariable((e) => e.SCHEDULER_ROLE_ARN),
        Input: JSON.stringify(updatedTemplate),
        RetryPolicy: { MaximumRetryAttempts: 3 },
      },
      GroupName: EVALUATION_JOB_SCHEDULER_GROUP_NAME,
    }),
  );

  log.info(`Successfully updated job scheduler ${schedulerName}`);

  return {
    name: schedulerName,
    cron: updatedCron,
    createdAt: existing.CreationDate,
    ...updatedTemplate,
  };
};

export const lambdaHandler: APIGatewayProxyHandler = getApiGatewayHandler(
  getUpdateJobSchedulerHandler(applyLambdaDecorators(updateJobSchedulerOperation)),
);
