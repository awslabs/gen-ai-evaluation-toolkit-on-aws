import { GenerationStep } from '@awssolutions/gen-ai-evaluation-toolkit-ts-client';
import { IAsyncDisposable } from '../../../types';
import { $, createTempFile, TempFile } from './test-utils';

export type GenerationJob = {
  jobId: string;
};

/**
 * Creates sample generation steps
 * @returns {GenerationStep[]} Array of generation step objects
 */
export function createSampleSteps(): GenerationStep[] {
  return [
    {
      plugin: 'generationNoopPlugin',
      configuration: {
        prompt: 'Generate 5 factual questions about AWS services',
        count: 5,
      },
    },
  ];
}

/**
 * Creates a steps file and returns a disposable object
 * @param {string} testId - Unique test identifier
 * @returns {Promise<TempFile>} A disposable steps file object
 */
export async function createGenerationConfigFile(testId: string): Promise<IAsyncDisposable<TempFile>> {
  return await createTempFile(`generation-config-${testId}.json`, JSON.stringify(createSampleSteps(), null, 2));
}

/**
 * Creates a generation job and returns a disposable generation job object
 * @param {string} jobName - Name of the job
 * @param {TempFile} stepsFile - The steps file to use
 * @returns {Promise<IAsyncDisposable<GenerationJob>>} A disposable generation job object
 */
export async function createGenerationJob(
  stepsFile: TempFile,
): Promise<IAsyncDisposable<GenerationJob>> {
  const result = await $`genai-etk generation job start --steps-file ${stepsFile.path}`;

  expect(result.stdout).toMatch(/Id:\s+([a-zA-Z0-9-]+)/);
  const jobIdMatch = result.stdout.match(/Id:\s+([a-zA-Z0-9-]+)/);
  expect(jobIdMatch).not.toBeNull();
  expect(jobIdMatch![1]).not.toBeNull();
  const jobId = jobIdMatch![1];

  return {
    jobId,
    async [Symbol.asyncDispose]() {
      await cleanupGenerationJob(jobId);
    },
  };
}

/**
 * Cleans up a generation job
 * @param {string | null | undefined} jobId - The job ID to clean up
 */
export async function cleanupGenerationJob(jobId?: string | null) {
  if (jobId) {
    await $`genai-etk generation job stop --id ${jobId}`;
  }
}
