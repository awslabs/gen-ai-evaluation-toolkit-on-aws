import { randomUUID } from 'crypto';
import { createEvalConfig, EvalConfigBody, setupTestEnvironment, updateEvalConfig, $ } from './helpers';
import { retry } from 'zx';

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

const V1_BODY: EvalConfigBody = {
  scorers: {
    llm_as_judge: {
      scores: {
        correctness: { description: 'v1: Evaluate whether the answer is factually correct' }
      }
    }
  }
};

const V2_BODY: EvalConfigBody = {
  scorers: {
    llm_as_judge: {
      scores: {
        correctness: { description: 'v2: Evaluate whether the answer is factually correct' },
        relevance: { description: 'v2: Is the answer relevant to the question?' }
      }
    }
  }
};

describe('Evaluator Config CLI Commands', () => {
  test('eval config create returns name + version 1', async () => {
    const testId = `create-${randomUUID()}`;
    const cfg = await createEvalConfig(testId, V1_BODY);

    expect(cfg.name).toBe(`eval-config-${testId}`);
    expect(cfg.version).toBe(1);
  });

  test('eval config get returns the stored body (latest)', async () => {
    const testId = `get-${randomUUID()}`;
    const cfg = await createEvalConfig(testId, V1_BODY);

    const result = await $`genai-etk eval config get --name ${cfg.name}`;

    expect(result.stdout).toContain(`Name: ${cfg.name}`);
    expect(result.stdout).toContain(`Version: ${cfg.version}`);
    expect(result.stdout).toContain('llm_as_judge');
    expect(result.stdout).toContain('correctness');
  });

  test('eval config update bumps version and eval config get --version pins to old', async () => {
    const testId = `update-${randomUUID()}`;
    const cfg = await createEvalConfig(testId, V1_BODY);
    expect(cfg.version).toBe(1);

    const updated = await updateEvalConfig(testId, cfg.name, V2_BODY);
    expect(updated.version).toBeGreaterThan(cfg.version);

    // Latest = v2 → contains the v2-only `relevance` score
    const latest = await $`genai-etk eval config get --name ${cfg.name}`;
    expect(latest.stdout).toContain(`Version: ${updated.version}`);
    expect(latest.stdout).toContain('relevance');

    // Pin to v1 → must NOT contain `relevance`
    const v1 = await $`genai-etk eval config get --name ${cfg.name} --version ${cfg.version}`;
    expect(v1.stdout).toContain(`Version: ${cfg.version}`);
    expect(v1.stdout).not.toContain('relevance');
    expect(v1.stdout).toContain('correctness');
  });

  test('eval config list contains the created config', async () => {
    const testId = `list-${randomUUID()}`;
    const cfg = await createEvalConfig(testId, V1_BODY);

    // config listing is backed by S3 ListObjectsV2, which is only eventually
    // consistent — a just-created config may not appear immediately. Retry.
    // Filter by the unique name so the result isn't hidden past the first
    // page when the store has accumulated many configs from prior runs.
    const { stdout } = await retry(5, '2s', () => $`genai-etk eval config list --name ${cfg.name}`);
    expect(stdout).toContain(cfg.name);
  });

  test(
    'eval job submit --config resolves scorers from latest stored config',
    async () => {
      const testId = `submit-${randomUUID()}`;
      const cfg = await createEvalConfig(testId, V1_BODY);

      const result = await $.json<{
        jobId: string;
        jobType: string;
      }>`genai-etk eval job submit-scoring --evaluator-name builtin --config ${cfg.name} --test-results-json '[{"input": {"q": "hi"}, "output": {"a": "hello"}}]'`;

      expect(result.jobId).toBeDefined();
      expect(result.jobType).toBe('SCORE');

      const status = await waitForTerminal(result.jobId);
      expect(status).toBe('SUCCESS');
    },
    TIMEOUT_MS + 10000
  );

  test(
    'eval job submit --config --config-version pins to an older version',
    async () => {
      const testId = `submit-pinned-${randomUUID()}`;
      const cfg = await createEvalConfig(testId, V1_BODY);
      const updated = await updateEvalConfig(testId, cfg.name, V2_BODY);
      expect(updated.version).toBeGreaterThan(cfg.version);

      const result = await $.json<{
        jobId: string;
        jobType: string;
      }>`genai-etk eval job submit-scoring --evaluator-name builtin --config ${cfg.name} --config-version ${cfg.version} --test-results-json '[{"input": {"q": "hi"}, "output": {"a": "hello"}}]'`;

      expect(result.jobId).toBeDefined();
      expect(result.jobType).toBe('SCORE');

      const status = await waitForTerminal(result.jobId);
      expect(status).toBe('SUCCESS');
    },
    TIMEOUT_MS + 10000
  );

  test('eval job submit --config-version without --config fails fast', async () => {
    await expect(
      $`genai-etk eval job submit-scoring --evaluator-name builtin --config-version 1 --test-results-json '[{"input": {"q": "hi"}, "output": {"a": "hello"}}]'`
    ).rejects.toMatchObject({ stderr: expect.stringContaining('--config-version requires --config') });
  });

  test('eval job submit --config <missing> surfaces a friendly resolver error', async () => {
    await expect(
      $`genai-etk eval job submit-scoring --evaluator-name builtin --config no-such-config-${randomUUID()} --test-results-json '[{"input": {"q": "hi"}, "output": {"a": "hello"}}]'`
    ).rejects.toMatchObject({ stderr: expect.stringContaining('Failed to resolve config') });
  });
});
