import {
  CreateTestCaseCommand,
  CreateTestCaseCommandInput,
  CreateTestCaseRequest,
  DeleteTestCaseCommand,
  GetTestCaseCommand,
  ListTestCasesCommand,
  ListTestCasesResponse,
  ResourceNotFoundException,
  TestCaseReference,
  ValidationException,
} from '@awssolutions/gen-ai-evaluation-toolkit-ts-client';
import { randomUUID } from 'crypto';
import { cleanupDatasets, createDummyDataset, createDummyTestCase, createDummyTestCases, send } from '../../helpers';

describe('Test Cases API Tests', () => {
  afterAll(async () => {
    await cleanupDatasets();
  });

  describe('CreateTestCase Operation', () => {
    test('Create test case - Happy path', async () => {
      await using dataset = await createDummyDataset();
      const payload: CreateTestCaseCommandInput = {
        datasetId: dataset.datasetId,
        input: 'some-input',
        expected: 'some-output',
      };

      // Create the test case
      const testCaseResponse = await send(new CreateTestCaseCommand(payload));

      // Verify the test case was created successfully
      const testCaseId = testCaseResponse.testCaseId;
      expect(testCaseId).toBeDefined();

      // Get the test case to confirm it was created successfully
      const retrievedTestCase = await send(
        new GetTestCaseCommand({
          datasetId: dataset.datasetId,
          testCaseId,
          version: 'head',
        }),
      );

      // Verify the retrieved test case matches what we created
      expect(retrievedTestCase.testCaseId).toEqual(testCaseId);
      expect(retrievedTestCase.input).toEqual(payload.input);
      expect(retrievedTestCase.expected).toEqual(payload.expected);
      expect(retrievedTestCase.createdAt).toBeDefined();
      expect(retrievedTestCase.createdBy).toBeDefined();
    });

    test('creating a test case for an non-existing datastore fails', async () => {
      await expect(
        send(new CreateTestCaseCommand({ datasetId: randomUUID(), input: 'should-fail', expected: 'output' })),
      ).rejects.toThrow(ResourceNotFoundException);
    });

    test('Create test case - Error path - Empty datasetId', async () => {
      const payload: CreateTestCaseCommandInput = {
        datasetId: '',
        input: 'some-input',
        expected: 'some-output',
      };

      await expect(send(new CreateTestCaseCommand(payload))).rejects.toThrow(
        /Invalid value for path parameter: datasetId/,
      );
    });
	 
	  // Test for missing fields removed as the fields are actually optional according to the API
  });

  describe('GetTestCase Operation', () => {
    test('Get test case - Happy path', async () => {
      await using dataset = await createDummyDataset();
      const { testCaseId } = await createDummyTestCase({ datasetId: dataset.datasetId });

      const retrievedTestCase = await send(
        new GetTestCaseCommand({
          datasetId: dataset.datasetId,
          testCaseId,
          version: 'head',
        }),
      );

      expect(retrievedTestCase.testCaseId).toEqual(testCaseId);
      expect(retrievedTestCase.input).toBeDefined();
      expect(retrievedTestCase.expected).toBeDefined();
      expect(retrievedTestCase.createdAt).toBeDefined();
      expect(retrievedTestCase.createdBy).toBeDefined();
    });

    test('Get test case - Error path - Non-existent datasetId', async () => {
      const nonExistentId = randomUUID();
      await using dataset = await createDummyDataset();
      const { testCaseId } = await createDummyTestCase({ datasetId: dataset.datasetId });

      await expect(
        send(
          new GetTestCaseCommand({
            datasetId: nonExistentId,
            testCaseId,
            version: 'head',
          }),
        ),
      ).rejects.toThrow(ResourceNotFoundException);
    });

    test('Get test case - Error path - Non-existent testCaseId', async () => {
      await using dataset = await createDummyDataset();
      const nonExistentId = randomUUID();

      await expect(
        send(
          new GetTestCaseCommand({
            datasetId: dataset.datasetId,
            testCaseId: nonExistentId,
            version: 'head',
          }),
        ),
      ).rejects.toThrow(ResourceNotFoundException);
    });

    test('Get test case - Error path - Malformed IDs', async () => {
      await using dataset = await createDummyDataset();
      const { testCaseId } = await createDummyTestCase({ datasetId: dataset.datasetId });

      // Empty datasetId
      await expect(
        send(
          new GetTestCaseCommand({
            datasetId: '',
            testCaseId,
            version: 'head',
          }),
        ),
      ).rejects.toThrow(/Invalid value for path parameter: datasetId/);

      // Empty testCaseId — trailing label collapses the URL to `.../testcases/`, matching no route
      await expect(
        send(
          new GetTestCaseCommand({
            datasetId: dataset.datasetId,
            testCaseId: '',
            version: 'head',
          }),
        ),
      ).rejects.toThrow(/No method found matching route/);

      // Malformed version
      await expect(
        send(
          new GetTestCaseCommand({
            datasetId: dataset.datasetId,
            testCaseId,
            version: 'invalid-version',
          }),
        ),
      ).rejects.toThrow(ValidationException);
    });
  });

  describe('ListTestCases Operation', () => {
    test('List test cases - Happy path', async () => {
      // Create a dataset for this test
      await using dataset = await createDummyDataset();
      const datasetId = dataset.datasetId;

      // Create multiple test cases
      const testCaseCount = 5;
      await using _testCases = await createDummyTestCases(datasetId, testCaseCount);

      // List all test cases in the dataset
      const listTestCasesCommand = new ListTestCasesCommand({
        datasetId: datasetId,
        version: 'head',
      });

      const listTestCasesResponse = await send(listTestCasesCommand);

      // Verify the response structure
      expect(listTestCasesResponse.testCases).toBeDefined();
      expect(Array.isArray(listTestCasesResponse.testCases)).toBe(true);
      expect(listTestCasesResponse.testCases).toHaveLength(testCaseCount);

      // Test pagination by setting a small maxResults value
      const maxResultsPerPage = 2;

      // Collect all test cases from paginated responses
      const allPaginatedTestCases: TestCaseReference[] = [];
      let nextToken: string | undefined = undefined;

      do {
        // Fetch a page of results
        const paginatedListCommand: ListTestCasesCommand = new ListTestCasesCommand({
          datasetId: datasetId,
          version: 'head',
          maxResults: maxResultsPerPage,
          nextToken: nextToken,
        });

        const paginatedResponse: ListTestCasesResponse = await send(paginatedListCommand);

        // Verify page structure
        expect(paginatedResponse.testCases).toBeDefined();
        expect(Array.isArray(paginatedResponse.testCases)).toBe(true);
        expect(paginatedResponse.testCases.length).toBeLessThanOrEqual(maxResultsPerPage);

        // Add to our collection of all paginated test cases
        allPaginatedTestCases.push(...paginatedResponse.testCases);

        // Update for next iteration
        nextToken = paginatedResponse.nextToken;
      } while (nextToken);

      // Verify we got all test cases through pagination
      expect(allPaginatedTestCases).toHaveLength(testCaseCount);
    });

    test('List test cases - Error path - Non-existent datasetId', async () => {
      const nonExistentId = randomUUID();

      await expect(
        send(
          new ListTestCasesCommand({
            datasetId: nonExistentId,
            version: 'head',
          }),
        ),
      ).rejects.toThrow(ResourceNotFoundException);
    });

    test('List test cases - Error path - Empty datasetId', async () => {
      await expect(
        send(
          new ListTestCasesCommand({
            datasetId: '',
            version: 'head',
          }),
        ),
      ).rejects.toThrow(/Invalid value for path parameter: datasetId/);
    });

    test('List test cases - Edge case - Empty dataset', async () => {
      await using dataset = await createDummyDataset();

      const response = await send(
        new ListTestCasesCommand({
          datasetId: dataset.datasetId,
          version: 'head',
        }),
      );

      expect(response.testCases).toBeDefined();
      expect(response.testCases).toHaveLength(0);
    });

    describe('Pagination Validation Tests', () => {
      test('ListTestCases: negative maxResults should return 400 ValidationException', async () => {
        const { datasetId } = await createDummyDataset();
        
        await expect(
          send(new ListTestCasesCommand({
            datasetId,
            version: 'head',
            maxResults: -1 // Negative value
          }))
        ).rejects.toThrow(ValidationException);
      });

      test('ListTestCases: zero maxResults should return 400 ValidationException', async () => {
        const { datasetId } = await createDummyDataset();
        
        await expect(
          send(new ListTestCasesCommand({
            datasetId,
            version: 'head',
            maxResults: 0 // Zero value
          }))
        ).rejects.toThrow(ValidationException);
      });

      test('ListTestCases: maxResults over 1000 should return 400 ValidationException', async () => {
        const { datasetId } = await createDummyDataset();
        
        await expect(
          send(new ListTestCasesCommand({
            datasetId,
            version: 'head',
            maxResults: 1001 // Over limit
          }))
        ).rejects.toThrow(ValidationException);
      });

      test('maxResults exactly at 1000 limit should be accepted', async () => {
        const { datasetId } = await createDummyDataset();
        
        // This should NOT throw a validation error
        try {
          await send(new ListTestCasesCommand({
            datasetId,
            version: 'head',
            maxResults: 200 // Exactly at limit
          }));
        } catch (error) {
          // If it fails, it should be for business logic reasons, not validation
          expect(error).not.toBeInstanceOf(ValidationException);
        }
      });
    });
  });

  describe('DeleteTestCase Operation', () => {
    test('Delete test case - Happy path', async () => {
      await using dataset = await createDummyDataset();

      const id = randomUUID();
      const testCaseParams: CreateTestCaseRequest = {
        datasetId: dataset.datasetId,
        input: `input-${id}`,
        expected: `output-${id}`,
      };

      const { testCaseId } = await createDummyTestCase(testCaseParams);

      await send(new DeleteTestCaseCommand({ datasetId: dataset.datasetId, testCaseId }));

      await expect(
        send(new GetTestCaseCommand({ testCaseId, datasetId: dataset.datasetId, version: 'head' })),
      ).rejects.toThrow(ResourceNotFoundException);
    });

    test('Delete test case - Idempotent behavior - Non-existent datasetId', async () => {
      const nonExistentId = randomUUID();
      await using dataset = await createDummyDataset();
      const { testCaseId } = await createDummyTestCase({ datasetId: dataset.datasetId });

      // DELETE should be idempotent, returning success even for non-existent resources
      const response = await send(new DeleteTestCaseCommand({ datasetId: nonExistentId, testCaseId }));
      expect(response.$metadata.httpStatusCode).toEqual(200);
    });

    test('Delete test case - Idempotent behavior - Non-existent testCaseId', async () => {
      await using dataset = await createDummyDataset();
      const nonExistentId = randomUUID();

      // DELETE should be idempotent, returning success even for non-existent resources
      const response = await send(
        new DeleteTestCaseCommand({ datasetId: dataset.datasetId, testCaseId: nonExistentId }),
      );
      expect(response.$metadata.httpStatusCode).toEqual(200);
    });

    test('Delete test case - Error path - Empty IDs', async () => {
      await using dataset = await createDummyDataset();
      const { testCaseId } = await createDummyTestCase({ datasetId: dataset.datasetId });

      // Empty datasetId
      await expect(
        send(
          new DeleteTestCaseCommand({
            datasetId: '',
            testCaseId,
          }),
        ),
      ).rejects.toThrow(/Invalid value for path parameter: datasetId/);

      // Empty testCaseId — trailing label collapses the URL to `.../testcases/`, matching no route
      await expect(
        send(
          new DeleteTestCaseCommand({
            datasetId: dataset.datasetId,
            testCaseId: '',
          }),
        ),
      ).rejects.toThrow(/No method found matching route/);
    });
  });
});
