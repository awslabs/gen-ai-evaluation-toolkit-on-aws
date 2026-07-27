import { suppressCdkNag } from '@src/cdk-nag-suppressions';
import { SecuredNodejsFunction } from '@src/common/constructs/secured';
import { Duration, Stack } from 'aws-cdk-lib';
import { RestApi } from 'aws-cdk-lib/aws-apigateway';
import { IVpc } from 'aws-cdk-lib/aws-ec2';
import { IEventBus } from 'aws-cdk-lib/aws-events';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { GenAiEvaluationToolkitStackProps } from '..';
import { DatastoreExportPlugin } from './datastoreExport';
import { createSetupEvalLambdaPlugin, createSetupGenerationLambdaPlugin } from './lambdaPlugin';

type PluginStacksProps<T extends Stack> = GenAiEvaluationToolkitStackProps<T> & {
  restApiId: string;
  restApiRootResourceId: string;
  privateRestApiUrl: string;
  vpc: IVpc;
  eventBus: IEventBus;
  evaluationBucket: IBucket;
  generationBucket: IBucket;
};

export class PluginsStack<T extends Stack> {
  public readonly stack: T;

  constructor(scope: Construct, id: string, props: PluginStacksProps<T>) {
    this.stack = props.stackFactory(scope, id, {
      description: 'Stack for the GenAI Evaluation Toolkit: Evaluation and Generation Plugins',
    });

    // === Evaluation plugins ===
    const setupEvalLambdaPlugin = createSetupEvalLambdaPlugin(props.eventBus, props.evaluationBucket);

    // Noop plugin
    setupEvalLambdaPlugin(
      'evalNoopPlugin',
      new SecuredNodejsFunction(this.stack, 'EvalNoopFunction', {
        vpc: props.vpc,
        timeout: Duration.seconds(30),
        handler: 'index.noopPluginHandlerLambda.lambdaHandler',
      }),
    );

    // === Generation Plugins ===
    const setupGenLambdaPlugin = createSetupGenerationLambdaPlugin(props.eventBus, props.generationBucket);

    // Noop plugin
    setupGenLambdaPlugin(
      'generationNoopPlugin',
      new SecuredNodejsFunction(this.stack, 'GenNoopFunction', {
        vpc: props.vpc,
        timeout: Duration.seconds(30),
        handler: 'index.noopPluginHandlerLambda.lambdaHandler',
      }),
    );

    // Datastore export
    new DatastoreExportPlugin(this.stack, 'DatastoreExportPlugin', {
      // API
      privateRestApiUrl: props.privateRestApiUrl,
      restApi: RestApi.fromRestApiAttributes(this.stack, 'RestApi', {
        restApiId: props.restApiId,
        rootResourceId: props.restApiRootResourceId,
      }),

      // Plugin dependencies
      vpc: props.vpc,
      eventBus: props.eventBus,
      grantReadWriteGenerationBucket: (scope, role) => {
        props.generationBucket.grantReadWrite(role);
        suppressCdkNag(
          scope,
          'AwsSolutions-IAM5',
          'Plugins need unrestricted wildcard access to the generation bucket',
        );
      },
    });
  }
}
