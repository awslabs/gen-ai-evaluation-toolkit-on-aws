import { getS3Client } from '@common/api/utils/s3';

jest.mock('timers/promises', () => ({
  setTimeout: jest.fn(),
}));

describe('S3 Utils', () => {
  it('should return the S3 Client value', () => {
    const envVar = getS3Client();
    expect(envVar).not.toBeNull();
  });
});
