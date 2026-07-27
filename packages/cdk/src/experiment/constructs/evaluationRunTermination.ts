import { Construct } from 'constructs';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { PythonLambda } from './pythonLambda';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import { EVALUATION_RUN_FAILED_EVENT_TYPE } from '../../common';
import { IVpc } from 'aws-cdk-lib/aws-ec2';
import { IKey } from 'aws-cdk-lib/aws-kms';
import { EnvVariable } from '@src/common/config';

type EvaluationRunTerminationProps = {
  mlflowTrackingServerArn: string;
  eventBus?: events.IEventBus;
  lambdaZipPath: string;
  vpc: IVpc;
  encryptionKey?: IKey;
};

export class EvaluationRunTermination extends Construct {
  constructor(scope: Construct, id: string, props: EvaluationRunTerminationProps) {
    super(scope, id);

    // Create Layer with dependencies
    const terminationLambda = new PythonLambda(this, 'ExperimentRunTerminationFunction', {
      description: 'Lambda to terminate experiment run with Failed status',
      handler: 'experiment_lambda.eventbridge.terminate_run_handler.handler',
      lambdaZipPath: props.lambdaZipPath,
      vpc: props.vpc,
      encryptionKey: props.encryptionKey,
    });

    terminationLambda.addEnvironment(EnvVariable.MLFLOW_TRACKING_SERVER_ARN, props.mlflowTrackingServerArn);

    // Grant the Lambda function permissions to interact with MLflow
    terminationLambda.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: [
          'sagemaker-mlflow:GetExperimentByName',
          'sagemaker-mlflow:GetRun',
          'sagemaker-mlflow:UpdateRun',
          'sagemaker-mlflow:SearchRuns',
        ],
        resources: [props.mlflowTrackingServerArn],
      }),
    );

    // Create EventBridge rule
    const rule = new events.Rule(this, 'EvaluationRunEndEventRuleForFailedRun', {
      eventPattern: {
        detailType: [EVALUATION_RUN_FAILED_EVENT_TYPE],
      },
      eventBus: props.eventBus,
      description: `Rule to invoke ${terminationLambda.functionName}`,
    });

    // Add Lambda function as target
    rule.addTarget(new targets.LambdaFunction(terminationLambda));
  }
}
