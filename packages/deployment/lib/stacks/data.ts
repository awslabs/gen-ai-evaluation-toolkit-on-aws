import { PhysicalName, RemovalPolicy, Stack, StackProps, Tags } from 'aws-cdk-lib';
import { IKey } from 'aws-cdk-lib/aws-kms';
import { BlockPublicAccess, Bucket } from 'aws-cdk-lib/aws-s3';
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import path from 'path';
import { packageRoot } from '../common';
import { copyTestData } from '../test-data';

export type DataStackProps = {
  customerKey?: IKey;
} & StackProps;

export class DataStack extends Stack {
  public readonly dataBucket: Bucket;
  private readonly customerKey?: IKey;

  constructor(scope: Construct, { customerKey, ...stackProps }: DataStackProps) {
    super(scope, 'DataStack', {
      terminationProtection: false,
      description: 'GenAi-ETK data stack that contain test cases and GTG resources',
      ...stackProps,
    });

    this.customerKey = customerKey;

    this.dataBucket = this.setupCustomerBucket();

    Tags.of(this).add('stack', this.stackName);
  }

  setupCustomerBucket(): Bucket {
    // This is a bucket that customer would usually provide
    // It can contain e.g. execution results for evaluation or knowledge documents for generation
    const bucket = new Bucket(this, 'DataBucket', {
      removalPolicy: RemovalPolicy.DESTROY,
      bucketName: PhysicalName.GENERATE_IF_NEEDED,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      autoDeleteObjects: true,
      encryptionKey: this.customerKey,
    });

    const testDataPath = path.join(packageRoot(), 'assets/test-data');
    copyTestData(testDataPath);

    // Populate bucket with testdata
    new BucketDeployment(this, 'DeployIntegrationTestData', {
      sources: [Source.asset(testDataPath)],
      destinationBucket: bucket,
      prune: true,
    });

    // Save bucket name to SSM
    new StringParameter(this, 'DataBucketName', {
      parameterName: '/genai-etk/customerProvidedBucketName',
      stringValue: bucket.bucketName,
      description: 'The bucket that contains customer resources to be used by Evaluation and GTG',
    });

    return bucket;
  }
}
