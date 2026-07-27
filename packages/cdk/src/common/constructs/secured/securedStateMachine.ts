import { Construct } from 'constructs';
import { StateMachineProps, StateMachine, LogLevel, LogOptions, StateMachineType } from 'aws-cdk-lib/aws-stepfunctions';
import { ILogGroup } from 'aws-cdk-lib/aws-logs';
import { IKey } from 'aws-cdk-lib/aws-kms';
import { SecuredLogGroup } from './securedLogGroup';
import { suppressCdkNag } from '@src/cdk-nag-suppressions';

export type SecuredStateMachineProps = StateMachineProps & {
  encryptionKey?: IKey;
};

export class SecuredStateMachine extends StateMachine {
  public readonly encryptionKey?: IKey;

  constructor(scope: Construct, id: string, props?: SecuredStateMachineProps) {
    const logGroupName = `${props?.stateMachineName ?? id}-LogGroup`.slice(0, 256);
    const logs: LogOptions = {
      destination:
        props?.logs?.destination ??
        new SecuredLogGroup(scope, `${id}-LogGroup`, {
          logGroupName,
          encryptionKey: props?.encryptionKey,
        }),
      level: props?.logs?.level ?? LogLevel.ALL,
    };

    // Create minimal role if none provided
    const role = props?.role ?? SecuredLogGroup.from(logs.destination as ILogGroup).createMinimalRoleForStepFunction();

    const config: StateMachineProps = {
      ...props,
      stateMachineName: id,
      role: role,
      logs: logs,
      tracingEnabled: true,
      stateMachineType: StateMachineType.STANDARD,
    };

    super(scope, id, config);

    // Suppress CDK-NAG for AWS managed policies and wildcard permissions used by Step Functions
    suppressCdkNag(this, [
      {
        id: 'AwsSolutions-IAM4',
        reason: 'Using AWS managed policies for Step Function execution role is AWS best practice',
      },
      {
        id: 'AwsSolutions-IAM5',
        reason:
          'Wildcard permissions are necessary for Step Functions to access CloudWatch Logs, X-Ray, and invoke Lambda functions',
      },
    ]);

    this.encryptionKey = props?.encryptionKey;
  }
}
