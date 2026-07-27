import { Construct } from 'constructs';
import { Stack } from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as destinations from 'aws-cdk-lib/aws-lambda-destinations';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { IRestApi } from 'aws-cdk-lib/aws-apigateway';
import { suppressCdkNag } from '@src/cdk-nag-suppressions';
import { GatewayConfig } from '../common/types/gatewayConfig';
import { addGatewayEnvironment } from '../common/utils/gatewayEnvironment';

/**
 * Properties for creating a Lambda-based evaluator.
 */
export type LambdaEvaluatorProps = {
  /** Name used to route EventBridge events (must match the evaluator's EVALUATOR_NAME). */
  evaluatorName: string;

  /** The Lambda function that implements evaluator_handler. */
  handler: lambda.IFunction;

  /** EventBridge bus for task dispatch events. */
  eventBus: events.IEventBus;

  /** Private API Gateway REST API — used for internal SigV4 invocations from within the VPC. */
  privateRestApi: IRestApi;

  /** Additional environment variables to set on the handler. */
  additionalEnvironment?: Record<string, string>;

  /** Optional AI Gateway config — when provided, evaluator routes LLM calls through the gateway. */
  gatewayConfig?: GatewayConfig;

  /**
   * API Gateway routes to grant `execute-api:Invoke` on, as explicit method+path pairs.
   *
   * Each entry maps to one IAM resource ARN:
   * `privateRestApi.arnForExecuteApi(route.method, route.path, '*')`.
   *
   * Defaults to `[{ method: '*', path: '/v2/*' }, { method: '*', path: '/datasets/*' }]`
   * when omitted — same broad coverage as the original wildcard grant.
   * Override with explicit verbs+paths to enforce least-privilege for a specific evaluator.
   *
   * @example
   * [
   *   { method: 'GET', path: '/v2/jobs/{jobId}' },
   *   { method: 'PUT', path: '/v2/jobs/{jobId}/status' },
   *   { method: 'GET', path: '/v2/reports/{reportId}/results' },
   *   { method: 'POST', path: '/v2/reports/{reportId}/results/scores/batch' },
   * ]
   */
  executeApiRoutes?: { method: string; path: string }[];
};

/**
 * Reusable CDK construct that wires a Lambda function as an evaluator.
 *
 * The evaluator Lambda communicates with the ETK API via HTTP (SigV4) —
 * it does NOT access DynamoDB directly. Only the API and post-processing
 * Lambdas in the core evaluator stack access DDB.
 *
 * Automatically configures:
 * - EventBridge rule filtering on `evaluatorName` for `EvaluatorTaskDispatched` events
 * - On-failure async invocation destination (crash/OOM detection)
 * - API Gateway execute-api:Invoke (for status updates + result writes via SigV4)
 * - Standard environment variables (EVALUATOR_NAME, ETK_API_ENDPOINT)
 *
 * Service-specific permissions (Bedrock, AgentCore, etc.) should be granted
 * by the caller — this keeps the construct focused on core wiring.
 */
export class LambdaEvaluator extends Construct {
  public readonly rule: events.Rule;

  constructor(scope: Construct, id: string, props: LambdaEvaluatorProps) {
    super(scope, id);

    const stack = Stack.of(this);
    const apiEndpoint = `https://${props.privateRestApi.restApiId}.execute-api.${stack.region}.amazonaws.com/prod`;

    // Set standard environment variables
    const fn = props.handler as lambda.Function;
    fn.addEnvironment('EVALUATOR_NAME', props.evaluatorName);
    fn.addEnvironment('ETK_API_ENDPOINT', apiEndpoint);

    if (props.additionalEnvironment) {
      for (const [key, value] of Object.entries(props.additionalEnvironment)) {
        fn.addEnvironment(key, value);
      }
    }

    if (props.gatewayConfig) {
      addGatewayEnvironment(fn, fn, props.gatewayConfig);
    }

    // API Gateway invoke (evaluator calls API via SigV4 for status updates + result writes).
    // Defaults to broad wildcard coverage; pass executeApiRoutes with explicit method+path
    // pairs to enforce least-privilege for a specific evaluator.
    const executeApiRoutes = props.executeApiRoutes ?? [
      { method: '*', path: '/v2/*' },
      { method: '*', path: '/datasets/*' },
    ];
    props.handler.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['execute-api:Invoke'],
        resources: executeApiRoutes.map(({ method, path }) => props.privateRestApi.arnForExecuteApi(method, path, '*')),
      }),
    );

    suppressCdkNag(props.handler, [
      { id: 'AwsSolutions-IAM5', reason: 'Evaluator Lambda needs wildcard for API GW paths' },
    ]);

    // On-failure destination: sends Lambda crash/OOM events to EventBridge
    // for the LambdaFailureHandler to detect and resume SFN
    fn.configureAsyncInvoke({
      onFailure: new destinations.EventBridgeDestination(props.eventBus),
      retryAttempts: 1,
    });

    // EventBridge rule: route EvaluatorTaskDispatched events for this evaluator
    this.rule = new events.Rule(this, 'TaskDispatchedRule', {
      eventPattern: {
        source: ['GenAiEvaluationToolkit'],
        detailType: ['EvaluatorTaskDispatched'],
        detail: { evaluatorName: [props.evaluatorName] },
      },
      eventBus: props.eventBus,
      description: `Routes evaluation tasks to the '${props.evaluatorName}' evaluator Lambda`,
    });
    this.rule.addTarget(new targets.LambdaFunction(props.handler));
  }
}
