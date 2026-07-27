import { suppressCdkNag } from '@src/cdk-nag-suppressions';
import { PhysicalName, RemovalPolicy } from 'aws-cdk-lib';
import { Role, ServicePrincipal, IPrincipal } from 'aws-cdk-lib/aws-iam';
import { ILogGroup, LogGroup, LogGroupProps, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { IKey } from 'aws-cdk-lib/aws-kms';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';

type SecuredLogGroupProps = LogGroupProps & {
  encryptionKey?: IKey;
};

export class SecuredLogGroup extends LogGroup {
  public readonly encryptionKey?: IKey;
  constructor(scope: Construct, id: string, props: SecuredLogGroupProps = {}) {
    const config: LogGroupProps = {
      removalPolicy: RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE,
      retention: RetentionDays.EIGHTEEN_MONTHS, // Set during pentest review for compliance/audit requirements
      ...props,
      encryptionKey: props.encryptionKey,
    };

    super(scope, id, config);

    // Store the encryption key for use in grant methods
    this.encryptionKey = props.encryptionKey;

    // Apply CDK-nag suppressions for customer-managed keys
    if (props.encryptionKey) {
      NagSuppressions.addResourceSuppressions(this, [
        {
          id: 'AwsSolutions-CWL-1',
          reason: 'Customer-managed KMS key used for CloudWatch Logs encryption as requested by customer',
        },
      ]);
    }
  }

  /**
   * Grant write permissions to a principal, including KMS permissions if the log group is encrypted
   */
  public override grantWrite(grantee: IPrincipal) {
    // Grant the standard CloudWatch Logs write permissions
    const grant = super.grantWrite(grantee);

    // If this log group uses a customer-managed KMS key, also grant KMS permissions
    if (this.encryptionKey) {
      this.encryptionKey.grantEncryptDecrypt(grantee);
    }

    return grant;
  }

  static from(logGroup: ILogGroup) {
    return {
      createMinimalRoleFor(principle: IPrincipal): Role {
        const parent = logGroup.node.scope ?? logGroup;
        const role = new Role(parent, `${logGroup.node.id}-ServiceRole`, {
          roleName: PhysicalName.GENERATE_IF_NEEDED,
          assumedBy: principle,
          description: `Minimal execution role for ${principle} to write into ${logGroup.node.id}`,
        });

        // Grant write permissions to the log group (includes KMS permissions if encrypted)
        logGroup.grantWrite(role);

        suppressCdkNag(role, 'AwsSolutions-IAM5', 'No way to avoid wildcards for log groups');

        return role;
      },

      createMinimalRoleForLambda(): Role {
        return this.createMinimalRoleFor(new ServicePrincipal('lambda.amazonaws.com'));
      },

      createMinimalRoleForStepFunction(): Role {
        return this.createMinimalRoleFor(new ServicePrincipal('states.amazonaws.com'));
      },
    };
  }
}
