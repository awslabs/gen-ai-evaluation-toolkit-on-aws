# GenAI-ETK Deployment

The GenAI-ETK Deployment package provides AWS CDK infrastructure for the GenAI Evaluation Toolkit, enabling secure and scalable evaluation of AI models and plugins.

This deployment creates a robust infrastructure for executing evaluation tasks, managing job statuses, and handling asynchronous workflows using AWS services including Lambda, Step Functions, DynamoDB, and API Gateway.

## Local Development

### Bootstrap CDK

Before first deployment, bootstrap your AWS account:

```shell
mise run bootstrap
```

> You need to run bootstrap only once per account

### Deploy Infrastructure

Deploy all stacks:

```shell
mise run deploy
```

List available stacks:

```shell
npx cdk list
```

#### Deploying into an existing VPC

By default, the pre-reqs stack creates a new VPC (CIDR `10.0.0.0/16`) along with VPC endpoints, flow logs, and a security group. To deploy into a VPC you already own, set `EXISTING_VPC_ID` before running deploy:

```shell
EXISTING_VPC_ID=vpc-0123456789abcdef0 mise run deploy
```

When `EXISTING_VPC_ID` is set, no new VPC, endpoints, flow logs, or security group are created. The VPC must have at least one private subnet (with egress) and whatever connectivity the workloads need — e.g. NAT or interface endpoints for ECR, CloudWatch, and API Gateway. `AWS_ACCOUNT` and `AWS_REGION` (or `CDK_DEFAULT_*`) must also be set so CDK can perform the `Vpc.fromLookup`.

> **Note:** When deploying into an existing VPC you must also provide an existing `execute-api` VPC endpoint ID so that internal Lambdas can reach the private API Gateway. Pass it via `EXISTING_API_GW_VPC_ENDPOINT_ID`:

```shell
EXISTING_VPC_ID=vpc-0123456789abcdef0 EXISTING_API_GW_VPC_ENDPOINT_ID=vpce-0abc123 mise run deploy
```

> **Note for Agent-as-Judge:** When using `EXISTING_VPC_ID`, the Agent-as-Judge evaluator requires pre-built **isolated subnets** — one per AZ, with no route to a NAT gateway or internet gateway. It also requires VPC interface endpoints for Bedrock Runtime, EventBridge, ECR, ECR Docker, CloudWatch, CloudWatch Logs, and `execute-api` (for the private API Gateway), plus an S3 gateway endpoint. Without these, the evaluator will detect internet reachability and refuse to run (`InternetEgressDetectedError`). See the Solution Guide's *Network isolation for the Agent-as-Judge evaluator* section for details.

### Build and Test

Build the project:

```shell
nx build deployment
```

Run tests with coverage:

```shell
npm run test
```

Update test snapshots (from deployment directory):

```shell
npm run test:update
```

### Code Quality

Lint and fix code (from deployment directory):

```shell
npm run lint
npm run fix
```

## Troubleshooting

### Common Issues

1. **CDK deployment fails**
   - Check AWS credentials and region configuration
   - Verify CDK context in `cdk.json`
   - Ensure account is bootstrapped: `mise run bootstrap`

2. **Lambda function timeouts**
   - Check CloudWatch Logs for specific functions
   - Increase timeout in stack configuration
   - Optimize function code for performance

3. **Build failures**
   - Run `mise run build` to compile TypeScript
   - Check for missing dependencies: `mise run install`
   - Verify Node.js version compatibility

4. **Test failures**
   - Update snapshots if infrastructure changed: `npm run test:update` (from deployment directory)
   - Check for environment-specific test data
   - Verify mock configurations in test setup

### Debugging and Monitoring

- **CloudWatch Logs**: Detailed logging for all components
- **AWS X-Ray**: Request tracing through the system
- **Performance**: Monitor DynamoDB capacity and Lambda metrics

## Infrastructure Overview

The GenAI-ETK deployment creates multiple interconnected stacks:

- **Pre-requisites Stack**: VPC, KMS keys, container images
- **GenAI-ETK Stacks**: Core evaluation toolkit infrastructure
- **Data Stack**: Storage for test data
- **External Plugins Stack**: Evaluation plugins (Lambda and ECS) and generation plugins (ECS)

The main application uses the `GenAiEvaluationToolkitStacks` construct from the CDK package.

### Plugin Deployment

ECS plugins run on Fargate with the following default resources:

| Plugin | Type | Task Definition | vCPU | Memory |
|--------|------|-----------------|------|--------|
| RAGAS | Evaluation | `ragas` | 2 | 8 GB |
| LLM-as-Judge | Evaluation | `llmAsJudgeEval` | 2 | 8 GB |
| RAG Test Case Generator | Generation | `generateTestCases` | 2 | 8 GB |
| Agentic Test Case Generator | Generation | `agenticTestCases` | 2 | 8 GB |
| LLM-as-Judge (Generation) | Generation | `llmAsAJudge` | 2 | 8 GB |

Lambda plugins (RAGAS Lambda, LLM-as-Judge Lambda, AgentCore Evaluations) are configured with 512 MB memory and 5-minute timeout.

Plugins integrate with workflow orchestrators via EventBridge for task tokens and progress reporting. For detailed plugin configuration and IAM permissions, see the [Solution Guide](../../docs/solution_guide/Gen-AI-ETK-SolutionGuide.md).

## Stack Dependencies

```
PreReqsStack → GenAiEtkStacks → DataStack
```

All stacks are deployed with proper dependency management to ensure correct resource creation order.

## Development Workflow

1. Make infrastructure changes in `lib/`
2. Update tests in `test/`
3. Run `mise run test` to verify changes
4. Run `mise run build` to compile
5. Deploy with `mise run deploy`

## Clean Up

Remove all deployed resources:

```shell
mise run destroy
```
