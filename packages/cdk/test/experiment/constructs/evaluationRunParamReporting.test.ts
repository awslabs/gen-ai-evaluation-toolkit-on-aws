import { Stack } from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import * as events from 'aws-cdk-lib/aws-events';
import { Key } from 'aws-cdk-lib/aws-kms';
import { EvaluationRunParamReporting } from '@experiment/constructs/evaluationRunParamReporting';
import { EVALUATION_RUN_START_EVENT_TYPE } from '@common';
import * as path from 'path';
import { Vpc } from 'aws-cdk-lib/aws-ec2';

describe('EvaluationRunParamReporting', () => {
  let stack: Stack;
  const mlflowTrackingServerArn = 'arn:aws:sagemaker:us-east-1:123456789012:experiment-tracking/test';
  const lambdaZipPath = path.resolve(__dirname, '../../../assets/experiment-lambdas.zip');
  let vpc: Vpc;

  beforeEach(() => {
    stack = new Stack();
    vpc = new Vpc(stack, 'TestVpc');
  });

  test('creates lambda function with correct configuration', () => {
    // ARRANGE & ACT
    new EvaluationRunParamReporting(stack, 'TestReporting', {
      mlflowTrackingServerArn,
      lambdaZipPath,
      vpc,
    });

    // ASSERT
    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::Lambda::Function', {
      Handler: 'experiment_lambda.eventbridge.report_configuration_lambda.handler',
      Environment: {
        Variables: {
          MLFLOW_TRACKING_SERVER_ARN: mlflowTrackingServerArn,
        },
      },
    });
  });

  test('creates IAM role with correct MLflow permissions', () => {
    // ARRANGE & ACT
    new EvaluationRunParamReporting(stack, 'TestReporting', {
      mlflowTrackingServerArn,
      lambdaZipPath,
      vpc,
    });

    // ASSERT
    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Effect: 'Allow',
            Action: 'sts:AssumeRole',
            Principal: { Service: 'lambda.amazonaws.com' },
          }),
        ]),
      },
    });
  });

  test('creates EventBridge rule with correct configuration', () => {
    // ARRANGE & ACT
    new EvaluationRunParamReporting(stack, 'TestReporting', {
      mlflowTrackingServerArn,
      lambdaZipPath,
      vpc,
    });

    // ASSERT
    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::Events::Rule', {
      EventPattern: {
        'detail-type': [EVALUATION_RUN_START_EVENT_TYPE],
      },
      Targets: Match.arrayWith([
        Match.objectLike({
          Arn: {
            'Fn::GetAtt': Match.arrayWith(['TestReportingExperimentReportFunction0B5E0EDD']),
          },
        }),
      ]),
    });
  });

  test('uses custom event bus when provided', () => {
    // ARRANGE
    const customEventBus = new events.EventBus(stack, 'CustomEventBus');

    // ACT
    new EvaluationRunParamReporting(stack, 'TestReporting', {
      mlflowTrackingServerArn,
      eventBus: customEventBus,
      lambdaZipPath,
      vpc,
    });

    // ASSERT
    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::Events::Rule', {
      EventBusName: Match.objectLike({
        Ref: Match.stringLikeRegexp('CustomEventBus'),
      }),
    });
  });

  test('creates lambda with customer-managed KMS key support', () => {
    // ARRANGE
    const customerKey = new Key(stack, 'CustomerKey');

    // ACT
    new EvaluationRunParamReporting(stack, 'TestReporting', {
      mlflowTrackingServerArn,
      lambdaZipPath,
      vpc,
      encryptionKey: customerKey,
    });

    // ASSERT
    const template = Template.fromStack(stack);

    // Verify Lambda function is created
    template.hasResourceProperties('AWS::Lambda::Function', {
      Handler: 'experiment_lambda.eventbridge.report_configuration_lambda.handler',
    });

    // Verify KMS permissions are granted to Lambda role
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Effect: 'Allow',
            Action: Match.arrayWith(['kms:Decrypt', 'kms:GenerateDataKey*']),
            Resource: {
              'Fn::GetAtt': [Match.stringLikeRegexp('CustomerKey'), 'Arn'],
            },
          }),
        ]),
      },
    });
  });

  test('creates lambda without KMS permissions when no encryption key provided', () => {
    // ARRANGE & ACT
    new EvaluationRunParamReporting(stack, 'TestReporting', {
      mlflowTrackingServerArn,
      lambdaZipPath,
      vpc,
    });

    // ASSERT
    const template = Template.fromStack(stack);

    // Verify Lambda function is created
    template.hasResourceProperties('AWS::Lambda::Function', {
      Handler: 'experiment_lambda.eventbridge.report_configuration_lambda.handler',
    });

    // Verify no KMS permissions are granted
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.not(
          Match.arrayWith([
            Match.objectLike({
              Action: Match.arrayWith(['kms:Decrypt']),
            }),
          ]),
        ),
      },
    });
  });

  test('creates secured log group with customer-managed encryption', () => {
    // ARRANGE
    const customerKey = new Key(stack, 'CustomerKey');

    // ACT
    new EvaluationRunParamReporting(stack, 'TestReporting', {
      mlflowTrackingServerArn,
      lambdaZipPath,
      vpc,
      encryptionKey: customerKey,
    });

    // ASSERT
    const template = Template.fromStack(stack);

    // Verify CloudWatch log group is created with KMS encryption
    template.hasResourceProperties('AWS::Logs::LogGroup', {
      KmsKeyId: {
        'Fn::GetAtt': [Match.stringLikeRegexp('CustomerKey'), 'Arn'],
      },
    });
  });
});
