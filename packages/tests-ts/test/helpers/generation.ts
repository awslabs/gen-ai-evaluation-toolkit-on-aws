import {
  GetGenerationCommand,
  StartGenerationCommand,
  StartGenerationInput,
  StartGenerationOutput,
  StepFunctionJobStatus,
  StopGenerationCommand,
} from '@awssolutions/gen-ai-evaluation-toolkit-ts-client';
import { setTimeout as sleep } from 'timers/promises';
import { send } from '.';
import { IAsyncDisposable } from '../types';

export async function startDummyGenerationRun(
  { experimentName, steps }: StartGenerationInput = {
    experimentName: undefined,
    steps: [
      {
        plugin: 'generationNoopPlugin',
        configuration: {},
      },
    ],
  },
): Promise<IAsyncDisposable<StartGenerationOutput>> {
  const run = await send(new StartGenerationCommand({ experimentName, steps }));

  expect(run.id).toBeDefined();
  expect(run.experimentName).toEqual(experimentName);
  expect(run.steps.length).toEqual(steps.length);

  return {
    ...run,
    async [Symbol.asyncDispose]() {
      await stopGenerationRun(run.id);
    },
  };
}

export async function stopGenerationRun(id: string) {
  try {
    await send(new StopGenerationCommand({ id }));
  } catch (error) {
    // we do not care if the resource does not exist:
    if (error instanceof Error && error.message === 'Resource not found') return;
    console.warn(`Failed to cleanup generation run ${id}:`, error);
  }
}

const completedStepFunctionJobStatusSet = new Set<StepFunctionJobStatus>([
  StepFunctionJobStatus.ABORTED,
  StepFunctionJobStatus.SUCCEEDED,
  StepFunctionJobStatus.FAILED,
]);

export async function waitUntilGenerationRunIsCompleted(runId: string, { sleepMs = 500 } = {}) {
  let status: StepFunctionJobStatus;

  do {
    await sleep(sleepMs);
    const response = await send(new GetGenerationCommand({ id: runId }));
    status = response.status;
  } while (!completedStepFunctionJobStatusSet.has(status));

  expect(completedStepFunctionJobStatusSet).toContain(status);
}
