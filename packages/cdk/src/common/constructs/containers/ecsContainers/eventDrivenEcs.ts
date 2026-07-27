import { EnvVariable, ServiceName } from '../../../config';
import { GenAiEtkPluginProps } from '../../../../plugins/contracts';
import { suppressCdkNag } from '../../../../cdk-nag-suppressions';
import { SecuredNodejsFunction, SecuredQueue } from '../../secured';
import { Stack } from 'aws-cdk-lib';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { BaseEcs } from './baseEcs';

export type EcsBasedPluginProps = GenAiEtkPluginProps & {
  /**
   * The name of the plugin
   */
  name: string;

  /**
   * The detail type for the EventBridge rule
   */
  detailType: string;

  /**
   * The container image to use for the ECS task
   */
  image: ecs.ContainerImage;

  fargateConfig?: ecs.FargateTaskDefinitionProps;
};

export class EcsBasedPlugin extends BaseEcs {
  constructor(scope: Construct, id: string, props: EcsBasedPluginProps) {
    super(scope, id, {
      vpc: props.vpc,
      image: props.image,
      fargateConfig: props.fargateConfig ?? {},
      name: props.name,
    });

    // Add EventBridge and Bedrock permissions
    this.addEventBridgePermissions(props.eventBus);
    this.addBedrockPermissions();

    // Add environment variables to container
    this.containerDefinition.addEnvironment('EVENT_BUS_ARN', props.eventBus.eventBusArn);
    this.containerDefinition.addEnvironment('PLUGIN_NAME', props.name);

    // Create Lambda trigger
    const triggerLambda = new SecuredNodejsFunction(this, 'ECSTriggerLambda', {
      description: `Lambda function to trigger ${props.name} plugin`,
      handler: 'index.triggerLambda.lambdaHandler',
      vpc: props.vpc,
      environment: {
        [EnvVariable.PLUGIN.ECS.TASK_CONTAINER_NAME]: 'PluginContainer',
        [EnvVariable.PLUGIN.ECS.CLUSTER_NAME]: this.cluster.clusterName,
        [EnvVariable.PLUGIN.ECS.SUBNET_IDS]: props.vpc.privateSubnets.map((s) => s.subnetId).join(','),
        [EnvVariable.PLUGIN.ECS.TASK_DEFINITION]: this.taskDefinition.taskDefinitionArn,
        [EnvVariable.PLUGIN.ECS.TASK_SECURITY_GROUP_ID]: this.securityGroup.securityGroupId,
      },
    });

    // Grant Lambda permissions
    triggerLambda.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['ecs:RunTask', 'ecs:DescribeTasks'],
        resources: [this.taskDefinition.taskDefinitionArn],
      }),
    );

    triggerLambda.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['iam:PassRole'],
        resources: [this.taskDefinition.executionRole!.roleArn, this.taskDefinition.taskRole.roleArn],
      }),
    );

    // Create EventBridge rule
    const rule = new events.Rule(this, 'EventbridgeRule', {
      eventPattern: {
        source: [ServiceName],
        detailType: [props.detailType],
        detail: {
          plugin: [props.name],
        },
      },
      eventBus: props.eventBus,
      description: `Rule to invoke ECS task for plugin: ${props.name}`,
    });

    const dlq = new SecuredQueue(this, 'DLQ', {
      encryptionKey: props.encryptionKey,
    });
    suppressCdkNag(dlq, 'AwsSolutions-SQS3', 'Queue is indeed used as DLQ but it is not detected by NAG');

    rule.addTarget(
      new targets.LambdaFunction(triggerLambda, {
        event: events.RuleTargetInput.fromObject({
          detail: events.EventField.fromPath('$.detail'),
        }),
        deadLetterQueue: dlq,
      }),
    );
  }

  private addEventBridgePermissions(eventBus: events.IEventBus): void {
    eventBus.grantPutEventsTo(this.taskRole);
  }

  private addBedrockPermissions(): void {
    const stack = Stack.of(this);
    this.taskRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['bedrock:CreateModelInvocationJob', 'bedrock:GetModelInvocationJob', 'bedrock:InvokeModel'],
        resources: [
          stack.formatArn({
            service: 'bedrock',
            resource: 'model-invocation-job',
            resourceName: '*',
            region: '*',
          }),
          stack.formatArn({
            service: 'bedrock',
            resource: 'inference-profile',
            resourceName: '*',
            region: '*',
          }),
          stack.formatArn({
            service: 'bedrock',
            resource: 'foundation-model',
            resourceName: '*',
            account: '',
            region: '*',
          }),
        ],
      }),
    );
  }
}
