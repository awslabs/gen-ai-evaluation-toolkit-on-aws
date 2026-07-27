import { DS_DDB_PK, DS_DDB_SK, EXPERIMENT_MLFLOW_BUCKET_SSM_KEY } from '@common/config';
import { ApiGateway } from '@constructs/apiGateway';
import { suppressCdkNag } from '@src/cdk-nag-suppressions';
import { EVALUATION_JOB_SCHEDULER_GROUP_NAME } from '@src/common/constants';
import { AnnotationSeeder } from '@src/datastore/constructs/annotationSeeder';
import { ApiGatewayProps, GenAiEvaluationToolkitStackProps } from '@src/index';
import { RemovalPolicy, Stack } from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { ITable } from 'aws-cdk-lib/aws-dynamodb';
import { IVpc } from 'aws-cdk-lib/aws-ec2';
import { Repository, TagMutability } from 'aws-cdk-lib/aws-ecr';
import { IKey } from 'aws-cdk-lib/aws-kms';
import { EventBus, IEventBus } from 'aws-cdk-lib/aws-events';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import { CfnScheduleGroup } from 'aws-cdk-lib/aws-scheduler';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { SecuredBucket, SecuredQueue, SecuredTable } from './secured';

export type PersistentStackProps<T extends Stack> = GenAiEvaluationToolkitStackProps<T> & {
  vpc: IVpc;
  apiGwProps: ApiGatewayProps;
  encryptionKey?: IKey;
};

export class BaseStack<T extends Stack> {
  public readonly stack: T;
  public readonly eventBus: IEventBus;
  public readonly schedulerGroup: CfnScheduleGroup;

  public readonly datastoreBucket: IBucket;
  public readonly datastoreTable: ITable;

  public readonly evaluationBucket: IBucket;

  public readonly experimentBucket: IBucket;
  public readonly experimentMlFlowBucket: IBucket;

  public readonly generationBucket: IBucket;

  public readonly ecrRepository: Repository;

  public readonly restApiId: string;
  public readonly restApiRootResourceId: string;
  /** URL of the private API Gateway — used by all internal Lambdas. */
  public readonly privateRestApiUrl: string;
  /** URL of the public API Gateway. Only set when publicEndpointType != 'DISABLED'. */
  public readonly publicRestApiUrl?: string;
  /**
   * ID and root resource ID of the public API Gateway.
   * Always a string (never undefined) to avoid CFN cross-stack export churn
   * when switching between DISABLED and EDGE/REGIONAL — CDK would break if
   * an export disappears while another stack still imports it.
   * Empty string means no public API (publicEndpointType == 'DISABLED').
   */
  public readonly publicRestApiId: string;
  public readonly publicRestApiRootResourceId: string;

  constructor(scope: Construct, id: string, props: PersistentStackProps<T>) {
    this.stack = props.stackFactory(scope, id, {
      description: 'Stack for the GenAI Evaluation Toolkit: Persistent and API GW Resources',
    });

    const eventBusDlq = new SecuredQueue(this.stack, 'DeadLetterQueue', {
      encryptionKey: props.encryptionKey,
    });
    suppressCdkNag(eventBusDlq, 'AwsSolutions-SQS3', 'Queue is used as DLQ but it is not detected by NAG');

    this.eventBus = new EventBus(this.stack, 'EventBus', {
      description: 'Event Bus for Gen AI Evaluation Toolkit',
      deadLetterQueue: eventBusDlq,
    });

    this.schedulerGroup = new CfnScheduleGroup(this.stack, 'SchedulerGroup', {
      name: EVALUATION_JOB_SCHEDULER_GROUP_NAME,
    });

    this.datastoreTable = new SecuredTable(this.stack, 'DatastoreDdbTable', {
      partitionKey: { name: DS_DDB_PK, type: dynamodb.AttributeType.STRING },
      sortKey: { name: DS_DDB_SK, type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      tableName: 'GenAiEtkDatastoreDdbTable',
      removalPolicy: RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE,
      encryptionKey: props.encryptionKey,
    });
    new AnnotationSeeder(this.stack, 'AnnotationSeeder', {
      table: this.datastoreTable,
      vpc: props.vpc,
    });

    this.datastoreBucket = new SecuredBucket(this.stack, 'DataStoreBucket', {
      bucketName: `genai-etk-datastore-${this.stack.account}-${this.stack.region}`,
      encryptionKey: props.encryptionKey,
    });

    // Bucket can potentially accumulate many temp testing data very quickly
    this.evaluationBucket = new SecuredBucket(this.stack, 'TestDataS3Bucket', {
      expireObjectsAfter: props.evaluationTempTestDataExpireAfter,
      encryptionKey: props.encryptionKey,
    });

    this.experimentBucket = new SecuredBucket(this.stack, 'ExperimentConfig', {
      bucketName: `genai-etk-experimentconfig-${this.stack.account}-${this.stack.region}`,
      encryptionKey: props.encryptionKey,
    });
    this.experimentMlFlowBucket = new SecuredBucket(this.stack, 'ExperimentArtifactStore', {
      bucketName: `genai-etk-experimentartifacts-${this.stack.account}-${this.stack.region}`,
      encryptionKey: props.encryptionKey,
    });

    new StringParameter(this.stack, 'ExperimentMlFlowBucketName', {
      parameterName: EXPERIMENT_MLFLOW_BUCKET_SSM_KEY,
      stringValue: this.experimentMlFlowBucket.bucketName,
      description: 'The name of the GenAI ETK experiment MLFlow bucket',
    });

    this.generationBucket = new SecuredBucket(this.stack, 'GenerationBucket', {
      encryptionKey: props.encryptionKey,
    });

    this.ecrRepository = new Repository(this.stack, 'GenAiEtkEcrRepository', {
      imageTagMutability: TagMutability.MUTABLE,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const apiGateway = new ApiGateway(this.stack, 'ApiGateway', props);
    // Must export API as IDs rather than "IRestAPI" to avoid excessive stack exports
    this.restApiId = apiGateway.privateRestApi.restApiId;
    this.restApiRootResourceId = apiGateway.privateRestApi.restApiRootResourceId;
    this.privateRestApiUrl = apiGateway.privateRestApi.url;
    this.publicRestApiUrl = apiGateway.publicRestApi?.url;
    // Always export stable non-empty values for publicRestApiId/RootResourceId.
    // When DISABLED, we fall back to the private API's IDs — dependent stacks
    // reconstruct an IRestApi from these but only register public routes when
    // the value differs from restApiId (i.e. a real public API exists).
    // Using fallback rather than empty string prevents CFN cross-stack export
    // churn when toggling between DISABLED and EDGE/REGIONAL on live stacks.
    this.publicRestApiId = apiGateway.publicRestApi?.restApiId ?? this.restApiId;
    this.publicRestApiRootResourceId = apiGateway.publicRestApi?.restApiRootResourceId ?? this.restApiRootResourceId;

    // SSM parameter: only created when a public API exists, for external callers (CLI, customer tooling).
    // Internal Lambdas are wired directly at deploy time — no SSM lookup needed.
    if (apiGateway.publicRestApi) {
      new StringParameter(this.stack, 'RestApiEndpoint', {
        parameterName: '/genai-etk/restApiEndpoint',
        stringValue: this.publicRestApiUrl!,
        description: 'URL for GenAI ETK REST API endpoints (public)',
      });
    }

    // Manual exports for backward compatibility
    this.stack.exportValue(this.ecrRepository.repositoryName);
    this.stack.exportValue(this.ecrRepository.repositoryArn);
  }
}
