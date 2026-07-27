import { $, setupTestEnvironment } from './helpers';

beforeAll(async () => {
  await setupTestEnvironment();
});

const POLL_INTERVAL_MS = 5000;
const TIMEOUT_MS = 120000;

async function waitForTerminal(jobId: string): Promise<string> {
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    const result = await $.json<{ jobId: string; status: string }>`genai-etk eval job get --job-id ${jobId}`;
    if (['SUCCESS', 'FAILURE', 'PARTIAL_FAILURE'].includes(result.status)) {
      return result.status;
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(`Job ${jobId} did not reach terminal status within ${TIMEOUT_MS}ms`);
}

describe('Evaluator Job CLI Commands', () => {
  let submittedJobId: string;

  test('submit a FULL evaluation job and wait for completion', async () => {
    const result = await $.json<{ jobId: string; reportId: string; evaluatorName: string; jobType: string; status: string }>`genai-etk eval job submit --evaluator-name builtin --test-cases-json '{"inline": [{"input": {"question": "What is 2+2?"}}]}' --scorers-json '{"llm_as_judge": {"scores": {"sample": {}}}}'`;

    expect(result.jobId).toBeDefined();
    expect(result.reportId).toBeDefined();
    expect(result.evaluatorName).toBe('builtin');
    expect(result.jobType).toBe('FULL');
    submittedJobId = result.jobId;

    const status = await waitForTerminal(result.jobId);
    expect(status).toBe('SUCCESS');
  }, TIMEOUT_MS + 10000);

  test('submit a scoring job with inline results and wait for completion', async () => {
    const result = await $.json<{ jobId: string; jobType: string }>`genai-etk eval job submit-scoring --evaluator-name builtin --scorers-json '{"llm_as_judge": {"scores": {"sample": {}}}}'  --test-results-json '[{"input": {"q": "hi"}, "output": {"a": "hello"}}]'`;

    expect(result.jobId).toBeDefined();
    expect(result.jobType).toBe('SCORE');

    const status = await waitForTerminal(result.jobId);
    expect(status).toBe('SUCCESS');
  }, TIMEOUT_MS + 10000);

  test('submit an app invoke job and wait for completion', async () => {
    const result = await $.json<{ jobId: string; jobType: string }>`genai-etk eval job submit-invoke --evaluator-name builtin --test-cases-json '{"inline": [{"input": {"q": "hi"}}]}'`;

    expect(result.jobId).toBeDefined();
    expect(result.jobType).toBe('APP_INVOKE');

    const status = await waitForTerminal(result.jobId);
    expect(status).toBe('SUCCESS');
  }, TIMEOUT_MS + 10000);

  test('get completed job details', async () => {
    const result = await $.json<{ jobId: string; evaluatorName: string; jobType: string; status: string }>`genai-etk eval job get --job-id ${submittedJobId}`;

    expect(result.jobId).toBe(submittedJobId);
    expect(result.evaluatorName).toBe('builtin');
    expect(result.jobType).toBe('FULL');
    expect(result.status).toBe('SUCCESS');
  });

  test('list jobs', async () => {
    const result = await $.json<{ jobs: { jobId: string }[] }>`genai-etk eval job list`;

    expect(result.jobs).toBeDefined();
    expect(result.jobs.length).toBeGreaterThan(0);
  });
});
