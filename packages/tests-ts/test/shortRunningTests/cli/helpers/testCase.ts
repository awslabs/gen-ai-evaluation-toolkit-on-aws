import { IAsyncDisposable } from '../../../types';
import { $ } from './test-utils';

export type TestCase = {
  id: string;
  datasetId: string;
};

/**
 * Creates a test case and returns a disposable test case object
 * @param {string} datasetId - The dataset ID
 * @returns {Promise<TestCase>} A disposable test case object
 */
export async function createTestCase(datasetId: string): Promise<IAsyncDisposable<TestCase>> {
  const result =
    await $`genai-etk dataset create-test-case --dataset-id ${datasetId} --input "Test question" --expected "Test answer"`;

  expect(result.stdout).toMatch(/Id:\s+([a-zA-Z0-9-]+)/);

  const testCaseIdMatch = result.stdout.match(/Id:\s+([a-zA-Z0-9-]+)/);
  expect(testCaseIdMatch).not.toBeNull();

  const id = testCaseIdMatch![1];
  expect(id).not.toBeNull();

  return {
    id,
    datasetId,
    async [Symbol.asyncDispose]() {
      await deleteTestCase(datasetId, id);
    },
  };
}

/**
 * Creates a test case and returns a disposable test case object
 * @param {string} datasetId - The dataset ID
 * @returns {Promise<TestCase>} A disposable test case object
 */
export async function deleteTestCase(datasetId?: string, testCaseId?: string): Promise<void> {
  if (!datasetId) return;
  if (!testCaseId) return;
  try {
    await $`genai-etk dataset delete-test-case --dataset-id ${datasetId} --test-case-id ${testCaseId}`;
  } catch (error) {
    console.warn(`Failed to cleanup testcase with dataset ${datasetId} and testCaseId ${testCaseId}:`, error);
  }
}
