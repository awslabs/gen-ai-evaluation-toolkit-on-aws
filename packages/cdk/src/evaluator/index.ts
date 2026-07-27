import { Construct } from 'constructs';
import { RemovalPolicy, Duration } from 'aws-cdk-lib';
import { IVpc, SubnetType } from 'aws-cdk-lib/aws-ec2';
import { IKey } from 'aws-cdk-lib/aws-kms';
import { IRestApi, LambdaIntegration, AuthorizationType } from 'aws-cdk-lib/aws-apigateway';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import { SecuredStateMachine, SecuredTable } from '@secured';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as destinations from 'aws-cdk-lib/aws-lambda-destinations';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { NagSuppressions } from 'cdk-nag';
import { suppressCdkNag } from '@src/cdk-nag-suppressions';
import { getApiDetailList } from '@constructs/apiUtils';
import { GenAiEtkServiceOperations } from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import { findPackageRoot } from '@src/common/utils/packageRoot';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Stack } from 'aws-cdk-lib';
import path from 'path';
import fs from 'fs';

type EvaluatorApiProps = {
  restApi: IRestApi;
  /**
   * Optional public API to register the same routes on.
   * Same Lambda handlers are reused — external callers hit EDGE, internal
   * Lambdas use the private API via VPC endpoint. No code duplication.
   */
  publicRestApi?: IRestApi;
  eventBus: events.IEventBus;
  evaluationBucket: IBucket;
  mlFlowServerArn: string;
  mlFlowArtifactBucket: IBucket;
  vpc?: IVpc;
  encryptionKey?: IKey;
};

const EVALUATOR_API_OPERATIONS: Set<GenAiEtkServiceOperations> = new Set([
  // Job submission (v2)
  'SubmitEvaluationJob',
  'SubmitScoringJob',
  'SubmitAppInvocationJob',
  // Job management (v2)
  'GetEvaluatorJob',
  'ListJobs',
  'UpdateEvaluatorJobStatus',
  // Reports
  'CreateReport',
  'GetReport',
  'ListReports',
  'DeleteReport',
  // Test Results
  'GetTestResult',
  'ListTestResults',
  'BatchCreateResults',
  'BatchUpdateScores',
  'BatchDeleteResults',
]);

/**
 * Configure a Lambda as an SFN task handler: on-failure destination + EventBridge rule.
 * Used for both user evaluator workers and ETK internal handlers.
 */
function configureTaskHandler(
  scope: Construct,
  id: string,
  handler: lambda.IFunction,
  eventBus: events.IEventBus,
  eventPattern: events.EventPattern,
  description: string,
): events.Rule {
  // On-failure destination for crash/timeout detection
  (handler as lambda.Function).configureAsyncInvoke({
    onFailure: new destinations.EventBridgeDestination(eventBus),
    retryAttempts: 1,
  });

  const rule = new events.Rule(scope, id, {
    eventPattern,
    eventBus,
    description,
  });
  rule.addTarget(new targets.LambdaFunction(handler));
  return rule;
}

export function evaluatorCore(scope: Construct, props: EvaluatorApiProps): { schedulerTriggerLambda: lambda.Function } {
  const lambdaZipPath = path.join(findPackageRoot(), 'assets', 'python-api.zip');

  // Single DynamoDB table for all evaluator data (jobs, reports, results)
  const evaluatorTable = new SecuredTable(scope, 'EvaluatorTable', {
    tableName: 'evaluatortable',
    partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
    sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
    billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    removalPolicy: RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE,
    encryptionKey: props.encryptionKey,
  });

  // ---------------------------------------------------------------------------
  // Step Functions: orchestration state machine
  // ---------------------------------------------------------------------------

  const aslPath = path.join(findPackageRoot(), 'assets', 'orchestration-asl.json');
  const aslRaw = fs.readFileSync(aslPath, 'utf-8');
  // Replace EventBusName placeholder with actual bus name
  const aslBody = aslRaw.replace(/\$\{EventBusName\}/g, props.eventBus.eventBusName);

  const stateMachine = new SecuredStateMachine(scope, 'OrchestrationStateMachine', {
    definitionBody: sfn.DefinitionBody.fromString(aslBody),
    encryptionKey: props.encryptionKey,
  });
  props.eventBus.grantPutEventsTo(stateMachine);

  const stateMachineArn = stateMachine.stateMachineArn;

  // ---------------------------------------------------------------------------
  // Shared environment variables
  // ---------------------------------------------------------------------------

  const sharedEnv: Record<string, string> = {
    EVALUATOR_TABLE: evaluatorTable.tableName,
    EVENT_BUS_NAME: props.eventBus.eventBusName,
    EVALUATION_BUCKET: props.evaluationBucket.bucketName,
    MLFLOW_TRACKING_SERVER_ARN: props.mlFlowServerArn,
    STATE_MACHINE_ARN: stateMachineArn,
  };

  // ---------------------------------------------------------------------------
  // API Lambda
  // ---------------------------------------------------------------------------

  const evaluatorApiLambda = new lambda.Function(scope, 'EvaluatorApiLambda', {
    runtime: lambda.Runtime.PYTHON_3_12,
    handler: 'evaluator_api.handler.handler',
    code: lambda.Code.fromAsset(lambdaZipPath),
    timeout: Duration.seconds(28),
    logRetention: RetentionDays.TEN_YEARS,
    memorySize: 512,
    environment: { ...sharedEnv, POWERTOOLS_SERVICE_NAME: 'evaluator-api' },
    ...(props.vpc && {
      vpc: props.vpc,
      vpcSubnets: { subnetType: SubnetType.PRIVATE_WITH_EGRESS },
    }),
  });

  suppressCdkNag(evaluatorApiLambda, [
    { id: 'AwsSolutions-L1', reason: 'Python 3.12 is the latest supported runtime' },
    { id: 'AwsSolutions-IAM4', reason: 'Using AWS managed policies for Lambda execution role' },
    {
      id: 'AwsSolutions-IAM5',
      reason: 'Wildcard permissions needed for CloudWatch Logs and DynamoDB access',
    },
  ]);

  NagSuppressions.addStackSuppressions(Stack.of(scope), [
    { id: 'AwsSolutions-IAM4', reason: 'LogRetention custom resource uses AWS managed policies' },
    { id: 'AwsSolutions-IAM5', reason: 'LogRetention custom resource requires wildcard permissions' },
  ]);

  // DynamoDB permissions
  evaluatorTable.grantReadWriteData(evaluatorApiLambda);

  // EventBridge permissions (for legacy event emission — will be removed)
  props.eventBus.grantPutEventsTo(evaluatorApiLambda);

  // Step Functions permissions (start executions + bridge worker callbacks)
  evaluatorApiLambda.addToRolePolicy(
    new PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        'states:StartExecution',
        'states:SendTaskSuccess',
        'states:SendTaskFailure',
        'states:SendTaskHeartbeat',
      ],
      resources: [stateMachineArn],
    }),
  );

  // MLflow permissions
  evaluatorApiLambda.addToRolePolicy(
    new PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        'sagemaker-mlflow:CreateExperiment',
        'sagemaker-mlflow:CreateRun',
        'sagemaker-mlflow:GetExperiment',
        'sagemaker-mlflow:GetExperimentByName',
        'sagemaker-mlflow:LogParam',
        'sagemaker-mlflow:LogMetric',
        'sagemaker-mlflow:LogBatch',
        'sagemaker-mlflow:GetRun',
        'sagemaker-mlflow:UpdateRun',
        'sagemaker-mlflow:SearchRuns',
      ],
      resources: [props.mlFlowServerArn],
    }),
  );

  // ---------------------------------------------------------------------------
  // Post-processing Lambda
  // ---------------------------------------------------------------------------

  const postProcessingLambda = new lambda.Function(scope, 'EvaluatorPostProcessingLambda', {
    runtime: lambda.Runtime.PYTHON_3_12,
    handler: 'evaluator_api.post_processing_handler.handler',
    code: lambda.Code.fromAsset(lambdaZipPath),
    timeout: Duration.minutes(15),
    logRetention: RetentionDays.TEN_YEARS,
    memorySize: 1024,
    environment: { ...sharedEnv, POWERTOOLS_SERVICE_NAME: 'evaluator-post-processing' },
    ...(props.vpc && {
      vpc: props.vpc,
      vpcSubnets: { subnetType: SubnetType.PRIVATE_WITH_EGRESS },
    }),
  });

  suppressCdkNag(postProcessingLambda, [
    { id: 'AwsSolutions-L1', reason: 'Python 3.12 is the latest supported runtime' },
    { id: 'AwsSolutions-IAM4', reason: 'Using AWS managed policies for Lambda execution role' },
    { id: 'AwsSolutions-IAM5', reason: 'Wildcard permissions needed for CloudWatch Logs' },
  ]);

  evaluatorTable.grantReadWriteData(postProcessingLambda);

  // SFN callback permissions (complete_task calls SendTaskSuccess/Failure)
  postProcessingLambda.addToRolePolicy(
    new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['states:SendTaskSuccess', 'states:SendTaskFailure', 'states:SendTaskHeartbeat'],
      resources: [stateMachineArn],
    }),
  );

  // MLflow permissions
  postProcessingLambda.addToRolePolicy(
    new PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        'sagemaker-mlflow:GetExperiment',
        'sagemaker-mlflow:GetExperimentByName',
        'sagemaker-mlflow:LogMetric',
        'sagemaker-mlflow:LogBatch',
        'sagemaker-mlflow:GetRun',
        'sagemaker-mlflow:UpdateRun',
        'sagemaker-mlflow:SearchRuns',
      ],
      resources: [props.mlFlowServerArn],
    }),
  );

  props.mlFlowArtifactBucket.grantWrite(postProcessingLambda);

  // ---------------------------------------------------------------------------
  // Internal handler Lambda (copy results, timeout, Lambda failure — single dispatch)
  // ---------------------------------------------------------------------------

  const internalHandlerLambda = new lambda.Function(scope, 'InternalHandlerLambda', {
    runtime: lambda.Runtime.PYTHON_3_12,
    code: lambda.Code.fromAsset(lambdaZipPath),
    handler: 'evaluator_api.internal_handlers.handler',
    timeout: Duration.minutes(15),
    memorySize: 512,
    logRetention: RetentionDays.TEN_YEARS,
    environment: { ...sharedEnv, POWERTOOLS_SERVICE_NAME: 'evaluator-internal' },
    ...(props.vpc && {
      vpc: props.vpc,
      vpcSubnets: { subnetType: SubnetType.PRIVATE_WITH_EGRESS },
    }),
  });
  evaluatorTable.grantReadWriteData(internalHandlerLambda);
  internalHandlerLambda.addToRolePolicy(
    new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['states:SendTaskSuccess', 'states:SendTaskFailure', 'states:SendTaskHeartbeat'],
      resources: [stateMachineArn],
    }),
  );
  suppressCdkNag(internalHandlerLambda, [
    { id: 'AwsSolutions-L1', reason: 'Python 3.12 is the latest supported runtime' },
    { id: 'AwsSolutions-IAM4', reason: 'Using AWS managed policies for Lambda execution role' },
    { id: 'AwsSolutions-IAM5', reason: 'Wildcard permissions needed for CloudWatch Logs' },
  ]);

  // ---------------------------------------------------------------------------
  // EventBridge rules
  // ---------------------------------------------------------------------------

  // 1. POST_PROCESS task → post-processing Lambda (separate — needs MLflow + S3)
  configureTaskHandler(
    scope,
    'TaskToPostProcess',
    postProcessingLambda,
    props.eventBus,
    {
      source: ['GenAiEvaluationToolkit'],
      detailType: ['EvaluatorTaskDispatched'],
      detail: { jobType: ['POST_PROCESS'] },
    },
    'Routes post-processing tasks from SFN to post-processing Lambda',
  );

  // 2. COPY_RESULTS task → internal handler
  configureTaskHandler(
    scope,
    'TaskToCopyResults',
    internalHandlerLambda,
    props.eventBus,
    {
      source: ['GenAiEvaluationToolkit'],
      detailType: ['EvaluatorTaskDispatched'],
      detail: { jobType: ['COPY_RESULTS'] },
    },
    'Routes copy-results tasks from SFN to internal handler',
  );

  // 3. Task timeout → internal handler
  new events.Rule(scope, 'TaskTimeoutRule', {
    eventPattern: {
      source: ['GenAiEvaluationToolkit'],
      detailType: ['EvaluatorTaskTimedOut'],
    },
    eventBus: props.eventBus,
    description: 'Routes task timeout events to internal handler',
  }).addTarget(new targets.LambdaFunction(internalHandlerLambda));

  // 4. Lambda invocation failure → internal handler
  new events.Rule(scope, 'LambdaFailureRule', {
    eventPattern: {
      source: ['lambda'],
      detailType: ['Lambda Function Invocation Result - Failure'],
    },
    eventBus: props.eventBus,
    description: 'Routes Lambda crash/OOM events to internal handler for SFN recovery',
  }).addTarget(new targets.LambdaFunction(internalHandlerLambda));

  // Note: User evaluator rules (EvaluatorTaskDispatched + evaluatorName) are created
  // by the LambdaEvaluator construct, not here. See plugins/lambdaEvaluator.ts.

  // ---------------------------------------------------------------------------
  // Scheduler trigger Lambda (invoked by EventBridge Scheduler on cron)
  // ---------------------------------------------------------------------------

  const schedulerTriggerLambda = new lambda.Function(scope, 'SchedulerTriggerLambda', {
    runtime: lambda.Runtime.PYTHON_3_12,
    code: lambda.Code.fromAsset(lambdaZipPath),
    handler: 'evaluator_api.scheduler_handler.handler',
    timeout: Duration.minutes(1),
    memorySize: 256,
    logRetention: RetentionDays.TEN_YEARS,
    environment: { ...sharedEnv, POWERTOOLS_SERVICE_NAME: 'evaluator-scheduler' },
    ...(props.vpc && {
      vpc: props.vpc,
      vpcSubnets: { subnetType: SubnetType.PRIVATE_WITH_EGRESS },
    }),
  });
  evaluatorTable.grantReadWriteData(schedulerTriggerLambda);
  schedulerTriggerLambda.addToRolePolicy(
    new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['states:StartExecution'],
      resources: [stateMachine.stateMachineArn],
    }),
  );
  schedulerTriggerLambda.addToRolePolicy(
    new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['events:PutEvents'],
      resources: [props.eventBus.eventBusArn],
    }),
  );
  suppressCdkNag(schedulerTriggerLambda, [
    { id: 'AwsSolutions-L1', reason: 'Python 3.12 is the latest supported runtime' },
    { id: 'AwsSolutions-IAM4', reason: 'Using AWS managed policies for Lambda execution role' },
    { id: 'AwsSolutions-IAM5', reason: 'Wildcard permissions needed for CloudWatch Logs and DynamoDB access' },
  ]);

  // ---------------------------------------------------------------------------
  // API Gateway integration
  // ---------------------------------------------------------------------------

  const lambdaIntegration = new LambdaIntegration(evaluatorApiLambda);

  const evaluatorsMethods = getApiDetailList()
    .filter((details) => EVALUATOR_API_OPERATIONS.has(details.name))
    .map((details) => {
      const resource = props.restApi.root.resourceForPath(details.path);
      // Register the same Lambda on the public API so external callers can reach it.
      // scopePermissionToMethod:false uses a single API-scoped Lambda permission instead of
      // one per method, avoiding the Lambda resource-based policy 20KB size limit.
      if (props.publicRestApi) {
        const publicResource = props.publicRestApi.root.resourceForPath(details.path);
        const publicMethod = publicResource.addMethod(
          details.method,
          new LambdaIntegration(evaluatorApiLambda, { scopePermissionToMethod: false }),
          { authorizationType: AuthorizationType.IAM },
        );
        suppressCdkNag(publicMethod, 'AwsSolutions-COG4', 'API GW uses IAM auth, not Cognito.');
      }
      return resource.addMethod(details.method, lambdaIntegration, {
        authorizationType: AuthorizationType.IAM,
      });
    });

  evaluatorsMethods.forEach((method) => {
    suppressCdkNag(
      method,
      'AwsSolutions-COG4',
      'API GW uses IAM authorization. No need for Cognito user pool authorizer.',
    );
  });

  return { schedulerTriggerLambda };
}
