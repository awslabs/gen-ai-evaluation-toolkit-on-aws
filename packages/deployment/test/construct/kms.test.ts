import { App, Stack } from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { ServicePrincipal, Role } from 'aws-cdk-lib/aws-iam';
import { CustomerManagedKmsKey } from '../../lib/constructs';

describe('CustomerManagedKmsKey', () => {
  let app: App;
  let stack: Stack;

  beforeEach(() => {
    app = new App();
    stack = new Stack(app, 'TestStack', {
      env: {
        account: '123456789012',
        region: 'us-east-1',
      },
    });
  });

  test('creates KMS key with proper configuration and CloudWatch Logs policy', () => {
    // GIVEN
    const props = {
      keyDescription: 'Test KMS key',
      keyAlias: 'test-key',
    };

    // WHEN
    const kmsKey = new CustomerManagedKmsKey(stack, 'TestKmsKey', props);

    // THEN
    const template = Template.fromStack(stack);

    // Verify KMS key is created with correct properties
    template.hasResourceProperties('AWS::KMS::Key', {
      Description: 'Test KMS key',
      EnableKeyRotation: true,
      KeyPolicy: {
        Statement: Match.arrayWith([
          // Account root permissions
          Match.objectLike({
            Sid: 'Enable IAM User Permissions',
            Effect: 'Allow',
            Action: 'kms:*',
          }),
          // CloudWatch Logs permissions
          Match.objectLike({
            Sid: 'Allow CloudWatch Logs',
            Effect: 'Allow',
            Principal: { Service: 'logs.us-east-1.amazonaws.com' },
          }),
        ]),
      },
    });

    // Verify alias is created
    template.hasResourceProperties('AWS::KMS::Alias', {
      AliasName: 'alias/test-key',
    });

    // Verify construct exposes correct properties
    expect(kmsKey.keyAlias).toBe('test-key');
    expect(kmsKey.key).toBeDefined();
    expect(kmsKey.alias).toBeDefined();
  });

  test('grantEncryptDecrypt method works correctly', () => {
    // GIVEN
    const kmsKey = new CustomerManagedKmsKey(stack, 'TestKmsKey', {
      keyDescription: 'Test KMS key',
      keyAlias: 'test-key',
    });

    const role = new Role(stack, 'TestRole', {
      assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
    });

    // WHEN
    const grant = kmsKey.grantEncryptDecrypt(role);

    // THEN
    expect(grant).toBeDefined();
    const template = Template.fromStack(stack);

    // Verify that the role gets KMS permissions
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Effect: 'Allow',
            Action: Match.arrayWith(['kms:Decrypt', 'kms:Encrypt', 'kms:GenerateDataKey*']),
          }),
        ]),
      },
    });
  });
});
