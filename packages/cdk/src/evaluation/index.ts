import { Stack } from 'aws-cdk-lib';
import { RestApi } from 'aws-cdk-lib/aws-apigateway';
import { IVpc } from 'aws-cdk-lib/aws-ec2';
import { IEventBus } from 'aws-cdk-lib/aws-events';
import { IKey } from 'aws-cdk-lib/aws-kms';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { GenAiEvaluationToolkitStackProps } from '..';
import { EvaluationApiGatewayIntegration } from './constructs/evaluationApiGatewayIntegration';
import { evaluatorCore } from '../evaluator';

type EvaluationProps<T extends Stack> = GenAiEvaluationToolkitStackProps<T> & {
  vpc: IVpc;
  eventBus: IEventBus;
  evaluationBucket: IBucket;
  restApiId: string;
  restApiRootResourceId: string;
  publicRestApiId?: string;
  publicRestApiRootResourceId?: string;
  mlFlowServerArn: string;
  mlFlowArtifactBucket: IBucket;
  encryptionKey?: IKey;
};

export class EvaluationStack<T extends Stack> {
  public readonly stack: T;
  constructor(scope: Construct, id: string, props: EvaluationProps<T>) {
    this.stack = props.stackFactory(scope, id, {
      description: 'Stack for the GenAI Evaluation Toolkit: Evaluation',
    });

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

    // v2 evaluator core (SFN orchestration, EventBridge routing, evaluator Lambda management)
    const { schedulerTriggerLambda } = evaluatorCore(this.stack, {
      restApi,
      publicRestApi,
      vpc: props.vpc,
      encryptionKey: props.encryptionKey,
      eventBus: props.eventBus,
      evaluationBucket: props.evaluationBucket,
      mlFlowServerArn: props.mlFlowServerArn,
      mlFlowArtifactBucket: props.mlFlowArtifactBucket,
    });

    // Job scheduler API (CRUD for scheduled evaluations)
    new EvaluationApiGatewayIntegration(this.stack, {
      restApi,
      publicRestApi,
      vpc: props.vpc,
      encryptionKey: props.encryptionKey,
      schedulerTriggerLambda,
    });
  }
}
