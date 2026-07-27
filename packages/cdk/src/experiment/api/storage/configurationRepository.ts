import {
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  ListObjectsV2CommandOutput,
  NoSuchKey,
  PutObjectCommand,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { EnvVariable } from '@common/config';
import { getEnvVariable } from '@common';
import { getS3Client } from '@common/api/utils/s3';
import {
  logErrorAndThrowConflict,
  logErrorAndThrowResourceNotFound,
  logErrorAndThrowValidation,
} from '@common/api/exceptions/serviceExceptions';
import { z } from 'zod';
import { log } from '@src/common/api/utils';
import { ConditionExpression, ResourceNotFoundException } from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import { HandlerContext } from '@common/api/apiGateway';
import { matchesMetadataFilters } from '@experiment/api/utils/metadataFilter';
import assert from 'assert';

type ModelOf<Shape extends z.ZodRawShape> = z.infer<z.ZodObject<Shape>>;
type MetadataModel = ModelOf<typeof metadataSchema.shape>;

type ValueAccessor<T> = ((src: T | undefined) => string | undefined) | (keyof T & string);

export type CreateOptions<Model> = {
  customMetadataFields: Record<string, ValueAccessor<Model>>;
  mergeFields: (keyof Model)[];
};

type ConfigWithETag<T> = {
  config: T;
  etag: string;
};

type Paginated<T> = {
  items: T[];
  continuationToken?: string;
};

type MetadataKeys = keyof typeof metadataSchema.shape;

type ConfigurationId = { name: string; version?: number };

const baseMetadataFields: Record<MetadataKeys, ValueAccessor<MetadataModel>> = {
  name: 'name',
  version: 'version',
  createdAt: (input) => (input ? String(input.createdAt.valueOf()) : undefined),
  createdBy: 'createdBy',
  lastUpdatedAt: (input) => (input ? String(input.lastUpdatedAt.valueOf()) : undefined),
  lastUpdatedBy: 'lastUpdatedBy',
};

const metadataSchema = z.object({
  name: z.string(),
  version: z.number({ coerce: true }).min(1),
  createdBy: z.string().optional(),
  createdAt: z.union([z.date({ coerce: true }), z.number({ coerce: true }).transform((n) => new Date(n))]),
  lastUpdatedBy: z.string().optional(),
  lastUpdatedAt: z.union([z.date({ coerce: true }), z.number({ coerce: true }).transform((n) => new Date(n))]),
});

export class ConfigurationRepository<Model extends ConfigurationId> {
  private readonly latestTag = 'latest';
  private readonly bucketName: string;
  private readonly modelSchema: z.ZodType<Model>;
  private readonly bucketPrefix: string;
  private readonly options: CreateOptions<Model & MetadataModel>;

  constructor(schema: z.ZodType<Model>, bucketPrefix: string, options?: Partial<CreateOptions<Model & MetadataModel>>) {
    this.modelSchema = schema;
    this.bucketPrefix = bucketPrefix;

    this.options = {
      mergeFields: options?.mergeFields ?? [],
      customMetadataFields: options?.customMetadataFields ?? {},
    };

    this.bucketName = getEnvVariable(EnvVariable.S3_BUCKET_NAME);
  }

  async create(config: Model, context: HandlerContext): Promise<Model> {
    const version = 1;
    const storedConfig: Model & MetadataModel = {
      ...config,
      version: version,
      createdAt: context.requestTime,
      createdBy: context.user,
      lastUpdatedAt: context.requestTime,
      lastUpdatedBy: context.user,
    };

    try {
      return await this.set(storedConfig);
    } catch (error) {
      if (error instanceof S3ServiceException && error.name === 'PreconditionFailed') {
        logErrorAndThrowConflict({
          externalMessage: `Configuration with name '${config.name}' already exists. Use update to modify existing configurations.`,
        });
      }
      throw error;
    }
  }

  async update(config: Partial<Model> & ConfigurationId, context: HandlerContext): Promise<Model & MetadataModel> {
    log.info('Updating configuration', config);

    const previous = await this.get({ name: config.name, version: config.version });

    log.info('Previous configuration', previous);

    if (this.options.mergeFields.length > 0) log.info('Merging fields:', { mergeFields: this.options.mergeFields });

    const updatedConfig: Model & MetadataModel = {
      ...previous.config,
      ...config,
      ...Object.fromEntries(
        this.options.mergeFields.map((field) => [
          field,
          {
            ...(field in previous.config ? (previous.config[field as keyof Model & MetadataModel] ?? {}) : {}),
            ...(field in config ? (config[field as keyof Model] ?? {}) : {}),
          },
        ]),
      ),
      version: previous.config.version + 1,
      lastUpdatedAt: context.requestTime,
      lastUpdatedBy: context.user,
    };

    log.info('Updated configuration', { updatedConfig });

    try {
      return await this.set(updatedConfig, previous.etag);
    } catch (error) {
      if (error instanceof NoSuchKey || error instanceof ResourceNotFoundException) {
        logErrorAndThrowResourceNotFound({
          externalMessage: `Configuration with type name '${config.name}' and version '${config.version}' can not be found`,
        });
      }
      if (error instanceof S3ServiceException && error.name === 'PreconditionFailed') {
        logErrorAndThrowConflict({
          externalMessage: `ETag of latest configuration with name '${config.name}' did not match. Configuration was updated concurrently.`,
        });
      }
      throw error;
    }
  }

  async get({ name, version }: ConfigurationId): Promise<ConfigWithETag<Model & MetadataModel>> {
    log.info(`Retrieving configuration with name '${name}' and version '${version}'`);

    try {
      const key = this.getPath({ name, version });

      log.info(`Performing GetObject with Bucket '${this.bucketName}' and key '${key}'`);

      const response = await getS3Client().send(
        new GetObjectCommand({
          Bucket: this.bucketName,
          Key: key,
        }),
      );

      const body = await response.Body?.transformToString();
      assert(body, 'No body in payload of S3 GetObjectCommand');

      const etag = response.ETag;
      assert(etag, 'No etag in payload of S3 GetObjectCommand');

      const parsed = JSON.parse(body);
      const parsedModel = this.modelSchema.parse(parsed);
      const parsedMetadata = metadataSchema.parse(parsed);

      const result: ConfigWithETag<Model & MetadataModel> = {
        config: {
          ...parsedModel,
          ...parsedMetadata,
        },
        etag: etag,
      };

      return result;
    } catch (error) {
      if (error instanceof NoSuchKey) {
        logErrorAndThrowResourceNotFound({
          externalMessage: `Configuration with type name '${name}' and version '${version}' can not be found`,
        });
      }
      throw error;
    }
  }

  async list({
    name,
    maxResults,
    filter,
    nextToken,
  }: {
    maxResults?: number;
    filter?: ConditionExpression;
    nextToken?: string;
    name?: string;
  }): Promise<Paginated<ConfigurationId>> {
    // We only retrieve latest - not versioned - configurations here.
    // Otherwise users would see all versions of one configurations before seeing the next configuration.
    // Effectively this behavior deduplicates configurations by name
    // More context in {this.getPath}

    const searchPrefix = `${this.bucketPrefix}/latest/${name ?? ''}`;

    log.info(`Listing configurations with prefix: ${searchPrefix}`);

    const listCommand = new ListObjectsV2Command({
      Bucket: this.bucketName,
      Prefix: searchPrefix,
      ContinuationToken: nextToken,
      MaxKeys: maxResults || 10,
    });

    let listResponse: ListObjectsV2CommandOutput;

    try {
      listResponse = await getS3Client().send(listCommand);
    } catch (error) {
      if (error instanceof S3ServiceException && error.name === 'InvalidArgument') {
        logErrorAndThrowValidation({
          externalMessage: `Argument Exception while requesting S3 ListObjectsV2.`,
          internalMessage: `Invalid command payload: ${JSON.stringify(listCommand)}`,
          sourceException: error,
        });
      }
      throw error;
    }

    if (!listResponse.Contents || listResponse.Contents.length === 0) {
      log.info('No configurations found', { listCommand });
      return {
        items: [],
        continuationToken: undefined,
      };
    }

    const configFiles = await Promise.all(
      listResponse.Contents.filter((item) => item.Key !== undefined).map(
        async (item) => await this.getMetadata(item.Key!).then((metadata) => ({ key: item.Key!, metadata: metadata })),
      ),
    );

    const validConfigFiles = configFiles
      .filter((item) => item.metadata)
      .map((item) => ({ key: item.key, metadata: item.metadata! }));

    log.info(`Found ${validConfigFiles.length} valid config files`);

    const filterResults = validConfigFiles.filter((config) => {
      if (!filter) return true;
      const match = matchesMetadataFilters(config.metadata, filter);
      if (!match) log.info('Item filtered out', { metadata: config.metadata, filter });
      return match;
    });

    const ids = filterResults.map((result) => ({
      name: result.metadata['name'],
      version: parseInt(result.metadata['version'], 10),
    }));

    log.info(`Successfully retrieved ${ids.length} configurations after filtering`);

    return {
      items: ids,
      continuationToken: listResponse.NextContinuationToken,
    };
  }

  private async getMetadata(key: string): Promise<Record<MetadataKeys, string> | undefined> {
    try {
      const headCommand = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const headResponse = await getS3Client().send(headCommand);

      const metadata = headResponse.Metadata;

      if (!metadata) {
        log.warn(`Metadata for file ${key} missing`, { headCommand, headResponse });
        return undefined;
      }

      const parsedMetadata: Partial<Record<MetadataKeys, string>> = {};

      for (const field of [...Object.keys(baseMetadataFields), ...Object.keys(this.options.customMetadataFields)]) {
        parsedMetadata[field as MetadataKeys] = metadata[field.toLowerCase()];
      }

      if (!metadataSchema.safeParse(parsedMetadata).success) {
        log.warn(`Metadata for file ${key} invalid`, { headCommand, headResponse, result: parsedMetadata });
        return undefined;
      }

      return parsedMetadata as Record<MetadataKeys, string>;
    } catch (error) {
      if (error instanceof NoSuchKey) {
        log.warn(`Configuration file ${key} not found, may have been deleted`, {
          bucketName: this.bucketName,
          key,
        });
      } else {
        log.error('Error retrieving metadata', { bucketName: this.bucketName, key, error });
      }
      return undefined;
    }
  }

  private async set(config: Model & MetadataModel, previousEtag?: string): Promise<Model & MetadataModel> {
    type VersionInformation = { versionNumber?: number; preconditions: Record<string, string> };

    const putObjectCommand = ({ versionNumber, preconditions }: VersionInformation) =>
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: this.getPath({ name: config.name, version: versionNumber }),
        Body: JSON.stringify(config),
        ContentType: 'application/json',
        Metadata: this.serializeMetadataFields(config),
        ...preconditions,
      });

    // All configurations are stored twice: 1. Once under their respective version string and 2. once as 'latest' tag.
    // You can only update a configuration by overwriting the latest tag file (if it exists) and by creating a new file
    // specific to that exact version that should not exist so far (as you create a new version of that file).
    // Given these requirements we can detect race conditions when users overwrite each others latest versions using
    // IfNoneMatch and IfMatch. However, there are no S3 transactions. So this is just best/minmal effort here:

    const versionInformations: VersionInformation[] = [
      {
        // exact version
        versionNumber: config.version,
        // an object with that exact version should not yet exist
        preconditions: { IfNoneMatch: '*' },
      },
      {
        // pseudo-version: 'latest' / undefined
        versionNumber: undefined,
        // an object with latest tag could exist, then it should match what we expect.
        // or this is version 1 and then it should not yet exist.
        preconditions: previousEtag ? { IfMatch: previousEtag } : { IfNoneMatch: '*' },
      },
    ];
    await Promise.all(
      versionInformations.map(async (version) => {
        const command = putObjectCommand(version);
        try {
          return await getS3Client().send(command);
        } catch (error) {
          log.error(
            `Error storing configuration with name '${config.name}' and version '${version}' in bucket '${command.input.Bucket}'`,
            { error, command },
          );
          throw error;
        }
      }),
    );

    return config;
  }

  private serializeMetadataFields(config: Model & MetadataModel): Record<string, string> {
    return Object.fromEntries(
      [...Object.entries(this.options.customMetadataFields), ...Object.entries(baseMetadataFields)]
        .map(([key, accessor]) => {
          const value = typeof accessor === 'function' ? accessor(config) : config[key as keyof Model & MetadataModel];

          if (!value) return undefined;

          return [key.toLowerCase(), String(value)];
        })
        .filter((e) => !!e),
    );
  }

  private getPath(id: ConfigurationId): string {
    /* 
        versioned files sit in:
         - s3://my-bucket/my-config/1.json
         - s3://my-bucket/my-config/2.json
         - s3://my-bucket/my-other-config/1.json
         - s3://my-bucket/my-other-config/2.json
        
        'latest' pseudo-versions sit in:
         - s3://my-bucket/latest/my-config.json
         - s3://my-bucket/latest/my-other-config.json

        This allows to GET/PATCH latest versions by omiting the version without including them in LIST operations
         */
    if (id.version) return `${this.bucketPrefix}/${id.name}/${id.version}.json`;
    return `${this.bucketPrefix}/${this.latestTag}/${id.name}.json`;
  }
}
