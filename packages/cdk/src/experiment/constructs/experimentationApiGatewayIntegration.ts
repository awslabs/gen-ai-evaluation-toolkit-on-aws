import { GenAiEtkServiceOperations } from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import { AuthorizationType, IRestApi, LambdaIntegration } from 'aws-cdk-lib/aws-apigateway';
import { IEventBus } from 'aws-cdk-lib/aws-events';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import { IKey } from 'aws-cdk-lib/aws-kms';
import { EnvVariable } from '@common/config';
import {
  getApiDetailList,
  getExperimentApiPythonLambdaHandler,
  getExperimentApiTypescriptLambdaHandler,
} from '@constructs/apiUtils';

import { MLFlow } from './mlflow';
import path from 'path';
import { EvaluationRunParamReporting } from './evaluationRunParamReporting';
import { findPackageRoot } from '@src/common/utils/packageRoot';
import { EvaluationRunMetricReporting } from './evaluationRunMetricReporting';
import { EvaluationRunTermination } from './evaluationRunTermination';
import { Construct } from 'constructs';
import { suppressCdkNag } from '@src/cdk-nag-suppressions';
import { IVpc } from 'aws-cdk-lib/aws-ec2';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';

type ExperimentationApiGatewayIntegrationStackProps = {
  configBucket: IBucket;
  mlFlowServer: MLFlow;
  vpc: IVpc;
  eventBus: IEventBus;
  restApi: IRestApi;
  /**
   * Optional public API to register the same routes on.
   * Same Lambda handlers are reused — external callers hit EDGE, internal
   * Lambdas use the private API via VPC endpoint. No code duplication.
   */
  publicRestApi?: IRestApi;
  encryptionKey?: IKey;
};

const EXPERIMENTATION_TYPESCRIPT_HANDLERS: Set<GenAiEtkServiceOperations> = new Set([
  'CreateConfiguration',
  'GetConfiguration',
  'UpdateConfiguration',
  'ListConfigurations',
]);

const EXPERIMENTATION_PYTHON_HANDLERS: Set<GenAiEtkServiceOperations> = new Set([
  'CreateExperiment',
  'UpdateExperiment',
  'GetExperiment',
  'ListExperiments',
  'ListExperimentOutputs',
  'DeleteExperiment',
]);

export class ExperimentationApiGatewayIntegration {
  constructor(scope: Construct, props: ExperimentationApiGatewayIntegrationStackProps) {
    const packageRoot = findPackageRoot();
    const lambdaZipPath = path.join(packageRoot, 'assets', 'experiment-lambdas.zip');

    new EvaluationRunParamReporting(scope, 'EvaluationRunParamReporting', {
      mlflowTrackingServerArn: props.mlFlowServer.mlFlowServerArn,
      lambdaZipPath: lambdaZipPath,
      eventBus: props.eventBus,
      vpc: props.vpc,
      encryptionKey: props.encryptionKey,
    });

    new EvaluationRunMetricReporting(scope, 'EvaluationRunMetricReporting', {
      mlflowTrackingServerArn: props.mlFlowServer.mlFlowServerArn,
      lambdaZipPath: lambdaZipPath,
      eventBus: props.eventBus,
      vpc: props.vpc,
      encryptionKey: props.encryptionKey,
    });

    new EvaluationRunTermination(scope, 'EvaluationRunTermination', {
      mlflowTrackingServerArn: props.mlFlowServer.mlFlowServerArn,
      lambdaZipPath: lambdaZipPath,
      eventBus: props.eventBus,
      vpc: props.vpc,
      encryptionKey: props.encryptionKey,
    });

    // Not all permissions are granted. You can find more here:
    // https://docs.aws.amazon.com/sagemaker/latest/dg/mlflow-create-tracking-server-iam.html
    const mlflowReadPolicy = new PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        'sagemaker-mlflow:GetExperiment',
        'sagemaker-mlflow:GetExperimentByName',
        'sagemaker-mlflow:SearchExperiments',
        'sagemaker-mlflow:SearchRuns',
        'sagemaker-mlflow:GetRun',
        'sagemaker-mlflow:ListArtifacts',
      ],
      resources: [props.mlFlowServer.mlFlowServerArn],
    });

    const mlflowReadWritePolicy = new PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        'sagemaker-mlflow:CreateExperiment',
        'sagemaker-mlflow:DeleteExperiment',
        'sagemaker-mlflow:RestoreExperiment',
        'sagemaker-mlflow:UpdateExperiment',
        'sagemaker-mlflow:SetTag',
        'sagemaker-mlflow:SetExperimentTag',
        'sagemaker-mlflow:DeleteTag',
        'sagemaker-mlflow:LogParam',
        ...mlflowReadPolicy.actions,
      ],
      resources: [props.mlFlowServer.mlFlowServerArn],
    });

    getApiDetailList().forEach((details) => {
      if (!EXPERIMENTATION_TYPESCRIPT_HANDLERS.has(details.name)) return;

      const resource = props.restApi.root.resourceForPath(details.path);

      const lambdaHandler = getExperimentApiTypescriptLambdaHandler(scope, details, props.vpc);

      lambdaHandler.addEnvironment(EnvVariable.S3_BUCKET_NAME, props.configBucket.bucketName);
      if (details.name.startsWith('Get') || details.name.startsWith('List')) {
        // Grant read permissions
        props.configBucket.grantRead(lambdaHandler);
      } else {
        // Grant read-write permissions
        props.configBucket.grantReadWrite(lambdaHandler);
      }

      const method = resource.addMethod(details.method, new LambdaIntegration(lambdaHandler), {
        authorizationType: AuthorizationType.IAM,
      });
      suppressCdkNag(
        method,
        'AwsSolutions-COG4',
        'API GW is located behind a customer facing API GW with Resource Policies enabled. No need for Cognito user pool authorizer.',
      );

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
    });

    getApiDetailList().forEach((details) => {
      if (!EXPERIMENTATION_PYTHON_HANDLERS.has(details.name)) return;

      const resource = props.restApi.root.resourceForPath(details.path);
      const lambdaHandler = getExperimentApiPythonLambdaHandler(scope, details, lambdaZipPath, props.vpc);

      lambdaHandler.addEnvironment(EnvVariable.MLFLOW_TRACKING_SERVER_ARN, props.mlFlowServer.mlFlowServerArn);
      if (details.name.startsWith('Get') || details.name.startsWith('List')) {
        lambdaHandler.addToRolePolicy(mlflowReadPolicy);
      } else {
        lambdaHandler.addToRolePolicy(mlflowReadWritePolicy);
      }

      const method = resource.addMethod(details.method, new LambdaIntegration(lambdaHandler, {}), {
        authorizationType: AuthorizationType.IAM,
      });
      suppressCdkNag(
        method,
        'AwsSolutions-COG4',
        'API GW is located behind a customer facing API GW with Resource Policies enabled. No need for Cognito user pool authorizer.',
      );

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
    });
  }
}
