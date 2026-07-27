# GenAI-ETK CDK Package

This package contains AWS CDK constructs and stacks for deploying the Gen AI Evaluation Toolkit infrastructure. It provides a comprehensive set of AWS resources including datastore, evaluation, experiment, generation, and monitoring stacks with API Gateway integration.

## Architecture Overview

The CDK package creates the following main stacks:

- **Base Stack**: Core infrastructure including API Gateway, S3 buckets, DynamoDB table, and EventBridge
- **DataStore Stack**: Test Data management APIs and Lambda functions
- **Evaluation Stack**: Evaluation workflow orchestration using Step Functions and ECS tasks
- **Generation Stack**: Test case generation workflows and APIs
- **Experiment Stack**: MLflow integration and experiment tracking
- **Plugins Stack**: Container-based evaluation and generation plugins
- **Monitoring Stack**: CloudWatch monitoring dashboard and alarms
- **API Deploy Stack**: API Gateway deployment coordination

## Setup

### Installing Dependencies

```bash
mise install          # To install nodejs and other tools
mise run install-all  # To install workspace dependencies and build generated packages
```

## Usage

### AI Gateway Integration (Optional)

To route all LLM calls through an AI gateway (an OAuth2-fronted LLM gateway, Bedrock Converse-compatible) for centralized cost tracking and budget enforcement, provide `gatewayConfig` when instantiating the construct:

```typescript
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';

const clientSecret = Secret.fromSecretNameV2(this, 'AiGatewaySecret', 'my-ai-gateway-client-secret');

const genAiEtk = new GenAiEvaluationToolkitStacks(app, 'GenAiEtk', {
  env,
  vpc,
  apiGwProps: { enablePrivateApiEndpoints: false },
  gatewayConfig: {
    gatewayEndpoint: 'https://gateway.myapp.example.com/bedrock',
    tokenEndpoint: 'https://auth.myapp.example.com/oauth2/token',
    clientId: 'my-gateway-client-id',
    clientSecret: clientSecret,
    modelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
  },
});
```

**GatewayConfig fields:**

| Field | Type | Description |
|-------|------|-------------|
| `gatewayEndpoint` | `string` | AI Gateway endpoint URL (must use HTTPS) |
| `tokenEndpoint` | `string` | OAuth2 token endpoint for client credentials flow |
| `clientId` | `string` | OAuth2 application client ID |
| `clientSecret` | `ISecret` | Secrets Manager secret containing the OAuth2 client secret |
| `modelId` | `string` | Model name as registered in the AI Gateway |
| `scope` | `string?` | OAuth2 scope(s) for the token request (space-separated). Optional — omit when the gateway's IdP requires none |

When `gatewayConfig` is provided:

- All plugins (built-in and custom) automatically route through the gateway
- `secretsmanager:GetSecretValue` permission is granted to plugin execution roles
- Environment variables (`AI_GATEWAY_ENDPOINT`, `AI_GATEWAY_TOKEN_ENDPOINT`, `AI_GATEWAY_CLIENT_ID`, `AI_GATEWAY_CLIENT_SECRET_ARN`, `AI_GATEWAY_MODEL_ID`, and `AI_GATEWAY_SCOPE` when configured) are injected into plugin Lambda/ECS environments
- No code changes are needed in custom evaluators — gateway routing is transparent

When `gatewayConfig` is omitted (default), plugins call Amazon Bedrock directly.

### Available Exports

The toolkit provides these exports for integration:

- `restApiId` - Private API Gateway REST API ID (used by internal Lambdas)
- `privateRestApiUrl` - Private API Gateway endpoint URL (VPC-internal, used by evaluators and plugins)
- `publicRestApiUrl` - Public API Gateway endpoint URL (EDGE/REGIONAL, for external callers). `undefined` when `publicEndpointType` is `DISABLED`.
- `publicRestApiId` - Public API Gateway REST API ID. `undefined` when `publicEndpointType` is `DISABLED`.
- `eventBus` - EventBridge event bus for plugin communication
- `mlFlowServerArn` - MLflow tracking server ARN
- `datastoreBucket` - S3 bucket for data storage
- `evaluationBucket` - S3 bucket for evaluation artifacts
- `generationBucket` - S3 bucket for generation artifacts
- `generationWorkflowRole` - IAM role for generation workflows
- `datastoreTableName` - DynamoDB table name

## Local Development

### Running Tests

```bash
# Run CDK package tests only (from cdk directory)
npm test

# Run tests in watch mode (from cdk directory)
npm run test:watch

# Update test snapshots (from cdk directory)
npm run test:update
```

### Code Quality

```bash
# Check linting and formatting (from cdk directory)
npm run lint

# Auto-fix issues (from cdk directory)
npm run format
```

## Troubleshooting

### Missing Assets Error

```
Error: Cannot find asset files
```

Solution: Run `nx build cdk` to build the package and copy required assets.

### TypeScript Compilation Errors

```
Error: Cannot find module '@src/...'
```

Solution: Ensure all dependencies are installed with `mise run install-all`, then run `nx build cdk`.

### CDK Synthesis Errors

```
Error: CDK_DEFAULT_ACCOUNT not set
```

Solution: Configure AWS credentials and ensure CDK environment variables are set.

### Container Image Build Failures

Check that Docker is running and you have permissions to build images.

> You can test docker is working with `docker run hello-world`

### Memory Issues with Jest

If Jest tests consume too much memory or run slowly:

```bash
# Set environment variables in mise.local.toml
mise set --file mise.local.toml JEST_MAX_WORKERS=1
mise set --file mise.local.toml NODE_OPTIONS="--max-old-space-size=4096"
```

## Package Structure

```
src/
├── common/           # Shared utilities and constructs
├── datastore/        # Test Data management stack
├── evaluation/       # Evaluation workflow stack
├── experiment/       # Experiment tracking stack
├── generation/       # Generation workflow stack
├── plugins/          # Plugin system implementation
└── index.ts          # Main exports
```
