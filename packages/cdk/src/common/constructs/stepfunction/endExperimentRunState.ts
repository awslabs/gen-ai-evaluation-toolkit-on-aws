import { EVALUATION_RUN_FINISHED_EVENT_TYPE, EVALUATION_RUN_FAILED_EVENT_TYPE, RunStatus } from '@src/common';
import { ServiceName } from '@src/common/config';
import {
  TaskInput,
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

type EndExperimentRunStepProps = {
  eventBus: IEventBus;
  payload: TaskInput;
  status: RunStatus;
};

export class EndExperimentRunState extends StateMachineFragment implements INextable {
  public readonly startState: State;
  public readonly endStates: INextable[];

  constructor(scope: Construct, id: string, props: EndExperimentRunStepProps) {
    super(scope, id);

    const detailType =
      props.status == RunStatus.Finished ? EVALUATION_RUN_FINISHED_EVENT_TYPE : EVALUATION_RUN_FAILED_EVENT_TYPE;

    const emitEvent = new EventBridgePutEvents(this, `EmitExperimentEndRunEvent for ${props.status} run`, {
      stateName: `Publish to Experiment End Run EventBridge for ${props.status} run`,
      entries: [
        {
          eventBus: props.eventBus,
          detail: props.payload,
          detailType,
          source: ServiceName,
        },
      ],
      resultPath: '$.eventBridgeResult',
    });

    const choice = new Choice(this, `EndRun-CheckExperimentNameExists for ${props.status} run`, {
      stateName: `EndRun-Check if experiment id present for ${props.status} run`,
    })
      .when(
        Condition.and(
          Condition.isPresent('$.experimentName'),
          Condition.not(Condition.stringEquals('$.experimentName', 'None')),
        ),
        emitEvent,
      )
      .otherwise(
        new Pass(this, `NoExperimentRunEnd for ${props.status} run`, {
          stateName: `Don't end the experiment run for ${props.status} run`,
        }).next(emitEvent),
      )
      .afterwards();

    this.endStates = choice.endStates;
    this.startState = choice.startState;
  }
}
