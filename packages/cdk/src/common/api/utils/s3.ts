import { S3Client } from '@aws-sdk/client-s3';
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
