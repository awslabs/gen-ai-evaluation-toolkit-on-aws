import { setupTestEnvironment, $ } from './helpers';
import { cleanupGenerationJob, createGenerationConfigFile, createGenerationJob } from './helpers/generation';
import { randomUUID } from 'crypto';

beforeAll(async () => {
  await setupTestEnvironment();
});

describe('Generation Commands', () => {
  test('should create a generation job', async () => {
    const testId = `create-${randomUUID()}`;
    const generationName = `generation-${testId}`;
    let jobId = null;

    try {
      await using stepsFile = await createGenerationConfigFile(testId);

      const result = await $`genai-etk generation job start --steps-file ${stepsFile.path}`;

      expect(result.stdout).toMatch(/Id:\s+([a-zA-Z0-9-]+)/);
      const jobIdMatch = result.stdout.match(/Id:\s+([a-zA-Z0-9-]+)/);
      expect(jobIdMatch).not.toBeNull();
      expect(jobIdMatch![1]).not.toBeNull();
      jobId = jobIdMatch![1];

      expect(result.stdout.includes(generationName) || result.stdout.includes('Id:')).toBeTruthy();
    } finally {
      await cleanupGenerationJob(jobId);
    }
  });

  test('should get generation job details', async () => {
    const testId = `get-${randomUUID()}`;

    await using stepsFile = await createGenerationConfigFile(testId);
    await using job = await createGenerationJob(stepsFile);

    const result = await $`genai-etk generation job get --id ${job.jobId}`;

    expect(result.stdout).toContain(job.jobId);
  });

  test('should list generation jobs', async () => {
    const result = await $`genai-etk generation job list`;

    expect(result).toBeTruthy();
  });

  test('should get job get', async () => {
    const testId = `status-${randomUUID()}`;

    await using stepsFile = await createGenerationConfigFile(testId);
    await using job = await createGenerationJob(stepsFile);

    const result = await $`genai-etk generation job get --id ${job.jobId}`;

    expect(result.stdout).toMatch(/Status|state|progress/i);
  });
});
