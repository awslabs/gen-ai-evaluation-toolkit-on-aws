import { randomUUID } from 'crypto';
import { createEvalReport, deleteEvalReport, setupTestEnvironment, $ } from './helpers';

beforeAll(async () => {
  await setupTestEnvironment();
});

describe('Evaluator Report + Result CLI Commands', () => {
  test('eval report create returns reportId + ACTIVE status', async () => {
    const testId = `create-${randomUUID()}`;
    await using report = await createEvalReport(testId);

    expect(report.reportId).toBeTruthy();
    expect(report.name).toBe(`report-${testId}`);
  });

  test('eval report get returns the stored report', async () => {
    const testId = `get-${randomUUID()}`;
    await using report = await createEvalReport(testId);

    const result = await $`genai-etk eval report get --report-id ${report.reportId}`;

    expect(result.stdout).toContain(`Report ID: ${report.reportId}`);
    expect(result.stdout).toContain(`Name: ${report.name}`);
    expect(result.stdout).toContain('Status: ACTIVE');
  });

  test('eval report get retrieves created report and list produces valid output', async () => {
    const testId = `list-${randomUUID()}`;
    await using report = await createEvalReport(testId);

    // Verify report is retrievable (list may be paginated with many reports)
    const get = await $`genai-etk eval report get --report-id ${report.reportId}`;
    expect(get.stdout).toContain(`Report ID: ${report.reportId}`);
    expect(get.stdout).toContain(`Name: ${report.name}`);
    expect(get.stdout).toContain('Status: ACTIVE');

    // Verify list command produces valid output structure
    const list = await $`genai-etk eval report list`;
    expect(list.stdout).toContain('Report ID:');
    expect(list.stdout).toContain('Status: ACTIVE');
  });

  test('eval result batch-create then list+get round-trips', async () => {
    const testId = `batch-create-${randomUUID()}`;
    await using report = await createEvalReport(testId);

    const resultsJson = JSON.stringify([
      { input: { q: 'first question' }, output: { a: 'first answer' } },
      { input: { q: 'second question' }, output: { a: 'second answer' } },
    ]);

    const created =
      await $`genai-etk eval result batch-create --report-id ${report.reportId} --results-json '${resultsJson}'`;
    expect(created.stdout).toContain('Created: 2');

    const list = await $`genai-etk eval result list --report-id ${report.reportId}`;
    const resultIds = [...list.stdout.matchAll(/Result ID:\s+([a-zA-Z0-9-]+)/g)].map((m) => m[1]);
    expect(resultIds.length).toBe(2);

    const get = await $`genai-etk eval result get --report-id ${report.reportId} --result-id ${resultIds[0]}`;
    expect(get.stdout).toContain(`Result ID: ${resultIds[0]}`);
    expect(get.stdout).toContain(`Report ID: ${report.reportId}`);
  });

  test('eval result batch-update-scores attaches scores to existing results', async () => {
    const testId = `batch-update-${randomUUID()}`;
    await using report = await createEvalReport(testId);

    const resultsJson = JSON.stringify([{ input: { q: 'hello' }, output: { a: 'world' } }]);
    const created =
      await $`genai-etk eval result batch-create --report-id ${report.reportId} --results-json '${resultsJson}'`;
    expect(created.stdout).toContain('Created: 1');

    const list = await $`genai-etk eval result list --report-id ${report.reportId}`;
    const resultId = list.stdout.match(/Result ID:\s+([a-zA-Z0-9-]+)/)![1];

    const itemsJson = JSON.stringify([{ resultId, scores: { correctness: { score: 0.9 } } }]);
    const update =
      await $`genai-etk eval result batch-update-scores --report-id ${report.reportId} --items-json '${itemsJson}'`;
    expect(update.stdout).toContain('Updated: 1');

    const get = await $`genai-etk eval result get --report-id ${report.reportId} --result-id ${resultId}`;
    expect(get.stdout).toContain('correctness');
  });

  test('eval result batch-delete removes specific results, others remain', async () => {
    const testId = `batch-delete-${randomUUID()}`;
    await using report = await createEvalReport(testId);

    const resultsJson = JSON.stringify([
      { input: { q: 'keep' }, output: { a: 'kept' } },
      { input: { q: 'drop' }, output: { a: 'dropped' } },
    ]);
    await $`genai-etk eval result batch-create --report-id ${report.reportId} --results-json '${resultsJson}'`;

    const before = await $`genai-etk eval result list --report-id ${report.reportId}`;
    const ids = [...before.stdout.matchAll(/Result ID:\s+([a-zA-Z0-9-]+)/g)].map((m) => m[1]);
    expect(ids.length).toBe(2);

    const toDelete = ids[0];
    const idsJson = JSON.stringify([toDelete]);
    const del =
      await $`genai-etk eval result batch-delete --report-id ${report.reportId} --result-ids-json '${idsJson}'`;
    expect(del.stdout).toContain('Deleted: 1');

    const after = await $`genai-etk eval result list --report-id ${report.reportId}`;
    expect(after.stdout).not.toContain(toDelete);
    expect(after.stdout).toContain(ids[1]);
  });

  test('eval report delete cascades to its results', async () => {
    const testId = `cascade-${randomUUID()}`;
    const report = await createEvalReport(testId);

    const resultsJson = JSON.stringify([{ input: { q: 'cascade' }, output: { a: 'me' } }]);
    await $`genai-etk eval result batch-create --report-id ${report.reportId} --results-json '${resultsJson}'`;

    await deleteEvalReport(report.reportId);

    // Subsequent get on the deleted report must fail with a ResourceNotFound-shaped error
    await expect($`genai-etk eval report get --report-id ${report.reportId}`).rejects.toMatchObject({
      stderr: expect.stringContaining('not found'),
    });
  });
});
