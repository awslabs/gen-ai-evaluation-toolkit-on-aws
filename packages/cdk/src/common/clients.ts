import { SchedulerClient } from '@aws-sdk/client-scheduler';
import { SFNClient } from '@aws-sdk/client-sfn';
import * as AWSXRay from 'aws-xray-sdk-core';
import { lazy } from './lazy';

/**
 * StepFunction client singleton with xray tracing.
 */
export const sfnClient = lazy(() => {
  const client = new SFNClient({
    // Increase max attempt since StepFunction has low rate-limit
    maxAttempts: 10,
  });

  AWSXRay.captureAWSv3Client(client);
  return client;
});

/**
 * Scheduler client singleton with xray tracing.
 */
export const schedulerClient = lazy(() => {
  const client = new SchedulerClient({ maxAttempts: 10 });

  AWSXRay.captureAWSv3Client(client);
  return client;
});
