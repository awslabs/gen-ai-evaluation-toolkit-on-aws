import {
  InlineTestResult,
  JobType,
  ScorerConfig,
  TestDataSource,
} from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';

/**
 * Job template fields relevant for validation. Structurally compatible with both
 * CreateJobSchedulerServerInput and ParsedJobTemplate (update path).
 */
export interface JobSchedulerConfiguration {
  jobType: JobType;
  testCases?: TestDataSource;
  scorers?: Record<string, ScorerConfig | null>;
  sourceReportId?: string;
  testResults?: InlineTestResult[];
}

/**
 * Validates a job scheduler configuration (create input or merged update template).
 *
 * Adapted from release/v1.2.0 `validatePluginConfiguration` (152daa0f, d71aa59c) to the
 * v2 job-template shape. Applies the same rules as direct job submissions
 * (python-api `evaluator_jobs.py`) and the scheduler trigger handler
 * (`scheduler_handler.py` SchedulerEvent validation). Without this check, schedulers
 * can be created or updated with configurations that only fail when the schedule fires.
 *
 * Returns a list of human-readable error strings; an empty list means the configuration
 * is acceptable. Callers are expected to surface errors via `logErrorAndThrowValidation`.
 */
export function validateJobSchedulerConfiguration(config: JobSchedulerConfiguration): string[] {
  const errors: string[] = [];

  errors.push(...validateTestCases(config.testCases));
  errors.push(...validateScorers(config.scorers));

  switch (config.jobType) {
    case JobType.FULL:
      if (!config.testCases) {
        errors.push('FULL job requires testCases');
      }
      if (!config.scorers || Object.keys(config.scorers).length === 0) {
        errors.push('FULL job requires at least one scorer');
      }
      break;
    case JobType.SCORE:
      if (!config.sourceReportId && (!config.testResults || config.testResults.length === 0)) {
        errors.push('SCORE job requires sourceReportId or testResults');
      }
      if (config.sourceReportId && config.testResults && config.testResults.length > 0) {
        errors.push('sourceReportId is mutually exclusive with testResults');
      }
      break;
    case JobType.APP_INVOKE:
      if (!config.testCases) {
        errors.push('APP_INVOKE job requires testCases');
      }
      break;
  }

  return errors;
}

/**
 * Structural validation of the testCases union: inline test cases must be a non-empty
 * array; dataset references must carry a datasetId. Mirrors `_validate_test_data` in
 * python-api `evaluator_jobs.py`.
 */
function validateTestCases(testCases?: TestDataSource): string[] {
  if (testCases == null) {
    return [];
  }

  if (typeof testCases !== 'object' || Array.isArray(testCases)) {
    return ['Invalid testCases: must be an object with either an inline or dataset member'];
  }

  const record = testCases as unknown as Record<string, unknown>;
  const errors: string[] = [];

  if ('inline' in record) {
    if (!Array.isArray(record.inline) || record.inline.length === 0) {
      errors.push('testCases.inline must contain at least one test case');
    }
  } else if ('dataset' in record) {
    const dataset = record.dataset;
    if (
      dataset == null ||
      typeof dataset !== 'object' ||
      typeof (dataset as Record<string, unknown>).datasetId !== 'string' ||
      (dataset as Record<string, unknown>).datasetId === ''
    ) {
      errors.push('testCases.dataset.datasetId is required');
    }
  } else {
    errors.push('Invalid testCases: must contain either an inline or dataset member');
  }

  return errors;
}

/**
 * Structural validation of the scorers map: each entry must be a scorer configuration
 * object or null (null = run with defaults). Mirrors the per-evaluator structural checks
 * from the release validatePluginConfiguration helper, adapted to the v2 ScorerMap shape.
 */
function validateScorers(scorers?: Record<string, ScorerConfig | null>): string[] {
  if (scorers == null) {
    return [];
  }

  if (typeof scorers !== 'object' || Array.isArray(scorers)) {
    return ['Invalid scorers: must be a map of scorer name to configuration'];
  }

  const errors: string[] = [];
  for (const [name, config] of Object.entries(scorers)) {
    if (config !== null && (typeof config !== 'object' || Array.isArray(config))) {
      errors.push(
        `Invalid scorer configuration for scorer '${name}': must be an object or null, but found ${typeof config}`,
      );
    }
  }

  return errors;
}
