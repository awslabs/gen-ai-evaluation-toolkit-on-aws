import {
  Annotation,
  AnnotationValue,
  ArchiveAnnotationSchemaCommand,
  CreateAnnotationSchemaCommand,
  CreateAnnotationSchemaRequest,
  DeleteTestCaseAnnotationCommand,
  GetTestCaseCommand,
  CreateDatasetVersionCommand,
  PutTestCaseAnnotationCommand,
  PutTestCaseAnnotationRequest,
  ResourceNotFoundException,
  ValidationException,
  GenAiEvaluationToolkitServiceException
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

describe('Test Case Annotations', () => {
  afterAll(async () => {
    await cleanupDatasets();
  });

  const numberSchemaRequest: CreateAnnotationSchemaRequest = {
    name: `TestNumberSchema-${randomUUID()}`,
    description: 'used for testing',
    valueType: { numericType: {} },
  };

  const stringSchemaRequest: CreateAnnotationSchemaRequest = {
    name: `TestStringSchema-${randomUUID()}`,
    description: 'used for testing',
    valueType: { stringType: { enum: ['a', 'b', 'c'] } },
  };

  let createdTestCaseId: string;
  let datasetId: string;

  beforeAll(async () => {
    await Promise.all([
      send(new CreateAnnotationSchemaCommand(numberSchemaRequest)),
      send(new CreateAnnotationSchemaCommand(stringSchemaRequest)),
    ]);
  });

  beforeEach(async () => {
    ({ datasetId } = await createDummyDataset());
    ({ testCaseId: createdTestCaseId } = await createDummyTestCase({ datasetId }));
    await send(new CreateDatasetVersionCommand({ datasetId }));
    await waitUntilDatasetIsActive(datasetId);
  });

  afterAll(async () => {
    await Promise.all([
      deleteAnnotationSchemaFromDDB(numberSchemaRequest.name),
      deleteAnnotationSchemaFromDDB(stringSchemaRequest.name),
    ]);
  });

  type AnnotationPayload = Pick<PutTestCaseAnnotationRequest, 'name' | 'value' | 'comment'>;

  async function putAnnotation(payload: AnnotationPayload, testCaseId: string = createdTestCaseId) {
    await send(
      new PutTestCaseAnnotationCommand({
        datasetId,
        testCaseId,
        ...payload,
      }),
    );
  }

  async function getAnnotations() {
    const { annotations } = await send(
      new GetTestCaseCommand({ datasetId, version: 'head', testCaseId: createdTestCaseId }),
    );
    expect(annotations).toBeDefined();
    expect(annotations).toHaveLength(2);

    return annotations!;
  }

  async function deleteAnnotation({ name }: AnnotationPayload) {
    await send(new DeleteTestCaseAnnotationCommand({ datasetId, testCaseId: createdTestCaseId, annotationName: name }));
  }

  function assertAnnotations(annotations: Annotation[], { name, value, comment }: AnnotationPayload) {
    const stringAnnotation = annotations.find((a) => a.name == name);
    expect(stringAnnotation).toBeDefined();
    expect(stringAnnotation?.value).toEqual(value);
    expect(stringAnnotation?.comment).toEqual(comment);
  }

  test('wrong types fail', async () => {
    await expect(
      putAnnotation({ name: numberSchemaRequest.name, value: { stringValue: 'some-value' } }),
    ).rejects.toThrow(ValidationException);

    await expect(putAnnotation({ name: stringSchemaRequest.name, value: { numericValue: 123 } })).rejects.toThrow(
      ValidationException,
    );

    await expect(
      putAnnotation({ name: stringSchemaRequest.name, value: { stringValue: 'value-not-in-enum' } }),
    ).rejects.toThrow(ValidationException);
  });

  test('CRUD', async () => {
    const numberPayload: AnnotationPayload = {
      name: numberSchemaRequest.name,
      value: { numericValue: 123 },
      comment: 'number annotation',
    };

    const stringPayload: AnnotationPayload = {
      name: stringSchemaRequest.name,
      value: { stringValue: stringSchemaRequest.valueType.stringType?.enum.at(0)! },
      comment: 'string annotation',
    };

    await Promise.all([putAnnotation(numberPayload), putAnnotation(stringPayload)]);

    let annotations = await getAnnotations();
    assertAnnotations(annotations, numberPayload);
    assertAnnotations(annotations, stringPayload);

    numberPayload.comment = 'updated number comment';
    numberPayload.value = { numericValue: 456 };
    stringPayload.comment = 'updated string comment';
    stringPayload.value = { stringValue: stringSchemaRequest.valueType.stringType?.enum.at(2)! };

    await Promise.all([putAnnotation(numberPayload), putAnnotation(stringPayload)]);

    annotations = await getAnnotations();
    assertAnnotations(annotations, numberPayload);
    assertAnnotations(annotations, stringPayload);

    await Promise.all([deleteAnnotation(numberPayload), deleteAnnotation(stringPayload)]);

    const testCase = await send(new GetTestCaseCommand({ datasetId, version: 'head', testCaseId: createdTestCaseId }));
    expect(testCase.annotations).toHaveLength(0);
  });

  describe('Put Test Case Annotation Error Paths', () => {
    let validDatasetId: string;
    let validTestCaseId: string;
    const validAnnotationName = numberSchemaRequest.name;
    const validAnnotationValue = { numericValue: 123 };
    const validComment = 'test annotation';

    beforeEach(async () => {
      ({ datasetId: validDatasetId } = await createDummyDataset());
      ({ testCaseId: validTestCaseId } = await createDummyTestCase({ datasetId: validDatasetId }));
      await send(new CreateDatasetVersionCommand({ datasetId: validDatasetId }));
      await waitUntilDatasetIsActive(validDatasetId);
    });

    test('should throw ResourceNotFoundException with non-existent datasetId', async () => {
      const nonExistentDatasetId = 'non-existent-dataset-id';

      await expect(
        send(
          new PutTestCaseAnnotationCommand({
            datasetId: nonExistentDatasetId,
            testCaseId: validTestCaseId,
            name: validAnnotationName,
            value: validAnnotationValue,
            comment: validComment,
          }),
        ),
      ).rejects.toThrow(ResourceNotFoundException);
    });

    test('should throw ResourceNotFoundException with non-existent testCaseId', async () => {
      const nonExistentTestCaseId = 'non-existent-test-case-id';

      await expect(
        send(
          new PutTestCaseAnnotationCommand({
            datasetId: validDatasetId,
            testCaseId: nonExistentTestCaseId,
            name: validAnnotationName,
            value: validAnnotationValue,
            comment: validComment,
          }),
        ),
      ).rejects.toThrow(ResourceNotFoundException);
    });

    test('should throw ResourceNotFoundException with non-existent annotation schema', async () => {
      const nonExistentAnnotationName = 'non-existent-annotation-schema';

      await expect(
        send(
          new PutTestCaseAnnotationCommand({
            datasetId: validDatasetId,
            testCaseId: validTestCaseId,
            name: nonExistentAnnotationName,
            value: validAnnotationValue,
            comment: validComment,
          }),
        ),
      ).rejects.toThrow(ResourceNotFoundException);
    });

    test('should throw Error with malformed datasetId', async () => {
      const malformedDatasetId = ''; // Empty string as malformed ID

      await expect(
        send(
          new PutTestCaseAnnotationCommand({
            datasetId: malformedDatasetId,
            testCaseId: validTestCaseId,
            name: validAnnotationName,
            value: validAnnotationValue,
            comment: validComment,
          }),
        ),
      ).rejects.toThrow(/Invalid value for path parameter: datasetId/);
    });

    test('should throw Error with malformed testCaseId', async () => {
      const malformedTestCaseId = ''; // Empty string as malformed ID

      await expect(
        send(
          new PutTestCaseAnnotationCommand({
            datasetId: validDatasetId,
            testCaseId: malformedTestCaseId,
            name: validAnnotationName,
            value: validAnnotationValue,
            comment: validComment,
          }),
        ),
      ).rejects.toThrow(/Invalid value for path parameter: testcaseId/i);
    });

    test('should throw ValidationException with malformed annotation name', async () => {
      const malformedAnnotationName = ''; // Empty string as malformed name

      await expect(
        send(
          new PutTestCaseAnnotationCommand({
            datasetId: validDatasetId,
            testCaseId: validTestCaseId,
            name: malformedAnnotationName,
            value: validAnnotationValue,
            comment: validComment,
          }),
        ),
      ).rejects.toThrow(ValidationException);
    });

    test('should throw ValidationException with missing value', async () => {
      // Using null as a value to simulate a missing value
      await expect(
        send(
          new PutTestCaseAnnotationCommand({
            datasetId: validDatasetId,
            testCaseId: validTestCaseId,
            name: validAnnotationName,
            value: null as unknown as AnnotationValue,
            comment: validComment,
          }),
        ),
      ).rejects.toThrow(ValidationException);
    });

    test('should handle very long comments', async () => {
      const veryLongComment = 'a'.repeat(1000);

      await expect(
        send(
          new PutTestCaseAnnotationCommand({
            datasetId: validDatasetId,
            testCaseId: validTestCaseId,
            name: validAnnotationName,
            value: validAnnotationValue,
            comment: veryLongComment,
          }),
        ),
      ).resolves.not.toThrow();
    });

    test('should handle empty comments', async () => {
      await expect(
        send(
          new PutTestCaseAnnotationCommand({
            datasetId: validDatasetId,
            testCaseId: validTestCaseId,
            name: validAnnotationName,
            value: validAnnotationValue,
            comment: '',
          }),
        ),
      ).resolves.not.toThrow();
    });

    test('PutTestCaseAnnotation: providing an archived annotation schema should throw ResourceNotFoundException', async () => {
      // Create and archive an annotation schema
      const archivedSchemaName = `TestArchivedSchema-${randomUUID()}`;
      await send(
        new CreateAnnotationSchemaCommand({
          name: archivedSchemaName,
          description: 'Schema to be archived',
          valueType: { numericType: {} },
        }),
      );

      // Archive the schema
      await send(new ArchiveAnnotationSchemaCommand({ annotationName: archivedSchemaName }));

      // Try to use the archived schema - should fail
      await expect(
        send(new PutTestCaseAnnotationCommand({
          datasetId: validDatasetId,
          testCaseId: validTestCaseId,
          name: archivedSchemaName,
          value: { numericValue: 123 },
          comment: 'test with archived schema',
        }))
      ).rejects.toThrow(GenAiEvaluationToolkitServiceException);
      await deleteAnnotationSchemaFromDDB(archivedSchemaName);
    });

    test('PutTestCaseAnnotation: very long numeric value should return 400 ValidationException', async () => {
      await expect(
        send(new PutTestCaseAnnotationCommand({
          datasetId: validDatasetId,
          testCaseId: validTestCaseId,
          name: validAnnotationName,
          value: {
            numericValue: 2_000_000 // Over the numeric range limit
          }
        }))
      ).rejects.toThrow(ValidationException);
    });
  });

  describe('Delete Test Case Annotation Error Paths', () => {
    let validDatasetId: string;
    let validTestCaseId: string;
    let validAnnotationName: string;

    beforeEach(async () => {
      ({ datasetId: validDatasetId } = await createDummyDataset());
      ({ testCaseId: validTestCaseId } = await createDummyTestCase({ datasetId: validDatasetId }));

      await send(new CreateDatasetVersionCommand({ datasetId: validDatasetId }));
      await waitUntilDatasetIsActive(validDatasetId);

      validAnnotationName = numberSchemaRequest.name;
      await send(
        new PutTestCaseAnnotationCommand({
          datasetId: validDatasetId,
          testCaseId: validTestCaseId,
          name: validAnnotationName,
          value: { numericValue: 123 },
          comment: 'test annotation',
        }),
      );
    });

    test('should return 204 with non-existent datasetId', async () => {
      const nonExistentDatasetId = 'non-existent-dataset-id';

      const response = await send(
        new DeleteTestCaseAnnotationCommand({
          datasetId: nonExistentDatasetId,
          testCaseId: validTestCaseId,
          annotationName: validAnnotationName,
        }),
      );

      expect(response.$metadata.httpStatusCode).toBe(204);
    });

    test('should return 204 with non-existent testCaseId', async () => {
      const nonExistentTestCaseId = 'non-existent-test-case-id';

      const response = await send(
        new DeleteTestCaseAnnotationCommand({
          datasetId: validDatasetId,
          testCaseId: nonExistentTestCaseId,
          annotationName: validAnnotationName,
        }),
      );

      expect(response.$metadata.httpStatusCode).toBe(204);
    });

    test('should return 204 with non-existent annotationName', async () => {
      const nonExistentAnnotationName = 'non-existent-annotation-name';

      const response = await send(
        new DeleteTestCaseAnnotationCommand({
          datasetId: validDatasetId,
          testCaseId: validTestCaseId,
          annotationName: nonExistentAnnotationName,
        }),
      );

      expect(response.$metadata.httpStatusCode).toBe(204);
    });

    test('should throw Error with malformed datasetId', async () => {
      const malformedDatasetId = ''; // Empty string as malformed ID

      await expect(
        send(
          new DeleteTestCaseAnnotationCommand({
            datasetId: malformedDatasetId,
            testCaseId: validTestCaseId,
            annotationName: validAnnotationName,
          }),
        ),
      ).rejects.toThrow(/Invalid value for path parameter: datasetId/);
    });

    test('should throw Error with malformed testCaseId', async () => {
      const malformedTestCaseId = ''; // Empty string as malformed ID

      await expect(
        send(
          new DeleteTestCaseAnnotationCommand({
            datasetId: validDatasetId,
            testCaseId: malformedTestCaseId,
            annotationName: validAnnotationName,
          }),
        ),
      ).rejects.toThrow(/Invalid value for path parameter: testcaseId/i);
    });

    test('should throw Error with malformed annotationName', async () => {
      const malformedAnnotationName = ''; // Empty string as malformed name

      await expect(
        send(
          new DeleteTestCaseAnnotationCommand({
            datasetId: validDatasetId,
            testCaseId: validTestCaseId,
            annotationName: malformedAnnotationName,
          }),
        ),
      ).rejects.toThrow(/No method found matching route/);
    });
  });
});
