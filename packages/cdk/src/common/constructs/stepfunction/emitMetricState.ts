import {
  JsonPath,
  Choice,
  Condition,
  Pass,
  StateMachineFragment,
  INextable,
  State,
} from 'aws-cdk-lib/aws-stepfunctions';
import { CallAwsService } from 'aws-cdk-lib/aws-stepfunctions-tasks';
import { Construct } from 'constructs';

type ValidPath = '$' | `$.${string}`;

type EmitMetricStateProps = {
  value: string;
  payloadPath: ValidPath;
};

export class EmitMetricState extends StateMachineFragment implements INextable {
  public readonly startState: State;
  public readonly endStates: INextable[];

  constructor(scope: Construct, id: string, { value, payloadPath }: EmitMetricStateProps) {
    super(scope, id);

    const nextState = new Pass(this, `Continue-EmitMetric-${value}`);

    // Create base parameters for CallAwsService
    const serviceParams = {
      service: 'cloudwatch',
      action: 'putMetricData',
      // SECURITY: `iamResources: ['*']` is required here. The
      // `cloudwatch:PutMetricData` action does not support resource-level
      // permissions (CloudWatch metrics are not ARN-addressable resources),
      // so a wildcard resource is the only valid scope for this action.
      // Access is bounded by the action itself and the workflow role policy.
      iamResources: ['*'],
      parameters: {
        MetricData: [
          {
            MetricName: value,
            Value: 1,
          },
        ],
        Namespace: JsonPath.stringAt(`${payloadPath}.observabilityLayer.metricNamespace`),
      },
      resultPath: `$.observability-${value}-result`,
    };

    const emitMetricsWithoutCredentials = new CallAwsService(this, `EmitMetricsNoCreds-${value}`, serviceParams);

    const choice = new Choice(this, `shouldEmitMetric-${value}`)
      .when(
        // Emit cloudwatch metrics if observabilityLayer is present and metricNamespace provided is neither null nor empty
        Condition.and(
          Condition.isPresent(`${payloadPath}.observabilityLayer.metricNamespace`),
          Condition.not(Condition.stringEquals(`${payloadPath}.observabilityLayer.metricNamespace`, '')),
          Condition.isNotNull(`${payloadPath}.observabilityLayer.metricNamespace`),
        ),
        emitMetricsWithoutCredentials.next(nextState),
      )
      .otherwise(new Pass(this, `shouldNotEmitMetric-${value}`).next(nextState))
      .afterwards();
    this.endStates = choice.endStates;
    this.startState = choice.startState;
  }
}
