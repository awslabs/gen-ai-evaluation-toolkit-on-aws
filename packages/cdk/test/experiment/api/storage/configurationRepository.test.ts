import { z } from 'zod';
import {
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { EnvVariable } from '@common/config';
import { getEnvVariable } from '@common';
import { getS3Client } from '@common/api/utils/s3';
import { ConfigurationRepository } from '@experiment/api/storage/configurationRepository';
import { ConditionExpression } from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import { matchesMetadataFilters } from '@experiment/api/utils/metadataFilter';
import {
  logErrorAndThrowResourceNotFound,
  logErrorAndThrowConflict,
  logErrorAndThrowValidation,
} from '@common/api/exceptions/serviceExceptions';
import { HandlerContext } from '@common/api/apiGateway';

const s3SendMock = jest.fn();

jest.mock('@experiment/api/utils/metadataFilter');
jest.mock('@common');
jest.mock('@common/api/utils/s3');
jest.mock('@common/api/exceptions/serviceExceptions', () => ({
  logErrorAndThrowResourceNotFound: jest.fn(),
  logErrorAndThrowConflict: jest.fn(),
  logErrorAndThrowValidation: jest.fn(),
}));

const mockS3ServiceException = (name: string): S3ServiceException => {
  const error = new S3ServiceException({
    name,
    $fault: 'server',
    message: `Mock ${name} error`,
    $metadata: {},
  });
  error.name = name;
  return error;
};

describe('ConfigurationRepository', () => {
  const mockNow = new Date('2024-01-01T12:00:00Z');
  const context: HandlerContext = { user: 'user-name', requestTime: mockNow };

  const testSchema = z.object({
    name: z.string(),
    version: z.number().optional(),
    content: z.string(),
  });

  type TestConfig = z.infer<typeof testSchema>;

  const matchesMetadataFiltersMock = jest.mocked(matchesMetadataFilters);
  const getEnvVariableMock = jest.mocked(getEnvVariable);
  const getS3ClientMock = jest.mocked(getS3Client);
  const logErrorAndThrowResourceNotFoundMock = jest.mocked(logErrorAndThrowResourceNotFound);
  const logErrorAndThrowConflictMock = jest.mocked(logErrorAndThrowConflict);
  const logErrorAndThrowValidationMock = jest.mocked(logErrorAndThrowValidation);

  let repository: ConfigurationRepository<TestConfig>;
  const bucketPrefix = 'test-prefix';

  const testConfig: TestConfig = {
    name: 'test-config',
    content: 'test-content',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    s3SendMock.mockReset();
    matchesMetadataFiltersMock.mockReset();
    repository = new ConfigurationRepository(testSchema, bucketPrefix);
    getEnvVariableMock.mockImplementation(
      <T extends string | ((env: typeof EnvVariable) => string)>(envVar: T): string => {
        if (envVar === EnvVariable.S3_BUCKET_NAME) {
          return 'test-bucket';
        }
        throw Error(`Env variable ${String(envVar)} is not set up.`);
      },
    );
    getS3ClientMock.mockImplementation(
      () =>
        ({
          send: s3SendMock,
        }) as unknown as S3Client,
    );
    logErrorAndThrowResourceNotFoundMock.mockImplementation(({ externalMessage }) => {
      throw new Error(externalMessage);
    });
    logErrorAndThrowConflictMock.mockImplementation(({ externalMessage }) => {
      throw new Error(externalMessage);
    });
    logErrorAndThrowValidationMock.mockImplementation(({ externalMessage }) => {
      throw new Error(externalMessage);
    });
  });

  describe('create', () => {
    it('should create a new configuration with version 1', async () => {
      s3SendMock.mockImplementation((command) => {
        if (command instanceof PutObjectCommand) {
          return Promise.resolve({ ETag: '"123456789"' });
        }
        return Promise.resolve({});
      });

      const result = await repository.create(testConfig, context);

      expect(result).toEqual({
        ...testConfig,
        createdAt: context.requestTime,
        createdBy: context.user,
        lastUpdatedAt: context.requestTime,
        lastUpdatedBy: context.user,
        version: 1,
      });
      expect(s3SendMock).toHaveBeenCalledTimes(2); // Two S3 calls for version 1 and latest
      expect(s3SendMock).toHaveBeenCalledWith(expect.any(PutObjectCommand));
    });

    it('should throw conflict error when configuration already exists', async () => {
      const preconditionFailedError = mockS3ServiceException('PreconditionFailed');
      s3SendMock.mockRejectedValue(preconditionFailedError);

      await expect(repository.create(testConfig, context)).rejects.toThrow(
        `Configuration with name '${testConfig.name}' already exists`,
      );
    });

    it('should rethrow unknown errors', async () => {
      const unknownError = new Error('Unknown error');
      s3SendMock.mockRejectedValue(unknownError);

      await expect(repository.create(testConfig, context)).rejects.toThrow(unknownError);
    });
  });

  describe('update', () => {
    const mockEarlier = new Date('2023-01-01T12:00:00Z');
    const previousUser = 'previous-user';

    const mockConfig: TestConfig & {
      createdAt: Date;
      createdBy?: string;
      lastUpdatedAt: Date;
      lastUpdatedBy?: string;
    } = {
      ...testConfig,
      version: 1,
      content: 'previous-content',
      createdAt: mockEarlier,
      createdBy: previousUser,
      lastUpdatedAt: mockEarlier,
      lastUpdatedBy: previousUser,
    };

    const mockETag = '"123456789"';

    it('should update an existing configuration and increment version', async () => {
      s3SendMock.mockImplementation((command) => {
        if (command instanceof GetObjectCommand) {
          return Promise.resolve({
            Body: {
              transformToString: jest.fn().mockResolvedValue(JSON.stringify(mockConfig)),
            },
            ETag: mockETag,
          });
        }

        if (command instanceof PutObjectCommand) return Promise.resolve({ ...command });
        return Promise.resolve({});
      });

      const updateData = {
        name: 'test-config',
        content: 'updated-content',
      };

      const result = await repository.update(updateData, context);

      expect(result).toEqual(
        expect.objectContaining({
          ...mockConfig,
          content: 'updated-content',
          createdAt: mockEarlier,
          createdBy: previousUser,
          lastUpdatedAt: context.requestTime,
          lastUpdatedBy: context.user,
          version: 2,
        }),
      );

      expect(s3SendMock).toHaveBeenCalledTimes(3); // One get and two puts

      const putCallArgs = s3SendMock.mock.calls.filter((call) => call[0] instanceof PutObjectCommand);
      expect(putCallArgs[0][0].input.IfNoneMatch).toBe('*'); // exact version
      expect(putCallArgs[1][0].input.IfMatch).toBe(mockETag); // latest
    });

    it('should merge fields specified in options', async () => {
      // Create repository with merge fields
      type Config = TestConfig & { metadata: Record<string, unknown> };
      const extendedSchema = testSchema.extend({ metadata: z.record(z.unknown()) });

      const repoWithMerge = new ConfigurationRepository(extendedSchema, bucketPrefix, {
        mergeFields: ['metadata'],
      });

      const existingConfig: Config = {
        ...mockConfig,
        metadata: { key1: 'value1', key2: 'value2' },
      };

      s3SendMock.mockImplementationOnce((command) => {
        if (command instanceof GetObjectCommand) {
          return Promise.resolve({
            Body: {
              transformToString: jest.fn().mockResolvedValue(JSON.stringify(existingConfig)),
            },
            ETag: mockETag,
          });
        }
        return Promise.resolve({});
      });

      s3SendMock.mockResolvedValue({});

      const updateData = {
        name: 'test-config',
        metadata: { key2: 'updated', key3: 'new-value' },
      };

      const result = await repoWithMerge.update(updateData, context);

      expect(result.metadata).toEqual({
        key1: 'value1',
        key2: 'updated',
        key3: 'new-value',
      });
    });

    it('should throw not found error when configuration does not exist during update', async () => {
      s3SendMock.mockImplementationOnce((command) => {
        if (command instanceof GetObjectCommand) {
          return Promise.resolve({
            Body: {
              transformToString: jest.fn().mockResolvedValue(JSON.stringify(mockConfig)),
            },
            ETag: mockETag,
          });
        }
        return Promise.resolve({});
      });

      const noSuchKeyError = new NoSuchKey({
        message: 'The specified key does not exist.',
        $metadata: {},
      });
      s3SendMock.mockRejectedValue(noSuchKeyError);

      await expect(repository.update({ name: 'non-existent', content: 'new' }, context)).rejects.toThrow(
        `Configuration with type name 'non-existent' and version 'undefined' can not be found`,
      );
    });

    it('should throw conflict error when concurrent update detected', async () => {
      s3SendMock.mockImplementationOnce((command) => {
        if (command instanceof GetObjectCommand) {
          return Promise.resolve({
            Body: {
              transformToString: jest.fn().mockResolvedValue(JSON.stringify(mockConfig)),
            },
            ETag: mockETag,
          });
        }
        return Promise.resolve({});
      });

      const preconditionFailedError = mockS3ServiceException('PreconditionFailed');
      s3SendMock.mockRejectedValue(preconditionFailedError);

      await expect(repository.update({ name: 'test-config', content: 'new' }, context)).rejects.toThrow(
        "ETag of latest configuration with name 'test-config' did not match",
      );
    });

    it('should throw on unexpected errors', async () => {
      s3SendMock.mockImplementationOnce((command) => {
        if (command instanceof GetObjectCommand) {
          return Promise.resolve({
            Body: {
              transformToString: jest.fn().mockResolvedValue(JSON.stringify(mockConfig)),
            },
            ETag: mockETag,
          });
        }
        return Promise.resolve({});
      });

      const error = new Error('Some error');
      s3SendMock.mockRejectedValue(error);

      await expect(repository.update({ name: 'test-config', content: 'new' }, context)).rejects.toThrow(error);
    });
  });

  describe('get', () => {
    const mockConfig: TestConfig & {
      createdAt: string;
      createdBy?: string;
      lastUpdatedAt: string;
      lastUpdatedBy?: string;
    } = {
      ...testConfig,
      version: 1,
      createdAt: context.requestTime,
      createdBy: context.user,
      lastUpdatedAt: context.requestTime,
      lastUpdatedBy: context.user,
    };

    const mockETag = '"123456789"';

    it('should get configuration by name and version', async () => {
      s3SendMock.mockImplementation((command) => {
        if (command instanceof GetObjectCommand) {
          return Promise.resolve({
            Body: {
              transformToString: jest.fn().mockResolvedValue(JSON.stringify(mockConfig)),
            },
            ETag: mockETag,
          });
        }
        return Promise.resolve({});
      });

      const result = await repository.get({ name: 'test-config', version: 1 });

      expect(result).toEqual({
        config: mockConfig,
        etag: mockETag,
      });

      expect(s3SendMock).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            Bucket: 'test-bucket',
            Key: 'test-prefix/test-config/1.json',
          }),
        }),
      );
    });

    it('should use "latest" when version is not specified', async () => {
      s3SendMock.mockImplementation((command) => {
        if (command instanceof GetObjectCommand) {
          return Promise.resolve({
            Body: {
              transformToString: jest.fn().mockResolvedValue(JSON.stringify(mockConfig)),
            },
            ETag: mockETag,
          });
        }
        return Promise.resolve({});
      });

      await repository.get({ name: 'test-config' });

      expect(s3SendMock).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            Key: 'test-prefix/latest/test-config.json',
          }),
        }),
      );
    });

    it('should throw not found error when configuration does not exist', async () => {
      const noSuchKeyError = new NoSuchKey({
        message: 'The specified key does not exist.',
        $metadata: {},
      });
      s3SendMock.mockRejectedValue(noSuchKeyError);

      await expect(repository.get({ name: 'non-existent' })).rejects.toThrow(
        "Configuration with type name 'non-existent' and version 'undefined' can not be found",
      );
    });

    it('should throw validation error when configuration is invalid', async () => {
      // Return invalid data that won't pass schema validation
      s3SendMock.mockImplementation(() => {
        return Promise.resolve({
          Body: {
            transformToString: jest.fn().mockResolvedValue(
              JSON.stringify({
                name: 123, // name should be string but is a number
                content: 'test-content',
                createdAt: mockNow,
              }),
            ),
          },
          ETag: mockETag,
        });
      });

      await expect(repository.get({ name: 'test-config' })).rejects.toThrow(/Expected string/); // Zod error for invalid type
    });
  });

  describe('list', () => {
    function mockListResponse(
      ...items: {
        name: string;
        version?: number;
        createdby?: string;
        createdat?: string;
        lastupdatedby?: string;
        lastupdatedat?: string;
      }[]
    ) {
      const headResponses = Object.fromEntries(
        items.map((item) => [
          `${item.name}/${item.version}`,
          {
            version: 1,
            createdby: 'me',
            createdat: mockNow.valueOf(),
            lastupdatedby: 'me',
            lastupdatedat: mockNow.valueOf(),
            ...item,
          },
        ]),
      );
      s3SendMock.mockImplementation((command) => {
        if (command instanceof ListObjectsV2Command) {
          return {
            Contents: items.map((item) => ({ Key: `${item.name}/${item.version}` })),
          };
        }
        if (command instanceof HeadObjectCommand) {
          console.log(`Retrieve metadata with key ${command.input.Key!}`);
          return {
            Metadata: headResponses[command.input.Key!],
          };
        }
        throw new Error(`${command} is not implemented`);
      });
    }

    it('should list configurations with prefix', async () => {
      mockListResponse({ name: 'one', version: 1 }, { name: 'two', version: 20 });

      matchesMetadataFiltersMock.mockImplementation(() => true);

      const result = await repository.list({ name: 'config' });

      expect(result.items).toHaveLength(2);
      expect(result.items).toEqual(
        expect.arrayContaining([
          { name: 'one', version: 1 },
          { name: 'two', version: 20 },
        ]),
      );
    });

    it('should return empty array when no configurations found', async () => {
      mockListResponse();

      const result = await repository.list({ name: 'non-existent' });

      expect(result.items).toEqual([]);
    });

    it('should filter configurations based on metadata', async () => {
      mockListResponse({ name: 'one', version: 1 }, { name: 'two', version: 20 });

      matchesMetadataFiltersMock.mockImplementation(
        (metadata: Record<string, string> | undefined) => metadata?.name === 'one',
      );

      const mockFilter = {} as ConditionExpression;

      const result = await repository.list({ filter: mockFilter });

      expect(matchesMetadataFiltersMock).toHaveBeenCalledTimes(2);
      expect(result.items).toEqual([{ name: 'one', version: 1 }]);
    });

    it('should ignore files that are deleted', async () => {
      s3SendMock.mockImplementation((command) => {
        if (command instanceof ListObjectsV2Command) {
          return Promise.resolve({
            Contents: [{ Key: 'test-prefix/config-1/1.json' }, { Key: 'test-prefix/config-2/1.json' }],
          });
        } else if (command instanceof HeadObjectCommand) {
          throw new NoSuchKey({
            message: 'The specified key does not exist.',
            $metadata: {},
          });
        }
        return Promise.resolve({});
      });

      matchesMetadataFiltersMock.mockImplementation(
        (metadata: Record<string, string> | undefined) => metadata?.name === 'config-1',
      );

      const mockFilter = {} as ConditionExpression;

      const result = await repository.list({ filter: mockFilter });

      expect(matchesMetadataFiltersMock).toHaveBeenCalledTimes(0);
      expect(result.items).toEqual([]);
    });

    it('should ignore files that throw random errors on retrieval', async () => {
      s3SendMock.mockImplementation((command) => {
        if (command instanceof ListObjectsV2Command) {
          return Promise.resolve({
            Contents: [{ Key: 'test-prefix/config-1/1.json' }, { Key: 'test-prefix/config-2/1.json' }],
          });
        } else if (command instanceof HeadObjectCommand) {
          throw new Error('Unexpected error');
        }
        return Promise.resolve({});
      });

      matchesMetadataFiltersMock.mockImplementation(
        (metadata: Record<string, string> | undefined) => metadata?.name === 'config-1',
      );

      const mockFilter = {} as ConditionExpression;

      const result = await repository.list({ filter: mockFilter });

      expect(matchesMetadataFiltersMock).toHaveBeenCalledTimes(0);
      expect(result.items).toEqual([]);
    });

    it('should skip files with missing name', async () => {
      // @ts-expect-error command type mismatch
      mockListResponse({ name: null, version: 1 }, { name: 'two', version: 20 });

      const result = await repository.list({});

      expect(result.items.length).toBe(1);
    });

    it('should skip files with missing version', async () => {
      // @ts-expect-error command type mismatch
      mockListResponse({ name: 'one', version: null }, { name: 'two', version: 20 });

      const result = await repository.list({});

      expect(result.items.length).toBe(1);
    });

    it('should skip invalid files', async () => {
      s3SendMock.mockImplementation((command) => {
        if (command instanceof ListObjectsV2Command) {
          return Promise.resolve({
            Contents: [{ Key: 'invalid' }],
          });
        } else if (command instanceof HeadObjectCommand) {
          return Promise.resolve({ Metadata: {} });
        }
        return Promise.resolve({});
      });

      matchesMetadataFiltersMock.mockImplementation(() => true);

      const result = await repository.list({});

      expect(result.items.length).toBe(0);
    });

    it('should include continuation token when more results available', async () => {
      s3SendMock.mockImplementation((command) => {
        if (command instanceof ListObjectsV2Command) {
          return Promise.resolve({
            Contents: [{ Key: 'test-prefix/config-1/1.json' }],
            NextContinuationToken: 'next-token',
          });
        } else if (command instanceof HeadObjectCommand) {
          return Promise.resolve({ Metadata: {} });
        }
        return Promise.resolve({});
      });

      matchesMetadataFiltersMock.mockImplementation(() => true);

      const result = await repository.list({});

      expect(result.continuationToken).toBe('next-token');
    });

    it('should throw validation error when S3 ListObjectsV2 fails with InvalidArgument', async () => {
      const invalidArgumentError = mockS3ServiceException('InvalidArgument');
      s3SendMock.mockRejectedValue(invalidArgumentError);

      await expect(repository.list({ name: 'test-config' })).rejects.toThrow(
        'Argument Exception while requesting S3 ListObjectsV2.',
      );

      expect(logErrorAndThrowValidationMock).toHaveBeenCalledWith(
        expect.objectContaining({
          externalMessage: 'Argument Exception while requesting S3 ListObjectsV2.',
          internalMessage: expect.stringContaining('Invalid command payload'),
          sourceException: invalidArgumentError,
        }),
      );
    });
  });
});
