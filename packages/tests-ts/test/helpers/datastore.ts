import {
  AnnotationSchema,
  CreateDatasetCommand,
  CreateTestCaseCommand,
  CreateTestCaseRequest,
  Dataset,
  DatasetStatus,
  DeleteDatasetCommand,
  DeleteTestCaseCommand,
  GetDatasetCommand,
  ListDatasetsCommand,
  TestCase,
} from '@awssolutions/gen-ai-evaluation-toolkit-ts-client';
import { randomUUID } from 'crypto';
import { setTimeout as sleep } from 'timers/promises';
import { exhaust, send } from '.';
import { IAsyncDisposable } from '../types';

let createdDatasets: Dataset[] = [];

export async function createDummyDataset({
  name = `test-dataset-${randomUUID()}`,
  description = 'Dataset created by integration test',
} = {}): Promise<IAsyncDisposable<Dataset>> {
  const dataset = await send(new CreateDatasetCommand({ name, description }));
  createdDatasets.push(dataset);

  expect(dataset.datasetId).toBeDefined();
  expect(dataset.name).toEqual(name);
  expect(dataset.description).toEqual(description);
  expect(dataset.status).toEqual(DatasetStatus.ACTIVE);

  return {
    ...dataset,
    async [Symbol.asyncDispose]() {
      await deleteDataset(dataset);

      // Remove dataset from created list
      createdDatasets = createdDatasets.filter(({ datasetId }) => datasetId != dataset.datasetId);
    },
  };
}

export async function cleanupDatasets() {
  // There are cases where datasets are not automatically cleaned up
  // e.g. when creating a list of datasets or when not using `await using` syntax
  await Promise.all(createdDatasets.map(deleteDataset));
}

export async function deleteDataset(dataset: Dataset): Promise<void> {
  try {
    await send(new DeleteDatasetCommand({ datasetId: dataset.datasetId }));
  } catch (error) {
    if (error instanceof Error && error.message === 'Resource not found') {
      console.warn(`Attempting to clean dataset ${dataset.name} twice`);
      return;
    }

    console.warn(`Failed to cleanup dataset ${dataset.name}:`, error);
  }
}

const MAX_ATTEMPTS = 50;

export async function waitUntilDatasetIsActive(datasetId: string) {
  let datasetStatus = '';
  let attempts = MAX_ATTEMPTS;

  do {
    attempts--;
    if (attempts === 0) {
      throw new Error(`Dataset ${datasetId} is not active after ${MAX_ATTEMPTS} attempts`);
    }
    await sleep(500); // sleep for 0.5 seconds
    ({ status: datasetStatus } = await send(new GetDatasetCommand({ datasetId })));
  } while (datasetStatus !== DatasetStatus.ACTIVE);

  expect(datasetStatus).toEqual(DatasetStatus.ACTIVE);
}

export async function createDummyTestCase(payload: CreateTestCaseRequest): Promise<IAsyncDisposable<TestCase>> {
  // Fill in some context if it was missing
  const id = randomUUID();
  payload.input ??= `input-${id}`;
  payload.expected ??= `output-${id}`;
  const testCase = await send(new CreateTestCaseCommand(payload));

  return {
    ...testCase,
    async [Symbol.asyncDispose]() {
      await deleteTestCase(payload.datasetId, testCase.testCaseId);
    },
  };
}

export async function createDummyTestCases(datasetId: string, count: number): Promise<IAsyncDisposable<TestCase[]>> {
  const testCases = await Promise.all(Array.from({ length: count }, () => createDummyTestCase({ datasetId })));

  return Object.assign(testCases, {
    async [Symbol.asyncDispose]() {
      await Promise.all(testCases.map((testCase) => testCase[Symbol.asyncDispose]()));
    },
  });
}

export async function deleteTestCase(datasetId?: string, testCaseId?: string): Promise<void> {
  if (!datasetId) return;
  if (!testCaseId) return;
  try {
    await send(new DeleteTestCaseCommand({ datasetId: datasetId, testCaseId: testCaseId }));
  } catch (error) {
    // we do not care if the resource does not exist:
    if (error instanceof Error && error.message === 'Resource not found') return;
    console.warn(`Failed to cleanup testcase ${datasetId}, ${testCaseId}:`, error);
  }
}

export function assertAnnotationSchema(got: AnnotationSchema, expected: AnnotationSchema) {
  expect(got.name).toEqual(expected.name);
  expect(got.description).toEqual(expected.description);
  expect(got.valueType).toEqual(expected.valueType);
  expect(got.isArchived).toEqual(expected.isArchived);

  if (expected.createdAt != null) expect(got.createdAt).toEqual(expected.createdAt);
  if (expected.createdBy != null) expect(got.createdBy).toEqual(expected.createdBy);
}

export async function detectLeakedDatasets() {
  const leakedDatasets = await exhaust(async (token) => {
    const { datasets, nextToken } = await send(new ListDatasetsCommand({ nextToken: token }));
    return { data: datasets.filter(({ name }) => name.includes('test-')), nextToken };
  });

  if (leakedDatasets.length > 0) {
    console.warn(`Detected ${leakedDatasets.length} leaked datasets`);
  }
}
