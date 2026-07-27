import {
  DatasetStatus,
  DeleteDatasetCommand,
  GetDatasetCommand,
  ListDatasetsCommand,
  ResourceNotFoundException,
  ValidationException,
} from '@awssolutions/gen-ai-evaluation-toolkit-ts-client';
import { randomUUID } from 'crypto';
import { createDummyDataset, createDummyTestCases, exhaust, send } from '../../helpers';

describe('Dataset Operations Tests', () => {
  describe('GetDataset Operation', () => {
    test('Get dataset - Happy path', async () => {
      await using dataset = await createDummyDataset();
      const loadedDataset = await send(new GetDatasetCommand({ datasetId: dataset.datasetId }));

      expect(loadedDataset.datasetId).toEqual(dataset.datasetId);
      expect(loadedDataset.name).toEqual(dataset.name);
      expect(loadedDataset.description).toEqual(dataset.description);
      expect(loadedDataset.status).toEqual(DatasetStatus.ACTIVE);
    });

    test('Get dataset - Error path - Non-existent datasetId', async () => {
      const nonExistentId = randomUUID();

      await expect(send(new GetDatasetCommand({ datasetId: nonExistentId }))).rejects.toThrow(
        ResourceNotFoundException,
      );
    });
  });

  describe('ListDatasets Operation', () => {
    test('List datasets - Happy path', async () => {
      const datasetsCount = 20;
      const maxResults = 15;

      const id = randomUUID();
      const createdDatasets = await Promise.all(
        Array(datasetsCount)
          .fill(0)
          .map((_, i) =>
            createDummyDataset({
              name: `list-test-dataset-${id}-${i}`,
              description: `Dataset ${i + 1} created for list test`,
            }),
          ),
      );

      // List datasets with default parameters
      const datasets = await exhaust(async (nextToken) => {
        const response = await send(new ListDatasetsCommand({ maxResults, nextToken }));

        // Validate response structure
        expect(response.datasets).toBeDefined();
        expect(Array.isArray(response.datasets)).toBe(true);
        expect(response.datasets.length).toBeLessThanOrEqual(maxResults);

        return { data: response.datasets, nextToken: response.nextToken };
      });

      // Verify our newly created datasets are in the list
      createdDatasets.forEach((dataset) => {
        const foundDataset = datasets.find((d) => d.datasetId === dataset.datasetId);

        expect(foundDataset).toBeDefined();
        expect(foundDataset?.name).toEqual(dataset.name);
        expect(foundDataset?.description).toEqual(dataset.description);
        expect(foundDataset?.status).toEqual(dataset.status);
      });

      // Clean-up created datasets
      await Promise.all(createdDatasets.map(async ({ datasetId }) => send(new DeleteDatasetCommand({ datasetId }))));
    });

    test('List datasets - Error path - Invalid maxResults', async () => {
      await expect(send(new ListDatasetsCommand({ maxResults: -1 }))).rejects.toThrow(
        ValidationException
      );
    });

    test('List datasets - Graceful handling of invalid nextToken', async () => {
      // The API handles invalid tokens gracefully rather than throwing
      const response = await send(new ListDatasetsCommand({ nextToken: 'invalid-token' }));

      // Verify we still get a valid empty response
      expect(response.datasets).toBeDefined();
      expect(Array.isArray(response.datasets)).toBe(true);
      expect(response.datasets).toHaveLength(0);
    });
  });

  describe('DeleteDataset Operation', () => {
    test('Delete dataset - Happy path - Empty dataset', async () => {
      await using dataset = await createDummyDataset();

      // Delete the dataset
      await send(new DeleteDatasetCommand({ datasetId: dataset.datasetId }));

      // Verify the dataset was deleted
      await expect(send(new GetDatasetCommand({ datasetId: dataset.datasetId }))).rejects.toThrow(
        ResourceNotFoundException,
      );
    });

    test('Delete dataset - Happy path - Dataset with test cases', async () => {
      await using dataset = await createDummyDataset();

      // Add test cases to the dataset
      await using _testCases = await createDummyTestCases(dataset.datasetId, 3);
      // Delete the dataset
      await send(new DeleteDatasetCommand({ datasetId: dataset.datasetId }));

      // Verify the dataset was deleted
      await expect(send(new GetDatasetCommand({ datasetId: dataset.datasetId }))).rejects.toThrow(
        ResourceNotFoundException,
      );
    });

    test('Delete dataset - Idempotent behavior - Non-existent datasetId', async () => {
      const nonExistentId = randomUUID();

      // DELETE should be idempotent, returning success even for non-existent resources
      const response = await send(new DeleteDatasetCommand({ datasetId: nonExistentId }));
      expect(response.$metadata.httpStatusCode).toEqual(204);
    });

    test('Delete dataset - Error path - Empty datasetId', async () => {
      // An empty datasetId collapses the URL to `DELETE /datasets/`, which matches no route.
      await expect(send(new DeleteDatasetCommand({ datasetId: '' }))).rejects.toThrow(
        /No method found matching route/,
      );
    });
  });
});
