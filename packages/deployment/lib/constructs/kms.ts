import { Construct } from 'constructs';
import { Key, IKey } from 'aws-cdk-lib/aws-kms';
import { Alias } from 'aws-cdk-lib/aws-kms';
import { PolicyDocument, PolicyStatement, Effect, AccountRootPrincipal, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { IGrantable, Grant } from 'aws-cdk-lib/aws-iam';
import { Stack } from 'aws-cdk-lib';

export interface CustomerManagedKmsKeyProps {
  /**
   * Description for the KMS key
   */
  keyDescription: string;

  /**
   * Alias for the KMS key (without the 'alias/' prefix)
   */
  keyAlias: string;
}

/**
 * A CDK construct that creates a customer-managed KMS key with an alias
 * for use in encryption scenarios where customer-managed keys are required.
 */
export class CustomerManagedKmsKey extends Construct {
  public readonly key: IKey;
  public readonly keyAlias: string;
  public readonly alias: Alias;

  constructor(scope: Construct, id: string, props: CustomerManagedKmsKeyProps) {
    super(scope, id);

    // Create the KMS key with default settings
    this.key = new Key(this, 'Key', {
      description: props.keyDescription,
      enableKeyRotation: true,
      policy: this.createDefaultKeyPolicy(),
    });

    // Create the alias
    this.keyAlias = props.keyAlias;
    this.alias = new Alias(this, 'Alias', {
      aliasName: `alias/${props.keyAlias}`,
      targetKey: this.key,
    });
  }

  /**
   * Grant encrypt and decrypt permissions to a grantee
   */
  public grantEncryptDecrypt(grantee: IGrantable): Grant {
    return this.key.grantEncryptDecrypt(grantee);
  }

  /**
   * Add a statement to the key's resource policy
   */
  public addToResourcePolicy(statement: PolicyStatement): void {
    this.key.addToResourcePolicy(statement);
  }

  /**
   * Creates a default key policy that allows the account root to manage the key
   * and includes necessary service permissions for CloudWatch Logs
   */
  private createDefaultKeyPolicy(): PolicyDocument {
    const region = Stack.of(this).region;

    return new PolicyDocument({
      statements: [
        // Allow account root to manage the key
        new PolicyStatement({
          sid: 'Enable IAM User Permissions',
          effect: Effect.ALLOW,
          principals: [new AccountRootPrincipal()],
          actions: ['kms:*'],
          resources: ['*'],
        }),
        // Allow CloudWatch Logs service to use the key
        new PolicyStatement({
          sid: 'Allow CloudWatch Logs',
          effect: Effect.ALLOW,
          principals: [new ServicePrincipal(`logs.${region}.amazonaws.com`)],
          actions: ['kms:Encrypt', 'kms:Decrypt', 'kms:ReEncrypt*', 'kms:GenerateDataKey*', 'kms:DescribeKey'],
          resources: ['*'],
          conditions: {
            ArnEquals: {
              'kms:EncryptionContext:aws:logs:arn': Stack.of(this).formatArn({
                service: 'logs',
                resource: '*',
              }),
            },
          },
        }),
      ],
    });
  }
}
