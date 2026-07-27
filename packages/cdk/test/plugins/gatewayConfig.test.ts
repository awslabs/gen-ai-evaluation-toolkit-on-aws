import { App, Stack } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { RestApi } from 'aws-cdk-lib/aws-apigateway';
import { Vpc } from 'aws-cdk-lib/aws-ec2';
import { ContainerImage } from 'aws-cdk-lib/aws-ecs';
import { EventBus } from 'aws-cdk-lib/aws-events';
import { Code, Function, Runtime } from 'aws-cdk-lib/aws-lambda';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import { GatewayConfig } from '../../src/common/types/gatewayConfig';
import { LambdaEvaluator } from '../../src/plugins/lambdaEvaluator';
import { createEvalEcsPluginFactory, createGenEcsPluginFactory } from '../../src/plugins/ecsPlugin';
import { createSetupEvalLambdaPlugin, createSetupGenerationLambdaPlugin } from '../../src/plugins/lambdaPlugin';

// Replace SecuredNodejsFunction (which expects pre-bundled Lambda assets) with a
// minimal Function so plugin constructs can be instantiated without a workspace build.
jest.mock('../../src/common/constructs/secured', () => {
  const actual = jest.requireActual('../../src/common/constructs/secured');
  const lambda = jest.requireActual('aws-cdk-lib/aws-lambda');
  class FakeSecuredNodejsFunction extends lambda.Function {
    constructor(scope: Construct, id: string, props: Record<string, unknown>) {
      const { vpc: _vpc, environment, ...rest } = (props || {}) as Record<string, unknown>;
      super(scope, id, {
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: 'index.handler',
        code: lambda.Code.fromInline('exports.handler = async () => {}'),
        environment,
        ...(rest as object),
      });
    }
  }
  return {
    ...actual,
    SecuredNodejsFunction: FakeSecuredNodejsFunction,
  };
});

function buildStack() {
  const app = new App();
  const stack = new Stack(app, 'TestStack', { env: { account: '123456789012', region: 'us-east-1' } });
  return { app, stack };
}

function buildGatewayConfig(stack: Stack, secretId = 'GwSecret'): GatewayConfig {
  const secret = new Secret(stack, secretId);
  return {
    gatewayEndpoint: 'https://gateway.example.com/bedrock',
    tokenEndpoint: 'https://auth.example.com/oauth2/token',
    clientId: 'test-client-id',
    clientSecret: secret,
    modelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
  };
}

function dummyFn(stack: Stack, id: string): Function {
  return new Function(stack, id, {
    runtime: Runtime.NODEJS_20_X,
    handler: 'index.handler',
    code: Code.fromInline('exports.handler = async () => {}'),
  });
}

// ---- ECS plugins -------------------------------------------------------------

describe('GatewayConfig — ECS plugins', () => {
  it('createGenEcsPluginFactory injects AI Gateway env vars when gatewayConfig is provided', () => {
    const { stack } = buildStack();
    const vpc = new Vpc(stack, 'Vpc');
    const eventBus = new EventBus(stack, 'Bus');
    const bucket = new Bucket(stack, 'Bucket');
    const gatewayConfig = buildGatewayConfig(stack);

    const factory = createGenEcsPluginFactory(bucket, eventBus, vpc, undefined, gatewayConfig);
    factory(stack, 'TestPlugin', {
      name: 'testPlugin',
      image: ContainerImage.fromRegistry('public.ecr.aws/test:latest'),
      fargateConfig: { cpu: 512, memoryLimitMiB: 1024 },
    });

    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::ECS::TaskDefinition', {
      ContainerDefinitions: Match.arrayWith([
        Match.objectLike({
          Environment: Match.arrayWith([
            { Name: 'AI_GATEWAY_ENDPOINT', Value: 'https://gateway.example.com/bedrock' },
            { Name: 'AI_GATEWAY_TOKEN_ENDPOINT', Value: 'https://auth.example.com/oauth2/token' },
            { Name: 'AI_GATEWAY_CLIENT_ID', Value: 'test-client-id' },
            Match.objectLike({ Name: 'AI_GATEWAY_CLIENT_SECRET_ARN' }),
            { Name: 'AI_GATEWAY_MODEL_ID', Value: 'anthropic.claude-3-sonnet-20240229-v1:0' },
          ]),
        }),
      ]),
    });
  });

  it('createGenEcsPluginFactory does NOT inject AI Gateway env vars when gatewayConfig is undefined', () => {
    const { stack } = buildStack();
    const vpc = new Vpc(stack, 'Vpc');
    const eventBus = new EventBus(stack, 'Bus');
    const bucket = new Bucket(stack, 'Bucket');

    const factory = createGenEcsPluginFactory(bucket, eventBus, vpc, undefined, undefined);
    factory(stack, 'TestPlugin', {
      name: 'testPlugin',
      image: ContainerImage.fromRegistry('public.ecr.aws/test:latest'),
      fargateConfig: { cpu: 512, memoryLimitMiB: 1024 },
    });

    const template = Template.fromStack(stack);
    const taskDefs = template.findResources('AWS::ECS::TaskDefinition');
    const containerDefs = Object.values(taskDefs)[0]?.Properties?.ContainerDefinitions || [];
    const appContainer = containerDefs.find((c: { Name: string }) => c.Name !== 'aws-otel-collector');
    const envVarNames = (appContainer?.Environment || []).map((e: { Name: string }) => e.Name);

    expect(envVarNames).not.toContain('AI_GATEWAY_ENDPOINT');
    expect(envVarNames).not.toContain('AI_GATEWAY_TOKEN_ENDPOINT');
    expect(envVarNames).not.toContain('AI_GATEWAY_CLIENT_ID');
    expect(envVarNames).not.toContain('AI_GATEWAY_CLIENT_SECRET_ARN');
    expect(envVarNames).not.toContain('AI_GATEWAY_MODEL_ID');
  });

  it('createEvalEcsPluginFactory also accepts gatewayConfig', () => {
    const { stack } = buildStack();
    const vpc = new Vpc(stack, 'Vpc');
    const eventBus = new EventBus(stack, 'Bus');
    const bucket = new Bucket(stack, 'Bucket');
    const gatewayConfig = buildGatewayConfig(stack);

    const factory = createEvalEcsPluginFactory(bucket, eventBus, vpc, undefined, gatewayConfig);
    factory(stack, 'EvalPlugin', {
      name: 'evalPlugin',
      image: ContainerImage.fromRegistry('public.ecr.aws/test:latest'),
      fargateConfig: { cpu: 512, memoryLimitMiB: 1024 },
    });

    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::ECS::TaskDefinition', {
      ContainerDefinitions: Match.arrayWith([
        Match.objectLike({
          Environment: Match.arrayWith([{ Name: 'AI_GATEWAY_CLIENT_ID', Value: 'test-client-id' }]),
        }),
      ]),
    });
  });
});

// ---- Lambda plugins ----------------------------------------------------------

describe('GatewayConfig — Lambda plugins', () => {
  it('createSetupEvalLambdaPlugin injects AI Gateway env vars when gatewayConfig is provided', () => {
    const { stack } = buildStack();
    const eventBus = new EventBus(stack, 'Bus');
    const bucket = new Bucket(stack, 'Bucket');
    const gatewayConfig = buildGatewayConfig(stack);

    const setup = createSetupEvalLambdaPlugin(eventBus, bucket, gatewayConfig);
    const fn = dummyFn(stack, 'PluginFn');
    setup('myEvalPlugin', fn);

    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::Lambda::Function', {
      Environment: {
        Variables: Match.objectLike({
          AI_GATEWAY_ENDPOINT: 'https://gateway.example.com/bedrock',
          AI_GATEWAY_TOKEN_ENDPOINT: 'https://auth.example.com/oauth2/token',
          AI_GATEWAY_CLIENT_ID: 'test-client-id',
          AI_GATEWAY_MODEL_ID: 'anthropic.claude-3-sonnet-20240229-v1:0',
        }),
      },
    });
  });

  it('createSetupEvalLambdaPlugin omits AI Gateway env vars when gatewayConfig is undefined', () => {
    const { stack } = buildStack();
    const eventBus = new EventBus(stack, 'Bus');
    const bucket = new Bucket(stack, 'Bucket');

    const setup = createSetupEvalLambdaPlugin(eventBus, bucket);
    const fn = dummyFn(stack, 'PluginFn');
    setup('myEvalPlugin', fn);

    const template = Template.fromStack(stack);
    const fns = template.findResources('AWS::Lambda::Function');
    const envVars = Object.values(fns)[0]?.Properties?.Environment?.Variables || {};
    expect(envVars).not.toHaveProperty('AI_GATEWAY_ENDPOINT');
    expect(envVars).not.toHaveProperty('AI_GATEWAY_CLIENT_ID');
  });

  it('createSetupGenerationLambdaPlugin also accepts gatewayConfig', () => {
    const { stack } = buildStack();
    const eventBus = new EventBus(stack, 'Bus');
    const bucket = new Bucket(stack, 'Bucket');
    const gatewayConfig = buildGatewayConfig(stack);

    const setup = createSetupGenerationLambdaPlugin(eventBus, bucket, gatewayConfig);
    const fn = dummyFn(stack, 'PluginFn');
    setup('myGenPlugin', fn);

    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::Lambda::Function', {
      Environment: {
        Variables: Match.objectLike({ AI_GATEWAY_CLIENT_ID: 'test-client-id' }),
      },
    });
  });
});

// ---- LambdaEvaluator ---------------------------------------------------------

describe('GatewayConfig — LambdaEvaluator', () => {
  it('injects AI Gateway env vars when gatewayConfig is provided', () => {
    const { stack } = buildStack();
    const eventBus = new EventBus(stack, 'Bus');
    const restApi = new RestApi(stack, 'Api');
    restApi.root.addMethod('GET'); // RestApi requires at least one method
    const fn = dummyFn(stack, 'EvaluatorFn');
    const gatewayConfig = buildGatewayConfig(stack);

    new LambdaEvaluator(stack, 'Evaluator', {
      evaluatorName: 'myEvaluator',
      handler: fn,
      eventBus,
      privateRestApi: restApi,
      gatewayConfig,
    });

    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::Lambda::Function', {
      Environment: {
        Variables: Match.objectLike({
          AI_GATEWAY_ENDPOINT: 'https://gateway.example.com/bedrock',
          AI_GATEWAY_CLIENT_ID: 'test-client-id',
          AI_GATEWAY_MODEL_ID: 'anthropic.claude-3-sonnet-20240229-v1:0',
        }),
      },
    });
  });

  it('does NOT inject AI Gateway env vars when gatewayConfig is undefined', () => {
    const { stack } = buildStack();
    const eventBus = new EventBus(stack, 'Bus');
    const restApi = new RestApi(stack, 'Api');
    restApi.root.addMethod('GET');
    const fn = dummyFn(stack, 'EvaluatorFn');

    new LambdaEvaluator(stack, 'Evaluator', {
      evaluatorName: 'myEvaluator',
      handler: fn,
      eventBus,
      privateRestApi: restApi,
    });

    const template = Template.fromStack(stack);
    const fns = template.findResources('AWS::Lambda::Function');
    const envVars = Object.values(fns)[0]?.Properties?.Environment?.Variables || {};
    expect(envVars).not.toHaveProperty('AI_GATEWAY_ENDPOINT');
    expect(envVars).not.toHaveProperty('AI_GATEWAY_CLIENT_ID');
  });
});
