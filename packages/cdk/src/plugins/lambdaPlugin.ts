import { EnvVariable, ServiceName } from '@common/config';
import { IEventBus, Rule } from 'aws-cdk-lib/aws-events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import { Function } from 'aws-cdk-lib/aws-lambda';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import { EventTypes } from './contracts';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { GatewayConfig } from '../common/types/gatewayConfig';
import { addGatewayEnvironment } from '../common/utils/gatewayEnvironment';

/**
 * Creates a simplified setup function for registering Lambda-based plugins.
 *
 * @internal
 * This is an internal factory function. Customers should use the methods on
 * GenAiEvaluationToolkitStacks instead:
 * - Use `genAiEtk.setupEvalLambdaPlugin()` for evaluation plugins
 * - Use `genAiEtk.setupGenLambdaPlugin()` for generation plugins
 *
 * @param eventBus - The EventBridge event bus for plugin communication
 * @param bucket - The S3 bucket for plugin data (evaluation or generation bucket)
 * @param detailType - EventBridge detail type for trigger events
 * @param gatewayConfig - Optional AI Gateway configuration
 * @returns Setup function that registers a Lambda plugin
 */
export function createSetupLambdaPlugin(
  eventBus: IEventBus,
  bucket: IBucket,
  detailType: string,
  gatewayConfig?: GatewayConfig,
) {
  /**
   * Registers a Lambda function as a plugin with automatic infrastructure setup.
   *
   * Automatically configures:
   * - Environment variables (plugin name, event bus ARN)
   * - EventBridge rule to route trigger events to the Lambda
   * - IAM permissions for S3 bucket access and EventBridge
   * - Optional Bedrock API access (all regions)
   * - AI Gateway environment variables (when gatewayConfig is provided)
   *
   * @param pluginName - Unique name for the plugin (used in configurations)
   * @param lambda - Lambda function to register as plugin
   * @param options - Configuration options
   * @param options.allowBedrockAccess - Grant Amazon Bedrock API permissions (default: false)
   */
  return function setupLambdaPlugin(pluginName: string, lambda: Function, { allowBedrockAccess = false } = {}) {
    lambda.addEnvironment(EnvVariable.PLUGIN.NAME, pluginName);
    lambda.addEnvironment(EnvVariable.PLUGIN.BUS_ARN, eventBus.eventBusArn);

    if (gatewayConfig) {
      addGatewayEnvironment(lambda, lambda, gatewayConfig);
    }

    eventBus.grantPutEventsTo(lambda);
    bucket.grantReadWrite(lambda);

    if (allowBedrockAccess) grantBedrockAccess(lambda);

    new Rule(lambda.stack, `${pluginName}_PluginTriggerRule`, {
      eventPattern: {
        source: [ServiceName],
        detailType: [detailType],
        detail: { plugin: [pluginName] },
      },
      targets: [new LambdaFunction(lambda)],
      eventBus: eventBus,
    });
  };
}

/**
 * Creates a setup function for evaluation Lambda plugins.
 *
 * @internal
 * This is an internal factory function. Customers should use
 * `genAiEtk.setupEvalLambdaPlugin()` instead.
 *
 * @param eventBus - The EventBridge event bus
 * @param bucket - The evaluation S3 bucket
 * @param gatewayConfig - Optional AI Gateway configuration
 * @returns Setup function for registering evaluation plugins
 */
export function createSetupEvalLambdaPlugin(eventBus: IEventBus, bucket: IBucket, gatewayConfig?: GatewayConfig) {
  return createSetupLambdaPlugin(eventBus, bucket, EventTypes.Evaluation.Metric.Trigger, gatewayConfig);
}

/**
 * Creates a setup function for generation Lambda plugins.
 *
 * @internal
 * This is an internal factory function. Customers should use
 * `genAiEtk.setupGenLambdaPlugin()` instead.
 *
 * @param eventBus - The EventBridge event bus
 * @param bucket - The generation S3 bucket
 * @param gatewayConfig - Optional AI Gateway configuration
 * @returns Setup function for registering generation plugins
 */
export function createSetupGenerationLambdaPlugin(eventBus: IEventBus, bucket: IBucket, gatewayConfig?: GatewayConfig) {
  return createSetupLambdaPlugin(eventBus, bucket, EventTypes.Generation.Plugin.Trigger, gatewayConfig);
}

/**
 * Grants Amazon Bedrock API permissions to a Lambda function.
 *
 * Adds IAM policy allowing InvokeModel, CreateModelInvocationJob, and GetModelInvocationJob
 * across all regions. Useful for plugins that need to call Bedrock models for evaluation
 * or generation tasks.
 *
 * @param lambda - Lambda function to grant permissions to
 * @internal
 */
function grantBedrockAccess(lambda: Function) {
  const stack = lambda.stack;

  lambda.addToRolePolicy(
    new PolicyStatement({
      effect: Effect.ALLOW,
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
