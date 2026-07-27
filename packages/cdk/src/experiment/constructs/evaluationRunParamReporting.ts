import { Construct } from 'constructs';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { PythonLambda } from './pythonLambda';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import { EVALUATION_RUN_START_EVENT_TYPE } from '../../common';
import { IVpc } from 'aws-cdk-lib/aws-ec2';
import { IKey } from 'aws-cdk-lib/aws-kms';
import { EnvVariable } from '@src/common/config';

type EvaluationRunParamReportingProps = {
  mlflowTrackingServerArn: string;
  eventBus?: events.IEventBus;
  lambdaZipPath: string;
  vpc: IVpc;
  encryptionKey?: IKey;
};

export class EvaluationRunParamReporting extends Construct {
  constructor(scope: Construct, id: string, props: EvaluationRunParamReportingProps) {
    super(scope, id);

    // Create Layer with dependencies
    const paramReportingLambda = new PythonLambda(this, 'ExperimentReportFunction', {
      description: 'Lambda to report workflow parameters to mlflow experiments',
      handler: 'experiment_lambda.eventbridge.report_configuration_lambda.handler',
      lambdaZipPath: props.lambdaZipPath,
      vpc: props.vpc,
      encryptionKey: props.encryptionKey,
    });

    paramReportingLambda.addEnvironment(EnvVariable.MLFLOW_TRACKING_SERVER_ARN, props.mlflowTrackingServerArn);
    // Grant the Lambda function permissions to interact with MLflow
    paramReportingLambda.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: [
          'sagemaker-mlflow:CreateRun',
          'sagemaker-mlflow:GetExperiment',
          'sagemaker-mlflow:LogParam',
          'sagemaker-mlflow:LogMetric',
          'sagemaker-mlflow:GetExperimentByName',
          'sagemaker-mlflow:GetRun',
          'sagemaker-mlflow:UpdateRun',
          'sagemaker-mlflow:LogBatch',
        ],
        resources: [props.mlflowTrackingServerArn],
      }),
    );

    // Create EventBridge rule
    const rule = new events.Rule(this, 'EvaluationRunStartEventRule', {
      eventPattern: {
        detailType: [EVALUATION_RUN_START_EVENT_TYPE],
      },
      eventBus: props.eventBus,
      description: `Rule to invoke ${paramReportingLambda.functionName}`,
    });

    // Add Lambda function as target
    rule.addTarget(new targets.LambdaFunction(paramReportingLambda));
  }
}
