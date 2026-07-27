import { ML_FLOW_SERVER_NAME } from '@src/common/constants';
import { BaseStack } from '@src/common/constructs/baseStack';
import { App, Arn, Duration, Environment, Stack, StackProps } from 'aws-cdk-lib';
import { IVpc } from 'aws-cdk-lib/aws-ec2';
import { IEventBus } from 'aws-cdk-lib/aws-events';
import { IRole } from 'aws-cdk-lib/aws-iam';
import { IKey } from 'aws-cdk-lib/aws-kms';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { ServiceName } from './common/config';
import { ApiDeployStack } from './common/constructs/apiDeployStack';
import { EcsBasedPlugin, EcsBasedPluginProps } from './common/constructs/containers/ecsContainers/eventDrivenEcs';
import { MonitoringStack } from './common/constructs/telemetry/monitoring';
import { S3Ref } from './common/types';
import { DataStoreStack } from './datastore';
import { EvaluationStack } from './evaluation';
import { ExperimentStack } from './experiment';
import { GenerationStack } from './generation';
import { PluginsStack } from './plugins';
import { EventTypes } from './plugins/contracts/constants';
import { createSetupEvalLambdaPlugin, createSetupGenerationLambdaPlugin } from './plugins/lambdaPlugin';
import {
  CreateEvalEcsPlugin,
  createEvalEcsPluginFactory,
  CreateGenEcsPlugin,
  createGenEcsPluginFactory,
  EvalEcsPlugin,
  GenerationEcsPlugin,
} from './plugins/ecsPlugin';

import { GatewayConfig } from './common/types/gatewayConfig';
export type { GatewayConfig };

export type GenAiEvaluationToolkitStackProps<T extends Stack = Stack> = {
  evaluationTempTestDataExpireAfter?: Duration;
  stackFactory: (
    scope: Construct,
    id: string,
    props: Omit<StackProps, 'description'> & Required<Pick<StackProps, 'description'>>,
  ) => T;
};

export type PublicEndpointType = 'EDGE' | 'REGIONAL' | 'DISABLED';

export type ApiGatewayProps = {
  /** Controls the public-facing endpoint. Defaults to 'EDGE'. Set to 'DISABLED' for fully private deployments. */
  publicEndpointType?: PublicEndpointType;
  /** VPC endpoint ID for the execute-api interface endpoint. Always required — used for the private API. */
  apiGwVpcEndpointId: string;
};

export type GenAiEvaluationToolkitConstructProps<T extends Stack = Stack> = {
  vpc: IVpc;
  apiGwProps: ApiGatewayProps;
  encryptionKey?: IKey;
  /** Optional AI Gateway config — when provided, plugins route LLM calls through the gateway */
  gatewayConfig?: GatewayConfig;
} & (GenAiEvaluationToolkitStackProps<T> | { env: Environment });

type GenAiEvaluationToolkitExports = {
  restApiId: string;
  /** URL of the private API Gateway — used by all internal Lambdas. */
  privateRestApiUrl: string;
  /** URL of the public API Gateway, if one was created (i.e. publicEndpointType != 'DISABLED'). */
  publicRestApiUrl?: string;
  /**
   * ID and root resource ID of the public API.
   * When publicEndpointType is 'DISABLED', these fall back to the private API's
   * IDs — feature stacks detect this by comparing publicRestApiId === restApiId
   * and skip public route registration when they match.
   * Always a string (never undefined) to keep CFN cross-stack exports stable
   * when toggling publicEndpointType on live stacks.
   */
  publicRestApiId: string;
  publicRestApiRootResourceId: string;
  eventBus: IEventBus;
  mlFlowServerArn: string;
  datastoreBucket: IBucket;
  evaluationBucket: IBucket;
  generationBucket: IBucket;
  generationWorkflowRole: IRole;
  datastoreTableName: string;
};

export type { S3Ref };

export { EcsBasedPlugin, EvalEcsPlugin, GenerationEcsPlugin, EventTypes };
export type { CreateEvalEcsPlugin, CreateGenEcsPlugin };
export type { EcsBasedPluginProps };

// SDK v2 evaluator constructs
import { LambdaEvaluator, LambdaEvaluatorProps } from './plugins/lambdaEvaluator';
export { LambdaEvaluator };
export type { LambdaEvaluatorProps };

/**
 * Gen AI Evaluation Toolkit CDK Constructs
 *
 * Provides the complete infrastructure for deploying Gen AI ETK, including API Gateway,
 * Lambda handlers, Step Functions workflows, and plugin deployment utilities.
 *
 * @example
 * ```typescript
 * const genAiEtk = new GenAiEvaluationToolkitStacks(app, 'GenAiEtk', {
 *   env,
 *   vpc: vpc,
 *   apiGwProps: { apiGwVpcEndpointId: 'vpce-xxx', publicEndpointType: 'EDGE' },
 * });
 * ```
 */
export class GenAiEvaluationToolkitStacks<T extends Stack = Stack> {
  public readonly stacks: T[];
  public readonly exports: GenAiEvaluationToolkitExports;

  /**
   * Registers an AWS Lambda function as an evaluation plugin.
   *
   * Automatically configures:
   * - EventBridge rule to route trigger events to the Lambda
   * - IAM permissions for S3 evaluation bucket access and EventBridge
   * - Environment variables (plugin name, event bus ARN)
   * - Optional Amazon Bedrock API permissions
   *
   * @param pluginName - Unique name for the plugin (used in evaluation configurations)
   * @param lambda - Lambda function to register as evaluation plugin
   * @param options - Configuration options
   * @param options.allowBedrockAccess - Grant Amazon Bedrock API permissions (default: false)
   *
   * @example
   * ```typescript
   * const myPlugin = new Function(this, 'MyEvalPlugin', {
   *   runtime: Runtime.PYTHON_3_12,
   *   handler: 'index.handler',
   *   code: Code.fromAsset('path/to/plugin'),
   *   timeout: Duration.minutes(15),
   * });
   *
   * genAiEtk.setupEvalLambdaPlugin('myCustomPlugin', myPlugin, {
   *   allowBedrockAccess: true
   * });
   * ```
   */
  public readonly setupEvalLambdaPlugin: ReturnType<typeof createSetupEvalLambdaPlugin>;

  /**
   * Registers an AWS Lambda function as a generation plugin.
   *
   * Automatically configures:
   * - EventBridge rule to route trigger events to the Lambda
   * - IAM permissions for S3 generation bucket access and EventBridge
   * - Environment variables (plugin name, event bus ARN)
   * - Optional Amazon Bedrock API permissions
   *
   * @param pluginName - Unique name for the plugin (used in generation configurations)
   * @param lambda - Lambda function to register as generation plugin
   * @param options - Configuration options
   * @param options.allowBedrockAccess - Grant Amazon Bedrock API permissions (default: false)
   *
   * @example
   * ```typescript
   * const myPlugin = new Function(this, 'MyGenPlugin', {
   *   runtime: Runtime.PYTHON_3_12,
   *   handler: 'index.handler',
   *   code: Code.fromAsset('path/to/plugin'),
   * });
   *
   * genAiEtk.setupGenLambdaPlugin('myGenPlugin', myPlugin);
   * ```
   */
  public readonly setupGenLambdaPlugin: ReturnType<typeof createSetupGenerationLambdaPlugin>;

  /**
   * Creates an ECS Fargate-based evaluation plugin.
   *
   * Automatically configures:
   * - ECS task definition with specified Fargate configuration
   * - EventBridge rule to trigger the plugin
   * - IAM task role with S3 evaluation bucket and EventBridge permissions
   * - VPC networking and security groups
   * - Automatic scaling via Fargate tasks
   *
   * @param scope - CDK construct scope
   * @param id - Unique construct identifier
   * @param props - Plugin configuration
   * @param props.name - Plugin name used in evaluation configurations
   * @param props.image - Container image for the plugin
   * @param props.fargateConfig - CPU and memory configuration
   * @returns EvalEcsPlugin construct with taskRole for additional permissions
   *
   * @example
   * ```typescript
   * const myPlugin = genAiEtk.createEvalEcsPlugin(this, 'MyEcsPlugin', {
   *   name: 'myCustomPlugin',
   *   image: ContainerImage.fromAsset('path/to/dockerfile'),
   *   fargateConfig: {
   *     cpu: 4 * 1024,
   *     memoryLimitMiB: 16 * 1024,
   *   },
   * });
   *
   * // Grant additional permissions if needed
   * myPlugin.taskRole.addManagedPolicy(...);
   * ```
   */
  public readonly createEvalEcsPlugin: CreateEvalEcsPlugin;

  /**
   * Creates an ECS Fargate-based generation plugin.
   *
   * Automatically configures:
   * - ECS task definition with specified Fargate configuration
   * - EventBridge rule to trigger the plugin
   * - IAM task role with S3 generation bucket and EventBridge permissions
   * - VPC networking and security groups
   * - Internal S3 bucket for intermediate data
   * - Automatic scaling via Fargate tasks
   *
   * @param scope - CDK construct scope
   * @param id - Unique construct identifier
   * @param props - Plugin configuration
   * @param props.name - Plugin name used in generation configurations
   * @param props.image - Container image for the plugin
   * @param props.fargateConfig - CPU and memory configuration
   * @returns GenerationEcsPlugin construct with taskRole and internalBucket
   *
   * @example
   * ```typescript
   * const myPlugin = genAiEtk.createGenEcsPlugin(this, 'MyGenPlugin', {
   *   name: 'myGenPlugin',
   *   image: ContainerImage.fromAsset('path/to/dockerfile'),
   *   fargateConfig: {
   *     cpu: 2 * 1024,
   *     memoryLimitMiB: 8 * 1024,
   *   },
   * });
   * ```
   */
  public readonly createGenEcsPlugin: CreateGenEcsPlugin;

  constructor(app: App, id: string, props: GenAiEvaluationToolkitConstructProps<T>) {
    const env = 'env' in props ? props.env : {};
    const stackFactory =
      'stackFactory' in props
        ? props.stackFactory
        : (scope: Construct, id: string, props: StackProps) =>
            new Stack(scope, id, { stackName: id, ...props, env }) as T;

    const baseStack = new BaseStack(app, `${id}-Base`, {
      ...props,
      stackFactory,
      encryptionKey: props.encryptionKey,
    });

    // Common props and stack exports
    const commonProps = {
      ...props,
      eventBus: baseStack.eventBus,
      datastoreBucket: baseStack.datastoreBucket,
      evaluationBucket: baseStack.evaluationBucket,
      experimentBucket: baseStack.experimentBucket,
      experimentMlFlowBucket: baseStack.experimentMlFlowBucket,
      generationBucket: baseStack.generationBucket,
      datastoreTable: baseStack.datastoreTable,
      restApiId: baseStack.restApiId,
      restApiRootResourceId: baseStack.restApiRootResourceId,
      privateRestApiUrl: baseStack.privateRestApiUrl,
      // Public API IDs — passed to feature stacks so the same Lambdas can be
      // registered on both APIs (external callers use EDGE, internal Lambdas
      // use the private API via the VPC endpoint — no proxy, no code duplication).
      publicRestApiId: baseStack.publicRestApiId,
      publicRestApiRootResourceId: baseStack.publicRestApiRootResourceId,
      ecrRepository: baseStack.ecrRepository,
      stackFactory,
    };

    // Feature stacks
    const datastoreStack = new DataStoreStack(app, `${id}-DataStore`, {
      ...commonProps,
      encryptionKey: props.encryptionKey,
    });

    const experimentStack = new ExperimentStack(app, `${id}-Experiment`, {
      ...commonProps,
      encryptionKey: props.encryptionKey,
    });

    const evaluationStack = new EvaluationStack(app, `${id}-Evaluation`, {
      ...commonProps,
      encryptionKey: props.encryptionKey,
      mlFlowServerArn: Arn.format(
        {
          service: 'sagemaker',
          resource: 'mlflow-tracking-server',
          resourceName: ML_FLOW_SERVER_NAME,
          region: env.region,
          account: env.account,
        },
        baseStack.stack,
      ),
      mlFlowArtifactBucket: commonProps.experimentMlFlowBucket,
    });
    evaluationStack.stack.addDependency(experimentStack.stack);

    const generationStack = new GenerationStack(app, `${id}-Generation`, commonProps);

    // Stack for API deployment
    const apiDeployStack = new ApiDeployStack(app, `${id}-ApiDeploy`, {
      ...commonProps,
      publicRestApiId: baseStack.publicRestApiId,
      publicRestApiRootResourceId: baseStack.publicRestApiRootResourceId,
    });
    apiDeployStack.stack.addDependency(datastoreStack.stack);
    apiDeployStack.stack.addDependency(evaluationStack.stack);
    apiDeployStack.stack.addDependency(experimentStack.stack);
    apiDeployStack.stack.addDependency(generationStack.stack);

    const pluginsStack = new PluginsStack(app, `${id}-Plugins`, commonProps);

    const monitoringStack = new MonitoringStack(app, `${id}-TLM`, {
      ...commonProps,
      serviceMonitorConfig: [
        {
          serviceName: ServiceName,
          restApiIds: [commonProps.restApiId],
        },
      ],
    });

    this.stacks = [
      baseStack.stack,
      datastoreStack.stack,
      evaluationStack.stack,
      experimentStack.stack,
      generationStack.stack,
      apiDeployStack.stack,
      pluginsStack.stack,
      monitoringStack.stack,
    ];

    this.exports = {
      restApiId: baseStack.restApiId,
      privateRestApiUrl: baseStack.privateRestApiUrl,
      publicRestApiUrl: baseStack.publicRestApiUrl,
      publicRestApiId: baseStack.publicRestApiId,
      publicRestApiRootResourceId: baseStack.publicRestApiRootResourceId,
      eventBus: baseStack.eventBus,
      mlFlowServerArn: experimentStack.mlFlowServerArn,
      datastoreBucket: baseStack.datastoreBucket,
      evaluationBucket: baseStack.evaluationBucket,
      generationBucket: baseStack.generationBucket,
      generationWorkflowRole: generationStack.workflowRoleArn,
      datastoreTableName: baseStack.datastoreTable.tableName,
    };

    this.setupEvalLambdaPlugin = createSetupEvalLambdaPlugin(
      baseStack.eventBus,
      baseStack.evaluationBucket,
      props.gatewayConfig,
    );
    this.setupGenLambdaPlugin = createSetupGenerationLambdaPlugin(
      baseStack.eventBus,
      baseStack.generationBucket,
      props.gatewayConfig,
    );

    this.createEvalEcsPlugin = createEvalEcsPluginFactory(
      baseStack.evaluationBucket,
      baseStack.eventBus,
      props.vpc,
      props.encryptionKey,
      props.gatewayConfig,
    );

    this.createGenEcsPlugin = createGenEcsPluginFactory(
      baseStack.generationBucket,
      baseStack.eventBus,
      props.vpc,
      props.encryptionKey,
      props.gatewayConfig,
    );
  }
}
