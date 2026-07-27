import { $, ExecError } from './test-utils';
import { IAsyncDisposable } from '../../../types';
import {
  Experiment,
  GetExperimentCommand,
  ResourceNotFoundException
} from '@awssolutions/gen-ai-evaluation-toolkit-ts-client';

/**
 * Creates an experiment and returns a disposable experiment object
 * @param {string} testId - Unique test identifier
 * @returns {Promise<Experiment>} A disposable experiment object
 */
export async function createExperiment(testId: string): Promise<IAsyncDisposable<Experiment>> {
  const experimentName = `experiment-${testId}`;
  const experimentDescription = `Test experiment created by CLI tests - ${testId}`;

  const createExperimentResult =
    await $.json<Experiment>`genai-etk experiment create --name ${experimentName} --description "${experimentDescription}"`;

  expect(createExperimentResult.name).toBeTruthy();

  await waitUntilExperimentIsAvailable(createExperimentResult.name);

  return {
    ...createExperimentResult,
    async [Symbol.asyncDispose]() {
      await deleteExperiment(createExperimentResult.name);
    },
  };
}

/**
 * Placeholder for cleaning up experiment resources
 * Note: Currently there is no delete command available for experiments
 * @param {string | null | undefined} experimentName - The experiment name
 */
export async function deleteExperiment(experimentName?: string | null) {
  if (experimentName) {
    try {
      await $`genai-etk experiment delete --name "${experimentName}"`;
    }
    catch (error) {
      const execError = error as ExecError;
      if (execError.stderr?.includes('not found'))
        return;
      if (execError.stderr?.includes('does not exist'))
        return;
      console.warn("Exception during cleanup", error)
    }
  }
}

/**
 * Waits until the experiment status becomes available
 * @param {string} experimentName - The experiment's name
 */
async function waitUntilExperimentIsAvailable(experimentName: string): Promise<void> {
  let attempts = 0;
  const maxAttempts = 30; // Maximum number of attempts to check status
  const delay = 1000; // Delay between attempts in milliseconds

  do {

    try {
      await $.json<GetExperimentCommand>`genai-etk experiment get --name ${experimentName}`;
      return;
    }
    catch (error) {
      if (error instanceof ResourceNotFoundException) {
        // not yet available
        await new Promise((resolve) => setTimeout(resolve, delay));
        attempts++;
        continue;
      }
      throw error;
    }

  } while (attempts < maxAttempts);

  throw new Error(`Experiment ${experimentName} is not available after ${maxAttempts} attempts`);
}
