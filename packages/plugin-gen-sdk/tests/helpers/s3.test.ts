import { S3Client } from '@aws-sdk/client-s3';
import { listS3PrefixObjects, getS3ObjectContent, writeS3Object } from '../../src/helpers/s3';

describe('S3 helpers', () => {
  const mockSend = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockSend.mockReset();
    S3Client.prototype.send = mockSend;
  });

  describe('listS3PrefixObjects', () => {
    it('should yield objects from single page', async () => {
      mockSend.mockResolvedValueOnce({
        Contents: [{ Key: 'prefix/file1.json' }, { Key: 'prefix/file2.json' }],
        NextContinuationToken: undefined,
      });

      const results: Array<{ Key?: string }> = [];
      for await (const obj of listS3PrefixObjects('test-bucket', 'prefix/')) {
        results.push(obj);
      }

      expect(results).toHaveLength(2);
      expect(results[0].Key).toBe('prefix/file1.json');
      expect(results[1].Key).toBe('prefix/file2.json');
    });

    it('should handle pagination', async () => {
      mockSend
        .mockResolvedValueOnce({
          Contents: [{ Key: 'prefix/file1.json' }],
          NextContinuationToken: 'token1',
        })
        .mockResolvedValueOnce({
          Contents: [{ Key: 'prefix/file2.json' }],
          NextContinuationToken: undefined,
        });

      const results: Array<{ Key?: string }> = [];
      for await (const obj of listS3PrefixObjects('test-bucket', 'prefix/')) {
        results.push(obj);
      }

      expect(results).toHaveLength(2);
      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it('should filter out objects without Key', async () => {
      mockSend.mockResolvedValueOnce({
        Contents: [{ Key: 'prefix/file1.json' }, { Key: undefined }, { Key: 'prefix/file2.json' }],
        NextContinuationToken: undefined,
      });

      const results: Array<{ Key?: string }> = [];
      for await (const obj of listS3PrefixObjects('test-bucket', 'prefix/')) {
        results.push(obj);
      }

      expect(results).toHaveLength(2);
    });

    it('should handle empty Contents', async () => {
      mockSend.mockResolvedValueOnce({
        Contents: undefined,
        NextContinuationToken: undefined,
      });

      const results: Array<{ Key?: string }> = [];
      for await (const obj of listS3PrefixObjects('test-bucket', 'prefix/')) {
        results.push(obj);
      }

      expect(results).toHaveLength(0);
    });
  });

  describe('getS3ObjectContent', () => {
    it('should return object body', async () => {
      const mockBody = {
        transformToString: jest.fn().mockResolvedValue('{"test": "content"}'),
      };
      mockSend.mockResolvedValueOnce({ Body: mockBody });

      const result = await getS3ObjectContent('test-bucket', 'test-key');

      expect(result).toBe(mockBody);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: { Bucket: 'test-bucket', Key: 'test-key' },
        }),
      );
    });

    it('should return undefined when Body is not present', async () => {
      mockSend.mockResolvedValueOnce({ Body: undefined });

      const result = await getS3ObjectContent('test-bucket', 'test-key');

      expect(result).toBeUndefined();
    });
  });

  describe('writeS3Object', () => {
    it('should write content to S3', async () => {
      mockSend.mockResolvedValueOnce({});

      await writeS3Object('test-bucket', 'test-key', '{"test": "content"}');

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: {
            Bucket: 'test-bucket',
            Key: 'test-key',
            Body: '{"test": "content"}',
            ContentType: 'application/json',
          },
        }),
      );
    });

    it('should use custom content type', async () => {
      mockSend.mockResolvedValueOnce({});

      await writeS3Object('test-bucket', 'test-key', 'plain text', 'text/plain');

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            ContentType: 'text/plain',
          }),
        }),
      );
    });
  });
});
