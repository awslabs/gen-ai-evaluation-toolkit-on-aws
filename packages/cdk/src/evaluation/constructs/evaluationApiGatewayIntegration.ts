import { GenAiEtkServiceOperations } from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import { getApiDetailList, getEvaluationApiLambdaHandler } from '@constructs/apiUtils';
import { EnvVariable } from '@src/common/config';
import { getSchedulerArn, getAllSchedulesArn } from '@src/common/constructs';
import assert from 'assert';
import { Stack } from 'aws-cdk-lib';
import { AuthorizationType, IRestApi, LambdaIntegration } from 'aws-cdk-lib/aws-apigateway';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { IKey } from 'aws-cdk-lib/aws-kms';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import { JobSchedulerIntegration } from './scheduler/JobSchedulerIntegration';
import { suppressCdkNag } from '@src/cdk-nag-suppressions';
import { IVpc } from 'aws-cdk-lib/aws-ec2';
import { EVALUATION_JOB_SCHEDULER_GROUP_NAME } from '@src/common/constants';

type EvaluationApiGatewayIntegrationStackProps = {
  restApi: IRestApi;
  /**
   * Optional public API to register the same routes on.
   * Same Lambda handlers are reused — external callers hit EDGE, internal
   * Lambdas use the private API via VPC endpoint. No code duplication.
   */
  publicRestApi?: IRestApi;
  vpc: IVpc;
  encryptionKey?: IKey;
  schedulerTriggerLambda: lambda.Function;
};

const SCHEDULER_HANDLERS: Set<GenAiEtkServiceOperations> = new Set([
  'ListJobSchedulers',
  'CreateJobScheduler',
  'DeleteJobScheduler',
  'GetJobScheduler',
  'UpdateJobScheduler',
]);

type SchedulerHandler = GenAiEtkServiceOperations &
  ('GetJobScheduler' | 'DeleteJobScheduler' | 'UpdateJobScheduler' | 'ListJobSchedulers');

function* GetJobScheduler(scope: Construct) {
  yield new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ['scheduler:GetSchedule'],
    resources: [getSchedulerArn(scope, EVALUATION_JOB_SCHEDULER_GROUP_NAME)],
  });
}

function* ListJobSchedulers(scope: Construct) {
  yield new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ['scheduler:ListSchedules'],
    resources: [getAllSchedulesArn(scope)],
  });
}

function* UpdateJobScheduler(scope: Construct) {
  yield new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ['scheduler:UpdateSchedule', 'scheduler:GetSchedule'],
    resources: [getSchedulerArn(scope, EVALUATION_JOB_SCHEDULER_GROUP_NAME)],
  });
}

function* DeleteJobScheduler(scope: Construct) {
  yield new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ['scheduler:DeleteSchedule', 'scheduler:GetSchedule'],
    resources: [getSchedulerArn(scope, EVALUATION_JOB_SCHEDULER_GROUP_NAME)],
  });
}

const SCHEDULER_POLICIES: Record<SchedulerHandler, (scope: Construct) => Generator<PolicyStatement>> = {
  GetJobScheduler,
  ListJobSchedulers,
  UpdateJobScheduler,
  DeleteJobScheduler,
};

export class EvaluationApiGatewayIntegration {
  constructor(scope: Construct, props: EvaluationApiGatewayIntegrationStackProps) {
    let jobSchedulerIntegration: JobSchedulerIntegration | undefined;

    getApiDetailList().forEach((details) => {
      if (!SCHEDULER_HANDLERS.has(details.name)) return;

      const resource = props.restApi.root.resourceForPath(details.path);
      const lambdaHandler = getEvaluationApiLambdaHandler(scope, details, props.vpc);
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

      const { account, region } = Stack.of(scope);
      lambdaHandler.addEnvironment(EnvVariable.ACCOUNT_ID, account);
      lambdaHandler.addEnvironment(EnvVariable.REGION, region);

      if (details.name === 'CreateJobScheduler') {
        jobSchedulerIntegration = new JobSchedulerIntegration(scope, 'JobSchedulerIntegration', {
          lambdaHandler,
          operationName: details.name,
          schedulerTriggerLambda: props.schedulerTriggerLambda,
          vpc: props.vpc,
          encryptionKey: props.encryptionKey,
        });
      }

      suppressCdkNag(
        method,
        'AwsSolutions-COG4',
        'API GW is located behind a customer facing API GW with Resource Policies enabled. No need for Cognito user pool authorizer.',
      );

      if (details.name in SCHEDULER_POLICIES) {
        for (const policy of SCHEDULER_POLICIES[details.name as SchedulerHandler](lambdaHandler)) {
          lambdaHandler.addToRolePolicy(policy);
        }
      }

      if (details.name === 'UpdateJobScheduler') {
        assert(
          jobSchedulerIntegration,
          'JobSchedulerIntegration not initialized. Make sure CreateJobScheduler is processed before UpdateJobScheduler.',
        );

        lambdaHandler.addEnvironment('TARGET_LAMBDA_ARN', jobSchedulerIntegration.jobTriggeredHandler.functionArn);
        lambdaHandler.addEnvironment('SCHEDULER_ROLE_ARN', jobSchedulerIntegration.schedulerRole.roleArn);

        lambdaHandler.addToRolePolicy(
          new PolicyStatement({
            effect: Effect.ALLOW,
            actions: ['iam:PassRole'],
            resources: [jobSchedulerIntegration.schedulerRole.roleArn],
            conditions: {
              StringLike: {
                'iam:PassedToService': 'scheduler.amazonaws.com',
              },
            },
          }),
        );
      }
    });
  }
}
