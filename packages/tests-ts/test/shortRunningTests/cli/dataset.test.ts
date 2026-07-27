import { setupTestEnvironment, $, deleteDataset, deleteTestCase } from './helpers';
import { createDataset, createTestCase, mintVersion } from './helpers';
import { randomUUID } from 'crypto';

beforeAll(async () => {
  await setupTestEnvironment();
});

describe('Dataset Commands', () => {
  test('should create a dataset', async () => {
    let datasetId;
    try {
      const testId = `1-create-${randomUUID()}`;
      const datasetName = `dataset-${testId}`;
      const datasetDescription = `Test dataset created by CLI tests - ${testId}`;

      const result = await $`genai-etk dataset create --name ${datasetName} --description "${datasetDescription}"`;

      expect(result.stdout).toMatch(/Id:\s+([a-zA-Z0-9-]+)/);
      const datasetIdMatch = result.stdout.match(/Id:\s+([a-zA-Z0-9-]+)/);

      expect(datasetIdMatch).not.toBeNull();
      expect(datasetIdMatch![1]).not.toBeNull();
      datasetId = datasetIdMatch![1];

      expect(result.stdout).toContain(datasetName);
      expect(result.stdout).toContain(datasetDescription);
      expect(datasetId).toBeTruthy();
    } finally {
      await deleteDataset(datasetId);
    }
  });

  test('should get dataset details', async () => {
    const testId = `2-get-${randomUUID()}`;

    await using dataset = await createDataset(testId);

    const result = await $`genai-etk dataset get --dataset-id ${dataset.id}`;

    expect(result.stdout).toContain(`dataset-${testId}`);
    expect(result.stdout).toContain(`Test dataset created by CLI tests - ${testId}`);
  });

  test('should list datasets', async () => {
    const testId = `3-list-${randomUUID()}`;

    await using _ = await createDataset(testId);

    const result = await $`genai-etk dataset list`;

    expect(result).toBeTruthy();
  });

  test('should create a test case', async () => {
    let testCaseId, datasetId;
    try {
      const testId = `4-testcase-${randomUUID()}`;

      await using dataset = await createDataset(testId);
      datasetId = dataset.id;

      const result =
        await $`genai-etk dataset create-test-case --dataset-id ${dataset.id} --input "Test question" --expected "Test answer"`;

      expect(result.stdout).toMatch(/Id:\s+([a-zA-Z0-9-]+)/);
      const testCaseIdMatch = result.stdout.match(/Id:\s+([a-zA-Z0-9-]+)/);

      expect(testCaseIdMatch).not.toBeNull();
      expect(testCaseIdMatch![1]).toBeDefined();
      testCaseId = testCaseIdMatch![1];

      expect(result.stdout).toContain('Successfully created the test case');
      expect(testCaseId).toBeTruthy();
    } finally {
      await deleteTestCase(datasetId, testCaseId);
    }
  });

  test('should get test case details', async () => {
    const testId = `5-get-testcase-${randomUUID()}`;

    await using dataset = await createDataset(testId);
    await using testCase = await createTestCase(dataset.id);

    const result =
      await $`genai-etk dataset get-test-case --dataset-id ${dataset.id} --test-case-id ${testCase.id} --version head`;

    expect(result.stdout).toContain('Test question');
    expect(result.stdout).toContain('Test answer');
  });

  test('should list test cases', async () => {
    const testId = `6-list-testcases-${randomUUID()}`;

    await using dataset = await createDataset(testId);
    await using _ = await createTestCase(dataset.id);

    const result = await $`genai-etk dataset list-test-cases --dataset-id ${dataset.id} --version head`;

    expect(result).toBeTruthy();
  });

  test('should mint a new version', async () => {
    const testId = `7-mint-${randomUUID()}`;

    await using dataset = await createDataset(testId);
    await using _ = await createTestCase(dataset.id);

    const result = await $`genai-etk dataset create-version --dataset-id ${dataset.id}`;

    expect(result.stdout).toContain('Successfully started to mint a new version');
  });

  test('should get version details', async () => {
    const testId = `8-get-version-${randomUUID()}`;

    await using dataset = await createDataset(testId);
    await using _ = await createTestCase(dataset.id);
    const version = await mintVersion(dataset.id);

    const result = await $`genai-etk dataset get-version --dataset-id ${dataset.id} --version ${version}`;

    expect(result).toBeTruthy();
  });

  test('should list versions', async () => {
    const testId = `9-list-versions-${randomUUID()}`;

    await using dataset = await createDataset(testId);
    await using _ = await createTestCase(dataset.id);

    await mintVersion(dataset.id);

    const result = await $`genai-etk dataset list-versions --dataset-id ${dataset.id}`;

    expect(result).toBeTruthy();
  });

  test('should get version details with "latest" parameter', async () => {
    const testId = `10-get-version-latest-${randomUUID()}`;

    await using dataset = await createDataset(testId);
    await using _ = await createTestCase(dataset.id);
    await mintVersion(dataset.id);

    const result = await $`genai-etk dataset get-version --dataset-id ${dataset.id} --version latest`;

    expect(result).toBeTruthy();
    expect(result.stdout).toContain(dataset.id);
  });

  test('should list test cases without specifying version parameter', async () => {
    const testId = `11-list-testcases-default-${randomUUID()}`;

    await using dataset = await createDataset(testId);
    await using _ = await createTestCase(dataset.id);

    // Note: omitting --version parameter, which should default to 'head'
    const result = await $`genai-etk dataset list-test-cases --dataset-id ${dataset.id}`;

    expect(result).toBeTruthy();
  });

  test('should get test case without specifying version parameter', async () => {
    const testId = `12-get-testcase-default-version-${randomUUID()}`;

    await using dataset = await createDataset(testId);
    await using testCase = await createTestCase(dataset.id);

    // Note: omitting --version parameter, which should default to 'head'
    const result = await $`genai-etk dataset get-test-case --dataset-id ${dataset.id} --test-case-id ${testCase.id}`;

    expect(result.stdout).toContain('Test question');
    expect(result.stdout).toContain('Test answer');
  });

  describe('version annotations validation', () => {
    // TODO: CLI returns "UnknownError" instead of API error message - improve client error handling
    test.skip('put version annotation should fail with understandable error', async () => {
      // Since we're testing validation error, no need to make the actual setup
      const options = [`--dataset-id ${randomUUID()}`, `--version 'head'`, `--name ${randomUUID()}`, `--string-value 123`];
      const requestPromise = $`genai-etk dataset put-version-annotation ${options.join(' ')}`;

      // Expect the right error to be thrown
      await expect(requestPromise).rejects.not.toThrow(/unknown/i);
      await expect(requestPromise).rejects.toThrow(/version must be a number/i);
    });
  });
});
