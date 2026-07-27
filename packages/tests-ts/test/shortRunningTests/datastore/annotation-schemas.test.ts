import {
  ArchiveAnnotationSchemaCommand,
  ConflictException,
  CreateAnnotationSchemaCommand,
  CreateAnnotationSchemaRequest,
  GetAnnotationSchemaCommand,
  ListAnnotationSchemasCommand,
  ResourceNotFoundException,
  ValidationException,
} from '@awssolutions/gen-ai-evaluation-toolkit-ts-client';
import { randomUUID } from 'crypto';
import { assertAnnotationSchema, cleanupDatasets, deleteAnnotationSchemaFromDDB, exhaust, send } from '../../helpers';

describe('Annotation Schemas', () => {
  afterAll(async () => {
    await cleanupDatasets();
  });

  describe('Create Annotation Schema Error Paths', () => {
    test('should throw ValidationException with missing name', async () => {
      const invalidRequest = {
        description: 'Missing name schema',
        valueType: { numericType: {} },
      };

      await expect(
        send(new CreateAnnotationSchemaCommand(invalidRequest as unknown as CreateAnnotationSchemaRequest)),
      ).rejects.toThrow(ValidationException);
    });

    test('should throw ValidationException with empty name', async () => {
      await expect(
        send(
          new CreateAnnotationSchemaCommand({
            name: '',
            description: 'Empty name schema',
            valueType: { numericType: {} },
          }),
        ),
      ).rejects.toThrow(ValidationException);
    });

    test('should throw ValidationException with missing valueType', async () => {
      const missingValueTypeRequest = {
        name: `TestMissingValueTypeSchema-${randomUUID()}`,
        description: 'Missing valueType schema',
      };

      await expect(
        send(new CreateAnnotationSchemaCommand(missingValueTypeRequest as unknown as CreateAnnotationSchemaRequest)),
      ).rejects.toThrow(ValidationException);
    });

    test('should reject an invalid valueType', async () => {
      const invalidRequest = {
        name: `TestInvalidValueTypeSchema-${randomUUID()}`,
        description: 'Invalid valueType schema',
        valueType: { invalidType: {} }, // This is not a valid valueType structure
      };

      // A malformed union variant is rejected; the client surfaces it as a generic error.
      await expect(
        send(new CreateAnnotationSchemaCommand(invalidRequest as unknown as CreateAnnotationSchemaRequest)),
      ).rejects.toThrow();
    });

    test('should accept empty string enum', async () => {
      const invalidRequest = {
        name: `TestEmptyEnumSchema-${randomUUID()}`,
        description: 'Empty enum schema',
        valueType: { stringType: { enum: [] } },
      };

      const response = await send(
        new CreateAnnotationSchemaCommand(invalidRequest as unknown as CreateAnnotationSchemaRequest),
      );
      expect(response.name).toBe(invalidRequest.name);
      expect(response.description).toBe(invalidRequest.description);
      await deleteAnnotationSchemaFromDDB(invalidRequest.name);
    });

    test('should throw ConflictException with duplicate schema name', async () => {
      const schemaName = `TestDuplicateSchema-${randomUUID()}`;
      await send(
        new CreateAnnotationSchemaCommand({
          name: schemaName,
          description: 'Original schema',
          valueType: { numericType: {} },
        }),
      );

      await expect(
        send(
          new CreateAnnotationSchemaCommand({
            name: schemaName,
            description: 'Duplicate schema',
            valueType: { numericType: {} },
          }),
        ),
      ).rejects.toThrow(ConflictException);
      await deleteAnnotationSchemaFromDDB(schemaName);
    });

    test('should handle minimum required fields', async () => {
      const schemaName = `TestMinimalSchema-${randomUUID()}`;

      await expect(
        send(
          new CreateAnnotationSchemaCommand({
            name: schemaName,
            valueType: { numericType: {} },
          }),
        ),
      ).resolves.not.toThrow();

      const schema = await send(new GetAnnotationSchemaCommand({ annotationName: schemaName }));
      expect(schema.name).toBe(schemaName);
      expect(schema.valueType.numericType).toBeDefined();
      expect(schema.description).toBeFalsy();
      await deleteAnnotationSchemaFromDDB(schemaName);
    });

    test('should handle special characters in name and description', async () => {
      const schemaName = `Test-Special_Chars.Schema_${randomUUID()}`;
      const specialDescription = 'Special chars: !@#$%^&*()_+-=[]{}|;:\'",.<>/?`~';

      await expect(
        send(
          new CreateAnnotationSchemaCommand({
            name: schemaName,
            description: specialDescription,
            valueType: { numericType: {} },
          }),
        ),
      ).resolves.not.toThrow();

      const schema = await send(new GetAnnotationSchemaCommand({ annotationName: schemaName }));
      expect(schema.name).toBe(schemaName);
      expect(schema.description).toBe(specialDescription);
      await deleteAnnotationSchemaFromDDB(schemaName);
    });

    test('should handle large string enum array', async () => {
      const schemaName = `TestLargeEnumSchema-${randomUUID()}`;
      const largeEnum = Array.from({ length: 100 }, (_, i) => `value${i}`);

      await expect(
        send(
          new CreateAnnotationSchemaCommand({
            name: schemaName,
            description: 'Large enum schema',
            valueType: { stringType: { enum: largeEnum } },
          }),
        ),
      ).resolves.not.toThrow();

      const schema = await send(new GetAnnotationSchemaCommand({ annotationName: schemaName }));
      expect(schema.name).toBe(schemaName);
      expect(schema.valueType.stringType?.enum).toHaveLength(largeEnum.length);
      await deleteAnnotationSchemaFromDDB(schemaName);
    });

    test('should handle creating multiple schemas in rapid succession', async () => {
      const schemaNames: string[] = [];
      const createPromises: Promise<unknown>[] = [];

      for (let i = 0; i < 5; i++) {
        const name = `TestParallelSchema${i}-${randomUUID()}`;
        schemaNames.push(name);
        createPromises.push(
          send(
            new CreateAnnotationSchemaCommand({
              name,
              description: `Parallel schema ${i}`,
              valueType: { numericType: {} },
            }),
          ),
        );
      }

      await expect(Promise.all(createPromises)).resolves.not.toThrow();

      for (const name of schemaNames) {
        const schema = await send(new GetAnnotationSchemaCommand({ annotationName: name }));
        expect(schema.name).toBe(name);
      }
      await Promise.all(schemaNames.map(name => deleteAnnotationSchemaFromDDB(name)));
    });
  });

  describe('Archive Annotation Schema Error Paths', () => {
    test('should throw ResourceNotFoundException with non-existent annotationName', async () => {
      const nonExistentAnnotationName = 'non-existent-annotation-name';

      await expect(
        send(new ArchiveAnnotationSchemaCommand({ annotationName: nonExistentAnnotationName })),
      ).rejects.toThrow(ResourceNotFoundException);
    });

    test('should reject a blank annotationName', async () => {
      const blankAnnotationName = ''; // Empty string as blank annotation name

      // Empty path labels are rejected server-side by the API Gateway request validator.
      await expect(
        send(new ArchiveAnnotationSchemaCommand({ annotationName: blankAnnotationName })),
      ).rejects.toThrow(/Invalid value for path parameter: annotationName/);
    });

    test('should handle archiving an already archived schema', async () => {
      const schemaName = `TestDoubleArchiveSchema-${randomUUID()}`;
      await send(
        new CreateAnnotationSchemaCommand({
          name: schemaName,
          description: 'Schema for double archive testing',
          valueType: { numericType: {} },
        }),
      );

      await send(new ArchiveAnnotationSchemaCommand({ annotationName: schemaName }));

      const afterFirstArchive = await send(new GetAnnotationSchemaCommand({ annotationName: schemaName }));
      expect(afterFirstArchive.isArchived).toBe(true);

      await expect(
        send(new ArchiveAnnotationSchemaCommand({ annotationName: schemaName })),
      ).resolves.not.toThrow();

      const afterSecondArchive = await send(new GetAnnotationSchemaCommand({ annotationName: schemaName }));
      expect(afterSecondArchive.isArchived).toBe(true);
      await deleteAnnotationSchemaFromDDB(schemaName);
    });

    test('should handle restoring an already restored schema', async () => {
      const schemaName = `TestDoubleRestoreSchema-${randomUUID()}`;
      await send(
        new CreateAnnotationSchemaCommand({
          name: schemaName,
          description: 'Schema for double restore testing',
          valueType: { numericType: {} },
        }),
      );

      const afterCreation = await send(new GetAnnotationSchemaCommand({ annotationName: schemaName }));
      expect(afterCreation.isArchived).toBe(false);

      await expect(
        send(new ArchiveAnnotationSchemaCommand({ annotationName: schemaName, restore: true })),
      ).resolves.not.toThrow();

      const afterSecondRestore = await send(new GetAnnotationSchemaCommand({ annotationName: schemaName }));
      expect(afterSecondRestore.isArchived).toBe(false);
      await deleteAnnotationSchemaFromDDB(schemaName);
    });

    test('should handle different schema types correctly', async () => {
      const numberSchemaName = `TestArchiveNumberSchema-${randomUUID()}`;
      const stringSchemaName = `TestArchiveStringSchema-${randomUUID()}`;

      await send(
        new CreateAnnotationSchemaCommand({
          name: numberSchemaName,
          description: 'Number schema for archive testing',
          valueType: { numericType: {} },
        }),
      );

      await send(
        new CreateAnnotationSchemaCommand({
          name: stringSchemaName,
          description: 'String schema for archive testing',
          valueType: { stringType: { enum: ['a', 'b', 'c'] } },
        }),
      );

      await Promise.all([
        send(new ArchiveAnnotationSchemaCommand({ annotationName: numberSchemaName })),
        send(new ArchiveAnnotationSchemaCommand({ annotationName: stringSchemaName })),
      ]);

      const [archivedNumberSchema, archivedStringSchema] = await Promise.all([
        send(new GetAnnotationSchemaCommand({ annotationName: numberSchemaName })),
        send(new GetAnnotationSchemaCommand({ annotationName: stringSchemaName })),
      ]);

      expect(archivedNumberSchema.isArchived).toBe(true);
      expect(archivedStringSchema.isArchived).toBe(true);

      await Promise.all([
        send(new ArchiveAnnotationSchemaCommand({ annotationName: numberSchemaName, restore: true })),
        send(new ArchiveAnnotationSchemaCommand({ annotationName: stringSchemaName, restore: true })),
      ]);

      const [restoredNumberSchema, restoredStringSchema] = await Promise.all([
        send(new GetAnnotationSchemaCommand({ annotationName: numberSchemaName })),
        send(new GetAnnotationSchemaCommand({ annotationName: stringSchemaName })),
      ]);

      expect(restoredNumberSchema.isArchived).toBe(false);
      expect(restoredStringSchema.isArchived).toBe(false);
      await Promise.all([deleteAnnotationSchemaFromDDB(numberSchemaName), deleteAnnotationSchemaFromDDB(stringSchemaName)]);
    });
  });

  describe('Get Annotation Schema Error Paths', () => {
    test('should throw ResourceNotFoundException with non-existent annotationName', async () => {
      const nonExistentAnnotationName = 'non-existent-annotation-name';

      await expect(send(new GetAnnotationSchemaCommand({ annotationName: nonExistentAnnotationName }))).rejects.toThrow(
        ResourceNotFoundException,
      );
    });

    test('should handle different schema types correctly', async () => {
      const numberSchemaName = `TestNumberSchema-${randomUUID()}`;
      const stringSchemaName = `TestStringSchema-${randomUUID()}`;

      await send(
        new CreateAnnotationSchemaCommand({
          name: numberSchemaName,
          description: 'Number schema for testing',
          valueType: { numericType: {} },
        }),
      );

      await send(
        new CreateAnnotationSchemaCommand({
          name: stringSchemaName,
          description: 'String schema for testing',
          valueType: { stringType: { enum: ['a', 'b', 'c'] } },
        }),
      );

      const numberSchema = await send(new GetAnnotationSchemaCommand({ annotationName: numberSchemaName }));
      expect(numberSchema.name).toBe(numberSchemaName);
      expect(numberSchema.valueType.numericType).toBeDefined();

      const stringSchema = await send(new GetAnnotationSchemaCommand({ annotationName: stringSchemaName }));
      expect(stringSchema.name).toBe(stringSchemaName);
      expect(stringSchema.valueType.stringType).toBeDefined();
      expect(stringSchema.valueType.stringType?.enum).toEqual(['a', 'b', 'c']);
      await Promise.all([deleteAnnotationSchemaFromDDB(numberSchemaName), deleteAnnotationSchemaFromDDB(stringSchemaName)]);
    });

    test('should handle archived schemas correctly', async () => {
      const schemaName = `TestArchiveSchema-${randomUUID()}`;
      await send(
        new CreateAnnotationSchemaCommand({
          name: schemaName,
          description: 'Schema for archive testing',
          valueType: { numericType: {} },
        }),
      );

      const beforeArchive = await send(new GetAnnotationSchemaCommand({ annotationName: schemaName }));
      expect(beforeArchive.isArchived).toBe(false);

      await send(new ArchiveAnnotationSchemaCommand({ annotationName: schemaName }));

      const afterArchive = await send(new GetAnnotationSchemaCommand({ annotationName: schemaName }));
      expect(afterArchive.isArchived).toBe(true);

      await send(new ArchiveAnnotationSchemaCommand({ annotationName: schemaName, restore: true }));

      const afterRestore = await send(new GetAnnotationSchemaCommand({ annotationName: schemaName }));
      expect(afterRestore.isArchived).toBe(false);
      await deleteAnnotationSchemaFromDDB(schemaName);
    });
  });

  describe('List Annotation Schemas Error Paths', () => {
    test('should handle fail on invalid maxResults parameter', async () => {
      await expect(send(new ListAnnotationSchemasCommand({ maxResults: -1 }))).rejects.toThrow(
        ValidationException
      );
    });

    test('should handle invalid nextToken parameter', async () => {
      const response = await send(new ListAnnotationSchemasCommand({ nextToken: 'invalid-token' }));
      expect(response.annotationSchemas).toBeDefined();
      expect(Array.isArray(response.annotationSchemas)).toBe(true);
    });

    test('should handle pagination correctly', async () => {
      const schemaNames: string[] = [];
      for (let i = 0; i < 5; i++) {
        const name = `TestPaginationSchema-${randomUUID()}`;
        schemaNames.push(name);
        await send(
          new CreateAnnotationSchemaCommand({
            name,
            description: `Pagination test schema ${i}`,
            valueType: { numericType: {} },
          }),
        );
      }

      const firstPage = await send(new ListAnnotationSchemasCommand({ maxResults: 2 }));
      expect(firstPage.annotationSchemas.length).toBeLessThanOrEqual(2);
      expect(firstPage.nextToken).toBeDefined();

      const secondPage = await send(
        new ListAnnotationSchemasCommand({ maxResults: 2, nextToken: firstPage.nextToken }),
      );
      expect(secondPage.annotationSchemas.length).toBeLessThanOrEqual(2);
      await Promise.all(schemaNames.map(name => deleteAnnotationSchemaFromDDB(name)));
    });

    test('should handle different schema types', async () => {
      const numberSchemaName = `TestNumberSchema-${randomUUID()}`;
      const stringSchemaName = `TestStringSchema-${randomUUID()}`;

      await send(
        new CreateAnnotationSchemaCommand({
          name: numberSchemaName,
          description: 'Number schema for testing',
          valueType: { numericType: {} },
        }),
      );

      await send(
        new CreateAnnotationSchemaCommand({
          name: stringSchemaName,
          description: 'String schema for testing',
          valueType: { stringType: { enum: ['a', 'b', 'c'] } },
        }),
      );

      const allSchemas = await exhaust(async (nextToken) => {
        const response = await send(new ListAnnotationSchemasCommand({ nextToken }));
        return { data: response.annotationSchemas, nextToken: response.nextToken };
      });
      const numberSchema = allSchemas.find((schema) => schema.name === numberSchemaName);
      const stringSchema = allSchemas.find((schema) => schema.name === stringSchemaName);

      expect(numberSchema).toBeDefined();
      expect(stringSchema).toBeDefined();
      expect(numberSchema?.valueType.numericType).toBeDefined();
      expect(stringSchema?.valueType.stringType).toBeDefined();
      await Promise.all([deleteAnnotationSchemaFromDDB(numberSchemaName), deleteAnnotationSchemaFromDDB(stringSchemaName)]);
    });
  });

  test('Annotation schema lifecycle', async () => {
    const numberSchemaRequest: CreateAnnotationSchemaRequest = {
      name: `TestNumberSchema-${randomUUID()}`,
      description: 'used for testing',
      valueType: { numericType: {} },
    };

    const stringSchemaRequest: CreateAnnotationSchemaRequest = {
      name: `TestStringSchema-${randomUUID()}`,
      description: 'used for testing',
      valueType: { stringType: { enum: ['a', 'b'] } },
    };

    const [numberSchema, stringSchema] = await Promise.all([
      send(new CreateAnnotationSchemaCommand(numberSchemaRequest)),
      send(new CreateAnnotationSchemaCommand(stringSchemaRequest)),
    ]);

    assertAnnotationSchema(numberSchema, { ...numberSchemaRequest, isArchived: false });
    assertAnnotationSchema(stringSchema, { ...stringSchemaRequest, isArchived: false });

    const schemasList = await send(new ListAnnotationSchemasCommand());
    expect(schemasList.annotationSchemas.length).toBeGreaterThanOrEqual(2);

    schemasList.annotationSchemas.forEach((schema) => {
      expect(schema.name).toBeDefined();
      expect(schema.valueType).toBeDefined();
    });

    let [gotNumberSchema, gotStringSchema] = await Promise.all([
      send(new GetAnnotationSchemaCommand({ annotationName: numberSchemaRequest.name })),
      send(new GetAnnotationSchemaCommand({ annotationName: stringSchemaRequest.name })),
    ]);

    assertAnnotationSchema(gotNumberSchema, numberSchema);
    assertAnnotationSchema(gotStringSchema, stringSchema);

    await Promise.all([
      send(new ArchiveAnnotationSchemaCommand({ annotationName: numberSchemaRequest.name })),
      send(new ArchiveAnnotationSchemaCommand({ annotationName: stringSchema.name })),
    ]);

    [gotNumberSchema, gotStringSchema] = await Promise.all([
      send(new GetAnnotationSchemaCommand({ annotationName: numberSchemaRequest.name })),
      send(new GetAnnotationSchemaCommand({ annotationName: stringSchemaRequest.name })),
    ]);

    assertAnnotationSchema(gotNumberSchema, { ...numberSchema, isArchived: true });
    assertAnnotationSchema(gotStringSchema, { ...stringSchema, isArchived: true });

    await Promise.all([
      send(new ArchiveAnnotationSchemaCommand({ annotationName: numberSchemaRequest.name, restore: true })),
      send(new ArchiveAnnotationSchemaCommand({ annotationName: stringSchema.name, restore: true })),
    ]);

    [gotNumberSchema, gotStringSchema] = await Promise.all([
      send(new GetAnnotationSchemaCommand({ annotationName: numberSchemaRequest.name })),
      send(new GetAnnotationSchemaCommand({ annotationName: stringSchemaRequest.name })),
    ]);

    assertAnnotationSchema(gotNumberSchema, numberSchema);
    assertAnnotationSchema(gotStringSchema, stringSchema);
    await Promise.all([deleteAnnotationSchemaFromDDB(numberSchemaRequest.name), deleteAnnotationSchemaFromDDB(stringSchemaRequest.name)]);
  });

  test('should not return archived schemas by default, but include them with includeArchived flag', async () => {
    const testId = `archived-filter-test-${randomUUID()}`;
    const activeAnnotationName = `active-annotation-${testId}`;
    const archivedAnnotationName = `archived-annotation-${testId}`;
    const annotationDescription = `Test annotation created by client tests - ${testId}`;

    try {
      await send(
        new CreateAnnotationSchemaCommand({
          name: activeAnnotationName,
          description: annotationDescription,
          valueType: { stringType: { enum: ['Good', 'Bad', 'Neutral'] } },
        }),
      );

      await send(
        new CreateAnnotationSchemaCommand({
          name: archivedAnnotationName,
          description: annotationDescription,
          valueType: { stringType: { enum: ['Good', 'Bad', 'Neutral'] } },
        }),
      );

      await send(new ArchiveAnnotationSchemaCommand({ annotationName: archivedAnnotationName }));

      const defaultResult = await exhaust(async (nextToken) => {
        const response = await send(new ListAnnotationSchemasCommand({ nextToken }));
        return { data: response.annotationSchemas, nextToken: response.nextToken };
      });

      const defaultSchemaNames = defaultResult.map((schema) => schema.name);
      expect(defaultSchemaNames).toContain(activeAnnotationName);
      expect(defaultSchemaNames).not.toContain(archivedAnnotationName);

      const allResult = await exhaust(async (nextToken) => {
        const response = await send(new ListAnnotationSchemasCommand({ nextToken, includeArchived: true }));
        return { data: response.annotationSchemas, nextToken: response.nextToken };
      });

      const allSchemaNames = allResult.map((schema) => schema.name);
      expect(allSchemaNames).toContain(activeAnnotationName);
      expect(allSchemaNames).toContain(archivedAnnotationName);
    } finally {
      await Promise.all([
        deleteAnnotationSchemaFromDDB(activeAnnotationName).catch(() => {}),
        deleteAnnotationSchemaFromDDB(archivedAnnotationName).catch(() => {}),
      ]);
    }
  });
});
