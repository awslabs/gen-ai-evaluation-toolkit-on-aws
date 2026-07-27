import { suppressCdkNag } from '@src/cdk-nag-suppressions';
import { ApiGatewayProps } from '@src/index';
import {
  AuthorizationType,
  EndpointType,
  RestApi,
  LogGroupLogDestination,
  AccessLogFormat,
  MethodLoggingLevel,
  CfnAccount,
} from 'aws-cdk-lib/aws-apigateway';
import { InterfaceVpcEndpoint, IVpc } from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { SecuredLogGroup } from './secured/securedLogGroup';
type ApiGatewayConstructProps = {
  vpc: IVpc;
  apiGwProps: ApiGatewayProps;
};

export class ApiGateway extends Construct {
  /**
   * The private API Gateway — always created, used by all internal Lambdas.
   * Only reachable from within the VPC via the execute-api VPC endpoint.
   */
  public readonly privateRestApi: RestApi;

  /**
   * The public API Gateway — only created when publicEndpointType is 'EDGE' or 'REGIONAL'.
   * Used by external callers (CLI, customer tooling). Undefined for fully private deployments.
   */
  public readonly publicRestApi?: RestApi;

  constructor(scope: Construct, id: string, props: ApiGatewayConstructProps) {
    super(scope, id);

    // Shared CloudWatch role and account config (one per account, shared by both APIs)
    const cloudWatchRole = new iam.Role(this, 'ApiGatewayCloudWatchRole', {
      assumedBy: new iam.ServicePrincipal('apigateway.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonAPIGatewayPushToCloudWatchLogs'),
      ],
    });
    const apiGatewayAccount = new CfnAccount(this, 'ApiGatewayAccount', {
      cloudWatchRoleArn: cloudWatchRole.roleArn,
    });

    // --- Private API (always created) ---
    // NOTE: construct ID must stay 'RestApi' (not 'PrivateRestApi') to preserve
    // the CloudFormation logical ID and cross-stack exports from the original single-API design.
    const privateLogGroup = new SecuredLogGroup(this, 'AccessLogs');
    this.privateRestApi = new RestApi(this, 'RestApi', {
      deploy: true,
      deployOptions: {
        stageName: 'prod',
        tracingEnabled: true,
        metricsEnabled: true,
        loggingLevel: MethodLoggingLevel.INFO,
        accessLogDestination: new LogGroupLogDestination(privateLogGroup),
        accessLogFormat: AccessLogFormat.jsonWithStandardFields(),
      },
      restApiName: `${id}-private`,
      endpointConfiguration: {
        types: [EndpointType.PRIVATE],
        vpcEndpoints: [
          InterfaceVpcEndpoint.fromInterfaceVpcEndpointAttributes(this, 'PrivateVpceLookup', {
            vpcEndpointId: props.apiGwProps.apiGwVpcEndpointId,
            port: 443,
          }),
        ],
      },
      // Deny all traffic not originating from our VPC
      policy: this.buildVpcRestrictedPolicy(props.vpc),
      defaultMethodOptions: {
        authorizationType: AuthorizationType.IAM,
      },
    });
    this.privateRestApi.node.addDependency(apiGatewayAccount);
    // Dummy method required by CDK when routes are defined across stacks
    // https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_apigateway-readme.html#breaking-up-methods-and-resources-across-stacks
    const privateMethod = this.privateRestApi.root.addMethod('ANY', undefined, {
      authorizationType: AuthorizationType.IAM,
    });

    // --- Public API (optional) ---
    const publicEndpointType = props.apiGwProps.publicEndpointType ?? 'EDGE';
    if (publicEndpointType !== 'DISABLED') {
      const publicLogGroup = new SecuredLogGroup(this, 'PublicAccessLogs');
      this.publicRestApi = new RestApi(this, 'PublicRestApi', {
        deploy: true,
        deployOptions: {
          stageName: 'prod',
          tracingEnabled: true,
          metricsEnabled: true,
          loggingLevel: MethodLoggingLevel.INFO,
          accessLogDestination: new LogGroupLogDestination(publicLogGroup),
          accessLogFormat: AccessLogFormat.jsonWithStandardFields(),
        },
        restApiName: `${id}-public`,
        endpointConfiguration: {
          types: [publicEndpointType === 'REGIONAL' ? EndpointType.REGIONAL : EndpointType.EDGE],
        },
        defaultMethodOptions: {
          authorizationType: AuthorizationType.IAM,
        },
      });
      this.publicRestApi.node.addDependency(apiGatewayAccount);
      const publicMethod = this.publicRestApi.root.addMethod('ANY', undefined, {
        authorizationType: AuthorizationType.IAM,
      });
      suppressCdkNag(publicMethod, 'AwsSolutions-COG4', 'API GW uses IAM auth, not Cognito.');
      suppressCdkNag(this.publicRestApi, [
        {
          id: 'AwsSolutions-APIG6',
          reason:
            'CloudWatch execution logging disabled per pentest review; access logs are sufficient for this use case.',
        },
        {
          id: 'AwsSolutions-APIG1',
          reason: 'Pentest-approved: access logging configured via separate access log group.',
        },
        { id: 'AwsSolutions-APIG2', reason: 'Request validation handled at application layer for flexibility.' },
      ]);
    }

    suppressCdkNag(privateMethod, 'AwsSolutions-COG4', 'API GW uses IAM auth, not Cognito.');
    suppressCdkNag(this, [
      {
        id: 'AwsSolutions-APIG6',
        reason:
          'CloudWatch execution logging disabled per pentest review; access logs are sufficient for this use case.',
      },
      {
        id: 'AwsSolutions-APIG1',
        reason: 'Pentest-approved: access logging configured via separate access log group.',
      },
      {
        id: 'AwsSolutions-IAM4',
        reason:
          'AWS managed policies used for API Gateway CloudWatch logging role; acceptable for logging-only permissions.',
      },
      { id: 'AwsSolutions-APIG2', reason: 'Request validation handled at application layer for flexibility.' },
    ]);
  }

  // Private APIGateway Resource Policy:
  // https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-resource-policies-examples.html
  //
  // Only the DENY statement is present — no broad Allow *.
  // This ensures same-account IAM identity policies are enforced (Table A:
  // "Neither Allow nor Deny" resource policy + IAM policy = IAM decides).
  // A broad Allow * would bypass IAM path-level restrictions for same-account
  // callers, making executeApiRoutes grants on Lambda roles ineffective.
  private buildVpcRestrictedPolicy(vpc: IVpc): iam.PolicyDocument {
    return new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          principals: [new iam.AnyPrincipal()],
          actions: ['execute-api:Invoke'],
          resources: ['execute-api:/*'],
          effect: iam.Effect.DENY,
          conditions: {
            StringNotEquals: {
              'aws:SourceVpc': vpc.vpcId,
            },
          },
        }),
      ],
    });
  }
}
