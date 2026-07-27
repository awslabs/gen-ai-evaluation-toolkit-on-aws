import {
  setupTestEnvironment,
  $,
  createAnnotationSchema,
  createDataset,
  createTestCase,
  mintVersion,
} from './helpers';
import { deleteAnnotationSchemaFromDDB, exhaust } from '../../helpers';
import { randomUUID } from 'crypto';

beforeAll(async () => {
  await setupTestEnvironment();
});

describe('Annotation Commands', () => {
  test('should create a string enum annotation schema', async () => {
    const testId = `annotation-${randomUUID()}`;
    const annotationName = `annotation-${testId}`;
    const annotationDescription = `Test annotation created by CLI tests - ${testId}`;

    try {
      const result =
        await $`genai-etk dataset create-annotation-schema --name ${annotationName} --description "${annotationDescription}" --enum-value "Good" --enum-value "Bad" --enum-value "Neutral"`;

      expect(result.stdout).toContain(annotationName);
      expect(result.stdout).toContain('Value Type: One of');
    } finally {
      await deleteAnnotationSchemaFromDDB(annotationName);
    }
  });

  test('should get annotation schema details', async () => {
    const testId = `get-annotation-${randomUUID()}`;
    await using annotationSchema = await createAnnotationSchema(testId);

    const result = await $`genai-etk dataset get-annotation-schema --annotation-name ${annotationSchema.name}`;

    expect(result.stdout).toContain(annotationSchema.name);
    expect(result.stdout).toContain('Good');
    expect(result.stdout).toContain('Bad');
    expect(result.stdout).toContain('Neutral');
  });

  test('should list annotation schemas', async () => {
    const testId = `list-annotation-${randomUUID()}`;
    await using annotationSchema = await createAnnotationSchema(testId);

    const allSchemas = await exhaust(async (nextToken) => {
      const response = await $.json<{ annotationSchemas: Array<{ name: string }>; nextToken?: string }>`genai-etk dataset list-annotation-schemas ${nextToken ? ` --next-token ${nextToken}` : ''}`;
      return { data: response.annotationSchemas, nextToken: response.nextToken };
    });

    expect(allSchemas.filter(schema => schema.name === annotationSchema.name)).toHaveLength(1);
    });

  test('should create a numeric annotation schema', async () => {
    const testId = `numeric-annotation-${randomUUID()}`;

    await using annotationSchema = await createAnnotationSchema(testId, { type: 'number' });

    const getResult = await $`genai-etk dataset get-annotation-schema --annotation-name ${annotationSchema.name}`;

    expect(getResult.stdout).toContain('Type: Number');
  });

  test('should put a version annotation', async () => {
    const testId = `version-annotation-${randomUUID()}`;

    await using dataset = await createDataset(testId);
    await using _ = await createTestCase(dataset.id);

    await mintVersion(dataset.id);

    await using annotationSchema = await createAnnotationSchema(testId);

    const result =
      await $`genai-etk dataset put-version-annotation --dataset-id ${dataset.id} --version 1 --name ${annotationSchema.name} --string-value "Good" --comment "This is a good version"`;

    expect(result.stdout).toContain(annotationSchema.name);
    expect(result.stdout).toContain('Good');
    expect(result.stdout).toContain('This is a good version');
  });

  test('should put a testcase annotation', async () => {
    const testId = `testcase-annotation-${randomUUID()}`;

    await using dataset = await createDataset(testId);
    await using testCase = await createTestCase(dataset.id);

    await mintVersion(dataset.id);

    await using annotationSchema = await createAnnotationSchema(testId);

    const result =
      await $`genai-etk dataset put-testcase-annotation --dataset-id ${dataset.id} --test-case-id ${testCase.id} --name ${annotationSchema.name} --string-value "Neutral" --comment "This is a neutral test case"`;

    expect(result.stdout).toContain(annotationSchema.name);
    expect(result.stdout).toContain('Neutral');
    expect(result.stdout).toContain('This is a neutral test case');
  });

  test('should delete a version annotation', async () => {
    const testId = `delete-version-annotation-${randomUUID()}`;

    await using dataset = await createDataset(testId);
    await using _ = await createTestCase(dataset.id);

    await mintVersion(dataset.id);

    await using annotationSchema = await createAnnotationSchema(testId);

    await $`genai-etk dataset put-version-annotation --dataset-id ${dataset.id} --version 1 --name ${annotationSchema.name} --string-value "Good" --comment "This is a good version"`;

    const result =
      await $`genai-etk dataset delete-version-annotation --dataset-id ${dataset.id} --version 1 --annotation-name ${annotationSchema.name}`;

    expect(result.stdout).toContain('Successfully deleted annotation');
  });

  test('should delete a testcase annotation', async () => {
    const testId = `delete-testcase-annotation-${randomUUID()}`;

    await using dataset = await createDataset(testId);
    await using testCase = await createTestCase(dataset.id);

    await mintVersion(dataset.id);

    await using annotationSchema = await createAnnotationSchema(testId);

    await $`genai-etk dataset put-testcase-annotation --dataset-id ${dataset.id} --test-case-id ${testCase.id} --name ${annotationSchema.name} --string-value "Neutral" --comment "This is a neutral test case"`;

    const result =
      await $`genai-etk dataset delete-testcase-annotation --dataset-id ${dataset.id} --test-case-id ${testCase.id} --annotation-name ${annotationSchema.name}`;

    expect(result.stdout).toContain('Successfully deleted annotation');
  });

  test('should archive and restore an annotation schema', async () => {
    const testId = `archive-annotation-${randomUUID()}`;
    const annotationName = `annotation-${testId}`;

    try {
      await using annotationSchema = await createAnnotationSchema(testId);

      const archiveResult = await $`genai-etk dataset archive-annotation-schema --annotation-name ${annotationSchema.name}`;
      expect(archiveResult.stdout).toContain('Is Archived: true');

      const getArchivedResult = await $`genai-etk dataset get-annotation-schema --annotation-name ${annotationSchema.name}`;
      expect(getArchivedResult.stdout).toContain('Is Archived: true');

      const restoreResult = await $`genai-etk dataset archive-annotation-schema --annotation-name ${annotationSchema.name} --restore`;
      expect(restoreResult.stdout).toContain('Is Archived: false');

      const getRestoredResult = await $`genai-etk dataset get-annotation-schema --annotation-name ${annotationSchema.name}`;
      expect(getRestoredResult.stdout).toContain('Is Archived: false');
    } finally {
      await deleteAnnotationSchemaFromDDB(annotationName).catch(() => {});
    }
  });

  test('should list annotation schemas with --include-archived', async () => {
    const activeTestId = `active-list-archived-${randomUUID()}`;
    const archivedTestId = `archived-list-archived-${randomUUID()}`;

    try {
      await using activeSchema = await createAnnotationSchema(activeTestId);
      await using archivedSchema = await createAnnotationSchema(archivedTestId);

      await $`genai-etk dataset archive-annotation-schema --annotation-name ${archivedSchema.name}`;

      const defaultSchemas = await exhaust(async (nextToken) => {
        const response = await $.json<{ annotationSchemas: Array<{ name: string }>; nextToken?: string }>`genai-etk dataset list-annotation-schemas ${nextToken ? ` --next-token ${nextToken}` : ''}`;
        return { data: response.annotationSchemas, nextToken: response.nextToken };
      });
      const defaultNames = defaultSchemas.map(s => s.name);
      expect(defaultNames).toContain(activeSchema.name);
      expect(defaultNames).not.toContain(archivedSchema.name);

      const archivedSchemas = await exhaust(async (nextToken) => {
        const response = await $.json<{ annotationSchemas: Array<{ name: string }>; nextToken?: string }>`genai-etk dataset list-annotation-schemas --include-archived ${nextToken ? ` --next-token ${nextToken}` : ''}`;
        return { data: response.annotationSchemas, nextToken: response.nextToken };
      });
      const archivedNames = archivedSchemas.map(s => s.name);
      expect(archivedNames).toContain(activeSchema.name);
      expect(archivedNames).toContain(archivedSchema.name);
    } finally {
      await Promise.all([
        deleteAnnotationSchemaFromDDB(`annotation-${activeTestId}`).catch(() => {}),
        deleteAnnotationSchemaFromDDB(`annotation-${archivedTestId}`).catch(() => {}),
      ]);
    }
  });
});
