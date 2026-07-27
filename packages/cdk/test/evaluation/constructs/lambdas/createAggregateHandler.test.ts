import { mockClient } from 'aws-sdk-client-mock';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { sdkStreamMixin } from '@smithy/util-stream';
import { Readable } from 'stream';
import { CreateAggregateEvent, createAggregateHandler } from '@src/evaluation/lambdas/createAggregateHandler';

const s3Mock = mockClient(S3Client);

describe('createAggregateHandler', () => {
  beforeEach(() => {
    s3Mock.reset();
  });

  const createMockStream = (data: string) => {
    const stream = new Readable();
    stream.push(data);
    stream.push(null);
    return sdkStreamMixin(stream);
  };

  describe('when processing S3 keys', () => {
    it('should read test results from S3 and aggregate', async () => {
      const event: CreateAggregateEvent = {
        bucket: 'test-bucket',
        aggregateS3Key: 'test/aggregate.json',
        s3Keys: ['test/result1.json', 'test/result2.json'],
      };

      // Mock no existing aggregate
      s3Mock.on(GetObjectCommand, { Bucket: 'test-bucket', Key: 'test/aggregate.json' }).rejects({ name: 'NoSuchKey' });

      // Mock test result files
      s3Mock
        .on(GetObjectCommand, { Bucket: 'test-bucket', Key: 'test/result1.json' })
        .resolves({ Body: createMockStream(JSON.stringify({ scores: [{ name: 'metric1', value: 10 }] })) });

      s3Mock
        .on(GetObjectCommand, { Bucket: 'test-bucket', Key: 'test/result2.json' })
        .resolves({ Body: createMockStream(JSON.stringify({ scores: [{ name: 'metric1', value: 20 }] })) });

      s3Mock.on(PutObjectCommand).resolves({});

      await createAggregateHandler(event);

      // Verify aggregate was written
      const putCalls = s3Mock.commandCalls(PutObjectCommand);
      expect(putCalls).toHaveLength(1);

      const putCall = putCalls[0]!;
      const aggregate = JSON.parse(putCall.args[0]!.input.Body as string);

      expect(aggregate.total).toBe(2);
      expect(aggregate.aggregates).toHaveLength(1);
      expect(aggregate.aggregates[0].name).toBe('metric1');
      expect(aggregate.aggregates[0].count).toBe(2);
      expect(aggregate.aggregates[0].min).toBe(10);
      expect(aggregate.aggregates[0].max).toBe(20);
      expect(aggregate.aggregates[0].mean).toBe(15);
    });

    it('should merge with existing aggregate', async () => {
      const event: CreateAggregateEvent = {
        bucket: 'test-bucket',
        aggregateS3Key: 'test/aggregate.json',
        s3Keys: ['test/result1.json'],
      };

      // Mock existing aggregate
      const existingAggregate = {
        total: 1,
        aggregates: [{ name: 'metric1', count: 1, min: 5, max: 5, mean: 5, m2: 0 }],
      };
      s3Mock
        .on(GetObjectCommand, { Bucket: 'test-bucket', Key: 'test/aggregate.json' })
        .resolves({ Body: createMockStream(JSON.stringify(existingAggregate)) });

      // Mock new test result
      s3Mock
        .on(GetObjectCommand, { Bucket: 'test-bucket', Key: 'test/result1.json' })
        .resolves({ Body: createMockStream(JSON.stringify({ scores: [{ name: 'metric1', value: 15 }] })) });

      s3Mock.on(PutObjectCommand).resolves({});

      await createAggregateHandler(event);

      const putCalls = s3Mock.commandCalls(PutObjectCommand);
      const aggregate = JSON.parse(putCalls[0]!.args[0]!.input.Body as string);

      expect(aggregate.total).toBe(2);
      expect(aggregate.aggregates[0].count).toBe(2);
      expect(aggregate.aggregates[0].min).toBe(5);
      expect(aggregate.aggregates[0].max).toBe(15);
      expect(aggregate.aggregates[0].mean).toBe(10);
    });

    it('should handle empty s3Keys array', async () => {
      const event: CreateAggregateEvent = {
        bucket: 'test-bucket',
        aggregateS3Key: 'test/aggregate.json',
        s3Keys: [],
      };

      s3Mock.on(GetObjectCommand, { Bucket: 'test-bucket', Key: 'test/aggregate.json' }).rejects({ name: 'NoSuchKey' });
      s3Mock.on(PutObjectCommand).resolves({});

      await createAggregateHandler(event);

      const putCalls = s3Mock.commandCalls(PutObjectCommand);
      const aggregate = JSON.parse(putCalls[0]!.args[0]!.input.Body as string);

      expect(aggregate.total).toBe(0);
      expect(aggregate.aggregates).toEqual([]);
    });

    it('should fail if a file read fails', async () => {
      const event: CreateAggregateEvent = {
        bucket: 'test-bucket',
        aggregateS3Key: 'test/aggregate.json',
        s3Keys: ['test/result1.json', 'test/result2.json'],
      };

      s3Mock.on(GetObjectCommand, { Bucket: 'test-bucket', Key: 'test/aggregate.json' }).rejects({ name: 'NoSuchKey' });

      // First file fails
      s3Mock.on(GetObjectCommand, { Bucket: 'test-bucket', Key: 'test/result1.json' }).rejects(new Error('Read error'));

      // Second file succeeds
      s3Mock
        .on(GetObjectCommand, { Bucket: 'test-bucket', Key: 'test/result2.json' })
        .resolves({ Body: createMockStream(JSON.stringify({ scores: [{ name: 'metric1', value: 10 }] })) });

      await expect(createAggregateHandler(event)).rejects.toThrow('Failed to process S3 key test/result1.json');
    });
  });

  describe('error handling', () => {
    it('should throw error if bucket is missing', async () => {
      const event: CreateAggregateEvent = {
        bucket: '',
        aggregateS3Key: 'test/aggregate.json',
        s3Keys: [],
      };

      await expect(createAggregateHandler(event)).rejects.toThrow('Missing required fields');
    });

    it('should throw error if aggregateS3Key is missing', async () => {
      const event: CreateAggregateEvent = {
        bucket: 'test-bucket',
        aggregateS3Key: '',
        s3Keys: [],
      };

      await expect(createAggregateHandler(event)).rejects.toThrow('Missing required fields');
    });
  });
});
