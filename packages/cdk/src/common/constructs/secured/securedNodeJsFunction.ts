import * as lambda from 'aws-cdk-lib/aws-lambda';
import { ILogGroup } from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { SecuredLogGroup } from './securedLogGroup';
import * as cdk from 'aws-cdk-lib';
import { suppressCdkNag } from '@src/cdk-nag-suppressions';
import { PhysicalName } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { IVpc, SubnetType } from 'aws-cdk-lib/aws-ec2';
import { IKey } from 'aws-cdk-lib/aws-kms';
import * as fs from 'fs';
import path from 'path';
import { findPackageRoot } from '@src/common/utils/packageRoot';

// Make vpc a required property by removing it from the base type and adding it explicitly
export type SecuredNodejsFunctionProps = Omit<lambda.FunctionOptions, 'runtime' | 'architecture' | 'vpc' | 'code'> & {
  vpc: IVpc; // VPC is now required
  encryptionKey?: IKey; // Optional customer-managed KMS key
  handler: string; // Required: handler path within the bundle (e.g., 'index.handlerName.lambdaHandler')
};

const DEFAULT_MEMORY_SIZE = 512;
const DEFAULT_LAMBDA_TIMEOUT = cdk.Duration.minutes(1);

export class SecuredNodejsFunction extends lambda.Function {
  /**
   * Returns the pre-built Lambda code from the single nodejs-handlers bundle
   * This follows the same pattern as Python Lambdas - single zip file for all handlers
   *
   * @returns Code.fromAsset pointing to the single nodejs-handlers bundle
   * @throws Error if the prebundled code doesn't exist
   */
  private static getPrebuiltLambdaCode(): lambda.Code {
    // Find package root by climbing up the directory tree looking for package.json
    // This works for both development and published package scenarios
    const packageRoot = findPackageRoot();
    const bundlePath = path.join(packageRoot, 'assets', 'lambda-handlers', 'nodejs-handlers');

    if (!fs.existsSync(bundlePath)) {
      throw new Error(
        `Prebundled Lambda code not found at ${bundlePath}. ` +
          `Please run 'npm run prebuild' to generate Lambda bundles before CDK synthesis.`,
      );
    }

    return lambda.Code.fromAsset(bundlePath);
  }

  /**
   * Creates a new SecuredNodejsFunction with pre-built Lambda code.
   *
   * All Lambda handlers must be pre-bundled during the build phase.
   * The pre-bundled code should be available at assets/lambda-handlers/nodejs-handlers/
   *
   * @param scope - The CDK construct scope
   * @param id - The CDK construct ID
   * @param props - Function properties with secure defaults applied
   */
  constructor(scope: Construct, id: string, props: SecuredNodejsFunctionProps) {
    const { memorySize, timeout, tracing, handler, ...otherProps } = props;

    // Create a secured log group if one is not provided
    const logGroup =
      props.logGroup ??
      new SecuredLogGroup(scope, `${id}-LogGroup`, {
        encryptionKey: props.encryptionKey,
      });

    // Create minimal role if none provided
    const role = props.role ?? SecuredLogGroup.from(logGroup as ILogGroup).createMinimalRoleForLambda();

    // Configuration using pre-built Lambda code
    const config: lambda.FunctionProps = {
      functionName: PhysicalName.GENERATE_IF_NEEDED,
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: memorySize ?? DEFAULT_MEMORY_SIZE,
      logGroup: logGroup,
      timeout: timeout ?? DEFAULT_LAMBDA_TIMEOUT,
      tracing: tracing ?? lambda.Tracing.ACTIVE,
      role: role,
      vpcSubnets: { subnetType: SubnetType.PRIVATE_WITH_EGRESS },
      code: SecuredNodejsFunction.getPrebuiltLambdaCode(),
      handler: handler,
      ...otherProps,
    };

    super(scope, id, config);

    suppressCdkNag(this, [
      // Suppress for Node.js runtime version since we're using the latest LTS
      { id: 'AwsSolutions-L1', reason: 'Using latest Node.js LTS version (22.x)' },
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
