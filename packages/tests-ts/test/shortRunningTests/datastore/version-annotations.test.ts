import {
  Annotation,
  AnnotationValue,
  CreateAnnotationSchemaCommand,
  CreateAnnotationSchemaRequest,
  DeleteDatasetVersionAnnotationCommand,
  GetDatasetVersionCommand,
  ListDatasetVersionsCommand,
  ListDatasetVersionsResponse,
  CreateDatasetVersionCommand,
  NumericLogicalComparator,
  PutDatasetVersionAnnotationCommand,
  PutDatasetVersionAnnotationRequest,
  ResourceNotFoundException,
  StringEnumLogicalComparator,
  ValidationException,
} from '@awssolutions/gen-ai-evaluation-toolkit-ts-client';
import { randomUUID } from 'crypto';
import {
  cleanupDatasets,
  createDummyDataset,
  createDummyTestCases,
  deleteAnnotationSchemaFromDDB,
  send,
  waitUntilDatasetIsActive,
} from '../../helpers';

describe('Version Annotations', () => {
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

  let datasetId: string;
  const version = 1;

  beforeAll(async () => {
    await Promise.all([
      send(new CreateAnnotationSchemaCommand(numberSchemaRequest)),
      send(new CreateAnnotationSchemaCommand(stringSchemaRequest)),
    ]);
  });

  beforeEach(async () => {
    ({ datasetId } = await createDummyDataset());
    await createDummyTestCases(datasetId, 2);
    await send(new CreateDatasetVersionCommand({ datasetId }));
    await waitUntilDatasetIsActive(datasetId);
  });

  afterAll(async () => {
    await Promise.all([
      deleteAnnotationSchemaFromDDB(numberSchemaRequest.name),
      deleteAnnotationSchemaFromDDB(stringSchemaRequest.name),
    ]);
  });

  type AnnotationPayload = Pick<PutDatasetVersionAnnotationRequest, 'name' | 'value' | 'comment'>;

  async function putAnnotation(payload: AnnotationPayload, versionNumber: number = version) {
    await send(
      new PutDatasetVersionAnnotationCommand({
        datasetId,
        version: versionNumber,
        ...payload,
      }),
    );
  }

  async function getAnnotations() {
    const { annotations } = await send(new GetDatasetVersionCommand({ datasetId, version: String(version) }));
    expect(annotations).toBeDefined();
    expect(annotations).toHaveLength(2);

    return annotations!;
  }

  async function deleteAnnotation({ name }: AnnotationPayload) {
    await send(new DeleteDatasetVersionAnnotationCommand({ datasetId, version, annotationName: name }));
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
      putAnnotation({ name: stringSchemaRequest.name, value: { stringValue: 'value-no-in-enum' } }),
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

    const datasetVersion = await send(new GetDatasetVersionCommand({ datasetId, version: String(version) }));
    expect(datasetVersion.annotations).toHaveLength(0);
  });

  describe('Delete Dataset Version Annotation Error Paths', () => {
    let validDatasetId: string;
    const validVersion = 1;
    let validAnnotationName: string;

    beforeEach(async () => {
      ({ datasetId: validDatasetId } = await createDummyDataset());
      await createDummyTestCases(validDatasetId, 2);
      await send(new CreateDatasetVersionCommand({ datasetId: validDatasetId }));
      await waitUntilDatasetIsActive(validDatasetId);

      validAnnotationName = numberSchemaRequest.name;
      await send(
        new PutDatasetVersionAnnotationCommand({
          datasetId: validDatasetId,
          version: validVersion,
          name: validAnnotationName,
          value: { numericValue: 123 },
          comment: 'test annotation',
        }),
      );
    });

    test('should throw ResourceNotFoundException with non-existent datasetId', async () => {
      const nonExistentDatasetId = 'non-existent-dataset-id';

      await expect(
        send(
          new DeleteDatasetVersionAnnotationCommand({
            datasetId: nonExistentDatasetId,
            version: validVersion,
            annotationName: validAnnotationName,
          }),
        ),
      ).rejects.toThrow(ResourceNotFoundException);
    });

    test('should throw ResourceNotFoundException with non-existent version', async () => {
      const nonExistentVersion = 999; // A version that doesn't exist

      await expect(
        send(
          new DeleteDatasetVersionAnnotationCommand({
            datasetId: validDatasetId,
            version: nonExistentVersion,
            annotationName: validAnnotationName,
          }),
        ),
      ).rejects.toThrow(ResourceNotFoundException);
    });

    test('should return 204 with non-existent annotationName', async () => {
      const nonExistentAnnotationName = 'non-existent-annotation-name';

      const response = await send(
        new DeleteDatasetVersionAnnotationCommand({
          datasetId: validDatasetId,
          version: validVersion,
          annotationName: nonExistentAnnotationName,
        }),
      );

      expect(response.$metadata.httpStatusCode).toBe(204);
    });

    test('should throw Error with malformed datasetId', async () => {
      const malformedDatasetId = ''; // Empty string as malformed ID

      await expect(
        send(
          new DeleteDatasetVersionAnnotationCommand({
            datasetId: malformedDatasetId,
            version: validVersion,
            annotationName: validAnnotationName,
          }),
        ),
      ).rejects.toThrow(/Invalid value for path parameter: datasetId/);
    });

    test('should throw ValidationException with invalid version number', async () => {
      const invalidVersion = -1; // Negative version number should be invalid

      await expect(
        send(
          new DeleteDatasetVersionAnnotationCommand({
            datasetId: validDatasetId,
            version: invalidVersion,
            annotationName: validAnnotationName,
          }),
        ),
      ).rejects.toThrow(ValidationException);
    });

    test('should throw Error with malformed annotationName', async () => {
      const malformedAnnotationName = ''; // Empty string as malformed name

      await expect(
        send(
          new DeleteDatasetVersionAnnotationCommand({
            datasetId: validDatasetId,
            version: validVersion,
            annotationName: malformedAnnotationName,
          }),
        ),
      ).rejects.toThrow(/No method found matching route/);
    });
  });

  describe('Put Dataset Version Annotation Error Paths', () => {
    let validDatasetId: string;
    const validVersion = 1;
    const validAnnotationName = numberSchemaRequest.name;
    const validAnnotationValue = { numericValue: 123 };
    const validComment = 'test annotation';

    beforeEach(async () => {
      ({ datasetId: validDatasetId } = await createDummyDataset());
      await createDummyTestCases(validDatasetId, 2);
      await send(new CreateDatasetVersionCommand({ datasetId: validDatasetId }));
      await waitUntilDatasetIsActive(validDatasetId);
    });

    test('should throw ResourceNotFoundException with non-existent datasetId', async () => {
      const nonExistentDatasetId = 'non-existent-dataset-id';

      await expect(
        send(
          new PutDatasetVersionAnnotationCommand({
            datasetId: nonExistentDatasetId,
            version: validVersion,
            name: validAnnotationName,
            value: validAnnotationValue,
            comment: validComment,
          }),
        ),
      ).rejects.toThrow(ResourceNotFoundException);
    });

    test('should throw ResourceNotFoundException with non-existent version', async () => {
      const nonExistentVersion = 999; // A version that doesn't exist

      await expect(
        send(
          new PutDatasetVersionAnnotationCommand({
            datasetId: validDatasetId,
            version: nonExistentVersion,
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
          new PutDatasetVersionAnnotationCommand({
            datasetId: validDatasetId,
            version: validVersion,
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
          new PutDatasetVersionAnnotationCommand({
            datasetId: malformedDatasetId,
            version: validVersion,
            name: validAnnotationName,
            value: validAnnotationValue,
            comment: validComment,
          }),
        ),
      ).rejects.toThrow(/Invalid value for path parameter: datasetId/);
    });

    test('should throw ValidationException with invalid version number', async () => {
      const invalidVersion = -1; // Negative version number should be invalid

      await expect(
        send(
          new PutDatasetVersionAnnotationCommand({
            datasetId: validDatasetId,
            version: invalidVersion,
            name: validAnnotationName,
            value: validAnnotationValue,
            comment: validComment,
          }),
        ),
      ).rejects.toThrow(ValidationException);
    });

    test('should throw ValidationException with malformed annotation name', async () => {
      const malformedAnnotationName = ''; // Empty string as malformed name

      await expect(
        send(
          new PutDatasetVersionAnnotationCommand({
            datasetId: validDatasetId,
            version: validVersion,
            name: malformedAnnotationName,
            value: validAnnotationValue,
            comment: validComment,
          }),
        ),
      ).rejects.toThrow(ValidationException);
    });

    test('should throw ValidationException with missing value', async () => {
      await expect(
        send(
          new PutDatasetVersionAnnotationCommand({
            datasetId: validDatasetId,
            version: validVersion,
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
          new PutDatasetVersionAnnotationCommand({
            datasetId: validDatasetId,
            version: validVersion,
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
          new PutDatasetVersionAnnotationCommand({
            datasetId: validDatasetId,
            version: validVersion,
            name: validAnnotationName,
            value: validAnnotationValue,
            comment: '',
          }),
        ),
      ).resolves.not.toThrow();
    });
  });

  test('Filtration', async () => {
    /**
     * - Create 3 versions
     * - Annotate them with different values (numbers and strings)
     *   - Numbers: 1, 2, 3
     *   - Strings: a, b, c
     * - Use filters to filter out needed versions
     *   - Filter using numbers: >= 2 -- should return versions 2 and 3
     *   - Filter using strings: one of (a, b) -- should return versions 1 and 2
     *   - Filter using both: >= 2 && one of (a, b) -- should return version 2 only
     */

    await send(new CreateDatasetVersionCommand({ datasetId }));
    await waitUntilDatasetIsActive(datasetId);

    await send(new CreateDatasetVersionCommand({ datasetId }));
    await waitUntilDatasetIsActive(datasetId);

    await Promise.all([
      // Annotate version 1 with number 1 and value 'a'
      putAnnotation({ name: numberSchemaRequest.name, value: { numericValue: 1 } }, 1),
      putAnnotation({ name: stringSchemaRequest.name, value: { stringValue: 'a' } }, 1),

      // Annotate version 2 with number 2 and value 'b'
      putAnnotation({ name: numberSchemaRequest.name, value: { numericValue: 2 } }, 2),
      putAnnotation({ name: stringSchemaRequest.name, value: { stringValue: 'b' } }, 2),

      // Annotate version 3 with number 3 and value 'c'
      putAnnotation({ name: numberSchemaRequest.name, value: { numericValue: 3 } }, 3),
      putAnnotation({ name: stringSchemaRequest.name, value: { stringValue: 'c' } }, 3),
    ]);

    // Filter based on number annotation: value >= 2
    const response1 = await send(
      new ListDatasetVersionsCommand({
        datasetId,
        filter: {
          condition: {
            numericCondition: {
              name: numberSchemaRequest.name,
              comparator: NumericLogicalComparator.GREATER_THAN_OR_EQUAL,
              value: 2,
            },
          },
        },
      }),
    );

    expect(response1.versions).toHaveLength(2);
    response1.versions.forEach((v) => expect([2, 3]).toContain(v.version));

    // Filter based on string annotation: value in ['a', 'b']
    const response2 = await send(
      new ListDatasetVersionsCommand({
        datasetId,
        filter: {
          or: [
            {
              condition: {
                stringEnumCondition: {
                  name: stringSchemaRequest.name,
                  comparator: StringEnumLogicalComparator.EQUAL_TO,
                  value: 'a',
                },
              },
            },
            {
              condition: {
                stringEnumCondition: {
                  name: stringSchemaRequest.name,
                  comparator: StringEnumLogicalComparator.EQUAL_TO,
                  value: 'b',
                },
              },
            },
          ],
        },
      }),
    );

    expect(response2.versions).toHaveLength(2);
    response2.versions.forEach((v) => expect([1, 2]).toContain(v.version));

    // Combine both filters: numberValue >= 2 && stringValue in ('a', 'b') -- should return version 2
    const response3 = (await send(
      new ListDatasetVersionsCommand({
        datasetId,
        filter: {
          and: [
            {
              condition: {
                numericCondition: {
                  name: numberSchemaRequest.name,
                  comparator: NumericLogicalComparator.GREATER_THAN_OR_EQUAL,
                  value: 2,
                },
              },
            },
            {
              or: [
                {
                  condition: {
                    stringEnumCondition: {
                      name: stringSchemaRequest.name,
                      comparator: StringEnumLogicalComparator.EQUAL_TO,
                      value: 'a',
                    },
                  },
                },
                {
                  condition: {
                    stringEnumCondition: {
                      name: stringSchemaRequest.name,
                      comparator: StringEnumLogicalComparator.EQUAL_TO,
                      value: 'b',
                    },
                  },
                },
              ],
            },
          ],
        },
      }),
    )) as ListDatasetVersionsResponse;

    expect(response3.versions).toHaveLength(1);
    expect(response3.versions[0]!.version).toEqual(2);
  });
});
