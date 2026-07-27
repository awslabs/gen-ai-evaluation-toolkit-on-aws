import { Construct } from 'constructs';
import { SecuredNodejsFunction } from '@src/common/constructs/secured';
import { PolicyStatement, Effect, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { IKey } from 'aws-cdk-lib/aws-kms';
import { Stack } from 'aws-cdk-lib';
import { suppressCdkNag } from '@src/cdk-nag-suppressions';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { IVpc } from 'aws-cdk-lib/aws-ec2';
import { EVALUATION_JOB_SCHEDULER_GROUP_NAME } from '@src/common/constants';

export interface JobSchedulerIntegrationProps {
  lambdaHandler: SecuredNodejsFunction;
  operationName: string;
  schedulerTriggerLambda: lambda.Function;
  vpc: IVpc;
  encryptionKey?: IKey;
}

export class JobSchedulerIntegration extends Construct {
  public readonly schedulerRole: Role;
  public readonly jobTriggeredHandler: lambda.Function;

  constructor(scope: Construct, id: string, props: JobSchedulerIntegrationProps) {
    super(scope, id);

    const { lambdaHandler, operationName, schedulerTriggerLambda } = props;

    // Use the Python scheduler trigger Lambda from evaluator core
    this.jobTriggeredHandler = schedulerTriggerLambda;

    // Only EventBridge Scheduler assumes this role (as Target.RoleArn) to invoke the
    // trigger Lambda. The Lambda itself executes with its own CDK-generated execution
    // role, so 'lambda.amazonaws.com' must NOT be trusted here.
    this.schedulerRole = new Role(this, `${operationName}-SchedulerRole`, {
      assumedBy: new ServicePrincipal('scheduler.amazonaws.com'),
      description: 'Role for EventBridge Scheduler to invoke Lambda functions',
    });

    this.schedulerRole.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['lambda:InvokeFunction'],
        resources: [this.jobTriggeredHandler.functionArn],
      }),
    );

    this.jobTriggeredHandler.addPermission(`${operationName}-AllowEventBridgeSchedulerInvocation`, {
      principal: new ServicePrincipal('scheduler.amazonaws.com'),
      action: 'lambda:InvokeFunction',
    });

    lambdaHandler.addToRolePolicy(
      new PolicyStatement({
        actions: ['scheduler:CreateSchedule', 'scheduler:DeleteSchedule', 'scheduler:GetSchedule'],
        resources: [
          Stack.of(this).formatArn({
            service: 'scheduler',
            resource: 'schedule',
            resourceName: `${EVALUATION_JOB_SCHEDULER_GROUP_NAME}/*`,
          }),
        ],
      }),
    );

    lambdaHandler.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['iam:PassRole'],
        resources: [this.schedulerRole.roleArn],
        conditions: {
          StringLike: {
            'iam:PassedToService': 'scheduler.amazonaws.com',
          },
        },
      }),
    );

    suppressCdkNag(lambdaHandler, 'AwsSolutions-IAM5', 'Can not avoid wildcards');

    lambdaHandler.addEnvironment('TARGET_LAMBDA_ARN', this.jobTriggeredHandler.functionArn);
    lambdaHandler.addEnvironment('SCHEDULER_ROLE_ARN', this.schedulerRole.roleArn);
  }
}
