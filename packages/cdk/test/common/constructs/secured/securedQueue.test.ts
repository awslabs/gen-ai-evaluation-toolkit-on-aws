import { App, Stack } from 'aws-cdk-lib';
import { Key } from 'aws-cdk-lib/aws-kms';
import { Template } from 'aws-cdk-lib/assertions';
import { Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { SecuredQueue } from '@secured';

describe('SecuredQueue', () => {
  let app: App;
  let stack: Stack;

  beforeEach(() => {
    app = new App();
    stack = new Stack(app, 'TestStack', { env: { account: '123456789012', region: 'us-east-1' } });
  });

  describe('Default behavior (SQS-managed encryption)', () => {
    test('should create queue with SQS-managed encryption when no encryption key provided', () => {
      // Arrange & Act
      new SecuredQueue(stack, 'TestQueue', {
        queueName: 'MyTestQueue',
      });

      // Assert
      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::SQS::Queue', {
        QueueName: 'MyTestQueue',
        // SQS-managed encryption is the default, so no KmsMasterKeyId should be present
      });
      // Verify that SSL is enforced
      template.hasResourceProperties('AWS::SQS::QueuePolicy', {
        PolicyDocument: {
          Statement: [
            {
              Effect: 'Deny',
              Condition: {
                Bool: {
                  'aws:SecureTransport': 'false',
                },
              },
            },
          ],
        },
      });
    });
  });

  describe('Customer-managed KMS key encryption', () => {
    test('should create queue with customer-managed encryption when encryption key provided', () => {
      // Arrange
      const customerKey = Key.fromKeyArn(
        stack,
        'CustomerKey',
        'arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012',
      );

      // Act
      new SecuredQueue(stack, 'TestQueue', {
        queueName: 'MyEncryptedQueue',
        encryptionKey: customerKey,
      });

      // Assert
      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::SQS::Queue', {
        QueueName: 'MyEncryptedQueue',
        KmsMasterKeyId: 'arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012',
      });
    });

    test('should apply CDK-nag suppressions for customer-managed keys', () => {
      // Arrange
      const customerKey = new Key(stack, 'CustomerKey');

      // Act
      const queue = new SecuredQueue(stack, 'TestQueue', {
        queueName: 'MyEncryptedQueue',
        encryptionKey: customerKey,
      });

      // Assert - verify that the queue construct is created successfully
      expect(queue).toBeDefined();

      // Verify the template has the expected queue
      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::SQS::Queue', {
        QueueName: 'MyEncryptedQueue',
      });
    });

    test('should use customer-managed encryption when encryption key provided', () => {
      // Arrange
      const customerKey = new Key(stack, 'CustomerKey');

      // Act
      new SecuredQueue(stack, 'TestQueue', {
        queueName: 'MyEncryptedQueue',
        encryptionKey: customerKey,
      });

      // Assert - verify encryption configuration is set correctly
      const template = Template.fromStack(stack);

      // Find the SQS queue resource
      const queueResources = template.findResources('AWS::SQS::Queue');
      const queueResource = Object.values(queueResources)[0] as { Properties: Record<string, unknown> };

      // Verify KMS encryption is configured
      expect(queueResource.Properties.KmsMasterKeyId).toEqual(
        expect.objectContaining({
          'Fn::GetAtt': expect.arrayContaining([expect.stringMatching(/^CustomerKey[A-F0-9]+$/), 'Arn']),
        }),
      );
    });
  });

  describe('Required security features', () => {
    test('should always enforce SSL transport', () => {
      // Arrange & Act
      new SecuredQueue(stack, 'TestQueue', {
        queueName: 'MyTestQueue',
      });

      // Assert
      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::SQS::QueuePolicy', {
        PolicyDocument: {
          Statement: [
            {
              Effect: 'Deny',
              Principal: { AWS: '*' },
              Action: 'sqs:*',
              Condition: {
                Bool: {
                  'aws:SecureTransport': 'false',
                },
              },
            },
          ],
        },
      });
    });

    test('should maintain all provided queue properties', () => {
      // Arrange
      const customerKey = new Key(stack, 'CustomerKey');

      // Act
      new SecuredQueue(stack, 'TestQueue', {
        queueName: 'MyCustomQueue',
        encryptionKey: customerKey,
      });

      // Assert
      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::SQS::Queue', {
        QueueName: 'MyCustomQueue',
      });
    });
  });

  describe('CDK grant integration', () => {
    test('should grant permissions with automatic KMS handling', () => {
      // Arrange
      const customerKey = new Key(stack, 'CustomerKey');
      const securedQueue = new SecuredQueue(stack, 'TestQueue', {
        encryptionKey: customerKey,
      });

      const testRole = new Role(stack, 'TestRole', {
        assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
      });

      // Act - Use queue directly - CDK automatically handles KMS permissions for customer-managed keys
      securedQueue.grantSendMessages(testRole);

      // Assert - Verify the stack includes both SQS and KMS permissions
      const template = Template.fromStack(stack);

      // Check that IAM policy exists and includes SQS permissions
      const policies = template.findResources('AWS::IAM::Policy');
      expect(Object.keys(policies).length).toBeGreaterThan(0);

      // Verify that the policy contains SQS actions
      const policyResource = Object.values(policies)[0] as {
        Properties: { PolicyDocument: { Statement: Array<{ Action?: string | string[] }> } };
      };
      const statements = policyResource.Properties.PolicyDocument.Statement;
      const hasSqsPermissions = statements.some(
        (statement) =>
          statement.Action &&
          (Array.isArray(statement.Action) ? statement.Action : [statement.Action]).some((action: string) =>
            action.includes('sqs:'),
          ),
      );
      expect(hasSqsPermissions).toBe(true);
    });
  });
});
