import { GetScheduleCommandOutput } from '@aws-sdk/client-scheduler';
import {
  AppConfig,
  InlineTestResult,
  JobType,
  ScorerConfig,
  TestDataSource,
} from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import { log } from '@common/api/utils';
import assert from 'assert';

/**
 * Parsed job scheduler payload extracted from EventBridge Target Input.
 * Matches the v2 job template shape.
 *
 * scheduleName + time are used by the handler for idempotent retries
 * (deterministic job_id derivation). They must survive update round-trips.
 */
export interface ParsedJobTemplate {
  scheduleName?: string;
  time?: string;
  jobType: JobType;
  evaluatorName: string;
  testCases?: TestDataSource;
  scorers?: Record<string, ScorerConfig | null>;
  app?: AppConfig;
  sourceReportId?: string;
  testResults?: InlineTestResult[];
  experimentName?: string;
}

/**
 * Extracts cron expression from EventBridge ScheduleExpression
 * @param expression The EventBridge schedule expression (e.g., "cron(0 0 * * *)")
 * @returns Cleaned cron expression without 'cron()' wrapper (e.g., "0 0 * * *")
 */
export function extractCronExpression(expression: string): string {
  return expression.replace(/^cron\(|\)$/g, '');
}

/**
 * Validates that a schedule has all required parameters
 * @param schedule The schedule retrieved from AWS EventBridge Scheduler
 * @param schedulerName Name of the scheduler (used for error messages)
 * @throws AssertionError if any required parameters are missing
 */
export function validateScheduleParameters(
  schedule: GetScheduleCommandOutput,
  schedulerName: string,
): asserts schedule is GetScheduleCommandOutput & {
  ScheduleExpression: string;
  Target: { Input: string };
  FlexibleTimeWindow: NonNullable<GetScheduleCommandOutput['FlexibleTimeWindow']>;
  CreationDate: Date;
} {
  assert(schedule.ScheduleExpression, `ScheduleExpression in schedule ${schedulerName} cannot be null`);
  assert(schedule.Target && schedule.Target.Input, `Target in schedule ${schedulerName} cannot be null`);
  assert(schedule.FlexibleTimeWindow, `FlexibleTimeWindow in schedule ${schedulerName} cannot be null`);
  assert(schedule.CreationDate, `CreationDate in schedule ${schedulerName} cannot be null`);
}

/**
 * Parses job template from EventBridge Target Input JSON
 * @param targetInput The JSON string from schedule.Target.Input
 * @param schedulerName Name of the scheduler (used for error messages)
 * @returns Parsed job template
 * @throws Error if JSON parsing fails or required fields are missing
 */
export function parseJobTemplate(targetInput: string, schedulerName: string): ParsedJobTemplate {
  try {
    const payload = JSON.parse(targetInput);

    assert(payload.jobType, `jobType is missing from Target Input for scheduler ${schedulerName}`);
    assert(payload.evaluatorName, `evaluatorName is missing from Target Input for scheduler ${schedulerName}`);

    return {
      ...(payload.scheduleName && { scheduleName: payload.scheduleName }),
      ...(payload.time && { time: payload.time }),
      jobType: payload.jobType as JobType,
      evaluatorName: payload.evaluatorName,
      ...(payload.testCases && { testCases: payload.testCases }),
      ...(payload.scorers && { scorers: payload.scorers }),
      ...(payload.app && { app: payload.app }),
      ...(payload.sourceReportId && { sourceReportId: payload.sourceReportId }),
      ...(payload.testResults && { testResults: payload.testResults }),
      ...(payload.experimentName && { experimentName: payload.experimentName }),
    };
  } catch (e) {
    log.warn(`Failed to parse job template from scheduler ${schedulerName}: ${e}`);
    throw e;
  }
}
