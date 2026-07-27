import assert from 'assert';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

const s3Client = new S3Client({});

export type CreateAggregateEvent = {
  bucket: string;
  aggregateS3Key: string;
  s3Keys?: string[]; // Array of S3 keys to read and aggregate
};

type PluginResult = {
  scores?: MetricScore[];
};

type MetricScore = Named<{
  value?: number;
  error?: string | null;
}>;

export type ScoreAggregates = {
  total: number;
  aggregates: Named<ScoreAggregate>[];
};

export type Named<T> = {
  name: string;
} & T;

export type ScoreAggregate = {
  count: number;
  min: number;
  max: number;
  mean: number;
  m2: number;
};

const zero: ScoreAggregate = {
  count: 0,
  mean: 0,
  m2: 0,
  min: Number.MAX_SAFE_INTEGER,
  max: Number.MIN_SAFE_INTEGER,
};

/**
 * Processes plugin results to create aggregated statistics
 * Reads existing aggregate from S3, reads test result files from S3, merges with new batch, writes back to S3
 * @param event The step function event containing S3 location and S3 keys to process
 * @returns Promise resolving to void (result stored in S3)
 */
export async function createAggregateHandler(event: CreateAggregateEvent): Promise<void> {
  console.log('Received event:', {
    bucket: event.bucket,
    aggregateKey: event.aggregateS3Key,
    keyCount: event.s3Keys?.length,
  });

  if (!event.bucket || !event.aggregateS3Key) {
    throw new Error('Missing required fields: bucket and aggregateS3Key');
  }

  // Read existing aggregate from S3 (if exists)
  let lastAggregate: ScoreAggregates | undefined;
  try {
    const getCommand = new GetObjectCommand({
      Bucket: event.bucket,
      Key: event.aggregateS3Key,
    });
    const response = await s3Client.send(getCommand);
    const body = await response.Body?.transformToString();
    if (body) {
      lastAggregate = JSON.parse(body);
      console.log('Loaded existing aggregate from S3');
    }
  } catch (error) {
    // AWS SDK errors have a name property
    if (error instanceof Error && error.name === 'NoSuchKey') {
      console.log('No existing aggregate found, starting fresh');
    } else {
      throw error;
    }
  }

  const initialAcc: Record<string, ScoreAggregate> = Object.fromEntries(
    lastAggregate?.aggregates.map(({ name, ...rest }) => [name, rest]) ?? [],
  );

  // Read test result files from S3 and extract scores
  const s3Keys = event.s3Keys || [];
  console.log(`Processing ${s3Keys.length} test result files from S3`);

  const results: PluginResult[] = [];
  for (const key of s3Keys) {
    try {
      const getCommand = new GetObjectCommand({
        Bucket: event.bucket,
        Key: key,
      });
      const response = await s3Client.send(getCommand);
      const body = await response.Body?.transformToString();
      if (body) {
        const testResult = JSON.parse(body);
        // Extract scores from the test result
        if (testResult.scores) {
          results.push({ scores: testResult.scores });
        }
      }
    } catch (error) {
      console.error(`Failed to read file ${key}:`, error);
      throw new Error(`Failed to process S3 key ${key}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log(`Successfully read ${results.length} test results`);

  const aggegateMap = results.reduce((acc, result) => {
    if (!result.scores || result.scores.length === 0) {
      console.log('Skipping empty scores');
      return acc;
    }
    return processStreamingResult(acc, result.scores);
  }, initialAcc);

  const newAggregate: ScoreAggregates = {
    total: (lastAggregate?.total || 0) + results.length,
    aggregates: Object.entries(aggegateMap).map(([name, aggregate]) => ({ name, ...aggregate })),
  };

  // Write updated aggregate back to S3
  const putCommand = new PutObjectCommand({
    Bucket: event.bucket,
    Key: event.aggregateS3Key,
    Body: JSON.stringify(newAggregate),
    ContentType: 'application/json',
  });
  await s3Client.send(putCommand);
  console.log('Wrote updated aggregate to S3');
}

/**
 * Process a single file from the streaming result
 * @param aggregate The existing aggregate
 * @param newFile The new file to be processed
 * @returns The updated aggregate
 */
function processStreamingResult(
  aggregate: Record<string, ScoreAggregate>,
  newScores: MetricScore[],
): Record<string, ScoreAggregate> {
  newScores
    .filter((score) => score.value != null)
    .forEach((score) => {
      const { name, value } = score;
      assert(value != null); // So the typesystem would understand it's non-null

      if (aggregate[name] == null) aggregate[name] = { ...zero };

      aggregate[name] = calculateStreamingMetrics(aggregate[name], value);
    });
  return aggregate;
}

/**
 * Streaming algorithm for calculating mean and variance
 * Welford's online algorithm
 * https://en.wikipedia.org/wiki/Algorithms_for_calculating_variance#Welford's_online_algorithm
 * @param aggregate The existing aggregate
 * @param newValue The new value to be added
 * @returns The updated aggregate
 */
function calculateStreamingMetrics(aggregate: ScoreAggregate, newValue: number): ScoreAggregate {
  const newAggregate = { ...aggregate, count: aggregate.count + 1 };

  const delta = newValue - newAggregate.mean;
  newAggregate.mean += delta / newAggregate.count;

  const delta2 = newValue - newAggregate.mean;
  newAggregate.m2 += delta * delta2;

  if (newValue < newAggregate.min) newAggregate.min = newValue;
  if (newValue > newAggregate.max) newAggregate.max = newValue;

  return newAggregate;
}

export const lambdaHandler = createAggregateHandler;
