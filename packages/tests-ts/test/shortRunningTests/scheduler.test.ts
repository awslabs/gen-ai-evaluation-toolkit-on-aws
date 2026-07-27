import {
  CreateJobSchedulerCommand,
  DeleteJobSchedulerCommand,
  GetJobSchedulerCommand,
  ListJobSchedulersCommand,
  UpdateJobSchedulerCommand,
} from '@awssolutions/gen-ai-evaluation-toolkit-ts-client';
import { send } from '../helpers';

const createdSchedules: string[] = [];

afterAll(async () => {
  await Promise.all(
    createdSchedules.map(async (name) => {
      try {
        await send(new DeleteJobSchedulerCommand({ name }));
      } catch (e) {
        // best-effort cleanup
      }
    }),
  );
});

describe('Job Scheduler', () => {
  test('Create a scheduler with v2 job template', async () => {
    const response = await send(
      new CreateJobSchedulerCommand({
        cron: '0 8 * * ? *',
        jobType: 'FULL',
        evaluatorName: 'builtin',
        testCases: { inline: [{ input: { question: 'What is 2+2?' } }] },
        scorers: { llm_as_judge: { scores: { sample: null } } },
        experimentName: 'scheduler-e2e-test',
      }),
    );

    expect(response.name).toBeDefined();
    expect(response.jobType).toBe('FULL');
    expect(response.evaluatorName).toBe('builtin');
    createdSchedules.push(response.name);
  });

  test('Get scheduler details', async () => {
    const createResp = await send(
      new CreateJobSchedulerCommand({
        cron: '0 12 * * ? *',
        jobType: 'SCORE',
        evaluatorName: 'builtin',
        scorers: { llm_as_judge: { scores: { sample: {} } } },
        sourceReportId: 'fake-report-id',
      }),
    );
    createdSchedules.push(createResp.name);

    const getResp = await send(new GetJobSchedulerCommand({ name: createResp.name }));
    expect(getResp.name).toBe(createResp.name);
    expect(getResp.cron).toBe('0 12 * * ? *');
    expect(getResp.jobType).toBe('SCORE');
    expect(getResp.evaluatorName).toBe('builtin');
  });

  test('Update scheduler cron', async () => {
    const createResp = await send(
      new CreateJobSchedulerCommand({
        cron: '0 8 * * ? *',
        jobType: 'APP_INVOKE',
        evaluatorName: 'builtin',
        testCases: { inline: [{ input: { q: 'hi' } }] },
      }),
    );
    createdSchedules.push(createResp.name);

    const updateResp = await send(
      new UpdateJobSchedulerCommand({
        name: createResp.name,
        cron: '0 18 * * ? *',
      }),
    );
    expect(updateResp.cron).toBe('0 18 * * ? *');
    expect(updateResp.jobType).toBe('APP_INVOKE');
  });

  test('List schedulers', async () => {
    const response = await send(new ListJobSchedulersCommand({}));
    expect(response.jobSchedulers).toBeDefined();
    expect(response.jobSchedulers.length).toBeGreaterThan(0);
  });

  test('Delete scheduler', async () => {
    const createResp = await send(
      new CreateJobSchedulerCommand({
        cron: '0 6 * * ? *',
        jobType: 'FULL',
        evaluatorName: 'builtin',
        testCases: { inline: [{ input: { q: 'hi' } }] },
        scorers: { llm_as_judge: { scores: { sample: {} } } },
      }),
    );

    const deleteResp = await send(new DeleteJobSchedulerCommand({ name: createResp.name }));
    expect(deleteResp.name).toBe(createResp.name);
    // Don't add to createdSchedules — already deleted
  });

});
