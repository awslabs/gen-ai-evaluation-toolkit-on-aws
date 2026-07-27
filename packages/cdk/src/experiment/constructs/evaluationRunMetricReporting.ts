import { Construct } from 'constructs';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { PythonLambda } from './pythonLambda';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import { EVALUATION_RUN_FINISHED_EVENT_TYPE } from '../../common';
import { IVpc } from 'aws-cdk-lib/aws-ec2';
import { IKey } from 'aws-cdk-lib/aws-kms';
import { EnvVariable } from '@src/common/config';

type EvaluationRunMetricReportingProps = {
  mlflowTrackingServerArn: string;
  eventBus?: events.IEventBus;
  lambdaZipPath: string;
  vpc: IVpc;
  encryptionKey?: IKey;
};

export class EvaluationRunMetricReporting extends Construct {
  constructor(scope: Construct, id: string, props: EvaluationRunMetricReportingProps) {
    super(scope, id);

    // Create Layer with dependencies
    const metricReportingLambda = new PythonLambda(this, `${id}-ExperimentMetricReportingFunction`, {
      description: 'Lambda to report workflow artifacts to mlflow experiments',
      handler: 'experiment_lambda.eventbridge.report_metrics_lambda.handler',
      lambdaZipPath: props.lambdaZipPath,
      vpc: props.vpc,
      encryptionKey: props.encryptionKey,
    });

    metricReportingLambda.addEnvironment(EnvVariable.MLFLOW_TRACKING_SERVER_ARN, props.mlflowTrackingServerArn);
    // Grant the Lambda function permissions to interact with MLflow
    metricReportingLambda.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: [
          'sagemaker-mlflow:LogMetric',
          'sagemaker-mlflow:GetExperimentByName',
          'sagemaker-mlflow:GetRun',
          'sagemaker-mlflow:UpdateRun',
          'sagemaker-mlflow:SearchRuns',
        ],
        resources: [props.mlflowTrackingServerArn],
      }),
    );

    // Create EventBridge rule
    const rule = new events.Rule(this, 'EvaluationRunEndEventRuleForFinishedRun', {
      eventPattern: {
        detailType: [EVALUATION_RUN_FINISHED_EVENT_TYPE],
      },
      eventBus: props.eventBus,
      description: `Rule to invoke ${metricReportingLambda.functionName}`,
    });

    // Add Lambda function as target
    rule.addTarget(new targets.LambdaFunction(metricReportingLambda));
  }
}
