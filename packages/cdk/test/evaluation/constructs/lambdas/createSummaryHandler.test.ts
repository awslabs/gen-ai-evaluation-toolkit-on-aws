import { mockClient } from 'aws-sdk-client-mock';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { sdkStreamMixin } from '@smithy/util-stream';
import { Readable } from 'stream';
import { CreateSummaryEvent, createSummaryHandler } from '@src/evaluation/lambdas/createSummaryHandler';

const s3Mock = mockClient(S3Client);

describe('createSummaryHandler', () => {
  beforeEach(() => {
    s3Mock.reset();
  });

  const createMockStream = (data: string) => {
    const stream = new Readable();
    stream.push(data);
    stream.push(null);
    return sdkStreamMixin(stream);
  };

  it('should throw error when bucket is missing', async () => {
    const event = { aggregateS3Key: 'test/aggregate.json', plugin: 'fmeval' } as CreateSummaryEvent;
    await expect(createSummaryHandler(event)).rejects.toThrow('Missing required fields');
  });

  it('should throw error when aggregateS3Key is missing', async () => {
    const event = { bucket: 'test-bucket', plugin: 'fmeval' } as CreateSummaryEvent;
    await expect(createSummaryHandler(event)).rejects.toThrow('Missing required fields');
  });

  it('should handle empty aggregates array', async () => {
    const event: CreateSummaryEvent = {
      bucket: 'test-bucket',
      aggregateS3Key: 'test/aggregate.json',
      plugin: 'fmeval',
    };

    const aggregate = {
      total: 0,
      aggregates: [],
    };

    s3Mock.on(GetObjectCommand).resolves({ Body: createMockStream(JSON.stringify(aggregate)) });

    const result = await createSummaryHandler(event);
    expect(result).toEqual([]);
  });

  it('should correctly calculate summary statistics for single aggregate', async () => {
    const event: CreateSummaryEvent = {
      bucket: 'test-bucket',
      aggregateS3Key: 'test/aggregate.json',
      plugin: 'fmeval',
    };

    const aggregate = {
      total: 2,
      aggregates: [
        {
          name: 'qa_accuracy',
          count: 2,
          min: 10,
          max: 20,
          mean: 15,
          m2: 50,
        },
      ],
    };

    s3Mock.on(GetObjectCommand).resolves({ Body: createMockStream(JSON.stringify(aggregate)) });

    const result = await createSummaryHandler(event);

    expect(result).toHaveLength(5);
    expect(result).toEqual(
      expect.arrayContaining([
        { metricId: 'fmeval_qa_accuracy_count', score: 2 },
        { metricId: 'fmeval_qa_accuracy_min', score: 10 },
        { metricId: 'fmeval_qa_accuracy_max', score: 20 },
        { metricId: 'fmeval_qa_accuracy_mean', score: 15 },
        { metricId: 'fmeval_qa_accuracy_standardDeviation', score: expect.closeTo(7.07, 2) },
      ]),
    );
  });

  it('should handle multiple different metrics', async () => {
    const event: CreateSummaryEvent = {
      bucket: 'test-bucket',
      aggregateS3Key: 'test/aggregate.json',
      plugin: 'fmeval',
    };

    const aggregate = {
      total: 4,
      aggregates: [
        {
          name: 'qa_accuracy',
          count: 2,
          min: 10,
          max: 20,
          mean: 15,
          m2: 50,
        },
        {
          name: 'factual_knowledge',
          count: 2,
          min: 5,
          max: 15,
          mean: 10,
          m2: 50,
        },
      ],
    };

    s3Mock.on(GetObjectCommand).resolves({ Body: createMockStream(JSON.stringify(aggregate)) });

    const result = await createSummaryHandler(event);

    expect(result).toHaveLength(10);
    expect(result).toEqual(
      expect.arrayContaining([
        { metricId: 'fmeval_qa_accuracy_count', score: 2 },
        { metricId: 'fmeval_qa_accuracy_min', score: 10 },
        { metricId: 'fmeval_qa_accuracy_max', score: 20 },
        { metricId: 'fmeval_qa_accuracy_mean', score: 15 },
        { metricId: 'fmeval_qa_accuracy_standardDeviation', score: expect.closeTo(7.07, 2) },
        { metricId: 'fmeval_factual_knowledge_count', score: 2 },
        { metricId: 'fmeval_factual_knowledge_min', score: 5 },
        { metricId: 'fmeval_factual_knowledge_max', score: 15 },
        { metricId: 'fmeval_factual_knowledge_mean', score: 10 },
        { metricId: 'fmeval_factual_knowledge_standardDeviation', score: expect.closeTo(7.07, 2) },
      ]),
    );
  });

  it('should handle zero standard deviation when count is 1', async () => {
    const event: CreateSummaryEvent = {
      bucket: 'test-bucket',
      aggregateS3Key: 'test/aggregate.json',
      plugin: 'fmeval',
    };

    const aggregate = {
      total: 1,
      aggregates: [
        {
          name: 'qa_accuracy',
          count: 1,
          min: 10,
          max: 10,
          mean: 10,
          m2: 0,
        },
      ],
    };

    s3Mock.on(GetObjectCommand).resolves({ Body: createMockStream(JSON.stringify(aggregate)) });

    const result = await createSummaryHandler(event);

    const stdDev = result.find((r) => r.metricId === 'fmeval_qa_accuracy_standardDeviation');
    expect(stdDev?.score).toBe(0);
  });

  it('should throw error when S3 read fails', async () => {
    const event: CreateSummaryEvent = {
      bucket: 'test-bucket',
      aggregateS3Key: 'test/aggregate.json',
      plugin: 'fmeval',
    };

    s3Mock.on(GetObjectCommand).rejects(new Error('S3 read error'));

    await expect(createSummaryHandler(event)).rejects.toThrow('S3 read error');
  });
});
