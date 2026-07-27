import { Duration } from 'aws-cdk-lib';
import { IEventBus, Rule } from 'aws-cdk-lib/aws-events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import { PolicyStatement, Effect } from 'aws-cdk-lib/aws-iam';
import {
  IntegrationPattern,
  TaskInput,
  JsonPath,
  Timeout,
  Pass,
  Parallel,
  INextable,
  StateMachineFragment,
  State,
  IStateMachine,
} from 'aws-cdk-lib/aws-stepfunctions';
import { LambdaInvoke } from 'aws-cdk-lib/aws-stepfunctions-tasks';
import { Construct } from 'constructs';
import { SecuredNodejsFunction } from '@secured';
import { EnvVariable } from '@src/common/config';
import { IVpc } from 'aws-cdk-lib/aws-ec2';

type ValidPath = '$' | `$.${string}`;

export type AsyncAwaitStateProps = {
  eventBus: IEventBus;
  requestEventDetailType: string;
  requestEventSource: string;
  responseEventDetailType: string;
  stateName: string;
  payloadPath: ValidPath;
  vpc: IVpc;
};

export interface ICanContinueStepfunction {
  grantWrite(stepFunction: IStateMachine): void;
}

export class AsyncAwaitState extends StateMachineFragment implements INextable, ICanContinueStepfunction {
  private awaitFunction: SecuredNodejsFunction;

  public readonly startState: State;
  public readonly endStates: INextable[];

  constructor(
    scope: Construct,
    id: string,
    {
      eventBus,
      requestEventDetailType,
      requestEventSource,
      responseEventDetailType,
      stateName,
      payloadPath,
      vpc,
    }: AsyncAwaitStateProps,
  ) {
    super(scope, id);

    const asyncFunction = new SecuredNodejsFunction(this, 'AsyncFunction', {
      handler: 'index.asyncHandler.lambdaHandler',
      description: 'Lambda to trigger an external event asynchroneously',
      vpc,
      environment: {
        [EnvVariable.ASYNC_AWAIT_STEP.REQUEST_DETAIL_TYPE]: requestEventDetailType,
        [EnvVariable.ASYNC_AWAIT_STEP.RESPONSE_DETAIL_TYPE]: responseEventDetailType,
        [EnvVariable.ASYNC_AWAIT_STEP.SOURCE]: requestEventSource,
        [EnvVariable.ASYNC_AWAIT_STEP.EVENT_BUS]: eventBus.eventBusArn,
      },
    });

    asyncFunction.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: [
          'events:PutEvents', // Permission to emit events
        ],
        resources: [eventBus.eventBusArn],
      }),
    );

    const asyncInvoke = new LambdaInvoke(this, 'LambdaInvoke', {
      stateName: stateName,
      lambdaFunction: asyncFunction,
      integrationPattern: IntegrationPattern.WAIT_FOR_TASK_TOKEN,
      payload: TaskInput.fromObject({
        // Pass through all input
        detail: JsonPath.stringAt(payloadPath),
        // Include the task token
        taskToken: JsonPath.taskToken,
      }),
      // Allow 10min for the async process to start and send a heartbeat
      heartbeatTimeout: Timeout.duration(Duration.minutes(10)),
    });

    // Because we are using WAIT_FOR_TASK_TOKEN and manually set the result but might not have
    // the context (input of the lambda invoke step) we have to preserve the context in a parallel
    // branch/state and merge afterwards:
    const preserveContext = new Pass(this, 'PreserveContext', {
      stateName: `Context for ${stateName}`,
    });

    const arrayAccessor = payloadPath.replace('$', '$[0]');

    const mergeResults = new Pass(this, 'MergeContext', {
      stateName: `Merge context for ${stateName}`,
      parameters: {
        detail: JsonPath.stringAt(`States.JsonMerge(${arrayAccessor}, $[1], false)`),
      },
      resultPath: '$',
    });

    const continueRule = new Rule(this, 'ContinueRule', {
      eventPattern: {
        detailType: [responseEventDetailType],
      },
      eventBus: eventBus,
      description: `Rule to continue on ${responseEventDetailType} events`,
    });

    this.awaitFunction = new SecuredNodejsFunction(this, 'AwaitFunction', {
      handler: 'index.awaitHandler.lambdaHandler',
      description: 'Lambda to await an external event',
      vpc,
    });

    continueRule.addTarget(new LambdaFunction(this.awaitFunction));

    const parallelExecution = new Parallel(this, 'InvokeWithContext', {
      stateName: `Preserve context for ${stateName}`,
    });

    parallelExecution.branch(preserveContext).branch(asyncInvoke).next(mergeResults);

    this.startState = parallelExecution;
    this.endStates = [mergeResults];
  }

  public grantWrite(stepFunction: IStateMachine) {
    this.awaitFunction.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['states:SendTaskSuccess', 'states:SendTaskFailure', 'states:SendTaskHeartbeat'],
        resources: [stepFunction.stateMachineArn],
      }),
    );
  }
}
