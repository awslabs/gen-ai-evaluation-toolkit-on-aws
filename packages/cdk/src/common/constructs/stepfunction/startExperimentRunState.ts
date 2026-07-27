import { EVALUATION_RUN_START_EVENT_TYPE } from '@src/common';
import { ServiceName } from '@src/common/config';
import {
  TaskInput,
  JsonPath,
  Choice,
  Condition,
  Pass,
  StateMachineFragment,
  INextable,
  State,
} from 'aws-cdk-lib/aws-stepfunctions';
import { EventBridgePutEvents } from 'aws-cdk-lib/aws-stepfunctions-tasks';
import { Construct } from 'constructs';
import { IEventBus } from 'aws-cdk-lib/aws-events';

type StartExperimentRunStepProps = {
  eventBus: IEventBus;
  payload: TaskInput;
};

export class StartExperimentRunState extends StateMachineFragment implements INextable {
  public readonly startState: State;
  public readonly endStates: INextable[];

  constructor(scope: Construct, id: string, props: StartExperimentRunStepProps) {
    super(scope, id);

    const emitEvent = new EventBridgePutEvents(scope, 'EmitExperimentStartRunEvent', {
      stateName: 'Publish to Experiment Start Run EventBridge',
      entries: [
        {
          eventBus: props.eventBus,
          detail: TaskInput.fromObject({
            experimentName: JsonPath.stringAt('$.experimentName'),
            runId: JsonPath.stringAt('$$.Execution.Name'),
            config: {
              testData: {
                bucketName: JsonPath.stringAt('$.detail.testData.bucketName'),
                prefix: JsonPath.stringAt('$.detail.testData.prefix'),
              },
              appId: JsonPath.stringAt('$.detail.appId'),
              plugins: JsonPath.objectAt('$.detail.plugins'),
              version: JsonPath.objectAt('$.configVersion'),
            },
          }),
          detailType: EVALUATION_RUN_START_EVENT_TYPE,
          source: ServiceName,
        },
      ],
      resultPath: '$.eventBridgeResult',
    });

    const choice = new Choice(scope, 'CheckExperimentNameExists', { stateName: 'Check if experiment id present' })
      .when(
        Condition.and(
          Condition.isPresent('$.experimentName'),
          Condition.not(Condition.stringEquals('$.experimentName', 'None')),
        ),
        emitEvent,
      )
      .otherwise(
        new Pass(scope, 'NoExperimentRunStart', {
          stateName: "Don't start the experiment run",
        }),
      )
      .afterwards();

    this.endStates = choice.endStates;
    this.startState = choice.startState;
  }
}
