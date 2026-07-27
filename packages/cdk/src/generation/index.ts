import { Construct } from 'constructs';
import { GenerationApiGatewayIntegration } from './constructs/generationApiGatewayIntegration';
import { IVpc } from 'aws-cdk-lib/aws-ec2';
import { GenerationStateMachine } from './constructs/generationWorkflow';
import { IEventBus } from 'aws-cdk-lib/aws-events';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import { Stack } from 'aws-cdk-lib';
import { RestApi } from 'aws-cdk-lib/aws-apigateway';
import { GenAiEvaluationToolkitStackProps } from '..';
import { IRole } from 'aws-cdk-lib/aws-iam';

type GenerationProps<T extends Stack> = GenAiEvaluationToolkitStackProps<T> & {
  vpc: IVpc;
  eventBus: IEventBus;
  generationBucket: IBucket;
  restApiId: string;
  restApiRootResourceId: string;
  publicRestApiId?: string;
  publicRestApiRootResourceId?: string;
};

export class GenerationStack<T extends Stack> {
  public readonly stack: T;
  public readonly workflowRoleArn: IRole;
  constructor(scope: Construct, id: string, { ...props }: GenerationProps<T>) {
    this.stack = props.stackFactory(scope, id, {
      description: 'Stack for the GenAI Evaluation Toolkit: Generation',
    });

    const stateMachine = new GenerationStateMachine(this.stack, id, {
      ...props,
    });
    // Export evaluation workflow role, customer may need to add permissions to access arbitrary buckets
    this.workflowRoleArn = stateMachine.stateMachine.role;
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

    new GenerationApiGatewayIntegration(this.stack, {
      ...props,
      workflow: stateMachine.stateMachine,
      restApi,
      publicRestApi,
    });
  }
}
