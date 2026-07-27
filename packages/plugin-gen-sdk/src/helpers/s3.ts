import { _Object, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { lazy } from './objects';

const s3Client = lazy(() => new S3Client());

/**
 * Generator that returns S3 objects under a given prefix, item by item.
 *
 * Warning: This generator is meant to be used for streaming and is not to be exhausted since the number of items is unknown
 * and exhausting such a paginated list would be an anti-pattern.
 */
export async function* listS3PrefixObjects(bucketName: string, prefix: string): AsyncGenerator<_Object> {
  let continuationToken: string | undefined;
  do {
    const listResponse = await s3Client().send(
      new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );

    continuationToken = listResponse.NextContinuationToken;
    if (!listResponse.Contents) continue;

    yield* listResponse.Contents.filter((obj) => obj.Key != null);
  } while (continuationToken);
}

export async function getS3ObjectContent(bucket: string, key: string) {
  const response = await s3Client().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  return response.Body;
}

export async function writeS3Object(bucket: string, key: string, content: string, contentType = 'application/json') {
  await s3Client().send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: content, ContentType: contentType }));
}
