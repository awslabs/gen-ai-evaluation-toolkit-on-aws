import { IAsyncDisposable } from '../../../types';
import { $ } from './test-utils';

export type EvalReport = { reportId: string; name: string };

/**
 * Creates an evaluation report and returns a disposable handle that
 * deletes the report (cascading to its results) on cleanup.
 */
export async function createEvalReport(testId: string): Promise<IAsyncDisposable<EvalReport>> {
  const name = `report-${testId}`;
  const description = `Test report created by CLI tests - ${testId}`;

  const result = await $`genai-etk eval report create --name ${name} --description "${description}"`;

  expect(result.stdout).toContain('Report created successfully');
  const idMatch = result.stdout.match(/Report ID:\s+([a-zA-Z0-9-]+)/);
  expect(idMatch).not.toBeNull();
  const reportId = idMatch![1];
  expect(reportId).toBeTruthy();

  return {
    reportId,
    name,
    async [Symbol.asyncDispose]() {
      await deleteEvalReport(reportId);
    },
  };
}

/**
 * Deletes an evaluation report (idempotent — succeeds if already gone).
 */
export async function deleteEvalReport(reportId?: string): Promise<void> {
  if (!reportId) return;
  try {
    await $`genai-etk eval report delete --report-id ${reportId}`;
  } catch (error) {
    console.warn(`Failed to cleanup report ${reportId}:`, error);
  }
}
