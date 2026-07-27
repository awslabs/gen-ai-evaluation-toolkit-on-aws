import { App, Stack } from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { Key } from 'aws-cdk-lib/aws-kms';
import { Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import 'jest-cdk-snapshot';
import { SecuredBucket } from '@secured';

describe('Secured Bucket', () => {
  beforeAll(() => {
    // We specify a fixed date for the snapshots to create a stable output
    const executionDate = '2023-11-18';
    jest.useFakeTimers();
    jest.setSystemTime(new Date(executionDate));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  test('Should match snapshot without name', () => {
    const app = new App();
    const stack = new Stack(app, 'TestStack', { env: { account: '12345' } });

    new SecuredBucket(stack, 'some-id');

    expect(stack).toMatchCdkSnapshot({ ignoreAssets: true });
  });

  test('Should match snapshot with name', () => {
    const app = new App();
    const stack = new Stack(app, 'TestStack', { env: { account: '12345' } });

    new SecuredBucket(stack, 'some-id', { bucketName: 'my-bucket' });

    expect(stack).toMatchCdkSnapshot({ ignoreAssets: true });
  });

  test('Should grant permissions with automatic KMS handling', () => {
    const app = new App();
    const stack = new Stack(app, 'TestStack', { env: { account: '12345' } });

    const customerKey = new Key(stack, 'CustomerKey');
    const securedBucket = new SecuredBucket(stack, 'TestBucket', {
      encryptionKey: customerKey,
    });

    const testRole = new Role(stack, 'TestRole', {
      assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
    });

    // Use bucket directly - CDK automatically handles KMS permissions for customer-managed keys
    securedBucket.grantRead(testRole);

    // Verify the stack includes both S3 and KMS permissions
    const template = Template.fromStack(stack);

    // Check that IAM policy exists with S3 permissions
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Effect: 'Allow',
            Action: Match.arrayWith(['s3:GetObject*', 's3:GetBucket*', 's3:List*']),
            Resource: Match.anyValue(),
          }),
        ]),
      },
    });

    // Check that IAM policy exists with KMS permissions for the customer-managed key
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Effect: 'Allow',
            Action: Match.arrayWith(['kms:Decrypt', 'kms:DescribeKey']),
            Resource: Match.anyValue(),
          }),
        ]),
      },
    });

    expect(stack).toMatchCdkSnapshot({ ignoreAssets: true });
  });

  test('Should support KMS key alias format', () => {
    const app = new App();
    const stack = new Stack(app, 'TestStack', { env: { account: '12345' } });

    // Test with KMS key alias format (recommended approach)
    const keyAlias = 'arn:aws:kms:us-east-1:12345:alias/etk-encryption-key';
    const customerKey = Key.fromKeyArn(stack, 'CustomerKey', keyAlias);

    const securedBucket = new SecuredBucket(stack, 'TestBucket', {
      encryptionKey: customerKey,
    });

    // Verify that the bucket is created successfully with alias
    expect(securedBucket).toBeDefined();
    expect(securedBucket.encryptionKey).toBe(customerKey);

    // Verify that the bucket uses the key alias correctly
    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::S3::Bucket', {
      BucketEncryption: {
        ServerSideEncryptionConfiguration: [
          {
            ServerSideEncryptionByDefault: {
              SSEAlgorithm: 'aws:kms',
              KMSMasterKeyID: keyAlias,
            },
            BucketKeyEnabled: true,
          },
        ],
      },
    });

    expect(stack).toMatchCdkSnapshot({ ignoreAssets: true });
  });
});
