import { GenAiEtkServiceOperations } from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import { getApiDetailList, getGenerationApiLambdaHandler } from '@constructs/apiUtils';
import { suppressCdkNag } from '@src/cdk-nag-suppressions';
import { EnvVariable } from '@src/common/config';
import { getExecutionArnPattern } from '@src/common/constructs';
import { Stack } from 'aws-cdk-lib';
import { AuthorizationType, IRestApi, LambdaIntegration } from 'aws-cdk-lib/aws-apigateway';
import { IVpc } from 'aws-cdk-lib/aws-ec2';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { StateMachine } from 'aws-cdk-lib/aws-stepfunctions';
import { Construct } from 'constructs';

type GenerationApiGatewayIntegrationProps = {
  workflow: StateMachine;
  restApi: IRestApi;
  /**
   * Optional public API to register the same routes on.
   * Same Lambda handlers are reused — external callers hit EDGE, internal
   * Lambdas use the private API via VPC endpoint. No code duplication.
   */
  publicRestApi?: IRestApi;
  vpc: IVpc;
};

type GenerationHandler = GenAiEtkServiceOperations &
  ('StartGeneration' | 'GetGeneration' | 'StopGeneration' | 'ListGenerations');

function* StartGeneration(stateMachine: StateMachine) {
  yield new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ['states:StartExecution'],
    resources: [stateMachine.stateMachineArn],
  });

  yield new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ['states:DescribeExecution'],
    resources: [getExecutionArnPattern(stateMachine)],
  });
}

function* GetGeneration(stateMachine: StateMachine) {
  yield new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ['states:DescribeExecution'],
    resources: [getExecutionArnPattern(stateMachine)],
  });
}

function* StopGeneration(stateMachine: StateMachine) {
  yield new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ['states:StopExecution', 'states:DescribeExecution'],
    resources: [getExecutionArnPattern(stateMachine)],
  });
}

function* ListGenerations(stateMachine: StateMachine) {
  yield new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ['states:ListExecutions'],
    resources: [stateMachine.stateMachineArn],
  });
}

const GENERATION_POLICIES: Record<GenerationHandler, (stateMachine: StateMachine) => Generator<PolicyStatement>> = {
  StartGeneration,
  GetGeneration,
  StopGeneration,
  ListGenerations,
};

export class GenerationApiGatewayIntegration {
  constructor(scope: Construct, props: GenerationApiGatewayIntegrationProps) {
    getApiDetailList().forEach((details) => {
      if (!(details.name in GENERATION_POLICIES)) return;

      const resource = props.restApi.root.resourceForPath(details.path);
      const lambdaHandler = getGenerationApiLambdaHandler(scope, details, props.vpc);
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

      const { account, region } = Stack.of(props.workflow);
      lambdaHandler.addEnvironment(EnvVariable.ACCOUNT_ID, account);
      lambdaHandler.addEnvironment(EnvVariable.REGION, region);

      lambdaHandler.addEnvironment(EnvVariable.GENERATION.WORKFLOW_ARN, props.workflow.stateMachineArn);
      for (const policy of GENERATION_POLICIES[details.name as GenerationHandler](props.workflow)) {
        lambdaHandler.addToRolePolicy(policy);
      }

      suppressCdkNag(
        method,
        'AwsSolutions-COG4',
        'API GW is located behind a customer facing API GW with Resource Policies enabled. No need for Cognito user pool authorizer.',
      );
    });
  }
}
