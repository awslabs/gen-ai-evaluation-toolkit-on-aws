import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { copyS3Directory, copyS3Item, deleteS3Directory, listPrefixObjects } from '@datastore/api/utils';

jest.mock('timers/promises', () => ({
  setTimeout: jest.fn(),
}));

describe('S3 Utils', () => {
  const mockSend = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockSend.mockReset();
    mockSend.mockResolvedValue({});
    S3Client.prototype.send = mockSend;
  });

  describe('copyS3Directory', () => {
    it('should copy all objects from source to destination', async () => {
      mockSend.mockImplementation(async (command) => {
        if (command instanceof ListObjectsV2Command) {
          return {
            Contents: Array(55)
              .fill(0)
              .map((_, i) => ({ Key: `source/file-${i}.txt` })),
          };
        }
        return {};
      });

      await copyS3Directory('bucket', 'source', 'dest');

      // List
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: {
            Bucket: 'bucket',
            Prefix: 'source/',
          },
        }),
      );

      // Copy
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: {
            Bucket: 'bucket',
            Key: 'dest/file-0.txt',
            CopySource: 'bucket/source/file-0.txt',
          },
        }),
      );
    });
  });

  describe('copyS3Item', () => {
    it('should copy single item with correct parameters', async () => {
      await copyS3Item('bucket', 'source/file.txt', 'source/', 'dest/');
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: {
            Bucket: 'bucket',
            Key: 'dest/file.txt',
            CopySource: 'bucket/source/file.txt',
          },
        }),
      );
    });
  });

  describe('listPrefixObjects', () => {
    it('should yield all objects in prefix', async () => {
      mockSend
        .mockResolvedValueOnce({
          Contents: [{ Key: 'prefix/file1.txt' }, { Key: 'prefix/file2.txt' }, {}],
          NextContinuationToken: 'some-token',
        })
        .mockResolvedValueOnce({
          Contents: [],
          NextContinuationToken: 'some-token',
        })
        .mockResolvedValueOnce({
          NextContinuationToken: 'some-token',
        })
        .mockResolvedValueOnce({
          Contents: [{}, { Key: 'prefix/file3.txt' }],
        });

      const objects = [];
      for await (const obj of listPrefixObjects('bucket', 'prefix/')) {
        objects.push(obj);
      }

      expect(objects).toHaveLength(3);
      expect(objects[0]!.Key).toBe('prefix/file1.txt');
      expect(objects[1]!.Key).toBe('prefix/file2.txt');
      expect(objects[2]!.Key).toBe('prefix/file3.txt');
    });
  });

  describe('deleteS3Directory', () => {
    const bucketName = 'test-bucket';
    const prefix = 'test-prefix';

    it('should delete all objects in directory when less than 1000 items', async () => {
      const contents = Array(5)
        .fill(null)
        .map((_, i) => ({ Key: `test-prefix/file${i}.txt` }));

      mockSend.mockResolvedValueOnce({ Contents: contents });

      await deleteS3Directory(bucketName, prefix);

      expect(mockSend).toHaveBeenCalledTimes(3); // list, delete, list

      // Verify DeleteObjectsCommand call
      expect(mockSend).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          input: {
            Bucket: bucketName,
            Delete: { Objects: contents },
          },
        }),
      );
    });

    it('should handle pagination when more than 1000 items', async () => {
      const contents = Array(1500)
        .fill(null)
        .map((_, i) => ({
          Key: `test-prefix/file${i}.txt`,
        }));

      mockSend.mockResolvedValueOnce({ Contents: contents });

      await deleteS3Directory(bucketName, prefix);

      expect(mockSend).toHaveBeenCalledTimes(4); // list, delete, delete, list

      // Verify first delete batch
      expect(mockSend).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          input: {
            Bucket: bucketName,
            Delete: { Objects: contents.slice(0, 1_000) },
          },
        }),
      );

      // Verify second delete batch
      expect(mockSend).toHaveBeenNthCalledWith(
        3,
        expect.objectContaining({
          input: {
            Bucket: bucketName,
            Delete: { Objects: contents.slice(1000) },
          },
        }),
      );
    });

    it('should handle empty directory', async () => {
      mockSend.mockResolvedValueOnce({ Contents: [] });
      await deleteS3Directory(bucketName, prefix);
      expect(mockSend).toHaveBeenCalledTimes(1); // For listing
    });

    it('should handle errors from S3', async () => {
      const error = new Error('S3 error');
      mockSend.mockRejectedValueOnce(error);
      await expect(deleteS3Directory(bucketName, prefix)).rejects.toThrow(error);
    });
  });
});
