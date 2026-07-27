import { Stack } from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { Duration } from 'aws-cdk-lib';
import { Key } from 'aws-cdk-lib/aws-kms';
import { PythonLambda } from '@experiment/constructs/pythonLambda';
import { SecuredLogGroup } from '@secured';
import * as path from 'path';
import * as ec2 from 'aws-cdk-lib/aws-ec2';

const lambdaZipPath = path.resolve(__dirname, '../../../assets/experiment-lambdas.zip');
describe('PythonLambda', () => {
  let stack: Stack;
  let vpc: ec2.Vpc;

  beforeEach(() => {
    stack = new Stack();
    // Create a VPC for the test
    vpc = new ec2.Vpc(stack, 'TestVPC', {
      maxAzs: 2,
      subnetConfiguration: [
        {
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
      ],
    });
  });

  test('creates lambda function with default configuration', () => {
    // ARRANGE
    const props = {
      handler: 'index.handler',
      lambdaZipPath,
      vpc: vpc,
    };

    // ACT
    new PythonLambda(stack, 'TestLambda', props);

    // ASSERT
    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::Lambda::Function', {
      Runtime: 'python3.12',
      Handler: 'index.handler',
      MemorySize: 256,
      Timeout: 15,
      Architectures: ['x86_64'],
    });
  });

  test('creates lambda function with custom configuration', () => {
    // ARRANGE
    const props = {
      handler: 'app.handler',
      lambdaZipPath,
      memorySize: 256,
      timeout: Duration.seconds(30),
      vpc: vpc,
    };

    // ACT
    new PythonLambda(stack, 'TestLambda', props);

    // ASSERT
    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::Lambda::Function', {
      Runtime: 'python3.12',
      Handler: 'app.handler',
      MemorySize: 256,
      Timeout: 30,
      Architectures: ['x86_64'],
    });
  });

  test('creates associated log group', () => {
    // ARRANGE
    const props = {
      handler: 'index.handler',
      lambdaZipPath,
      vpc: vpc,
    };

    // ACT
    new PythonLambda(stack, 'TestLambda', props);

    // ASSERT
    const template = Template.fromStack(stack);
    template.resourceCountIs('AWS::Logs::LogGroup', 1);
  });

  test('uses provided log group', () => {
    // ARRANGE
    const logGroupName = '/aws/lambda/custom-log-group';
    const customLogGroup = new SecuredLogGroup(stack, logGroupName);

    const props = {
      handler: 'index.handler',
      lambdaZipPath,
      logGroup: customLogGroup,
      vpc: vpc,
    };

    // ACT
    new PythonLambda(stack, 'TestLambda', props);

    // ASSERT
    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::Lambda::Function', {
      Runtime: 'python3.12',
      Handler: 'index.handler',
    });
  });

  test('creates lambda with customer-managed KMS key for log group encryption', () => {
    // ARRANGE
    const customerKey = new Key(stack, 'CustomerKey');
    const props = {
      handler: 'index.handler',
      lambdaZipPath,
      vpc: vpc,
      encryptionKey: customerKey,
    };

    // ACT
    new PythonLambda(stack, 'TestLambda', props);

    // ASSERT
    const template = Template.fromStack(stack);

    // Verify Lambda function is created
    template.hasResourceProperties('AWS::Lambda::Function', {
      Runtime: 'python3.12',
      Handler: 'index.handler',
    });

    // Verify CloudWatch log group is created with KMS encryption
    template.hasResourceProperties('AWS::Logs::LogGroup', {
      KmsKeyId: {
        'Fn::GetAtt': [Match.stringLikeRegexp('CustomerKey'), 'Arn'],
      },
    });
  });

  test('creates lambda with AWS-managed encryption when no key provided', () => {
    // ARRANGE
    const props = {
      handler: 'index.handler',
      lambdaZipPath,
      vpc: vpc,
    };

    // ACT
    new PythonLambda(stack, 'TestLambda', props);

    // ASSERT
    const template = Template.fromStack(stack);

    // Verify Lambda function is created
    template.hasResourceProperties('AWS::Lambda::Function', {
      Runtime: 'python3.12',
      Handler: 'index.handler',
    });

    // Verify CloudWatch log group is created without KMS key (AWS-managed)
    template.hasResourceProperties('AWS::Logs::LogGroup', {
      KmsKeyId: Match.absent(),
    });
  });

  test('creates IAM role with VPC permissions', () => {
    // ARRANGE
    const props = {
      handler: 'index.handler',
      lambdaZipPath,
      vpc: vpc,
    };

    // ACT
    new PythonLambda(stack, 'TestLambda', props);

    // ASSERT
    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Effect: 'Allow',
            Action: [
              'ec2:CreateNetworkInterface',
              'ec2:DescribeNetworkInterfaces',
              'ec2:DeleteNetworkInterface',
              'ec2:AssignPrivateIpAddresses',
              'ec2:UnassignPrivateIpAddresses',
            ],
            Resource: '*',
          }),
        ]),
      },
    });
  });
});
