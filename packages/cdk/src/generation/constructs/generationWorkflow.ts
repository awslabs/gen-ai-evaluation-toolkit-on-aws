import { ServiceName } from '@src/common/config';
import { SecuredStateMachine } from '@src/common/constructs/secured';
import { AsyncAwaitState, EmitMetricState } from '@src/common/constructs/stepfunction';
import { EventTypes } from '@src/plugins/contracts';
import { IVpc } from 'aws-cdk-lib/aws-ec2';
import { IEventBus } from 'aws-cdk-lib/aws-events';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import { DefinitionBody, Fail, JsonPath, Map, Pass, StateMachine, TaskInput } from 'aws-cdk-lib/aws-stepfunctions';
import { EventBridgePutEvents } from 'aws-cdk-lib/aws-stepfunctions-tasks';
import { Construct } from 'constructs';

type GenerationWorkflowProps = {
  eventBus: IEventBus;
  generationBucket: IBucket;
  vpc: IVpc;
};

export class GenerationStateMachine extends Construct {
  public readonly stateMachine: StateMachine;

  constructor(scope: Construct, id: string, props: GenerationWorkflowProps) {
    super(scope, id);

    const emitMetricStarted = new EmitMetricState(this, 'EmitStarted', {
      value: 'GENERATION_STARTED',
      payloadPath: '$',
    });
    const emitMetricEnded = new EmitMetricState(this, 'EmitEnded', {
      value: 'GENERATION_COMPLETED',
      payloadPath: '$',
    });
    const emitMetricFailed = new EmitMetricState(this, 'EmitFailed', {
      value: 'GENERATION_FAILED',
      payloadPath: '$',
    });

    const failState = new Fail(this, 'FailState', {
      causePath: JsonPath.stringAt('$.error.Cause'),
      errorPath: JsonPath.stringAt('$.error.Error'),
    });

    const enrichTimeoutError = new Pass(this, 'EnrichTimeoutError', {
      stateName: 'Enrich timeout error',
      parameters: {
        error: {
          Error: 'States.Timeout',
          'Cause.$':
            "States.Format('Plugin execution timed out after 10 minutes. Plugin(s): {}. This can occur if the plugin failed to start, crashed during execution, or stopped sending progress updates. Verify the plugin name is correct and the plugin is properly configured.', States.JsonToString($.steps[*].plugin))",
        },
        'steps.$': '$.steps',
      },
    });

    const errorHandlingState = emitMetricFailed.next(failState);
    const timeoutHandlingState = enrichTimeoutError.next(errorHandlingState);

    // Iterate over plugins section of the triggering event
    const iterateOverPlugins = new Map(this, 'IteratePlugins', {
      stateName: 'Iterate over plugins',
      itemsPath: '$.steps',
      itemSelector: {
        detail: JsonPath.stringAt('States.JsonMerge($, $$.Map.Item.Value, false)'),
        id: JsonPath.stringAt('$$.Execution.Name'),
        index: JsonPath.numberAt('$$.Map.Item.Index'),
      },
      resultPath: '$.pluginResults',
      // we set max concurrency to 1 because the process is actually sequential
      // this only works because the ouput of one plugin invocation is not used as input by the next one
      // as we communicate only through S3 buckets/prefixes and they can be predicted
      maxConcurrency: 1,
      ...props,
    });

    const preparePayload = new Pass(this, 'PluginPayload', {
      parameters: {
        id: JsonPath.stringAt('$.id'),
        plugin: JsonPath.stringAt('$.detail.plugin'),
        input: {
          bucket: props.generationBucket.bucketName,
          prefix: JsonPath.format('{}/{}', JsonPath.stringAt('$.id'), JsonPath.stringAt('$.index')),
        },
        output: {
          bucket: props.generationBucket.bucketName,
          prefix: JsonPath.format('{}/{}', JsonPath.stringAt('$.id'), JsonPath.stringAt('States.MathAdd($.index, 1)')),
        },
        configuration: JsonPath.stringAt('$.detail.configuration'),
      },
      resultPath: '$.detail',
    });

    const invokePlugins = new AsyncAwaitState(this, 'InvokePlugin', {
      ...props,
      requestEventDetailType: EventTypes.Generation.Plugin.Trigger,
      requestEventSource: ServiceName,
      responseEventDetailType: EventTypes.Generation.Plugin.Done,
      stateName: 'Invoke generation plugins',
      payloadPath: '$.detail',
    });

    iterateOverPlugins
      .itemProcessor(preparePayload.next(invokePlugins))
      .addCatch(timeoutHandlingState, {
        errors: ['States.Timeout'],
        resultPath: '$.error',
      })
      .addCatch(errorHandlingState, {
        errors: ['States.ALL'],
        resultPath: '$.error',
      });

    const putEventsTask = new EventBridgePutEvents(this, 'EmitEvent', {
      stateName: 'Publish to EventBridge',
      entries: [
        {
          eventBus: props.eventBus,
          detail: TaskInput.fromObject({
            status: 'Done',
          }),
          detailType: EventTypes.Generation.Done,
          source: ServiceName,
        },
      ],
      resultPath: '$.eventBridgeResult',
    });

    // Orchestrate workflow:
    const definition = emitMetricStarted.next(iterateOverPlugins).next(emitMetricEnded).next(putEventsTask);

    this.stateMachine = new SecuredStateMachine(this, 'GenerationStepFunction', {
      definitionBody: DefinitionBody.fromChainable(definition),
    });

    invokePlugins.grantWrite(this.stateMachine);
  }
}
