import {
  ConflictException,
  CreateExperimentCommand,
  DeleteExperimentCommand,
  CreateExperimentResponse,
  GetExperimentCommand,
  ListExperimentsCommand,
  ResourceNotFoundException,
  UpdateExperimentCommand,
  ValidationException,
} from '@awssolutions/gen-ai-evaluation-toolkit-ts-client';
import { randomUUID } from 'crypto';
import { send } from '../../helpers';

export async function createRandomExperiment(name?: string, description?: string): Promise<CreateExperimentResponse> {
  const experimentName = name || `test-experiment-${randomUUID()}`;
  const experimentDescription = description || `Test experiment created at ${new Date().toISOString()}`;

  const response = await send(new CreateExperimentCommand({
    name: experimentName,
    description: experimentDescription,
  }));

  return response;
}

describe('Experiment API Tests', () => {
  describe('Create Experiment', () => {
    test('should create an experiment with name only', async () => {
      const experimentName = `test-experiment-${randomUUID()}`;

      const response = await send(new CreateExperimentCommand({
        name: experimentName,
      }));

      expect(response).toBeDefined();
      expect(response).toBeDefined();
      expect(response.name).toBe(experimentName);
    });

    test('should create an experiment with name and description', async () => {
      const experimentName = `test-experiment-${randomUUID()}`;
      const experimentDescription = 'Test experiment with description';

      const response = await send(new CreateExperimentCommand({
        name: experimentName,
        description: experimentDescription,
      }));

      expect(response).toBeDefined();
      expect(response).toBeDefined();
      expect(response.name).toBe(experimentName);
      expect(response.description).toBe(experimentDescription);
    });

    test('should throw ValidationException when name is not provided', async () => {
      // @ts-expect-error Validation test
      await expect(send(new CreateExperimentCommand({}))).rejects.toThrow(ValidationException);
    });

    test('should throw ConflictException when experiment with same name already exists', async () => {
      const experimentName = `test-experiment-duplicate-${randomUUID()}`;

      // Create the first experiment
      await send(new CreateExperimentCommand({
        name: experimentName,
      }));

      // Try to create another with the same name
      await expect(send(new CreateExperimentCommand({
        name: experimentName,
      }))).rejects.toThrow(ConflictException);
    });
  });

  describe('Get Experiment', () => {
    test('should get an experiment by name', async () => {
      // Create an experiment first
      const experiment = await createRandomExperiment();

      // Get the experiment by name
      const response = await send(new GetExperimentCommand({
        name: experiment.name,
      }));

      expect(response).toBeDefined();
      expect(response).toBeDefined();
      expect(response.name).toBe(experiment.name);
    });

    test('should throw ValidationException when experiment name is not provided', async () => {
      // @ts-expect-error Validation test
      await expect(send(new GetExperimentCommand({}))).rejects.toThrow(ValidationException);
    });

    test('should throw ResourceNotFoundException when experiment does not exist', async () => {
      await expect(send(new GetExperimentCommand({
        name: `non-existent-${randomUUID()}`,
      }))).rejects.toThrow(ResourceNotFoundException);
    });
  });

  describe('Update Experiment', () => {
    test('should update experiment name', async () => {
      // Create an experiment first
      const experiment = await createRandomExperiment();
      const newName = `updated-experiment-${randomUUID()}`;

      // Update the experiment name
      const response = await send(new UpdateExperimentCommand({
        name: experiment.name,
        newName: newName,
      }));

      expect(response).toBeDefined();
      expect(response).toBeDefined();
      expect(response.name).toBe(newName);
    });

    test('should update experiment description', async () => {
      // Create an experiment first
      const experiment = await createRandomExperiment();
      const newDescription = `Updated description at ${new Date().toISOString()}`;

      // Update the experiment description
      const response = await send(new UpdateExperimentCommand({
        name: experiment.name,
        description: newDescription,
      }));

      expect(response).toBeDefined();
      expect(response).toBeDefined();
      expect(response.name).toBe(experiment.name);
      expect(response.description).toBe(newDescription);
    });

    test('should update both name and description', async () => {
      // Create an experiment first
      const experiment = await createRandomExperiment();
      const newName = `updated-experiment-${randomUUID()}`;
      const newDescription = `Updated description at ${new Date().toISOString()}`;

      // Update both name and description
      const response = await send(new UpdateExperimentCommand({
        name: experiment.name,
        newName: newName,
        description: newDescription,
      }));

      expect(response).toBeDefined();
      expect(response).toBeDefined();
      expect(response.name).toBe(newName);
      expect(response.description).toBe(newDescription);
    });

    test('should throw ValidationException when experiment name is not provided', async () => {
      // @ts-expect-error Validation test
      await expect(send(new UpdateExperimentCommand({
        newName: 'new-name',
      }))).rejects.toThrow(ValidationException);
    });

    test('should throw ResourceNotFoundException when experiment does not exist', async () => {
      await expect(send(new UpdateExperimentCommand({
        name: `non-existent-${randomUUID()}`,
        newName: 'new-name',
      }))).rejects.toThrow(ResourceNotFoundException);
    });
  });

  describe('Delete Experiment', () => {
    test('should delete an experiment', async () => {
      // Create an experiment first
      const experiment = await createRandomExperiment();

      // Delete the experiment
      await send(new DeleteExperimentCommand({
        name: experiment.name,
      }));

      // Verify it was deleted by attempting to get it
      await expect(send(new GetExperimentCommand({
        name: experiment.name,
      }))).rejects.toThrow(ResourceNotFoundException);
    });

    test('should throw ValidationException when experiment name is not provided', async () => {
      // @ts-expect-error Validation test
      await expect(send(new DeleteExperimentCommand({}))).rejects.toThrow(ValidationException);
    });

    test('should not throw when deleting non-existent experiment (idempotent)', async () => {
      // Delete a non-existent experiment should not throw
      await expect(send(new DeleteExperimentCommand({
        name: `non-existent-${randomUUID()}`,
      }))).resolves.not.toThrow();
    });
  });

  describe('List Experiments', () => {
    test('should list experiments', async () => {
      // Create a few experiments to ensure there's something to list
      await createRandomExperiment('list-test-1');
      await createRandomExperiment('list-test-2');

      // List experiments
      const response = await send(new ListExperimentsCommand({}));

      expect(response).toBeDefined();
      expect(response.experiments).toBeDefined();
      expect(response.experiments.length).toBeGreaterThan(0);
    });

    test('should list experiments with pagination', async () => {
      // Create more experiments for pagination testing
      await createRandomExperiment('pagination-test-1');
      await createRandomExperiment('pagination-test-2');
      await createRandomExperiment('pagination-test-3');

      // Get first page with limited results
      const firstPageResponse = await send(new ListExperimentsCommand({
        maxResults: 2,
      }));

      expect(firstPageResponse).toBeDefined();
      expect(firstPageResponse.experiments).toBeDefined();
      expect(firstPageResponse.experiments.length).toBeLessThanOrEqual(2);

      if (firstPageResponse.nextToken) {
        // Get the second page
        const secondPageResponse = await send(new ListExperimentsCommand({
          maxResults: 2,
          nextToken: firstPageResponse.nextToken,
        }));

        expect(secondPageResponse).toBeDefined();
        expect(secondPageResponse.experiments).toBeDefined();
        expect(secondPageResponse.experiments.length).toBeGreaterThan(0);

        // Ensure different experiments between pages
        const firstPageNames = firstPageResponse.experiments.map(e => e.name);
        const secondPageNames = secondPageResponse.experiments.map(e => e.name);

        for (const id of secondPageNames) {
          expect(firstPageNames).not.toContain(id);
        }
      }
    });

    test('should filter experiments using filter expression', async () => {
      const uniquePrefix = randomUUID().substring(0, 8);
      const filterExperimentName = `filter-test-${uniquePrefix}`;

      // Create a specific experiment for filtering
      await createRandomExperiment(filterExperimentName);

      // List experiments with filter
      const response = await send(new ListExperimentsCommand({
        filter: `name LIKE '%${uniquePrefix}%'`,
      }));

      expect(response).toBeDefined();
      expect(response.experiments).toBeDefined();
      expect(response.experiments.length).toBeGreaterThanOrEqual(1);

      // Verify the filtered results contain our specific experiment
      const experimentNames = response.experiments.map(e => e.name);
      expect(experimentNames).toContain(filterExperimentName);
    });

    test('should order experiments using orderBy parameter', async () => {
      // Create experiments with sequential names for ordering
      const orderPrefix = randomUUID().substring(0, 8);
      await createRandomExperiment(`a-order-test-${orderPrefix}`);
      await createRandomExperiment(`b-order-test-${orderPrefix}`);
      await createRandomExperiment(`c-order-test-${orderPrefix}`);

      // List experiments with ordering by name ASC
      const responseAsc = await send(new ListExperimentsCommand({
        filter: `name LIKE '%${orderPrefix}%'`,
        orderBy: ['name ASC'],
      }));

      expect(responseAsc).toBeDefined();
      expect(responseAsc.experiments).toBeDefined();
      expect(responseAsc.experiments.length).toBeGreaterThanOrEqual(3);

      // Verify ascending order
      const namesAsc = responseAsc.experiments.map(e => e.name);
      expect(namesAsc[0] < namesAsc[1]).toBeTruthy();

      // List with ordering by name DESC
      const responseDesc = await send(new ListExperimentsCommand({
        filter: `name LIKE '%${orderPrefix}%'`,
        orderBy: ['name DESC'],
      }));

      // Verify descending order
      const namesDesc = responseDesc.experiments.map(e => e.name);
      expect(namesDesc[0] > namesDesc[1]).toBeTruthy();
    });

    test('should filter experiments by viewType', async () => {
      // Create an experiment
      const viewTypeTestExperiment = await createRandomExperiment(`viewtype-test-${randomUUID().substring(0, 8)}`);

      // Delete the experiment to make it inactive
      await send(new DeleteExperimentCommand({
        name: viewTypeTestExperiment.name,
      }));

      // List only deleted experiments
      const deletedResponse = await send(new ListExperimentsCommand({
        viewType: 'DELETED_ONLY',
      }));

      expect(deletedResponse).toBeDefined();
      expect(deletedResponse.experiments).toBeDefined();
      expect(deletedResponse.experiments.length).toBeGreaterThan(0);

      // List active experiments
      const activeResponse = await send(new ListExperimentsCommand({
        viewType: 'ACTIVE_ONLY',
      }));

      expect(activeResponse).toBeDefined();
      expect(activeResponse.experiments).toBeDefined();

      // The deleted experiment should not be in active list
      const activeNames = activeResponse.experiments.map(e => e.name);
      expect(activeNames).not.toContain(viewTypeTestExperiment.name);

      // List all experiments
      const allResponse = await send(new ListExperimentsCommand({
        viewType: 'ALL',
      }));

      expect(allResponse.experiments.length).toBeGreaterThan(activeResponse.experiments.length);
    });
  });
});
