import assert from 'assert';
import { CreateGenEcsPlugin, GenerationEcsPlugin, LambdaEvaluator } from '@awssolutions/gen-ai-evaluation-cdk';
import { Duration, Stack, StackProps, Tags } from 'aws-cdk-lib';
import { ContainerImage } from 'aws-cdk-lib/aws-ecs';
import { DockerImageCode, DockerImageFunction } from 'aws-cdk-lib/aws-lambda';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { RestApi } from 'aws-cdk-lib/aws-apigateway';
import { IEventBus } from 'aws-cdk-lib/aws-events';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { ContainerImageReference, imagePath, GatewayConfigInput } from '../common';
import { Effect, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { ISubnet, IVpc, SubnetType } from 'aws-cdk-lib/aws-ec2';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';

type ExternalPluginsStackProps = StackProps & {
  vpc: IVpc;
  uploadContainerImage: (scope: Construct, imagePath: string, imageName?: string) => ContainerImageReference;

  createGenEcsPlugin: CreateGenEcsPlugin;
  eventBus: IEventBus;
  restApiId: string;
  /**
   * The data bucket (from DataStack). All plugin/evaluator bucket grants are
   * handled here so the dependency flows DataStack → ExternalPluginsStack only.
   */
  dataBucket: IBucket;

  /**
   * When provided, the agent-as-judge Lambda is pinned to these isolated
   * subnets (no internet egress). When absent it falls back to PRIVATE_WITH_EGRESS
   * and the network guard in the Lambda will fail loudly — use only for testing.
   */
  agentAsJudgeIsolatedSubnets?: ISubnet[];

  gatewayConfig?: GatewayConfigInput;
};

export class ExternalPluginsStack extends Stack {
  public ragGenPluginRole: Role;
  public agenticPluginRole: Role;

  public agentAsJudgeLambda: DockerImageFunction;

  private vpc: IVpc;
  private dataBucket: IBucket;
  private agentAsJudgeIsolatedSubnets?: ISubnet[];

  private uploadImage: ExternalPluginsStackProps['uploadContainerImage'];

  private createGenEcsPlugin: CreateGenEcsPlugin;
  private eventBus: IEventBus;
  private restApiId: string;
  private gatewayConfig?: GatewayConfigInput;

  constructor(scope: Construct, props: ExternalPluginsStackProps) {
    super(scope, 'GenAiEtk-external-plugins', props);
    Tags.of(this).add('stack', this.stackName); // Only informational

    this.vpc = props.vpc;
    this.dataBucket = props.dataBucket;

    if (props.agentAsJudgeIsolatedSubnets) {
      assert(
        props.agentAsJudgeIsolatedSubnets.length > 0,
        'ExternalPluginsStack.agentAsJudgeIsolatedSubnets must be non-empty when provided',
      );
      this.agentAsJudgeIsolatedSubnets = props.agentAsJudgeIsolatedSubnets;
    }

    this.uploadImage = props.uploadContainerImage;
    this.createGenEcsPlugin = props.createGenEcsPlugin;
    this.eventBus = props.eventBus;
    this.restApiId = props.restApiId;
    this.gatewayConfig = props.gatewayConfig;

    this.setupBuiltinEvaluator();
    this.setupGenEcsPlugins();
    this.setupAgentAsJudgeEvaluator();
  }

  /**
   * Built-in evaluator Lambda — bundles LLM-as-Judge, RAGAS, and AgentCore scorers.
   * Wired via LambdaEvaluator construct (EventBridge rule + API GW invoke permission).
   */
  private setupBuiltinEvaluator() {
    const builtinImage = this.uploadImage(this, imagePath('evaluator-builtin'));
    const builtinLambda = new DockerImageFunction(this, 'BuiltinEvaluatorLambda', {
      code: DockerImageCode.fromEcr(builtinImage.ecrRepo, { tagOrDigest: builtinImage.imageTag }),
      timeout: Duration.minutes(15),
      logRetention: RetentionDays.TEN_YEARS,
      memorySize: 2048,
      ...(this.vpc && {
        vpc: this.vpc,
        vpcSubnets: { subnetType: SubnetType.PRIVATE_WITH_EGRESS },
      }),
    });
    builtinLambda.node.addDependency(builtinImage.ecrDeployment);

    const privateRestApi = RestApi.fromRestApiId(this, 'EvaluatorRestApi', this.restApiId);

    new LambdaEvaluator(this, 'BuiltinEvaluator', {
      evaluatorName: 'builtin',
      handler: builtinLambda,
      eventBus: this.eventBus,
      privateRestApi,
      additionalEnvironment: {
        BEDROCK_MODEL_ID: `global.anthropic.claude-sonnet-4-6`,
        POWERTOOLS_SERVICE_NAME: 'evaluator-builtin',
      },
      ...(this.gatewayConfig && {
        gatewayConfig: {
          gatewayEndpoint: this.gatewayConfig.gatewayEndpoint,
          tokenEndpoint: this.gatewayConfig.tokenEndpoint,
          clientId: this.gatewayConfig.clientId,
          clientSecret: Secret.fromSecretCompleteArn(this, 'AiGatewayClientSecret', this.gatewayConfig.clientSecretArn),
          modelId: this.gatewayConfig.modelId,
          ...(this.gatewayConfig.scope && { scope: this.gatewayConfig.scope }),
        },
      }),
    });

    // Export evaluator log group name for e2e tests
    new StringParameter(this, 'EvaluatorLogGroupName', {
      parameterName: '/genai-etk/evaluatorLogGroupName',
      stringValue: builtinLambda.logGroup.logGroupName,
      description: 'CloudWatch log group for the builtin evaluator Lambda',
    });

    // Bedrock access for built-in scorers (LLM-as-Judge, RAGAS) and app_invoke
    builtinLambda.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['bedrock:InvokeModel', 'bedrock:Converse'],
        resources: [`arn:aws:bedrock:*:${this.account}:inference-profile/*`, `arn:aws:bedrock:*::foundation-model/*`],
      }),
    );

    // AgentCore scorer needs bedrock-agentcore:Evaluate
    builtinLambda.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['bedrock-agentcore:Evaluate'],
        resources: [`arn:aws:bedrock-agentcore:*:${this.account}:evaluator/*`],
      }),
    );
  }

  /**
   * Agent-as-Judge evaluator Lambda — standalone isolated evaluator that runs
   * an opencode agent as the judge. Pinned to isolated subnets (no internet
   * egress) when agentAsJudgeIsolatedSubnets is provided.
   */
  private setupAgentAsJudgeEvaluator() {
    const aajImage = this.uploadImage(this, imagePath('evaluator-agent-as-judge'));
    const aajLambda = new DockerImageFunction(this, 'AgentAsJudgeEvaluatorLambda', {
      code: DockerImageCode.fromEcr(aajImage.ecrRepo, { tagOrDigest: aajImage.imageTag }),
      timeout: Duration.minutes(15),
      logRetention: RetentionDays.TEN_YEARS,
      memorySize: 2 * 1024,
      vpc: this.vpc,
      vpcSubnets: this.agentAsJudgeIsolatedSubnets
        ? { subnets: this.agentAsJudgeIsolatedSubnets }
        : { subnetType: SubnetType.PRIVATE_WITH_EGRESS },
      environment: {
        // Leave headroom under the 15-min Lambda limit for test-case I/O overhead.
        SUBPROCESS_TIMEOUT_MINUTES: '10',
      },
    });
    aajLambda.node.addDependency(aajImage.ecrDeployment);

    new LambdaEvaluator(this, 'AgentAsJudgeEvaluator', {
      evaluatorName: 'agent-as-judge',
      handler: aajLambda,
      eventBus: this.eventBus,
      privateRestApi: RestApi.fromRestApiId(this, 'EvaluatorRestApi2', this.restApiId),
      additionalEnvironment: {
        POWERTOOLS_SERVICE_NAME: 'evaluator-agent-as-judge',
      },
      // Least-privilege: restrict to the exact routes AaJ calls, with explicit HTTP verbs.
      // Does not need submit/create/delete routes — only job lifecycle + score writes.
      executeApiRoutes: [
        { method: 'GET', path: '/v2/jobs/*' }, // dedup check
        { method: 'PUT', path: '/v2/jobs/*/status' }, // status updates
        { method: 'GET', path: '/v2/reports/*/results' }, // list existing results
        { method: 'POST', path: '/v2/reports/*/results/scores/batch' }, // write scores
        { method: 'GET', path: '/datasets/*/testcases' }, // dataset-sourced jobs
        { method: 'GET', path: '/datasets/*/testcases/*' }, // single test case
      ],
    });

    // Bedrock access (inference + model invocation)
    aajLambda.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['bedrock:InvokeModel', 'bedrock:Converse', 'bedrock:InvokeModelWithResponseStream'],
        resources: [`arn:aws:bedrock:*:${this.account}:inference-profile/*`, `arn:aws:bedrock:*::foundation-model/*`],
      }),
    );

    // S3 access on the evaluation/agent-as-judge prefix (requirement docs + artifacts)
    this.dataBucket.grantRead(aajLambda, 'evaluation/agent-as-judge/*');
    aajLambda.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['s3:ListBucket'],
        resources: [this.dataBucket.bucketArn],
        conditions: {
          StringLike: { 's3:prefix': ['evaluation/agent-as-judge/*'] },
        },
      }),
    );

    this.agentAsJudgeLambda = aajLambda;
  }

  private setupGenEcsPlugins() {
    // Rag generator
    const ragGenImage = this.uploadImage(this, imagePath('plugin-gen-rag'));
    const ragPlugin = this.createGenEcsPlugin(this, 'GenEcsRagGen', {
      name: 'generateTestCases',
      image: ContainerImage.fromEcrRepository(ragGenImage.ecrRepo, ragGenImage.imageTag),
      fargateConfig: {
        cpu: 2 * 1024,
        memoryLimitMiB: 8 * 1024,
      },
    });
    this.grantBatchBedrockAccess(ragPlugin);
    ragPlugin.node.addDependency(ragGenImage.ecrDeployment);

    this.ragGenPluginRole = ragPlugin.taskRole;

    // Grant rag-gen access to the generation prefix of dataBucket.
    // Moved here from DataStack so all bucket grants live in one place.
    this.dataBucket.grantRead(this.ragGenPluginRole, 'generation/*');
    this.ragGenPluginRole.addToPrincipalPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['s3:ListBucket'],
        resources: [this.dataBucket.bucketArn],
        conditions: {
          StringLike: { 's3:prefix': ['generation/*'] },
        },
      }),
    );

    // Grant rag-gen access to traces prefix for OTEL trace extraction tests.
    this.dataBucket.grantRead(this.ragGenPluginRole, 'traces/*');
    this.ragGenPluginRole.addToPrincipalPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['s3:ListBucket'],
        resources: [this.dataBucket.bucketArn],
        conditions: {
          StringLike: { 's3:prefix': ['traces/*'] },
        },
      }),
    );

    // LLM-as-Judge generator
    const llmAsJudgeImage = this.uploadImage(this, imagePath('plugin-gen-llm-as-judge'));
    const llmAsJudgePlugin = this.createGenEcsPlugin(this, 'GenEcsLlmAsJudge', {
      name: 'llmAsAJudge',
      image: ContainerImage.fromEcrRepository(llmAsJudgeImage.ecrRepo, llmAsJudgeImage.imageTag),
      fargateConfig: {
        cpu: 2 * 1024,
        memoryLimitMiB: 8 * 1024,
      },
    });
    this.grantBatchBedrockAccess(llmAsJudgePlugin);
    llmAsJudgePlugin.node.addDependency(llmAsJudgeImage.ecrDeployment);

    // Agentic GTG plugin - generates test cases for AI agent evaluation
    const agenticGenImage = this.uploadImage(this, imagePath('plugin-gen-agentic'));
    const agenticPlugin = this.createGenEcsPlugin(this, 'GenEcsAgentic', {
      name: 'agenticTestCases',
      image: ContainerImage.fromEcrRepository(agenticGenImage.ecrRepo, agenticGenImage.imageTag),
      fargateConfig: {
        cpu: 2 * 1024,
        memoryLimitMiB: 8 * 1024,
      },
    });
    this.grantBedrockConverseAccess(agenticPlugin);
    agenticPlugin.node.addDependency(agenticGenImage.ecrDeployment);

    this.agenticPluginRole = agenticPlugin.taskRole;

    // Grant agentic plugin access to traces prefix for OTEL trace extraction.
    this.dataBucket.grantRead(this.agenticPluginRole, 'traces/*');
    this.agenticPluginRole.addToPrincipalPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['s3:ListBucket'],
        resources: [this.dataBucket.bucketArn],
        conditions: {
          StringLike: { 's3:prefix': ['traces/*'] },
        },
      }),
    );
  }

  private grantBatchBedrockAccess(plugin: GenerationEcsPlugin) {
    const bedrockRole = new Role(plugin, 'BedrockBatchJobRole', {
      assumedBy: new ServicePrincipal('bedrock.amazonaws.com'),
      description: 'Role for Bedrock batch job invocations',
    });

    // Grant bucket permissions
    plugin.internalBucket.grantReadWrite(bedrockRole);

    // Grant Bedrock model invocation permissions for batch jobs (required for inference profiles)
    bedrockRole.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['bedrock:InvokeModel'],
        resources: [`arn:aws:bedrock:*::foundation-model/*`, `arn:aws:bedrock:*:${this.account}:inference-profile/*`],
      }),
    );

    plugin.taskRole.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['iam:PassRole'],
        resources: [bedrockRole.roleArn],
      }),
    );

    plugin.containerDefinition.addEnvironment('BEDROCK_ROLE_ARN', bedrockRole.roleArn);
  }

  private grantBedrockConverseAccess(plugin: GenerationEcsPlugin) {
    // Grant Bedrock Converse API permissions for real-time model invocation
    plugin.taskRole.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
        resources: [`arn:aws:bedrock:*::foundation-model/*`, `arn:aws:bedrock:*:${this.account}:inference-profile/*`],
      }),
    );
  }
}
