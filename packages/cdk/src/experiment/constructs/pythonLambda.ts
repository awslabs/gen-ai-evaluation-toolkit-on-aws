import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import { Duration, PhysicalName } from 'aws-cdk-lib';
import { ILogGroup } from 'aws-cdk-lib/aws-logs';
import { SecuredLogGroup } from '@secured';
import { suppressCdkNag } from '@src/cdk-nag-suppressions';
import * as iam from 'aws-cdk-lib/aws-iam';
import { IVpc, SubnetType } from 'aws-cdk-lib/aws-ec2';
import { IKey } from 'aws-cdk-lib/aws-kms';

const DEFAULT_MEMORY_SIZE = 256;
const DEFAULT_LAMBDA_TIMEOUT = Duration.seconds(15);

// Make vpc a required property by removing it from the base type and adding it explicitly
type PythonLambdaFunctionProps = Omit<
  lambda.FunctionProps,
  'runtime' | 'code' | 'loggingFormat' | 'architecture' | 'vpc'
> & {
  lambdaZipPath: string;
  vpc: IVpc; // VPC is now required
  encryptionKey?: IKey; // Optional customer-managed KMS key
};

export class PythonLambda extends lambda.Function {
  constructor(scope: Construct, id: string, props: PythonLambdaFunctionProps) {
    // Create a secured log group if one is not provided
    const logGroup =
      props.logGroup ??
      new SecuredLogGroup(scope, `${id}-LogGroup`, {
        encryptionKey: props.encryptionKey,
      });

    // Create minimal role if none provided
    const role = props.role ?? SecuredLogGroup.from(logGroup as ILogGroup).createMinimalRoleForLambda();

    const config: lambda.FunctionProps = {
      functionName: PhysicalName.GENERATE_IF_NEEDED,
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: props.handler,
      code: lambda.Code.fromAsset(props.lambdaZipPath),
      architecture: lambda.Architecture.X86_64,
      memorySize: props.memorySize ?? DEFAULT_MEMORY_SIZE,
      timeout: props.timeout ?? DEFAULT_LAMBDA_TIMEOUT,
      loggingFormat: lambda.LoggingFormat.JSON,
      logGroup: logGroup,
      role: role,
      vpc: props.vpc,
      // place Lambda in private subnets
      vpcSubnets: { subnetType: SubnetType.PRIVATE_WITH_EGRESS },
    };
    super(scope, id, config);

    suppressCdkNag(this, [
      // Suppress for Python runtime version
      { id: 'AwsSolutions-L1', reason: 'Python 3.11 is required for compatibility with dependencies' },
      // Suppress for AWS managed policies and wildcard permissions used by Lambda functions
      {
        id: 'AwsSolutions-IAM4',
        reason: 'Using AWS managed policies for Lambda execution role is AWS best practice',
      },
      {
        id: 'AwsSolutions-IAM5',
        reason:
          'Wildcard permissions are necessary for Lambda to access CloudWatch Logs, X-Ray, and other AWS services',
      },
    ]);

    this.role?.addToPrincipalPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'ec2:CreateNetworkInterface',
          'ec2:DescribeNetworkInterfaces',
          'ec2:DeleteNetworkInterface',
          'ec2:AssignPrivateIpAddresses',
          'ec2:UnassignPrivateIpAddresses',
        ],
        resources: ['*'],
      }),
    );
  }
}
