import { CopyObjectCommand, DeleteObjectsCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { chunkGenerator, processUntilExhausted } from './functions';
import * as AWSXRay from 'aws-xray-sdk-core';

let _s3Client: S3Client | undefined;
export function getS3Client() {
  // If we need any custom initialization it can go here
  if (_s3Client == null) {
    _s3Client = new S3Client({ maxAttempts: 5 });
    AWSXRay.captureAWSv3Client(_s3Client);
  }
  return _s3Client;
}

export async function deleteS3Directory(bucketName: string, prefix: string) {
  if (!prefix.endsWith('/')) prefix += '/';

  const MAX_ITEMS_COUNT = 1_000; // as per DeleteObjectsCommand limitations

  // Deletion while paginating misses pagination order and can cause some items to be missed
  // so it must be done in a loop to make sure all items are deleted properly
  await processUntilExhausted(async (repeat) => {
    const itemsGenerator = chunkGenerator(listPrefixObjects(bucketName, prefix), MAX_ITEMS_COUNT);
    for await (const items of itemsGenerator) {
      await getS3Client().send(
        new DeleteObjectsCommand({
          Bucket: bucketName,
          Delete: { Objects: items.map((item) => ({ Key: item.Key! })) },
        }),
      );

      repeat();
    }
  });
}

export async function copyS3Directory(bucketName: string, sourcePrefix: string, destinationPrefix: string) {
  if (!sourcePrefix.endsWith('/')) sourcePrefix += '/';
  if (!destinationPrefix.endsWith('/')) destinationPrefix += '/';

  const MAX_CONCURRENT_REQUESTS_COUNT = 50;

  const itemsGenerator = chunkGenerator(listPrefixObjects(bucketName, sourcePrefix), MAX_CONCURRENT_REQUESTS_COUNT);
  for await (const items of itemsGenerator) {
    const copyPromises = items.map((item) => copyS3Item(bucketName, item.Key!, sourcePrefix, destinationPrefix));
    await Promise.all(copyPromises);
  }
}

export async function copyS3Item(
  bucketName: string,
  itemKey: string,
  fromPrefix: string,
  toPrefix: string,
): Promise<void> {
  const destinationKey = itemKey.replace(fromPrefix, toPrefix);

  await getS3Client().send(
    new CopyObjectCommand({
      CopySource: `${bucketName}/${itemKey}`,
      Bucket: bucketName,
      Key: destinationKey,
    }),
  );
}

/**
 * Generator that returns S3 objects under a given prefix, item by item.
 *
 * Warning: This generator is meant to be used for streaming and is not to be exhausted since the number of items is unknown
 * and exhausting such a paginated list would be an anti-pattern.
 */
export async function* listPrefixObjects(bucketName: string, prefix: string) {
  let continuationToken: string | undefined;
  do {
    const listResponse = await getS3Client().send(
      new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );

    continuationToken = listResponse.NextContinuationToken;
    if (!listResponse.Contents) continue;

    // Only yield objects that have a key
    yield* listResponse.Contents.filter((obj) => obj.Key != null);
  } while (continuationToken);
}
