/* eslint-disable @typescript-eslint/no-explicit-any */
import { UpdateJobSchedulerServerInput, JobType } from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import { updateJobSchedulerOperation } from '@src/evaluation/api/handlers/updateJobSchedulerLambda';
import { HandlerContext } from '@common/api/apiGateway';

const mockSend = jest.fn();

jest.mock('@common', () => {
  const actual = jest.requireActual('@common');
  return {
    ...actual,
    getEnvVariable: jest.fn(() => 'mock-env-value'),
    schedulerClient: jest.fn(() => ({ send: mockSend })),
  };
});
jest.mock('aws-xray-sdk-core', () => ({
  captureAWSv3Client: jest.fn().mockImplementation((client) => client),
}));

// Replicate mergeTemplate logic for unit testing
// (mirrors packages/cdk/src/evaluation/api/handlers/updateJobSchedulerLambda.ts)
function mergeTemplate(existing: any, input: any): any {
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

describe('updateJobScheduler mergeTemplate', () => {
  const existingTemplate = {
    jobType: 'FULL',
    evaluatorName: 'builtin',
    testCases: { inline: [{ input: { q: 'hello' } }] },
    scorers: { llm_as_judge: { scores: { sample: {} } } },
    app: { name: 'my_app', params: { model: 'nova' } },
    experimentName: 'daily-eval',
  };

  test('empty input preserves all existing fields', () => {
    const result = mergeTemplate(existingTemplate, {});

    expect(result.jobType).toBe('FULL');
    expect(result.evaluatorName).toBe('builtin');
    expect(result.testCases).toEqual(existingTemplate.testCases);
    expect(result.scorers).toEqual(existingTemplate.scorers);
    expect(result.app).toEqual(existingTemplate.app);
    expect(result.experimentName).toBe('daily-eval');
  });

  test('updating evaluatorName preserves other fields', () => {
    const result = mergeTemplate(existingTemplate, { evaluatorName: 'custom-eval' });

    expect(result.evaluatorName).toBe('custom-eval');
    expect(result.jobType).toBe('FULL');
    expect(result.testCases).toEqual(existingTemplate.testCases);
    expect(result.scorers).toEqual(existingTemplate.scorers);
  });

  test('updating scorers replaces existing scorers', () => {
    const newScorers = { ragas: { scores: { faithfulness: {} } } };
    const result = mergeTemplate(existingTemplate, { scorers: newScorers });

    expect(result.scorers).toEqual(newScorers);
    expect(result.testCases).toEqual(existingTemplate.testCases);
  });

  test('updating testCases replaces existing testCases', () => {
    const newTestCases = { dataset: { datasetId: 'new-dataset' } };
    const result = mergeTemplate(existingTemplate, { testCases: newTestCases });

    expect(result.testCases).toEqual(newTestCases);
    expect(result.scorers).toEqual(existingTemplate.scorers);
  });

  test('updating experimentName replaces existing', () => {
    const result = mergeTemplate(existingTemplate, { experimentName: 'new-experiment' });

    expect(result.experimentName).toBe('new-experiment');
  });

  test('fields not in existing are not added when input is empty', () => {
    const minimal = {
      jobType: 'SCORE',
      evaluatorName: 'builtin',
      sourceReportId: 'report-123',
    };

    const result = mergeTemplate(minimal, {});

    expect(result.testCases).toBeUndefined();
    expect(result.scorers).toBeUndefined();
    expect(result.app).toBeUndefined();
    expect(result.testResults).toBeUndefined();
    expect(result.experimentName).toBeUndefined();
    expect(result.sourceReportId).toBe('report-123');
  });

  test('changing jobType and adding sourceReportId', () => {
    const result = mergeTemplate(existingTemplate, {
      jobType: 'SCORE',
      sourceReportId: 'report-456',
    });

    expect(result.jobType).toBe('SCORE');
    expect(result.sourceReportId).toBe('report-456');
    expect(result.evaluatorName).toBe('builtin');
    expect(result.scorers).toEqual(existingTemplate.scorers);
  });

  test('multiple fields updated at once', () => {
    const result = mergeTemplate(existingTemplate, {
      evaluatorName: 'new-eval',
      scorers: { ragas: { scores: { answer_relevancy: {} } } },
      experimentName: 'updated',
    });

    expect(result.evaluatorName).toBe('new-eval');
    expect(result.scorers).toEqual({ ragas: { scores: { answer_relevancy: {} } } });
    expect(result.experimentName).toBe('updated');
    expect(result.jobType).toBe('FULL');
    expect(result.testCases).toEqual(existingTemplate.testCases);
    expect(result.app).toEqual(existingTemplate.app);
  });
});

describe('updateJobSchedulerOperation', () => {
  const mockNow = new Date('2024-01-01T12:00:00Z');
  const context: HandlerContext = { user: 'user-name', requestTime: mockNow };
  const creationDate = new Date('2024-01-01T00:00:00Z');

  function mockExistingSchedule(template: object) {
    mockSend.mockResolvedValueOnce({
      Name: 'test-scheduler',
      ScheduleExpression: 'cron(0 0 * * ? *)',
      Target: {
        Arn: 'arn:aws:lambda:us-east-1:123456789012:function:trigger',
        Input: JSON.stringify(template),
        RoleArn: 'arn:aws:iam::123456789012:role/scheduler-role',
        RetryPolicy: { MaximumRetryAttempts: 3 },
      },
      FlexibleTimeWindow: { Mode: 'OFF' },
      CreationDate: creationDate,
    });
  }

  const existingFullTemplate = {
    jobType: 'FULL',
    evaluatorName: 'builtin',
    testCases: { inline: [{ input: { q: 'hello' } }] },
    scorers: { llm_as_judge: { scores: { sample: {} } } },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should update the schedule when the merged template is valid', async () => {
    const mockInput: UpdateJobSchedulerServerInput = {
      name: 'test-scheduler',
      scorers: { ragas: { scores: { faithfulness: {} } } },
    };
    mockExistingSchedule(existingFullTemplate);
    mockSend.mockResolvedValueOnce({}); // UpdateScheduleCommand

    const result = await updateJobSchedulerOperation(mockInput, context);

    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(result.scorers).toEqual(mockInput.scorers);
    expect(result.testCases).toEqual(existingFullTemplate.testCases);
    expect(result.createdAt).toBe(creationDate);
  });

  it('should reject updates that strip scorers from a FULL job', async () => {
    const mockInput = {
      name: 'test-scheduler',
      scorers: {},
    } as unknown as UpdateJobSchedulerServerInput;
    mockExistingSchedule(existingFullTemplate);

    await expect(updateJobSchedulerOperation(mockInput, context)).rejects.toThrow(
      /FULL job requires at least one scorer/,
    );
    // Only GetScheduleCommand — the update must not be sent
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('should reject switching jobType to SCORE without sourceReportId or testResults', async () => {
    const mockInput: UpdateJobSchedulerServerInput = {
      name: 'test-scheduler',
      jobType: JobType.SCORE,
    };
    mockExistingSchedule(existingFullTemplate);

    await expect(updateJobSchedulerOperation(mockInput, context)).rejects.toThrow(
      /SCORE job requires sourceReportId or testResults/,
    );
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('should reject updates that set empty inline test cases', async () => {
    const mockInput = {
      name: 'test-scheduler',
      testCases: { inline: [] },
    } as unknown as UpdateJobSchedulerServerInput;
    mockExistingSchedule(existingFullTemplate);

    await expect(updateJobSchedulerOperation(mockInput, context)).rejects.toThrow(
      /testCases.inline must contain at least one test case/,
    );
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('should reject updates that set malformed scorer configurations', async () => {
    const mockInput = {
      name: 'test-scheduler',
      scorers: { toxicity: 'not-an-object' },
    } as unknown as UpdateJobSchedulerServerInput;
    mockExistingSchedule(existingFullTemplate);

    await expect(updateJobSchedulerOperation(mockInput, context)).rejects.toThrow(
      /Invalid scorer configuration for scorer 'toxicity'/,
    );
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('should validate the merged template, accepting partial updates that stay valid', async () => {
    const mockInput: UpdateJobSchedulerServerInput = {
      name: 'test-scheduler',
      experimentName: 'new-experiment',
    };
    mockExistingSchedule(existingFullTemplate);
    mockSend.mockResolvedValueOnce({}); // UpdateScheduleCommand

    const result = await updateJobSchedulerOperation(mockInput, context);

    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(result.experimentName).toBe('new-experiment');
    expect(result.scorers).toEqual(existingFullTemplate.scorers);
  });
});
