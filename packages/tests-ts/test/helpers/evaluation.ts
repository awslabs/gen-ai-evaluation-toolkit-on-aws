import {
  GetEvaluatorJobCommand,
  GetEvaluatorJobCommandOutput,
  JobStatus,
  SubmitEvaluationJobCommand,
  SubmitEvaluationJobCommandInput,
  SubmitEvaluationJobCommandOutput,
} from '@awssolutions/gen-ai-evaluation-toolkit-ts-client';
import { setTimeout as sleep } from 'timers/promises';
import { send } from '.';

let createdJobIds: string[] = [];

export async function submitEvaluationJob(
  input: SubmitEvaluationJobCommandInput,
): Promise<SubmitEvaluationJobCommandOutput> {
  const job = await send(new SubmitEvaluationJobCommand(input));
  expect(job.jobId).toBeDefined();
  createdJobIds.push(job.jobId);
  return job;
}

const terminalStatuses = new Set<string>([
  JobStatus.SUCCESS,
  JobStatus.FAILURE,
  JobStatus.PARTIAL_FAILURE,
]);

export async function waitUntilEvaluatorJobIsCompleted(jobId: string): Promise<GetEvaluatorJobCommandOutput> {
  let job: GetEvaluatorJobCommandOutput;

  do {
    await sleep(2000);
    job = await send(new GetEvaluatorJobCommand({ jobId }));
  } while (!terminalStatuses.has(job.status));

  return job;
}

export async function stopCreatedEvaluationRuns() {
  // No cancel API in v2; we just clear the tracking list so afterAll doesn't fail.
  createdJobIds = [];
}
