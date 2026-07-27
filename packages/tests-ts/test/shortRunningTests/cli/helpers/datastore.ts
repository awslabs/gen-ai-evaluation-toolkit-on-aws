import { IAsyncDisposable } from '../../../types';
import { $ } from './test-utils';

export type Dataset = { id: string };

/**
 * Creates a dataset and returns a disposable dataset object
 * @param {string} testId - Unique test identifier
 * @returns {Promise<Dataset>} A disposable dataset object
 */
export async function createDataset(testId: string): Promise<IAsyncDisposable<Dataset>> {
  const datasetName = `dataset-${testId}`;
  const datasetDescription = `Test dataset created by CLI tests - ${testId}`;

  const result = await $`genai-etk dataset create --name ${datasetName} --description "${datasetDescription}"`;

  expect(result.stdout).toMatch(/Id:\s+([a-zA-Z0-9-]+)/);
  const datasetIdMatch = result.stdout.match(/Id:\s+([a-zA-Z0-9-]+)/);

  expect(datasetIdMatch).not.toBeNull();
  const id = datasetIdMatch![1];

  expect(id).toBeDefined();
  expect(id).not.toBeNull();

  return {
    id,
    async [Symbol.asyncDispose]() {
      await deleteDataset(id);
    },
  };
}

/**
 * Deletes a dataset
 * @param {string} id - The dataset id
 * @returns {Promise<void>}
 */
export async function deleteDataset(id?: string): Promise<void> {
  if (!id) return;
  try {
    await $`genai-etk dataset delete --dataset-id ${id}`;
  } catch (error) {
    console.warn(`Failed to cleanup dataset with id ${id}:`, error);
  }
}

/**
 * Mints a version and returns its number
 * @param {string} datasetId - The dataset ID
 * @returns {Promise<string>} The version number
 */
export async function mintVersion(datasetId: string): Promise<string> {
  const result = await $`genai-etk dataset create-version --dataset-id ${datasetId}`;

  expect(result.stdout).toContain('Successfully started to mint a new version');

  await waitUntilDatasetIsActive(datasetId);

  const versionResult = await $`genai-etk dataset list-versions --dataset-id ${datasetId}`;

  const versionMatch = versionResult.stdout.match(/Version:\s+(\d+)/);
  expect(versionMatch).not.toBeNull();

  const version = versionMatch![1];
  expect(version).not.toBeNull();

  return version;
}

/**
 * Waits until the dataset status becomes ACTIVE
 * @param {string} datasetId - The dataset ID
 */
async function waitUntilDatasetIsActive(datasetId: string): Promise<void> {
  let status = '';
  let attempts = 0;
  const maxAttempts = 30; // Maximum number of attempts to check status
  const delay = 1000; // Delay between attempts in milliseconds

  do {
    await new Promise((resolve) => setTimeout(resolve, delay));

    const result = await $`genai-etk dataset get --dataset-id ${datasetId}`;

    const statusMatch = result.stdout.match(/Status:\s+(\w+)/);
    if (statusMatch && statusMatch[1]) {
      status = statusMatch[1];
    }

    attempts++;
  } while (status !== 'ACTIVE' && attempts < maxAttempts);

  expect(status).toEqual('ACTIVE');
}
