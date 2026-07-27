import {
  CreateAnnotationSchemaCommand,
  CreateDatasetCommand,
  CreateTestCaseCommand,
  DeleteDatasetCommand,
  GetAnnotationSchemaCommand,
  GetDatasetCommand,
  GetDatasetVersionCommand,
  GetTestCaseCommand,
  ListAnnotationSchemasCommand,
  ListDatasetsCommand,
  ListDatasetVersionsCommand,
  ListTestCasesCommand,
  CreateDatasetVersionCommand,
  PutDatasetVersionAnnotationCommand,
  PutTestCaseAnnotationCommand,
} from '@awssolutions/gen-ai-evaluation-toolkit-ts-client';
import ms from 'ms';
import { setTimeout as sleep } from 'timers/promises';
import {
  Counter,
  createDummyDataset,
  createDummyTestCase,
  createDummyTestCases,
  send,
  waitUntilDatasetIsActive,
} from '../helpers';
import { benchmarkFunction } from './helpers';

describe('Datastore APIs Benchmarks', () => {
  jest.setTimeout(ms('15 minutes'));

  const counter = new Counter();
  const now = new Date().toISOString();

  beforeEach(async () => {
    // Cool down after each test to refill the rate-limit
    await sleep(10_000);
  });

  test('GetDataset', async () => {
    // Create dataset
    await using dataset = await createDummyDataset();
    const { datasetId } = dataset;

    const command = () => send(new GetDatasetCommand({ datasetId }));

    await benchmarkFunction(command, 'get dataset');
  });

  test('GetDatasetVersion', async () => {
    // Create dataset
    await using dataset = await createDummyDataset();
    const { datasetId } = dataset;

    // Mint new dataset version
    await send(new CreateDatasetVersionCommand({ datasetId }));
    await waitUntilDatasetIsActive(datasetId);

    const command = () => send(new GetDatasetVersionCommand({ datasetId, version: 'latest' }));

    await benchmarkFunction(command, 'get dataset version');
  });

  test('GetTestCase', async () => {
    // Create dataset
    await using dataset = await createDummyDataset();
    const { datasetId } = dataset;

    await using testCase = await createDummyTestCase({ datasetId });
    const { testCaseId } = testCase;

    const command = () => send(new GetTestCaseCommand({ datasetId, version: 'head', testCaseId }));

    await benchmarkFunction(command, 'get test case');
  });

  test('ListDatasets', async () => {
    // Create 100 datasets
    const datasets = await Promise.all(Array.from({ length: 100 }, () => createDummyDataset()));
    await sleep(5_000);

    try {
      await benchmarkFunction(() => send(new ListDatasetsCommand()), 'list datasets', {
        runs: [10, 25],
      });
    } finally {
      // Cleanup created datasets
      await Promise.all(datasets.map(({ datasetId }) => send(new DeleteDatasetCommand({ datasetId }))));
    }
  });

  test('ListDatasetVersions', async () => {
    await using dataset = await createDummyDataset();
    const { datasetId } = dataset;

    // Create some versions for listing
    for (let i = 0; i < 50; i++) {
      await send(new CreateDatasetVersionCommand({ datasetId }));
      await waitUntilDatasetIsActive(datasetId);
    }

    const command = () => send(new ListDatasetVersionsCommand({ datasetId }));

    await benchmarkFunction(command, 'list dataset versions');
  });

  test('ListTestCases', async () => {
    await using dataset = await createDummyDataset();
    const { datasetId } = dataset;

    // Create test cases for listing
    await createDummyTestCases(datasetId, 100);

    const command = () => send(new ListTestCasesCommand({ datasetId, version: 'head' }));

    await benchmarkFunction(command, 'list test cases');
  });

  test('CreateAnnotationSchema', async () => {
    const command = () =>
      send(
        new CreateAnnotationSchemaCommand({
          name: `creation-benchmark-${now}-${counter.nextValue()}`,
          valueType: { numericType: {} },
        }),
      );

    await benchmarkFunction(command, 'create annotation schema');
  });

  test('CreateDataset', async () => {
    const command = () =>
      send(
        new CreateDatasetCommand({
          name: `creation-benchmark-${now}-${counter.nextValue()}`,
        }),
      );

    await benchmarkFunction(command, 'create test case');
  });

  test('CreateTestCase', async () => {
    await using dataset = await createDummyDataset();
    const { datasetId } = dataset;

    const command = () => send(new CreateTestCaseCommand({ datasetId }));

    await benchmarkFunction(command, 'create dataset');
  });

  test('GetAnnotationSchema', async () => {
    const schema = await send(
      new CreateAnnotationSchemaCommand({
        name: `creation-benchmark-${now}-${counter.nextValue()}`,
        valueType: { numericType: {} },
      }),
    );

    await benchmarkFunction(
      () =>
        send(
          new GetAnnotationSchemaCommand({
            annotationName: schema.name,
          }),
        ),
      'get annotation schema',
    );
  });

  test('ListAnnotationSchemas', async () => {
    // Make sure some annotation schemas are created for listing
    await Promise.all(
      Array.from({ length: 500 }, () =>
        send(
          new CreateAnnotationSchemaCommand({
            name: `creation-benchmark-${now}-${counter.nextValue()}`,
            valueType: { numericType: {} },
          }),
        ),
      ),
    );

    await benchmarkFunction(() => send(new ListAnnotationSchemasCommand()), 'list annotation schema', {
      runs: [10, 25],
    });
  });

  describe('PutDatasetVersionAnnotation', () => {
    test('benchmark', async () => {
      const schema = await send(
        new CreateAnnotationSchemaCommand({
          name: `creation-benchmark-${now}-${counter.nextValue()}`,
          valueType: { numericType: {} },
        }),
      );

      await using dataset = await createDummyDataset();
      const { datasetId } = dataset;

      await send(new CreateDatasetVersionCommand({ datasetId }));
      await waitUntilDatasetIsActive(datasetId);

      await benchmarkFunction(
        () =>
          send(
            new PutDatasetVersionAnnotationCommand({
              datasetId,
              name: schema.name,
              version: 1,
              value: { numericValue: counter.nextValue() },
            }),
          ),
        'put version annotation benchmark',
        { runs: [100], concurrentRuns: 1 },
      );
    });

    test('load test', async () => {
      const schema = await send(
        new CreateAnnotationSchemaCommand({
          name: `creation-benchmark-${now}-${counter.nextValue()}`,
          valueType: { numericType: {} },
        }),
      );

      await benchmarkFunction(
        async () => {
          const startTime = performance.now();

          await using dataset = await createDummyDataset();
          const { datasetId } = dataset;

          await send(new CreateDatasetVersionCommand({ datasetId }));
          await waitUntilDatasetIsActive(datasetId);

          const setupTime = performance.now() - startTime;

          await send(
            new PutDatasetVersionAnnotationCommand({
              datasetId,
              name: schema.name,
              version: 1,
              value: { numericValue: counter.nextValue() },
            }),
          );

          return setupTime;
        },
        'put version annotation - whole scenario',
        { runs: [100, 500, 1000] },
      );
    });
  });

  describe('PutTestCaseAnnotation', () => {
    test('benchmark', async () => {
      const schema = await send(
        new CreateAnnotationSchemaCommand({
          name: `creation-benchmark-${now}-${counter.nextValue()}`,
          valueType: { numericType: {} },
        }),
      );

      await using dataset = await createDummyDataset();
      const { datasetId } = dataset;

      const { testCaseId } = await createDummyTestCase({ datasetId });

      // Test case must be in a minted version before being annotated
      await send(new CreateDatasetVersionCommand({ datasetId }));
      await waitUntilDatasetIsActive(datasetId);

      const command = () =>
        send(
          new PutTestCaseAnnotationCommand({
            datasetId,
            testCaseId,
            name: schema.name,
            value: { numericValue: counter.nextValue() },
          }),
        );

      await benchmarkFunction(command, 'put test case annotation benchmark', {
        runs: [100],
        concurrentRuns: 1,
      });
    });

    test('load test', async () => {
      const schema = await send(
        new CreateAnnotationSchemaCommand({
          name: `creation-benchmark-${now}-${counter.nextValue()}`,
          valueType: { numericType: {} },
        }),
      );

      await benchmarkFunction(
        async () => {
          const startTime = performance.now();

          await using dataset = await createDummyDataset();
          const { datasetId } = dataset;

          const { testCaseId } = await createDummyTestCase({ datasetId });

          // Test case must be in a minted version before being annotated
          await send(new CreateDatasetVersionCommand({ datasetId }));
          await waitUntilDatasetIsActive(datasetId);

          const setupTime = performance.now() - startTime;

          await send(
            new PutTestCaseAnnotationCommand({
              datasetId,
              testCaseId,
              name: schema.name,
              value: { numericValue: counter.nextValue() },
            }),
          );

          return setupTime;
        },
        'put test case annotation - whole scenario',
        {
          runs: [100, 500, 1000],
        },
      );
    });
  });

  // Warning: takes about 4 minutes to complete
  test.skip('CreateDatasetVersionVersion', async () => {
    await using dataset = await createDummyDataset();
    const { datasetId } = dataset;

    // Create some test cases
    await createDummyTestCases(datasetId, 500);

    await benchmarkFunction(
      async () => {
        await send(new CreateDatasetVersionCommand({ datasetId }));
        await waitUntilDatasetIsActive(datasetId);
      },
      'mint new version',
      {
        runs: [50],
        concurrentRuns: 1,
        comment: '500 test cases',
      },
    );
  });
});
