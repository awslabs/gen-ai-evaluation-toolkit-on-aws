import {
  DatasetVersion,
  DeleteTestCaseCommand,
  GetDatasetVersionCommand,
  ListDatasetVersionsCommand,
  ListDatasetVersionsResponse,
  ListTestCasesCommand,
  CreateDatasetVersionCommand,
  ResourceNotFoundException,
  RestoreDatasetCommand,
  UnprocessableEntityException,
  ValidationException,
} from '@awssolutions/gen-ai-evaluation-toolkit-ts-client';
import { randomUUID } from 'crypto';
import {
  cleanupDatasets,
  createDummyDataset,
  createDummyTestCases,
  send,
  waitUntilDatasetIsActive,
} from '../../helpers';

describe('Dataset Versions Operations Tests', () => {
  afterAll(async () => {
    await cleanupDatasets();
  });

  describe('CreateDatasetVersion Operation', () => {
    test('Mint dataset version - Happy path', async () => {
      // Create a dataset for this test using the existing function
      await using dataset = await createDummyDataset();

      // Fill dataset with some tests
      const testCasesCount = 5;
      await createDummyTestCases(dataset.datasetId, testCasesCount);

      // Mint a new version of the dataset
      const createVersionCommand = new CreateDatasetVersionCommand({ datasetId: dataset.datasetId });

      const mintVersionResponse = await send(createVersionCommand);

      expect(mintVersionResponse.dataset).toBeDefined();
      expect(mintVersionResponse.dataset?.datasetId).toEqual(dataset.datasetId);

      // Wait for the dataset to become ACTIVE again after minting
      await waitUntilDatasetIsActive(dataset.datasetId);

      // Get the dataset version details
      const versionNumber = mintVersionResponse.dataset?.currentVersion?.toString() || '1';

      const versionResponse = await send(
        new GetDatasetVersionCommand({
          datasetId: dataset.datasetId,
          version: versionNumber,
        }),
      );

      // Verify the version details
      expect(versionResponse.datasetId).toEqual(dataset.datasetId);
      expect(versionResponse.version.toString()).toEqual(versionNumber);
      expect(versionResponse.createdAt).toBeDefined();
      expect(versionResponse.createdBy).toBeDefined();
      expect(versionResponse.s3Location).toBeDefined();

      // List all test cases from the minted version
      const listTestCasesResponse = await send(
        new ListTestCasesCommand({
          datasetId: dataset.datasetId,
          version: versionNumber,
        }),
      );

      // Verify the response structure
      expect(listTestCasesResponse.testCases).toBeDefined();
      expect(Array.isArray(listTestCasesResponse.testCases)).toBe(true);
      expect(listTestCasesResponse.testCases).toHaveLength(testCasesCount);
    });

    test('Mint dataset version - Error path - Non-existent datasetId', async () => {
      const nonExistentId = randomUUID();

      await expect(send(new CreateDatasetVersionCommand({ datasetId: nonExistentId }))).rejects.toThrow(
        ResourceNotFoundException,
      );
    });

    test('Mint dataset version - Error path - Empty datasetId', async () => {
      await expect(send(new CreateDatasetVersionCommand({ datasetId: '' }))      ).rejects.toThrow(
        /Invalid value for path parameter: datasetId/,
      );
    });

    test('Mint dataset version - Edge case - Empty dataset', async () => {
      await using dataset = await createDummyDataset();

      // Mint a version without adding any test cases
      const mintVersionResponse = await send(new CreateDatasetVersionCommand({ datasetId: dataset.datasetId }));
      await waitUntilDatasetIsActive(dataset.datasetId);

      expect(mintVersionResponse.dataset).toBeDefined();
      expect(mintVersionResponse.dataset?.datasetId).toEqual(dataset.datasetId);

      // Verify the version was created but has no test cases
      const versionNumber = mintVersionResponse.dataset?.currentVersion?.toString() || '1';
      const listTestCasesResponse = await send(
        new ListTestCasesCommand({
          datasetId: dataset.datasetId,
          version: versionNumber,
        }),
      );

      expect(listTestCasesResponse.testCases).toHaveLength(0);
    });
  });

  describe('ListDatasetVersions Operation', () => {
    test('List dataset versions - Happy path', async () => {
      // Create a dataset for this test
      await using dataset = await createDummyDataset();

      // Create some test cases
      await createDummyTestCases(dataset.datasetId, 5);

      // Mint multiple versions of the dataset
      await send(new CreateDatasetVersionCommand({ datasetId: dataset.datasetId }));
      await waitUntilDatasetIsActive(dataset.datasetId);

      await send(new CreateDatasetVersionCommand({ datasetId: dataset.datasetId }));
      await waitUntilDatasetIsActive(dataset.datasetId);

      // List all versions of the dataset
      const { versions } = await send(new ListDatasetVersionsCommand({ datasetId: dataset.datasetId }));

      // Verify the response structure
      expect(versions).toBeDefined();
      expect(Array.isArray(versions)).toBe(true);
      expect(versions).toHaveLength(2);

      // Verify each version has the expected properties
      versions.forEach((version) => {
        expect(version.datasetId).toEqual(dataset.datasetId);
        expect(version.version).toBeDefined();
        expect(version.createdAt).toBeDefined();
        expect(version.createdBy).toBeDefined();
        expect(version.s3Location).toBeDefined();
      });

      // Test pagination by setting a small maxResults value
      const maxResultsPerPage = 1;

      // Collect all versions from paginated responses
      const allPaginatedVersions: DatasetVersion[] = [];
      let nextToken: string | undefined = undefined;

      do {
        const paginatedResponse: ListDatasetVersionsResponse = await send(
          new ListDatasetVersionsCommand({
            datasetId: dataset.datasetId,
            maxResults: maxResultsPerPage,
            nextToken: nextToken,
          }),
        );

        // Verify page structure
        expect(paginatedResponse.versions).toBeDefined();
        expect(Array.isArray(paginatedResponse.versions)).toBe(true);
        expect(paginatedResponse.versions.length).toBeLessThanOrEqual(maxResultsPerPage);

        // Add to our collection of all paginated versions
        allPaginatedVersions.push(...paginatedResponse.versions);

        // Update for next iteration
        nextToken = paginatedResponse.nextToken;
      } while (nextToken);

      // Verify we got all versions through pagination
      expect(allPaginatedVersions.length).toEqual(2);
    });

    test('List dataset versions - Non-existent datasetId returns empty list', async () => {
      const nonExistentId = randomUUID();

      // The API returns an empty list rather than an error for non-existent datasets
      const response = await send(new ListDatasetVersionsCommand({ datasetId: nonExistentId }));
      expect(response.versions).toBeDefined();
      expect(response.versions).toHaveLength(0);
    });

    test('List dataset versions - Error path - Empty datasetId', async () => {
      await expect(send(new ListDatasetVersionsCommand({ datasetId: '' }))      ).rejects.toThrow(
        /Invalid value for path parameter: datasetId/,
      );
    });

    test('List dataset versions - Edge case - Dataset with no versions', async () => {
      await using dataset = await createDummyDataset();

      const response = await send(new ListDatasetVersionsCommand({ datasetId: dataset.datasetId }));

      expect(response.versions).toBeDefined();
      expect(response.versions).toHaveLength(0);
    });
  });

  describe('GetDatasetVersion Operation', () => {
    test('Get dataset version - Happy path', async () => {
      // Create a dataset and mint a version
      await using dataset = await createDummyDataset();
      await createDummyTestCases(dataset.datasetId, 2);

      const mintResponse = await send(new CreateDatasetVersionCommand({ datasetId: dataset.datasetId }));
      await waitUntilDatasetIsActive(dataset.datasetId);

      const versionNumber = mintResponse.dataset?.currentVersion?.toString() || '1';

      const versionResponse = await send(
        new GetDatasetVersionCommand({
          datasetId: dataset.datasetId,
          version: versionNumber,
        }),
      );

      expect(versionResponse.datasetId).toEqual(dataset.datasetId);
      expect(versionResponse.version.toString()).toEqual(versionNumber);
      expect(versionResponse.createdAt).toBeDefined();
      expect(versionResponse.createdBy).toBeDefined();
      expect(versionResponse.s3Location).toBeDefined();
    });

    test('Get dataset version - Error path - Non-existent datasetId', async () => {
      const nonExistentId = randomUUID();

      await expect(send(new GetDatasetVersionCommand({ datasetId: nonExistentId, version: '1' }))).rejects.toThrow(
        ResourceNotFoundException,
      );
    });

    test('Get dataset version - Error path - Non-existent version', async () => {
      await using dataset = await createDummyDataset();

      await expect(
        send(new GetDatasetVersionCommand({ datasetId: dataset.datasetId, version: '999' })),
      ).rejects.toThrow(ResourceNotFoundException);
    });

    test('Get dataset version - Error path - Malformed version', async () => {
      await using dataset = await createDummyDataset();

      await expect(
        send(new GetDatasetVersionCommand({ datasetId: dataset.datasetId, version: 'invalid-version' })),
      ).rejects.toThrow(ValidationException);
    });
  });

  describe('RestoreDataset Operation', () => {
    test('Restore dataset - Happy path', async () => {
      await using dataset = await createDummyDataset();

      // Create 2 test cases and mint a version
      const originalTestCases = await createDummyTestCases(dataset.datasetId, 2);
      await send(new CreateDatasetVersionCommand({ datasetId: dataset.datasetId }));
      await waitUntilDatasetIsActive(dataset.datasetId);

      // Delete created test cases and create other ones
      await Promise.all([
        ...originalTestCases.map((testCase) =>
          send(new DeleteTestCaseCommand({ datasetId: dataset.datasetId, testCaseId: testCase.testCaseId })),
        ),
        createDummyTestCases(dataset.datasetId, 5),
      ]);

      await send(new RestoreDatasetCommand({ datasetId: dataset.datasetId, version: 1 }));
      await waitUntilDatasetIsActive(dataset.datasetId);

      const { testCases } = await send(new ListTestCasesCommand({ datasetId: dataset.datasetId, version: 'head' }));
      expect(testCases.map((t) => t.id).sort()).toEqual(originalTestCases.map((t) => t.testCaseId).sort());
    });

    test('Restore dataset - Error path - Non-existent datasetId', async () => {
      const nonExistentId = randomUUID();

      await expect(send(new RestoreDatasetCommand({ datasetId: nonExistentId, version: 1 }))).rejects.toThrow(
        ResourceNotFoundException,
      );
    });

    test('Restore dataset - Error path - Non-existent version', async () => {
      await using dataset = await createDummyDataset();

      await expect(send(new RestoreDatasetCommand({ datasetId: dataset.datasetId, version: 999 }))).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    test('Restore dataset - Error path - Empty datasetId', async () => {
      await expect(send(new RestoreDatasetCommand({ datasetId: '', version: 1 }))      ).rejects.toThrow(
        /Invalid value for path parameter: datasetId/,
      );
    });

    test('Restore dataset - Edge case - Rolling back to current version', async () => {
      await using dataset = await createDummyDataset();

      // Create test cases and mint a version
      await createDummyTestCases(dataset.datasetId, 2);
      await send(new CreateDatasetVersionCommand({ datasetId: dataset.datasetId }));
      await waitUntilDatasetIsActive(dataset.datasetId);

      const { testCases: beforeTestCases } = await send(
        new ListTestCasesCommand({ datasetId: dataset.datasetId, version: 'head' }),
      );
      const beforeIds = beforeTestCases.map((t) => t.id).sort();

      await send(new RestoreDatasetCommand({ datasetId: dataset.datasetId, version: 1 }));
      await waitUntilDatasetIsActive(dataset.datasetId);

      const { testCases: afterTestCases } = await send(
        new ListTestCasesCommand({ datasetId: dataset.datasetId, version: 'head' }),
      );
      const afterIds = afterTestCases.map((t) => t.id).sort();

      expect(afterIds).toEqual(beforeIds);
    });
  });
});
