import { setupTestEnvironment, $ } from './helpers';
import { createExperiment, deleteExperiment } from './helpers/experiment';
import { randomUUID } from 'crypto';

beforeAll(async () => {
  await setupTestEnvironment();
});

describe('Experiment Commands', () => {
  test('should create an experiment', async () => {
    const testId = `create-${randomUUID()}`;
    const experimentName = `experiment-${testId}`;
    const experimentDescription = `Test experiment created by CLI tests - ${testId}`;

    try {
      const result = await $`genai-etk experiment create --name ${experimentName} --description "${experimentDescription}"`;

      expect(result.stdout.includes(experimentName)).toBeTruthy();
      expect(result.stdout.includes('created')).toBeTruthy();
    } finally {
      await deleteExperiment(experimentName);
    }
  });

  test('should list experiments with filters and ordering', async () => {
    // Create a test experiment with unique name for filtering
    const testId = `filter-${randomUUID()}`;
    await using experiment = await createExperiment(testId);

    // Test list with filter
    const filterResult = await $`genai-etk experiment list --filter "name LIKE '%${testId}%'" --output json`;

    // Parse JSON output to verify filter worked
    const filterOutput = JSON.parse(filterResult.stdout);
    expect(filterOutput).toBeDefined();
    expect(Array.isArray(filterOutput.experiments)).toBeTruthy();

    interface ExperimentOutput {
      name: string;
      description?: string;
    }

    expect(filterOutput.experiments.some((exp: ExperimentOutput) => exp.name === experiment.name)).toBeTruthy();

    // Test list with order-by parameter
    const orderResult = await $`genai-etk experiment list --order-by "name DESC" --max-results 10 --output json`;

    // Verify command executed successfully
    expect(orderResult).toBeTruthy();
  });

  test('should get an experiment by ID', async () => {
    const testId = `get-${randomUUID()}`;

    // Create an experiment to get
    await using experiment = await createExperiment(testId);

    // Get the experiment by ID
    const result = await $`genai-etk experiment get --name ${experiment.name}`;

    // Verify the output contains the experiment details
    expect(result.stdout).toContain(experiment.name);
  });

  test('should update an experiment', async () => {
    const testId = `update-${randomUUID()}`;

    // Create an experiment to update
    await using experiment = await createExperiment(testId);

    const newName = `updated-${testId}`;
    const newDescription = `Updated description ${new Date().toISOString()}`;

    // Update the experiment
    try {
      const result = await $`genai-etk experiment update --name ${experiment.name} --new-name "${newName}" --description "${newDescription}"`;

      // Verify the output contains the updated information
      expect(result.stdout).toContain(newName);
      expect(result.stdout).toContain('Experiment updated successfully');

      // Verify the experiment was updated by getting it
      const getResult = await $`genai-etk experiment get --name ${newName}`;
      expect(getResult.stdout).toContain(newName);
      expect(getResult.stdout).toContain(newDescription);
    }
    finally {
      deleteExperiment(newName);
    }
  });

  test('should delete an experiment', async () => {
    const testId = `delete-${randomUUID()}`;
    await using experiment = await createExperiment(testId);

    // Delete the experiment
    const deleteResult = await $`genai-etk experiment delete --name ${experiment.name}`;

    // Verify the output indicates successful deletion
    expect(deleteResult.stdout).toContain('Successfully deleted experiment');

    // Verify the experiment was deleted by trying to get it (should fail or return not found)
    try {
      await $`genai-etk experiment get --name ${experiment.name} --output json`;
      fail('Should have thrown an error when getting deleted experiment');
    } catch (error) {
      expect(error).toBeDefined();
    }
  });

  test('should get experiment outputs with trace command', async () => {
    const testId = `trace-${randomUUID()}`;

    // Create an experiment
    await using experiment = await createExperiment(testId);

    // List experiment outputs using trace command
    const result = await $`genai-etk experiment list-outputs --name ${experiment.name} --start-version 1 --end-version 2`;

    // Verify command executed successfully (output may be empty if no runs exist)
    expect(result).toBeTruthy();
    expect(result.stdout).toBeDefined();
  });
});
