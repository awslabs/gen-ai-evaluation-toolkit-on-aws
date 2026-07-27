import { Location } from 'aws-cdk-lib/aws-s3';

export type S3Ref = {
  location: Location;
  // If bucket is encrypted the key is required for permissions to read the bucket
  bucketKeyArn?: string;
  // Image version for triggering ECR updates only when image changes
  imageVersion: string;
};
