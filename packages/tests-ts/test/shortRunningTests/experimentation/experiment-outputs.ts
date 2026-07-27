import {
  ListExperimentOutputsCommand,
  ValidationException,
} from '@awssolutions/gen-ai-evaluation-toolkit-ts-client';
import { randomUUID } from 'crypto';
import { send } from '../../helpers';
import { createRandomExperiment } from './experiment';

describe('Experiment Outputs API Tests', () => {
  describe('List Experiment Outputs', () => {
    test('should list experiment outputs with valid parameters', async () => {
      // Create an experiment first
      const experiment = await createRandomExperiment();

      // List experiment outputs
      const response = await send(new ListExperimentOutputsCommand({
        name: experiment.name,
        startVersion: 1,
        endVersion: 2,
      }));

      expect(response).toBeDefined();
      expect(response.outputs).toBeDefined();
      expect(Array.isArray(response.outputs)).toBe(true);
      // The outputs might be empty if no runs exist, but the array should be defined
    });

    test('should paginate experiment outputs', async () => {
      // Create an experiment first
      const experiment = await createRandomExperiment();

      // List experiment outputs with pagination
      const response = await send(new ListExperimentOutputsCommand({
        name: experiment.name,
        startVersion: 1,
        endVersion: 10,
        maxResults: 5,
      }));

      expect(response).toBeDefined();
      expect(response.outputs).toBeDefined();

      // If there are more results and a nextToken is returned
      if (response.nextToken) {
        const nextPageResponse = await send(new ListExperimentOutputsCommand({
          name: experiment.name,
          startVersion: 1,
          endVersion: 10,
          maxResults: 5,
          nextToken: response.nextToken,
        }));

        expect(nextPageResponse).toBeDefined();
        expect(nextPageResponse.outputs).toBeDefined();
      }
    });

    test('should filter by input workflow types', async () => {
      // Create an experiment first
      const experiment = await createRandomExperiment();

      // List experiment outputs with input filter
      const response = await send(new ListExperimentOutputsCommand({
        name: experiment.name,
        startVersion: 1,
        endVersion: 5,
        input: ['Evaluation'],
      }));

      expect(response).toBeDefined();
      expect(response.outputs).toBeDefined();
    });

    test('should filter by output metrics', async () => {
      // Create an experiment first
      const experiment = await createRandomExperiment();

      // List experiment outputs with output metrics filter
      const response = await send(new ListExperimentOutputsCommand({
        name: experiment.name,
        startVersion: 1,
        endVersion: 5,
        output: ['accuracy', 'f1_score'],
      }));

      expect(response).toBeDefined();
      expect(response.outputs).toBeDefined();
    });

    test('should throw ValidationException when experimentName is not provided', async () => {
      await expect(send(new ListExperimentOutputsCommand({
        startVersion: 1,
        endVersion: 5,
      } as any))).rejects.toThrow(ValidationException);
    });

    test('should throw ValidationException when startVersion is not provided', async () => {
      await expect(send(new ListExperimentOutputsCommand({
        name: 'test-experiment',
        endVersion: 5,
      } as any))).rejects.toThrow(ValidationException);
    });

    test('should throw ValidationException when endVersion is not provided', async () => {
      await expect(send(new ListExperimentOutputsCommand({
        name: 'test-experiment',
        startVersion: 1,
      } as any))).rejects.toThrow(ValidationException);
    });

    test('should throw ValidationException when endVersion is less than startVersion', async () => {
      await expect(send(new ListExperimentOutputsCommand({
        name: 'test-experiment',
        startVersion: 5,
        endVersion: 1,
      }))).rejects.toThrow(ValidationException);
    });

    test('should handle error when experiment does not exist', async () => {
      const nonExistentExperimentName = `non-existent-experiment-${randomUUID()}`;

      await expect(send(new ListExperimentOutputsCommand({
        name: nonExistentExperimentName,
        startVersion: 1,
        endVersion: 5,
      }))).rejects.toThrow(); // This might throw a specific exception like ResourceNotFoundException
    });
  });
});
