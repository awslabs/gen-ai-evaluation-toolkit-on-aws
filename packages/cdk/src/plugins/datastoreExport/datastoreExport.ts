import { EnvVariable, ServiceName } from '@config/index';
import { IterateOverBucketFilesState } from '@constructs/stepfunction/iterateOverBucketFiles';
import { EventTypes, GenAiEtkPluginProps } from '@plugins/contracts';
import { SecuredNodejsFunction, SecuredStateMachine } from '@secured';
import { Duration } from 'aws-cdk-lib';
import { IRestApi } from 'aws-cdk-lib/aws-apigateway';
import { IVpc } from 'aws-cdk-lib/aws-ec2';
import { Rule, RuleTargetInput } from 'aws-cdk-lib/aws-events';
import { SfnStateMachine } from 'aws-cdk-lib/aws-events-targets';
import { Effect, IGrantable, IRole, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { IFunction } from 'aws-cdk-lib/aws-lambda';
import { Choice, Condition, DefinitionBody, Pass, QueryLanguage, TaskInput } from 'aws-cdk-lib/aws-stepfunctions';
import { EventBridgePutEvents, LambdaInvoke } from 'aws-cdk-lib/aws-stepfunctions-tasks';
import { Construct } from 'constructs';

export type DatastoreExportPluginProps = GenAiEtkPluginProps & {
  restApi: IRestApi;
  /** URL of the private API Gateway — used by internal Lambdas for SigV4 invocations. */
  privateRestApiUrl: string;
  grantReadWriteGenerationBucket: (scope: Construct, role: IGrantable) => void;
};

export class DatastoreExportPlugin extends Construct {
  public readonly name: string = 'DatastoreExport';
  public readonly executionRole: IRole;

  constructor(scope: Construct, id: string, props: DatastoreExportPluginProps) {
    super(scope, id);

    const restApiUrl = props.privateRestApiUrl;

    const grantAccessToInvokeRestAPI = (_scope: Construct, identity: IGrantable) => {
      identity.grantPrincipal.addToPrincipalPolicy(
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: ['execute-api:Invoke'],
          resources: [props.restApi.arnForExecuteApi('*')],
        }),
      );
    };

    // Adds the EventBridge rule to trigger the plugin
    const rule = new Rule(this, `${id}-DataExportRule`, {
      eventBus: props.eventBus,
      eventPattern: {
        source: [ServiceName],
        detailType: [EventTypes.Generation.Plugin.Trigger],
        detail: {
          plugin: [this.name],
        },
      },
      description: 'Triggers the DataStore Export plugin when a matching event is received',
    });

    const notifyError = new EventBridgePutEvents(this, `${id}-notify-error`, {
      stateName: 'Notify Error',
      entries: [
        {
          eventBus: props.eventBus,
          source: this.name,
          detailType: EventTypes.Generation.Plugin.Done,
          detail: TaskInput.fromObject({
            status: 'error',
            taskToken: '{% $taskToken %}',
            error: '{% $pluginName & " plugin failed: " & $states.input.Error %}',
            cause: '{% $states.input.Cause %}',
          }),
        },
      ],
    });

    const invokeCreateTestCase = new LambdaInvoke(this, `${id}-batchInvokeCreateTestCase`, {
      stateName: 'Batch invoke createTestCase API',
      lambdaFunction: this.getBatchCreateTestCaseLambda(
        restApiUrl,
        props.vpc,
        props.grantReadWriteGenerationBucket,
        grantAccessToInvokeRestAPI,
      ),
      payloadResponseOnly: true,
      payload: TaskInput.fromObject({
        bucket: '{% $states.input.input.bucket %}',
        objectKeys: '{% $map($states.input.partialListResult.Contents, function($content) { $content.Key }) %}',
        datasetId: '{% $states.input.configuration.datasetConfiguration.datasetId %}',
      }),
      outputs: '{% $states.input %}',
    }).addCatch(notifyError, {
      errors: ['States.ALL'],
    });

    const notifyInProgress = new EventBridgePutEvents(this, `${id}-notify-in-progress`, {
      stateName: 'Notify In Progress',
      entries: [
        {
          eventBus: props.eventBus,
          source: this.name,
          detailType: EventTypes.Generation.Plugin.Done,
          detail: TaskInput.fromObject({
            status: 'inProgress',
            taskToken: '{% $states.input.taskToken %}',
          }),
        },
      ],
    });

    const copyFragment = new IterateOverBucketFilesState(this, `${id}-ListFiles`, {
      stateName: 'Test Data',
      bucketNamePath: 'input.bucket',
      prefixPath: 'input.prefix',
      operation: invokeCreateTestCase.next(notifyInProgress),
    });

    const invokeMintVersion = new LambdaInvoke(this, `${id}-invokeMintVersion`, {
      stateName: 'Invoke mintVersion API',
      lambdaFunction: this.getCreateDatasetVersionLambda(restApiUrl, props.vpc, grantAccessToInvokeRestAPI),
      payloadResponseOnly: true,
      payload: TaskInput.fromObject({
        datasetId: '{% $states.input.configuration.datasetConfiguration.datasetId %}',
      }),
      outputs: '{% $states.input %}',
    }).addCatch(notifyError, {
      errors: ['States.ALL'],
    });

    const notifyDone = new EventBridgePutEvents(this, `${id}-notify-done`, {
      stateName: 'Notify Done',
      entries: [
        {
          eventBus: props.eventBus,
          source: this.name,
          detailType: EventTypes.Generation.Plugin.Done,
          detail: TaskInput.fromObject({
            status: 'success',
            taskToken: '{% $states.input.taskToken %}',
          }),
        },
      ],
    });

    const mintAndNotifyDone = invokeMintVersion.next(notifyDone);

    const shouldMint = new Choice(this, `${id}-shouldMInt`, {
      stateName: `Should mint a new version`,
    })
      .when(
        Condition.jsonata(
          '{% $exists($states.input.configuration.datasetConfiguration.mintVersion) and $states.input.configuration.datasetConfiguration.mintVersion %}',
        ),
        mintAndNotifyDone,
      )
      .otherwise(notifyDone)
      .afterwards();

    const preserveTaskToken = new Pass(this, `${id}-preserveTaskToken`, {
      stateName: 'Preserve Task Token',
      assign: {
        taskToken: '{% $states.input.taskToken %}',
        pluginName: '{% $states.input.plugin %}',
      },
    });

    const stateMachineDefinition = preserveTaskToken.next(copyFragment.next(shouldMint));

    const stepFunction = new SecuredStateMachine(this, `${id}-StepFunction`, {
      definitionBody: DefinitionBody.fromChainable(stateMachineDefinition),
      queryLanguage: QueryLanguage.JSONATA,
    });
    props.grantReadWriteGenerationBucket(this, stepFunction);
    props.eventBus.grantPutEventsTo(stepFunction);

    rule.addTarget(
      new SfnStateMachine(stepFunction, {
        input: RuleTargetInput.fromEventPath('$.detail'),
      }),
    );

    this.executionRole = stepFunction.role;
  }

  private getBatchCreateTestCaseLambda(
    restApiUrl: string,
    vpc: IVpc,
    grantAccessToGenerationBucket: (scope: Construct, identity: IGrantable) => void,
    grantAccessToInvokeRestAPI: (scope: Construct, identity: IGrantable) => void,
  ): IFunction {
    const batchCreateTestCaseLambda = new SecuredNodejsFunction(this, 'CreateTestCaseFunction', {
      handler: 'index.batchCreateTestCaseLambda.lambdaHandler',
      environment: {
        [EnvVariable.GENAI_ETK_URL]: restApiUrl,
      },
      timeout: Duration.minutes(15),
      vpc: vpc,
    });
    grantAccessToGenerationBucket(batchCreateTestCaseLambda, batchCreateTestCaseLambda.role!);
    grantAccessToInvokeRestAPI(batchCreateTestCaseLambda, batchCreateTestCaseLambda.role!);
    return batchCreateTestCaseLambda;
  }

  private getCreateDatasetVersionLambda(
    restApiUrl: string,
    vpc: IVpc,
    grantAccessToInvokeRestAPI: (scope: Construct, identity: IGrantable) => void,
  ): IFunction {
    const mintLambda = new SecuredNodejsFunction(this, 'MintVersionFunction', {
      handler: 'index.mintVersionLambda.lambdaHandler',
      environment: {
        [EnvVariable.GENAI_ETK_URL]: restApiUrl,
      },
      // CreateDatasetVersion can copy large datasets synchronously.
      timeout: Duration.minutes(15),
      vpc: vpc,
    });
    grantAccessToInvokeRestAPI(mintLambda, mintLambda.role!);
    return mintLambda;
  }
}
