import {
  CreateExperimentCommand,
  CreateExperimentResponse,
  DeleteExperimentCommand,
} from '@awssolutions/gen-ai-evaluation-toolkit-ts-client';
import { send } from '.';
import { randomUUID } from 'crypto';

const createdExperiments: string[] = [];

export async function createExperiment({
  name = `test-experiment-${randomUUID()}`,
  description = 'Experiment created by integration test',
} = {}): Promise<CreateExperimentResponse> {
  const experimentOutput = await send(new CreateExperimentCommand({ name, description }));
  expect(experimentOutput).toBeDefined();
  expect(experimentOutput.name).toEqual(name);

  createdExperiments.push(experimentOutput.name);

  return experimentOutput;
}

export async function cleanupCreatedExperiments() {
  await Promise.all(
    createdExperiments.map(async (name) => {
      try {
        await send(new DeleteExperimentCommand({ name }));
      } catch (error) {
        console.warn(`Failed to cleanup experiment ${name}:`, error);
      }
    }),
  );
  createdExperiments.splice(0, createdExperiments.length);
}
