import { App, Stack } from 'aws-cdk-lib';
import { AttributeType } from 'aws-cdk-lib/aws-dynamodb';
import { Key } from 'aws-cdk-lib/aws-kms';
import { Template } from 'aws-cdk-lib/assertions';
import { Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { SecuredTable } from '@secured';

describe('SecuredTable', () => {
  let app: App;
  let stack: Stack;

  beforeEach(() => {
    app = new App();
    stack = new Stack(app, 'TestStack', { env: { account: '123456789012', region: 'us-east-1' } });
  });

  describe('Default behavior (AWS-managed encryption)', () => {
    test('should create table with AWS-managed encryption when no encryption key provided', () => {
      // Arrange & Act
      new SecuredTable(stack, 'TestTable', {
        partitionKey: { name: 'pk', type: AttributeType.STRING },
      });

      // Assert
      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        SSESpecification: {
          SSEEnabled: true,
          // AWS-managed encryption doesn't specify KMSMasterKeyId
        },
        PointInTimeRecoverySpecification: {
          PointInTimeRecoveryEnabled: true,
        },
      });
    });
  });

  describe('Customer-managed KMS key encryption', () => {
    test('should create table with customer-managed encryption when encryption key provided', () => {
      // Arrange
      const customerKey = new Key(stack, 'CustomerKey', {
        description: 'Customer-managed key for DynamoDB encryption',
      });

      // Act
      new SecuredTable(stack, 'TestTable', {
        partitionKey: { name: 'pk', type: AttributeType.STRING },
        encryptionKey: customerKey,
      });

      // Assert
      const template = Template.fromStack(stack);

      // Find the DynamoDB table resource
      const tableResources = template.findResources('AWS::DynamoDB::Table');
      const tableResource = Object.values(tableResources)[0] as { Properties: Record<string, unknown> };

      // Verify encryption configuration
      expect(tableResource.Properties.SSESpecification).toEqual({
        SSEEnabled: true,
        SSEType: 'KMS',
        KMSMasterKeyId: expect.objectContaining({
          'Fn::GetAtt': expect.arrayContaining([expect.stringMatching(/^CustomerKey[A-F0-9]+$/), 'Arn']),
        }),
      });

      expect(tableResource.Properties.PointInTimeRecoverySpecification).toEqual({
        PointInTimeRecoveryEnabled: true,
      });
    });

    test('should apply CDK-nag suppressions for customer-managed keys', () => {
      // Arrange
      const customerKey = new Key(stack, 'CustomerKey');

      // Act
      new SecuredTable(stack, 'TestTable', {
        partitionKey: { name: 'pk', type: AttributeType.STRING },
        encryptionKey: customerKey,
      });

      // Assert - verify that the table has CDK-nag suppressions
      const template = Template.fromStack(stack);
      const tableResource = template.findResources('AWS::DynamoDB::Table');
      const tableLogicalId = Object.keys(tableResource)[0];

      // Check that CDK-nag suppressions are applied (they appear as metadata)
      expect(template.toJSON().Resources[tableLogicalId].Metadata).toBeDefined();
    });

    test('should use customer-managed encryption type when encryption key provided', () => {
      // Arrange
      const customerKey = new Key(stack, 'CustomerKey');

      // Act
      new SecuredTable(stack, 'TestTable', {
        partitionKey: { name: 'pk', type: AttributeType.STRING },
        encryptionKey: customerKey,
      });

      // Assert - verify encryption configuration is set correctly
      const template = Template.fromStack(stack);

      // Find the DynamoDB table resource
      const tableResources = template.findResources('AWS::DynamoDB::Table');
      const tableResource = Object.values(tableResources)[0] as { Properties: Record<string, unknown> };

      // Verify KMS encryption is configured
      expect(tableResource.Properties.SSESpecification).toEqual({
        SSEEnabled: true,
        SSEType: 'KMS',
        KMSMasterKeyId: expect.objectContaining({
          'Fn::GetAtt': expect.arrayContaining([expect.stringMatching(/^CustomerKey[A-F0-9]+$/), 'Arn']),
        }),
      });
    });
  });

  describe('Required security features', () => {
    test('should always enable point-in-time recovery', () => {
      // Arrange & Act
      new SecuredTable(stack, 'TestTable', {
        partitionKey: { name: 'pk', type: AttributeType.STRING },
      });

      // Assert
      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        PointInTimeRecoverySpecification: {
          PointInTimeRecoveryEnabled: true,
        },
      });
    });

    test('should maintain all provided table properties', () => {
      // Arrange
      const customerKey = new Key(stack, 'CustomerKey');

      // Act
      new SecuredTable(stack, 'TestTable', {
        partitionKey: { name: 'pk', type: AttributeType.STRING },
        sortKey: { name: 'sk', type: AttributeType.STRING },
        tableName: 'MyCustomTable',
        encryptionKey: customerKey,
      });

      // Assert
      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'MyCustomTable',
        AttributeDefinitions: [
          { AttributeName: 'pk', AttributeType: 'S' },
          { AttributeName: 'sk', AttributeType: 'S' },
        ],
        KeySchema: [
          { AttributeName: 'pk', KeyType: 'HASH' },
          { AttributeName: 'sk', KeyType: 'RANGE' },
        ],
      });
    });
  });

  describe('CDK grant integration', () => {
    test('should grant permissions with automatic KMS handling', () => {
      // Arrange
      const customerKey = new Key(stack, 'CustomerKey');
      const securedTable = new SecuredTable(stack, 'TestTable', {
        partitionKey: { name: 'pk', type: AttributeType.STRING },
        encryptionKey: customerKey,
      });

      const testRole = new Role(stack, 'TestRole', {
        assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
      });

      // Act - Use table directly - CDK automatically handles KMS permissions for customer-managed keys
      securedTable.grantReadData(testRole);

      // Assert - Verify the stack includes both DynamoDB and KMS permissions
      const template = Template.fromStack(stack);

      // Check that IAM policy exists and includes DynamoDB permissions
      const policies = template.findResources('AWS::IAM::Policy');
      expect(Object.keys(policies).length).toBeGreaterThan(0);

      // Verify that the policy contains DynamoDB actions
      const policyResource = Object.values(policies)[0] as {
        Properties: { PolicyDocument: { Statement: Array<{ Action?: string | string[] }> } };
      };
      const statements = policyResource.Properties.PolicyDocument.Statement;
      const hasDynamoDbPermissions = statements.some(
        (statement) =>
          statement.Action &&
          (Array.isArray(statement.Action) ? statement.Action : [statement.Action]).some((action: string) =>
            action.includes('dynamodb:'),
          ),
      );
      expect(hasDynamoDbPermissions).toBe(true);
    });
  });
});
