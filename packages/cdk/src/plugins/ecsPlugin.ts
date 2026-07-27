import { IVpc } from 'aws-cdk-lib/aws-ec2';
import { IEventBus } from 'aws-cdk-lib/aws-events';
import { IKey } from 'aws-cdk-lib/aws-kms';
import { Bucket, IBucket } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { suppressCdkNag } from '../cdk-nag-suppressions';
import { EnvVariable } from '../common/config';
import { EcsBasedPlugin, EcsBasedPluginProps } from '../common/constructs/containers/ecsContainers';
import { SecuredBucket } from '../common/constructs/secured';
import { GatewayConfig } from '../common/types/gatewayConfig';
import { addGatewayEnvironment } from '../common/utils/gatewayEnvironment';
import { EventTypes } from './contracts';

/**
 * Simplified ECS-based evaluation plugin construct.
 *
 * @internal
 * This class is not typically instantiated directly. Customers should use
 * `genAiEtk.createEvalEcsPlugin()` which returns an instance of this class.
 *
 * Extends EcsBasedPlugin with pre-configured settings for evaluation plugins.
 * Automatically grants S3 read/write access to the evaluation bucket and configures
 * the correct EventBridge detail type for evaluation metrics.
 */
export class EvalEcsPlugin extends EcsBasedPlugin {
  constructor(
    scope: Construct,
    id: string,
    props: Omit<EcsBasedPluginProps, 'detailType'> & { evaluationBucket: IBucket },
  ) {
    super(scope, id, {
      detailType: EventTypes.Evaluation.Metric.Trigger,
      ...props,
    });

    props.evaluationBucket.grantReadWrite(this.taskRole);
    suppressCdkNag(
      this.taskRole.stack,
      'AwsSolutions-IAM5',
      'Plugins need unrestricted wildcard access to the evaluation bucket',
    );
  }
}

/**
 * Creates a factory function for simplified evaluation ECS plugin creation.
 *
 * @internal
 * This is an internal factory function. Customers should use
 * `genAiEtk.createEvalEcsPlugin()` instead.
 *
 * @param evalBucket - S3 bucket for evaluation data
 * @param eventBus - EventBridge event bus for plugin communication
 * @param vpc - VPC for ECS tasks
 * @param kmsKey - Optional KMS key for encryption
 * @returns Factory function that creates EvalEcsPlugin instances
 */
export type CreateEvalEcsPlugin = (
  scope: Construct,
  id: string,
  props: Omit<EcsBasedPluginProps, 'detailType' | 'eventBus' | 'vpc' | 'encryptionKey' | 'evaluationBucket'>,
) => EvalEcsPlugin;

export function createEvalEcsPluginFactory(
  evalBucket: IBucket,
  eventBus: IEventBus,
  vpc: IVpc,
  kmsKey?: IKey,
  gatewayConfig?: GatewayConfig,
): CreateEvalEcsPlugin {
  return function createEvalEcsPlugin(
    scope: Construct,
    id: string,
    props: Omit<EcsBasedPluginProps, 'detailType' | 'eventBus' | 'vpc' | 'encryptionKey' | 'evaluationBucket'>,
  ): EvalEcsPlugin {
    const plugin = new EvalEcsPlugin(scope, id, {
      eventBus,
      vpc,
      encryptionKey: kmsKey,
      evaluationBucket: evalBucket,
      ...props,
    });
    if (gatewayConfig) {
      addGatewayEnvironment(plugin.containerDefinition, plugin.taskRole, gatewayConfig);
    }
    return plugin;
  };
}

/**
 * Simplified ECS-based generation plugin construct.
 *
 * @internal
 * This class is not typically instantiated directly. Customers should use
 * `genAiEtk.createGenEcsPlugin()` which returns an instance of this class.
 *
 * Extends EcsBasedPlugin with pre-configured settings for generation plugins.
 * Automatically grants S3 read/write access to the generation bucket, creates
 * an internal bucket for intermediate data, and configures the correct EventBridge
 * detail type for generation plugins.
 */
export class GenerationEcsPlugin extends EcsBasedPlugin {
  /**
   * Internal S3 bucket for intermediate generation data.
   * Automatically created and granted read/write access to the task role.
   */
  public readonly internalBucket: Bucket;

  constructor(
    scope: Construct,
    id: string,
    props: Omit<EcsBasedPluginProps, 'detailType'> & { generationBucket: IBucket },
  ) {
    super(scope, id, {
      detailType: EventTypes.Generation.Plugin.Trigger,
      ...props,
    });

    props.generationBucket.grantReadWrite(this.taskRole);
    suppressCdkNag(
      this.taskRole.stack,
      'AwsSolutions-IAM5',
      'Plugins need unrestricted wildcard access to the evaluation bucket',
    );

    this.internalBucket = new SecuredBucket(this, 'RAGInternalBucket', { encryptionKey: props.encryptionKey });
    this.internalBucket.grantReadWrite(this.taskRole);

    this.containerDefinition.addEnvironment(EnvVariable.PLUGIN.ECS.GEN.INTERNAL_BUCKET, this.internalBucket.bucketName);
  }
}

/**
 * Creates a factory function for simplified generation ECS plugin creation.
 *
 * @internal
 * This is an internal factory function. Customers should use
 * `genAiEtk.createGenEcsPlugin()` instead.
 *
 * @param genBucket - S3 bucket for generation data
 * @param eventBus - EventBridge event bus for plugin communication
 * @param vpc - VPC for ECS tasks
 * @param kmsKey - Optional KMS key for encryption
 * @returns Factory function that creates GenerationEcsPlugin instances
 */
export type CreateGenEcsPlugin = (
  scope: Construct,
  id: string,
  props: Omit<EcsBasedPluginProps, 'detailType' | 'eventBus' | 'vpc' | 'encryptionKey' | 'generationBucket'>,
) => GenerationEcsPlugin;

export function createGenEcsPluginFactory(
  genBucket: IBucket,
  eventBus: IEventBus,
  vpc: IVpc,
  kmsKey?: IKey,
  gatewayConfig?: GatewayConfig,
): CreateGenEcsPlugin {
  return function createGenEcsPlugin(
    scope: Construct,
    id: string,
    props: Omit<EcsBasedPluginProps, 'detailType' | 'eventBus' | 'vpc' | 'encryptionKey' | 'generationBucket'>,
  ): GenerationEcsPlugin {
    const plugin = new GenerationEcsPlugin(scope, id, {
      eventBus,
      vpc,
      encryptionKey: kmsKey,
      generationBucket: genBucket,
      ...props,
    });
    if (gatewayConfig) {
      addGatewayEnvironment(plugin.containerDefinition, plugin.taskRole, gatewayConfig);
    }
    return plugin;
  };
}
