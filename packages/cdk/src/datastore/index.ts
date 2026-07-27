import { Construct } from 'constructs';
import { DataStoreApiGatewayIntegration } from './constructs/datastoreApiGatewayIntegration';
import { Stack } from 'aws-cdk-lib';
import { IVpc } from 'aws-cdk-lib/aws-ec2';
import { IEventBus } from 'aws-cdk-lib/aws-events';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import { ITable } from 'aws-cdk-lib/aws-dynamodb';
import { IKey } from 'aws-cdk-lib/aws-kms';
import { GenAiEvaluationToolkitStackProps } from '..';
import { RestApi } from 'aws-cdk-lib/aws-apigateway';

type DataStoreProps<T extends Stack> = GenAiEvaluationToolkitStackProps<T> & {
  vpc: IVpc;
  eventBus: IEventBus;
  datastoreBucket: IBucket;
  datastoreTable: ITable;
  restApiId: string;
  restApiRootResourceId: string;
  publicRestApiId?: string;
  publicRestApiRootResourceId?: string;
  encryptionKey?: IKey;
};

export class DataStoreStack<T extends Stack = Stack> {
  public readonly stack: T;
  constructor(scope: Construct, id: string, props: DataStoreProps<T>) {
    this.stack = props.stackFactory(scope, id, {
      description: 'Stack for the GenAI Evaluation Toolkit: Datastore',
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

    new DataStoreApiGatewayIntegration(this.stack, {
      ddbTable: props.datastoreTable,
      versioningBucket: props.datastoreBucket,
      restApi: restApi,
      publicRestApi,
      vpc: props.vpc,
      encryptionKey: props.encryptionKey,
    });
  }
}
