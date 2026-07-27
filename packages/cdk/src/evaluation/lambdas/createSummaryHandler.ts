import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { Named, ScoreAggregates } from './createAggregateHandler';

const s3Client = new S3Client({});

export type CreateSummaryEvent = {
  bucket: string;
  aggregateS3Key: string;
  plugin: string;
};

type Summary = Named<{
  plugin: string;
  count: number;
  min: number;
  max: number;
  mean: number;
  standardDeviation: number;
}>;

type AggregatedResultMetrics = {
  metricId: string;
  score: number;
};

/**
 * Handles the creation of statistical summaries from score aggregates stored in S3
 * @param event Step function event containing S3 location of aggregate data
 * @returns Array of aggregated result metrics containing statistical measures
 * @throws Error when required fields are missing or S3 read fails
 */
export async function createSummaryHandler(event: CreateSummaryEvent): Promise<AggregatedResultMetrics[]> {
  console.log('Received event:', { bucket: event.bucket, aggregateKey: event.aggregateS3Key, plugin: event.plugin });

  if (!event.bucket || !event.aggregateS3Key) {
    throw new Error('Missing required fields: bucket and aggregateS3Key');
  }

  // Read aggregate from S3
  let aggregate: ScoreAggregates;
  try {
    const getCommand = new GetObjectCommand({
      Bucket: event.bucket,
      Key: event.aggregateS3Key,
    });
    const response = await s3Client.send(getCommand);
    const body = await response.Body?.transformToString();
    if (!body) {
      throw new Error('Empty response from S3');
    }
    aggregate = JSON.parse(body);
    console.log('Loaded aggregate from S3:', {
      total: aggregate.total,
      aggregateCount: aggregate.aggregates.length,
    });
  } catch (error) {
    console.error('Error reading aggregate from S3:', error);
    throw error;
  }

  const summary: Summary[] = aggregate.aggregates.map((agg) => ({
    name: agg.name,
    plugin: event.plugin,
    count: agg.count,
    min: agg.min,
    max: agg.max,
    mean: agg.mean,
    standardDeviation: agg.m2 == 0 || agg.count == 1 ? 0 : Math.sqrt(agg.m2 / (agg.count - 1)),
  }));

  const result: AggregatedResultMetrics[] = transformSummaryToAggregatedResultMetrics(summary);
  console.log('Result:', JSON.stringify(result));
  return result;
}

function transformSummaryToAggregatedResultMetrics(summaryList: Summary[]): AggregatedResultMetrics[] {
  const transformedSummary: AggregatedResultMetrics[] = [];
  for (const summary of summaryList) {
    transformedSummary.push({
      metricId: summary.plugin + '_' + summary.name + '_' + 'count',
      score: summary.count,
    });
    transformedSummary.push({ metricId: summary.plugin + '_' + summary.name + '_' + 'min', score: summary.min });
    transformedSummary.push({ metricId: summary.plugin + '_' + summary.name + '_' + 'max', score: summary.max });
    transformedSummary.push({ metricId: summary.plugin + '_' + summary.name + '_' + 'mean', score: summary.mean });
    transformedSummary.push({
      metricId: summary.plugin + '_' + summary.name + '_' + 'standardDeviation',
      score: summary.standardDeviation,
    });
  }
  return transformedSummary;
}

export const lambdaHandler = createSummaryHandler;
