import {
  ListJobSchedulersServerInput,
  ListJobSchedulersServerOutput,
  getListJobSchedulersHandler,
} from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import { ListSchedulesCommand, SchedulerClient } from '@aws-sdk/client-scheduler';
import { Operation } from '@aws-smithy/server-common';
import { lazy } from '@common';
import { HandlerContext, getApiGatewayHandler } from '@common/api/apiGateway';
import { log } from '@common/api/utils';
import { applyLambdaDecorators } from '@src/common/api/utils/lambdaWrapper';
import { APIGatewayProxyHandler } from 'aws-lambda';
import * as AWSXRay from 'aws-xray-sdk-core';
import { EVALUATION_JOB_SCHEDULER_GROUP_NAME } from '@src/common/constants';
import assert from 'assert';

const scheduler = lazy(() => {
  const client = new SchedulerClient({});
  AWSXRay.captureAWSv3Client(client);
  return client;
});

export const listJobSchedulersOperation: Operation<
  ListJobSchedulersServerInput,
  ListJobSchedulersServerOutput,
  HandlerContext
> = async (input, _context) => {
  log.info('Listing job schedulers');

  const result = await scheduler().send(
    new ListSchedulesCommand({
      GroupName: EVALUATION_JOB_SCHEDULER_GROUP_NAME,
      NextToken: input.nextToken,
      MaxResults: input.maxResults,
    }),
  );

  if (!result.Schedules || result.Schedules.length === 0) {
    return { jobSchedulers: [] };
  }

  const jobSchedulers = result.Schedules.map((schedule) => {
    // Assert that schedule has required properties
    assert(schedule.Name, 'Schedule must have a Name property');
    assert(schedule.CreationDate, 'Schedule must have a CreationDate property');

    return {
      name: schedule.Name,
      createdAt: schedule.CreationDate,
    };
  });

  // Return the next token at the top level of the response
  return {
    jobSchedulers,
    nextToken: result.NextToken,
  };
};

export const lambdaHandler: APIGatewayProxyHandler = getApiGatewayHandler(
  getListJobSchedulersHandler(applyLambdaDecorators(listJobSchedulersOperation)),
);
