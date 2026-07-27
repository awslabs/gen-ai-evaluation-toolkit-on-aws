import { Construct } from 'constructs';
import { ExperimentationApiGatewayIntegration } from '@experiment/constructs/experimentationApiGatewayIntegration';
import { IEventBus } from 'aws-cdk-lib/aws-events';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import { IKey } from 'aws-cdk-lib/aws-kms';
import { MLFlow } from './constructs/mlflow';
import { Stack } from 'aws-cdk-lib';
import { GenAiEvaluationToolkitStackProps } from '..';
import { RestApi } from 'aws-cdk-lib/aws-apigateway';
import { IVpc } from 'aws-cdk-lib/aws-ec2';

type ExperimentProps<T extends Stack> = GenAiEvaluationToolkitStackProps<T> & {
  eventBus: IEventBus;
  experimentBucket: IBucket;
  experimentMlFlowBucket: IBucket;
  restApiId: string;
  restApiRootResourceId: string;
  publicRestApiId?: string;
  publicRestApiRootResourceId?: string;
  vpc: IVpc;
  encryptionKey?: IKey;
};

export class ExperimentStack<T extends Stack> {
  public readonly stack: T;
  readonly mlFlowServerArn: string;
  constructor(scope: Construct, id: string, props: ExperimentProps<T>) {
    this.stack = props.stackFactory(scope, id, {
      description: 'Stack for the GenAI Evaluation Toolkit: Experimentation',
    });

    const mlFlow = new MLFlow(this.stack, 'MLFlow', {
      experimentMlFlowBucket: props.experimentMlFlowBucket,
      encryptionKey: props.encryptionKey,
    });

    this.mlFlowServerArn = mlFlow.mlFlowServerArn;

    const restApi = RestApi.fromRestApiAttributes(this.stack, 'RestApi', {
      restApiId: props.restApiId,
      rootResourceId: props.restApiRootResourceId,
    });

    const publicRestApi =
      props.publicRestApiId && props.publicRestApiId !== props.restApiId
        ? RestApi.fromRestApiAttributes(this.stack, 'PublicRestApi', {
            restApiId: props.publicRestApiId,
            rootResourceId: props.publicRestApiRootResourceId!,
          })
        : undefined;

    new ExperimentationApiGatewayIntegration(this.stack, {
      mlFlowServer: mlFlow,
      configBucket: props.experimentBucket,
      eventBus: props.eventBus,
      restApi: restApi,
      publicRestApi,
      vpc: props.vpc,
      encryptionKey: props.encryptionKey,
    });
  }
}
