import {
  CreateAnnotationSchemaCommand,
  CreateDatasetVersionCommand,
  ListTestCasesCommand,
  PutTestCaseAnnotationCommand,
} from '@awssolutions/gen-ai-evaluation-toolkit-ts-client';
import { randomUUID } from 'crypto';
import {
  cleanupDatasets,
  createDummyDataset,
  createDummyTestCase,
  deleteAnnotationSchemaFromDDB,
  send,
  waitUntilDatasetIsActive,
} from '../../helpers';

describe('Annotation Filter in ListTestCases', () => {
  const schemaName = `TestFilterSchema-${randomUUID()}`;
  let datasetId: string;
  let tcHigh1: string;
  let tcHigh2: string;
  let tcHigh3: string;
  let tcMedium1: string;
  let tcMedium2: string;
  let tcLow1: string;

  beforeAll(async () => {
    // Create annotation schema
    await send(
      new CreateAnnotationSchemaCommand({
        name: schemaName,
        description: 'Quality tier for filter testing',
        valueType: { stringType: { enum: ['HIGH', 'MEDIUM', 'LOW'] } },
      }),
    );

    // Create dataset with 6 test cases
    ({ datasetId } = await createDummyDataset());

    const cases = await Promise.all([
      createDummyTestCase({ datasetId, input: 'q1', expected: 'a1' }),
      createDummyTestCase({ datasetId, input: 'q2', expected: 'a2' }),
      createDummyTestCase({ datasetId, input: 'q3', expected: 'a3' }),
      createDummyTestCase({ datasetId, input: 'q4', expected: 'a4' }),
      createDummyTestCase({ datasetId, input: 'q5', expected: 'a5' }),
      createDummyTestCase({ datasetId, input: 'q6', expected: 'a6' }),
    ]);

    [tcHigh1, tcHigh2, tcHigh3, tcMedium1, tcMedium2, tcLow1] = cases.map((c) => c.testCaseId);

    // Mint version (required before annotations)
    await send(new CreateDatasetVersionCommand({ datasetId }));
    await waitUntilDatasetIsActive(datasetId);

    // Annotate: 3 HIGH, 2 MEDIUM, 1 LOW
    await Promise.all([
      send(new PutTestCaseAnnotationCommand({ datasetId, testCaseId: tcHigh1, name: schemaName, value: { stringValue: 'HIGH' } })),
      send(new PutTestCaseAnnotationCommand({ datasetId, testCaseId: tcHigh2, name: schemaName, value: { stringValue: 'HIGH' } })),
      send(new PutTestCaseAnnotationCommand({ datasetId, testCaseId: tcHigh3, name: schemaName, value: { stringValue: 'HIGH' } })),
      send(new PutTestCaseAnnotationCommand({ datasetId, testCaseId: tcMedium1, name: schemaName, value: { stringValue: 'MEDIUM' } })),
      send(new PutTestCaseAnnotationCommand({ datasetId, testCaseId: tcMedium2, name: schemaName, value: { stringValue: 'MEDIUM' } })),
      send(new PutTestCaseAnnotationCommand({ datasetId, testCaseId: tcLow1, name: schemaName, value: { stringValue: 'LOW' } })),
    ]);
  });

  afterAll(async () => {
    await cleanupDatasets();
    await deleteAnnotationSchemaFromDDB(schemaName);
  });

  test('without filter returns all 6 test cases', async () => {
    const { testCases } = await send(
      new ListTestCasesCommand({ datasetId, version: 'head' }),
    );
    expect(testCases).toHaveLength(6);
  });

  test('filter by HIGH returns only 3 test cases', async () => {
    const { testCases } = await send(
      new ListTestCasesCommand({
        datasetId,
        version: 'head',
        filter: {
          condition: {
            stringEnumCondition: { name: schemaName, value: 'HIGH', comparator: '=' },
          },
        },
      }),
    );
    expect(testCases).toHaveLength(3);
    const ids = testCases.map((tc) => tc.id);
    expect(ids).toContain(tcHigh1);
    expect(ids).toContain(tcHigh2);
    expect(ids).toContain(tcHigh3);
  });

  test('filter by MEDIUM returns only 2 test cases', async () => {
    const { testCases } = await send(
      new ListTestCasesCommand({
        datasetId,
        version: 'head',
        filter: {
          condition: {
            stringEnumCondition: { name: schemaName, value: 'MEDIUM', comparator: '=' },
          },
        },
      }),
    );
    expect(testCases).toHaveLength(2);
    const ids = testCases.map((tc) => tc.id);
    expect(ids).toContain(tcMedium1);
    expect(ids).toContain(tcMedium2);
  });

  test('OR filter (HIGH or MEDIUM) returns 5 test cases', async () => {
    const { testCases } = await send(
      new ListTestCasesCommand({
        datasetId,
        version: 'head',
        filter: {
          or: [
            { condition: { stringEnumCondition: { name: schemaName, value: 'HIGH', comparator: '=' } } },
            { condition: { stringEnumCondition: { name: schemaName, value: 'MEDIUM', comparator: '=' } } },
          ],
        },
      }),
    );
    expect(testCases).toHaveLength(5);
  });

  test('NOT filter (NOT LOW) returns 5 test cases', async () => {
    const { testCases } = await send(
      new ListTestCasesCommand({
        datasetId,
        version: 'head',
        filter: {
          not: {
            condition: { stringEnumCondition: { name: schemaName, value: 'LOW', comparator: '=' } },
          },
        },
      }),
    );
    expect(testCases).toHaveLength(5);
    const ids = testCases.map((tc) => tc.id);
    expect(ids).not.toContain(tcLow1);
  });

});
