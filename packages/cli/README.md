# GenAI-ETK CLI

A command-line interface for the Gen AI Evaluation Toolkit, providing comprehensive dataset management, evaluation configuration, experiment tracking, and test case generation capabilities.

## Installing Dependencies

```bash
mise install          # To install nodejs and other tools
mise run install-all  # To install workspace dependencies and build generated packages
```

### Development Setup

```bash
# Build the CLI (run from anywhere)
nx build cli

# Install CLI for local development (from cli directory)
npm run dev:link

# Unlink when done (from cli directory)
npm run dev:unlink
```

## Configuration

### Environment Variables

Set the following environment variable before using the CLI:

```bash
export GEN_AI_ETK_API_URL="https://your-api-gateway-url"
```

You can find this URL in your AWS API Gateway console under Stages → Invoke URL.

### AWS Credentials

The CLI uses the AWS SDK for JavaScript, which supports multiple credential sources:

- AWS credentials file (`~/.aws/credentials`)
- Environment variables (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`)
- IAM roles (for EC2/ECS/Lambda)
- AWS SSO profiles

Required permissions:

- `execute-api:Invoke` on the configured API Gateway
- `sagemaker:CreatePresignedMlflowTrackingServerUrl` for experiment UI access

For local development with `mise`, ensure you have AWS credentials configured as described in the [deployment package README](../deployment/README.md).

## Usage

### Getting Help

```bash
# View all available commands
genai-etk --help

# View help for a specific command group
genai-etk dataset --help
genai-etk eval --help
genai-etk experiment --help
genai-etk generation --help
```

## Commands

### Dataset Management

Manage datasets and test cases:

```bash
# Create a new dataset
genai-etk dataset create --name "my-dataset" --description "Test dataset"

# List all datasets
genai-etk dataset list

# Get dataset details
genai-etk dataset get --name "my-dataset"

# Create a dataset version
genai-etk dataset create-version --name "my-dataset" --version "v1.0"

# Create test cases
genai-etk dataset create-test-case --dataset-id "my-dataset" --input-file "test-data.json"

# List test cases
genai-etk dataset list-test-cases --dataset-id "my-dataset"

# List test cases filtered by annotation
genai-etk dataset list-test-cases --dataset-id "my-dataset" \
  --filter '{"condition": {"stringEnumCondition": {"name": "QUALITY", "value": "HIGH", "comparator": "="}}}'

# Or use a filter file
genai-etk dataset list-test-cases --dataset-id "my-dataset" --filter-file ./filter.json

# Manage annotation schemas
genai-etk dataset create-annotation-schema --name "schema1" --number-value
genai-etk dataset list-annotation-schemas
```

### Evaluation

Configure and run evaluations:

```bash
# Create evaluation configuration
genai-etk eval config create --name "my-eval-config" --config-file "eval_config.json"

# Update evaluation configuration
genai-etk eval config update --name "my-eval-config" --config-file "updated_config.json"

# List evaluation configurations
genai-etk eval config list

# Submit a full evaluation job (invoke app + score results)
genai-etk eval job submit --evaluator-name "builtin" \
  --test-cases-json '{"dataset": {"datasetId": "my-dataset"}}' \
  --scorers-json '{"llm_as_judge": {"scores": {"correctness": {"description": "Evaluate whether the answer is factually correct"}}}}'

# Submit a job using a stored config instead of inline scorers
# (--config-version pins a specific version; default is latest)
genai-etk eval job submit --evaluator-name "builtin" \
  --test-cases-json '{"dataset": {"datasetId": "my-dataset"}}' \
  --config "my-eval-config" --config-version 2

# Submit a scoring-only job (score test results that already have outputs)
genai-etk eval job submit-scoring --evaluator-name "builtin" \
  --source-report-id "report-123" \
  --scorers-json '{"llm_as_judge": {"scores": {"correctness": {"description": "Evaluate whether the answer is factually correct"}}}}'

# Submit an app invocation job (no scoring)
genai-etk eval job submit-invoke --evaluator-name "builtin" \
  --test-cases-json '{"inline": [{"input": {"question": "Hello"}}]}'

# Monitor evaluation jobs
genai-etk eval job list
genai-etk eval job get --job-id "eval-job-123"

# Schedule evaluations (runs daily at 9 AM)
genai-etk eval schedule create \
  --cron "0 9 * * ? *" \
  --job-type "FULL" \
  --evaluator-name "builtin" \
  --test-cases-json '{"dataset": {"datasetId": "my-dataset"}}' \
  --scorers-json '{"llm_as_judge": {"scores": {"correctness": {"description": "Evaluate whether the answer is factually correct"}}}}'

# Manage schedules
genai-etk eval schedule list
genai-etk eval schedule get --name "daily-eval"
genai-etk eval schedule update --name "daily-eval" --cron "0 10 * * ? *"
genai-etk eval schedule delete --name "daily-eval"
```

### Reports and Results

Evaluation jobs write their outputs to reports (containers of per-test-case results). Inspect and manage them directly:

```bash
# Reports
genai-etk eval report list
genai-etk eval report get --report-id "report-123"
genai-etk eval report create --name "my-report" --experiment-name "my-experiment"
genai-etk eval report delete --report-id "report-123"

# Results within a report
genai-etk eval result list --report-id "report-123"
genai-etk eval result get --report-id "report-123" --result-id "result-456"

# Batch operations (up to 25 items per call)
genai-etk eval result batch-create --report-id "report-123" \
  --results-json '[{"input": {"question": "Hello"}, "output": {"text": "Hi"}}]'
genai-etk eval result batch-update-scores --report-id "report-123" \
  --items-json '[{"resultId": "result-456", "scores": {"correctness": {"value": 1.0}}}]'
genai-etk eval result batch-delete --report-id "report-123" \
  --result-ids-json '["result-456"]'
```

### Experiment Tracking

Manage experiments and view results:

```bash
# Create an experiment
genai-etk experiment create --name "my-experiment" --description "Testing new model"

# List experiments
genai-etk experiment list

# Get experiment details
genai-etk experiment get --name "my-experiment"

# Get experiment outputs
genai-etk experiment get-output --name "my-experiment" --version "1.0"

# Launch MLflow UI for experiment analysis
genai-etk experiment launch-ui
```

### Test Case Generation

Generate test cases using various plugins:

```bash
# Start a generation job
genai-etk generation job start --steps-file "generation-steps.json"

# Monitor generation jobs
genai-etk generation job list
genai-etk generation job get --id "gen-job-123"

# Stop a running generation job
genai-etk generation job stop --id "gen-job-123"
```

## Development

### Building

```bash
# Build all packages including CLI
nx build cli

# Watch mode for development (from cli directory)
npm run build:watch
```

### Testing

```bash
# Run CLI tests only
nx test cli

# Run tests in watch mode (from cli directory)
npm run test:watch

# Run tests with coverage (from cli directory)
npm run test:ci

# Update test snapshots (from cli directory)
npm run test:update
```

### Code Quality

```bash
# Check linting and formatting (from cli directory)
npm run check

# Auto-fix issues (from cli directory)
npm run fix

# Format code (from cli directory)
npm run format

# Lint code (from cli directory)
npm run lint
```

## Troubleshooting

### API URL Not Set

```
Error: GEN_AI_ETK_API_URL environment variable is required
```

Solution: Set the `GEN_AI_ETK_API_URL` environment variable to your API Gateway endpoint.

### AWS Credentials Not Found

```
Error: Unable to locate credentials
```

Solution: Configure AWS credentials using one of the supported methods (credentials file, environment variables, IAM roles).

### Permission Denied

```
Error: User is not authorized to perform: execute-api:Invoke
```

Solution: Ensure your AWS credentials have the necessary permissions for API Gateway access.

### MLflow UI Access Issues

```
Error: Access denied when launching experiment UI
```

Solution: Ensure your AWS credentials have `sagemaker:CreatePresignedMlflowTrackingServerUrl` permissions.

### Getting Support

1. Check the command help: `genai-etk <command> --help`
2. Verify your configuration and credentials
3. Check the API Gateway logs in AWS CloudWatch
4. Review the deployment documentation for infrastructure issues
