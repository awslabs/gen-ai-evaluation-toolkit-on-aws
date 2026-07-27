import { GenAiEtkServiceOperations } from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import { EnvVariable } from '@common/config';
import { getApiDetailList, getDataStoreApiLambdaHandler } from '@constructs/apiUtils';
import { SecuredNodejsFunction, SecuredQueue } from '@secured';
import { suppressCdkNag } from '@src/cdk-nag-suppressions';
import * as cdk from 'aws-cdk-lib';
import { AuthorizationType, IRestApi, LambdaIntegration } from 'aws-cdk-lib/aws-apigateway';
import { ITable } from 'aws-cdk-lib/aws-dynamodb';
import { Function } from 'aws-cdk-lib/aws-lambda';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import { IKey } from 'aws-cdk-lib/aws-kms';
import { Construct } from 'constructs';
import { IVpc } from 'aws-cdk-lib/aws-ec2';

type DatastoreApiGatewayIntegrationProps = {
  ddbTable: ITable;
  versioningBucket: IBucket;
  vpc: IVpc;
  restApi: IRestApi;
  /**
   * Optional public API to register the same routes on.
   * Same Lambda handlers are reused — external callers hit EDGE, internal
   * Lambdas use the private API via VPC endpoint. No code duplication.
   */
  publicRestApi?: IRestApi;
  encryptionKey?: IKey;
};

const DATASTORE_HANDLERS: Set<GenAiEtkServiceOperations> = new Set([
  'CreateDataset',
  'GetDataset',
  'GetDatasetVersion',
  'ListDatasets',
  'ListDatasetVersions',
  'CreateDatasetVersion',
  'ListTestCases',
  'GetTestCase',
  'DeleteTestCase',
  'RestoreDataset',
  'CreateTestCase',
  'DeleteDataset',
  'CreateAnnotationSchema',
  'ListAnnotationSchemas',
  'GetAnnotationSchema',
  'ArchiveAnnotationSchema',
  'PutDatasetVersionAnnotation',
  'PutTestCaseAnnotation',
  'DeleteDatasetVersionAnnotation',
  'DeleteTestCaseAnnotation',
]);

export class DataStoreApiGatewayIntegration {
  constructor(scope: Construct, props: DatastoreApiGatewayIntegrationProps) {
    getApiDetailList().forEach((details) => {
      if (!DATASTORE_HANDLERS.has(details.name)) return;

      const resource = props.restApi.root.resourceForPath(details.path);
      const lambdaHandler = getDataStoreApiLambdaHandler(scope, details, props.vpc);
      const method = resource.addMethod(details.method, new LambdaIntegration(lambdaHandler), {
        authorizationType: AuthorizationType.IAM,
      });

      // Register the same Lambda on the public API so external callers can reach it.
      // scopePermissionToMethod:false uses a single API-scoped Lambda permission instead of
      // one per method, avoiding the Lambda resource-based policy 20KB size limit.
      if (props.publicRestApi) {
        const publicResource = props.publicRestApi.root.resourceForPath(details.path);
        const publicMethod = publicResource.addMethod(
          details.method,
          new LambdaIntegration(lambdaHandler, { scopePermissionToMethod: false }),
          { authorizationType: AuthorizationType.IAM },
        );
        suppressCdkNag(publicMethod, 'AwsSolutions-COG4', 'API GW uses IAM auth, not Cognito.');
      }

      lambdaHandler.addEnvironment(EnvVariable.DYNAMO_TABLE_NAME, props.ddbTable.tableName);
      lambdaHandler.addEnvironment(EnvVariable.S3_BUCKET_NAME, props.versioningBucket.bucketName);

      const operationName = details.name.toLowerCase();
      if (operationName.startsWith('get') || operationName.startsWith('list')) {
        props.ddbTable.grantReadData(lambdaHandler);
        props.versioningBucket.grantRead(lambdaHandler);
      } else {
        props.ddbTable.grantReadWriteData(lambdaHandler);
        props.versioningBucket.grantReadWrite(lambdaHandler);
      }

      if (details.name === 'CreateDatasetVersion') {
        createVersioningLambda(scope, props, lambdaHandler);
      }

      if (details.name === 'RestoreDataset') {
        createRestoreLambda(scope, props, lambdaHandler);
      }
      suppressCdkNag(
        method,
        'AwsSolutions-COG4',
        'API GW is located behind a customer facing API GW with Resource Policies enabled. No need for Cognito user pool authorizer.',
      );
    });
  }
}

function createVersioningLambda(scope: Construct, props: DatastoreApiGatewayIntegrationProps, invokerLambda: Function) {
  const versioningHandler = new SecuredNodejsFunction(scope, 'VersioningLambda', {
    handler: 'index.versioningWorkerLambda.lambdaHandler',
    timeout: cdk.Duration.minutes(15),
    environment: {
      [EnvVariable.S3_BUCKET_NAME]: props.versioningBucket.bucketName,
      [EnvVariable.DYNAMO_TABLE_NAME]: props.ddbTable.tableName,
    },
    vpc: props.vpc,
  });

  props.ddbTable.grantReadWriteData(versioningHandler);
  props.versioningBucket.grantReadWrite(versioningHandler);

  // Create SQS queue, and add SQS as event source for Lambda
  const queue = new SecuredQueue(scope, 'VersioningTrigger', {
    visibilityTimeout: versioningHandler.timeout,
    encryptionKey: props.encryptionKey,
    deadLetterQueue: {
      maxReceiveCount: 3,
      queue: new SecuredQueue(scope, 'VersioningDLQ', {
        encryptionKey: props.encryptionKey,
      }),
    },
  });

  // Grant permissions to read from and to the trigger queue
  invokerLambda.addEnvironment(EnvVariable.VERSIONING_SQS_URL, queue.queueUrl);
  queue.grantSendMessages(invokerLambda);

  versioningHandler.addEventSource(
    new SqsEventSource(queue, {
      // Each event = single invocation to avoid possible timeouts
      batchSize: 1,
      reportBatchItemFailures: true,
    }),
  );
}

function createRestoreLambda(scope: Construct, props: DatastoreApiGatewayIntegrationProps, invokerLambda: Function) {
  const rollbackHandler = new SecuredNodejsFunction(scope, 'RollbackLambda', {
    handler: 'index.restoreDatasetWorkerLambda.lambdaHandler',
    timeout: cdk.Duration.minutes(15),
    environment: {
      [EnvVariable.S3_BUCKET_NAME]: props.versioningBucket.bucketName,
      [EnvVariable.DYNAMO_TABLE_NAME]: props.ddbTable.tableName,
    },
    vpc: props.vpc,
  });

  props.ddbTable.grantReadWriteData(rollbackHandler);
  props.versioningBucket.grantReadWrite(rollbackHandler);

  // Create SQS queue, and add SQS as event source for Lambda
  const queue = new SecuredQueue(scope, 'RollbackTrigger', {
    visibilityTimeout: rollbackHandler.timeout,
    encryptionKey: props.encryptionKey,
    deadLetterQueue: {
      maxReceiveCount: 3,
      queue: new SecuredQueue(scope, 'RollbackDLQ', {
        encryptionKey: props.encryptionKey,
      }),
    },
  });

  // Grant permissions to read from and to the trigger queue
  invokerLambda.addEnvironment(EnvVariable.ROLLBACK_SQS_URL, queue.queueUrl);
  queue.grantSendMessages(invokerLambda);

  rollbackHandler.addEventSource(
    new SqsEventSource(queue, {
      // Each event = single invocation to avoid possible timeouts
      batchSize: 1,
      reportBatchItemFailures: true,
    }),
  );
}
