import { Table, TableEncryption, TableProps } from 'aws-cdk-lib/aws-dynamodb';
import { IKey } from 'aws-cdk-lib/aws-kms';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';

export type SecuredTableProps = TableProps & {
  encryptionKey?: IKey;
};

export class SecuredTable extends Table {
  public override readonly encryptionKey?: IKey;
  constructor(scope: Construct, id: string, props: SecuredTableProps) {
    const encryptionConfig = SecuredTable.getEncryptionConfig(props.encryptionKey);

    super(scope, id, {
      ...props,
      ...encryptionConfig,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      },
    });

    // Store the encryption key for use in grant methods
    this.encryptionKey = props.encryptionKey;

    // Apply CDK-nag suppressions for customer-managed keys
    if (props.encryptionKey) {
      NagSuppressions.addResourceSuppressions(this, [
        {
          id: 'AwsSolutions-DDB-3',
          reason: 'Customer-managed KMS key used for DynamoDB encryption as requested by customer',
        },
      ]);
    }
  }

  private static getEncryptionConfig(encryptionKey?: IKey): Partial<TableProps> {
    if (encryptionKey) {
      return {
        encryption: TableEncryption.CUSTOMER_MANAGED,
        encryptionKey: encryptionKey,
      };
    }
    // Maintain existing default behavior
    return {
      encryption: TableEncryption.AWS_MANAGED,
    };
  }
}
