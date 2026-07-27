import path from 'path';
import { EnvVariable, StatusType } from './constants';
import { getEnvVariable, emitEvent, writeS3Object, listS3PrefixObjects, getS3ObjectContent } from './helpers';
import { S3Reference } from './models';

/**
 * Context provided to plugin execute functions.
 * Handles S3 operations, progress reporting, and artifact storage.
 */
export interface PluginContext {
  /** Unique identifier for this workflow run */
  readonly runId: string;

  /** Internal S3 bucket for intermediate artifacts */
  readonly internalBucket: string;

  /** Output S3 location for final results */
  readonly output: S3Reference;

  /** Input S3 location (for filters that read existing test cases) */
  readonly input: S3Reference | undefined;

  /**
   * Report progress to the workflow.
   * @param message - Human-readable progress message
   */
  reportProgress(message: string): Promise<void>;

  /**
   * Write an intermediate artifact to the internal S3 bucket.
   * Useful for debugging (e.g., taxonomy.json, scenarios.json).
   * @param key - Relative path within the artifacts folder
   * @param content - Content to write
   */
  writeArtifact(key: string, content: string): Promise<void>;

  /**
   * Write a test case to the output location.
   * @param id - Unique test case identifier (used in filename)
   * @param testCase - Test case data
   */
  writeTestCase(id: string, testCase: unknown): Promise<void>;

  /**
   * List input files (for filters).
   * @returns AsyncGenerator of S3 objects
   */
  listInputFiles(): AsyncGenerator<{ Key: string }>;

  /**
   * Read an input file (for filters).
   * @param key - S3 key of the file
   * @returns Parsed JSON content
   */
  readInputFile<T = unknown>(key: string): Promise<T>;
}

export interface PluginContextOptions {
  taskToken: string;
  runId: string;
  output: S3Reference;
  input: S3Reference | undefined;
}

export function createPluginContext(options: PluginContextOptions): PluginContext {
  const { taskToken, runId, output, input } = options;
  const internalBucket = getEnvVariable(EnvVariable.INTERNAL_S3_BUCKET);

  return {
    runId,
    internalBucket,
    output,
    input,

    async reportProgress(message: string): Promise<void> {
      await emitEvent({
        taskToken,
        status: StatusType.IN_PROGRESS,
        message,
        error: undefined,
        cause: undefined,
      });
    },

    async writeArtifact(key: string, content: string): Promise<void> {
      const fullKey = path.join('artifacts', runId, key);
      await writeS3Object(internalBucket, fullKey, content);
      console.log(`Wrote artifact: s3://${internalBucket}/${fullKey}`);
    },

    async writeTestCase(id: string, testCase: unknown): Promise<void> {
      const key = path.join(output.prefix, `${id}.json`);
      await writeS3Object(output.bucket, key, JSON.stringify(testCase, null, 2));
    },

    async *listInputFiles(): AsyncGenerator<{ Key: string }> {
      if (!input) {
        throw new Error('No input location configured - this plugin does not receive input files');
      }
      for await (const obj of listS3PrefixObjects(input.bucket, input.prefix)) {
        if (obj.Key) {
          yield { Key: obj.Key };
        }
      }
    },

    async readInputFile<T = unknown>(key: string): Promise<T> {
      if (!input) {
        throw new Error('No input location configured');
      }
      const body = await getS3ObjectContent(input.bucket, key);
      const content = await body?.transformToString();
      if (!content) {
        throw new Error(`Empty or missing file: ${key}`);
      }
      return JSON.parse(content) as T;
    },
  };
}
