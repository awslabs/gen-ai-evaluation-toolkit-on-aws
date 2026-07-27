# GenAI ETK Python Integration Tests

This package contains integration tests for the GenAI ETK API. The tests can be executed locally.

## Running tests locally

Run tests with `hatch run test`

### Prerequisites

The tests require AWS credentials with appropriate permissions. Configure AWS credentials using `aws configure` or your preferred credential method.
The tests require GenAI ETK is deployed to your dev account. See local deployment instructions in the deployment package README.

### Configuration Options

The tests automatically detect configuration in this order:

1. **SSM Parameter** (preferred): `/genai-etk/restApiEndpoint` - API endpoint from parameter store
2. **Environment Variable** (fallback): `GENAI_ETK_API_URL` - API Gateway URL
3. **AWS Region**: Detected from boto3 session or defaults to `us-east-1`
