import { Construct } from 'constructs';
import { IVpc } from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Arn, Stack } from 'aws-cdk-lib';
import { ServiceName } from '@common/config';
import { suppressCdkNag } from '@src/cdk-nag-suppressions';

export type BaseEcsProps = {
  vpc: IVpc;
  image: ecs.ContainerImage;
  name: string;
  fargateConfig: ecs.FargateTaskDefinitionProps;
};

export class BaseEcs extends Construct {
  public readonly cluster: ecs.Cluster;
  public readonly taskDefinition: ecs.FargateTaskDefinition;
  public readonly taskRole: iam.Role;
  public readonly securityGroup: ec2.SecurityGroup;
  public readonly containerDefinition: ecs.ContainerDefinition;
  public readonly vpc: IVpc;

  constructor(scope: Construct, id: string, props: BaseEcsProps) {
    super(scope, id);

    this.vpc = props.vpc;

    // Create ECS Cluster with container insights
    this.cluster = new ecs.Cluster(this, 'Cluster', {
      vpc: props.vpc,
      enableFargateCapacityProviders: true,
      containerInsights: true,
    });

    // Create security group
    this.securityGroup = new ec2.SecurityGroup(this, 'SecurityGroup', {
      vpc: props.vpc,
      allowAllOutbound: true,
      description: `Security group for ${props.name} ECS task`,
    });

    // Create IAM roles
    this.taskRole = new iam.Role(this, 'TaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      description: `Task role for ${props.name}`,
    });

    const executionRole = new iam.Role(this, 'ExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });

    // Add observability permissions
    this.addObservabilityPermissions(executionRole);

    // Create task definition
    this.taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDefinition', {
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.X86_64,
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      },
      taskRole: this.taskRole,
      executionRole,
      ...props.fargateConfig,
    });

    // Add OTEL collector
    this.addOtelCollector();

    // Add main container
    const streamPrefix = `${id}-${props.name}-task`;
    this.containerDefinition = this.taskDefinition.addContainer('PluginContainer', {
      image: props.image,
      logging: ecs.LogDrivers.awsLogs({ streamPrefix }),
    });
  }

  private createLogGroupArn(resourceName: string): string {
    return Arn.format({ service: 'logs', resource: 'log-group', resourceName }, Stack.of(this));
  }

  private addObservabilityPermissions(executionRole: iam.Role): void {
    // X-Ray permissions
    const xrayPolicy = new iam.Policy(this, 'XRayPolicy', {
      statements: [
        new iam.PolicyStatement({
          actions: [
            'xray:PutTraceSegments',
            'xray:PutTelemetryRecords',
            'xray:GetSamplingRules',
            'xray:GetSamplingTargets',
            'xray:GetSamplingStatisticSummaries',
          ],
          resources: ['*'],
        }),
      ],
    });

    // CloudWatch permissions
    const cloudWatchPolicy = new iam.Policy(this, 'CloudWatchPolicy', {
      statements: [
        new iam.PolicyStatement({
          actions: ['cloudwatch:PutMetricData'],
          resources: ['*'],
        }),
        new iam.PolicyStatement({
          actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents', 'logs:DescribeLogStreams'],
          resources: [
            this.createLogGroupArn('/aws/ecs/ecs-aws-otel-collector*'),
            this.createLogGroupArn('/aws/ecs/ecs-aws-otel-collector*:log-stream:*'),
            this.createLogGroupArn('/aws/ecs/*-task*'),
            this.createLogGroupArn('/aws/ecs/*-task*:log-stream:*'),
            this.createLogGroupArn(`/aws/ecs/containerinsights/${this.cluster.clusterName}*`),
            this.createLogGroupArn(`/aws/ecs/containerinsights/${this.cluster.clusterName}*:log-stream:*`),
          ],
        }),
        new iam.PolicyStatement({
          actions: ['ssm:GetParameters'],
          resources: [
            Arn.format({ service: 'ssm', resource: 'parameter', resourceName: 'AmazonCloudWatch-*' }, Stack.of(this)),
          ],
        }),
      ],
    });

    xrayPolicy.attachToRole(this.taskRole);
    cloudWatchPolicy.attachToRole(this.taskRole);

    // Suppress cdk-nag warnings for observability policies
    suppressCdkNag(xrayPolicy, [
      {
        id: 'AwsSolutions-IAM5',
        reason:
          'X-Ray policy requires wildcard resource permissions (Resource::*) for tracing operations ' +
          '(PutTraceSegments, PutTelemetryRecords, GetSamplingRules, etc.). This is the standard AWS pattern for X-Ray integration.',
      },
    ]);

    suppressCdkNag(cloudWatchPolicy, [
      {
        id: 'AwsSolutions-IAM5',
        reason:
          'CloudWatch policy requires: 1) wildcard resource (Resource::*) for PutMetricData as metrics are not known in advance, ' +
          '2) wildcard log group ARNs (ecs-aws-otel-collector*, *-task*, containerinsights/*) for ECS task logging and container insights, ' +
          '3) wildcard SSM parameter (AmazonCloudWatch-*) for CloudWatch agent configuration. ' +
          'These are standard AWS patterns for ECS observability.',
      },
    ]);

    // ECR permissions for execution role
    executionRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['ecr:GetAuthorizationToken'],
        resources: ['*'],
      }),
    );

    executionRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['ecr-public:GetAuthorizationToken', 'sts:GetServiceBearerToken'],
        resources: ['*'],
      }),
    );

    executionRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['ecr:BatchCheckLayerAvailability', 'ecr:GetDownloadUrlForLayer', 'ecr:BatchGetImage'],
        resources: [Arn.format({ service: 'ecr', resource: 'repository', resourceName: '*' }, Stack.of(this))],
      }),
    );

    executionRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['logs:CreateLogStream', 'logs:PutLogEvents'],
        resources: [
          this.createLogGroupArn('/aws/ecs/ecs-aws-otel-collector*:*'),
          this.createLogGroupArn('/aws/ecs/ecs-aws-otel-collector*:log-stream:*'),
          this.createLogGroupArn('/aws/ecs/*-task*:*'),
          this.createLogGroupArn('/aws/ecs/*-task*:log-stream:*'),
        ],
      }),
    );

    // Suppress cdk-nag warnings for execution role wildcard permissions
    // These are required for ECS task execution and observability
    suppressCdkNag(executionRole, [
      {
        id: 'AwsSolutions-IAM5',
        reason:
          'Execution role requires wildcard permissions for: ' +
          '1) ECR operations (ecr:GetAuthorizationToken on *, ecr repository operations on ecr:repository/*) to pull container images, ' +
          '2) CloudWatch Logs operations on log groups with wildcards (*-task*, ecs-aws-otel-collector*) for task logging. ' +
          'These are standard permissions required for ECS task execution and observability.',
      },
    ]);
  }

  private addOtelCollector(): void {
    this.taskDefinition.addContainer('aws-otel-collector', {
      image: ecs.ContainerImage.fromRegistry('public.ecr.aws/aws-observability/aws-otel-collector:latest'),
      command: ['--config=/etc/ecs/container-insights/otel-task-metrics-config.yaml'],
      essential: true,
      environment: {
        AWS_REGION: Stack.of(this).region,
        CLUSTER_NAME: this.cluster.clusterName,
        TASK_ARN: '${ECS_CONTAINER_METADATA_URI_V4}',
        SERVICE_NAME: ServiceName,
      },
      logging: new ecs.AwsLogDriver({
        streamPrefix: 'ecs-aws-otel-collector',
      }),
    });

    suppressCdkNag(
      this.taskDefinition,
      'AwsSolutions-ECS2',
      'This is the usual way how the otel collector is configured',
    );
  }
}
