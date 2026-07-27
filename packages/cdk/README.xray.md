# X-Ray Tracing Implementation

X-Ray tracing has been implemented across all GenAiETK services. The implementation includes:

1. Automatic tracing for all Lambda functions (enabled by default in SecuredNodeJsFunction)
2. API Gateway tracing enabled on all service endpoints
3. X-Ray groups created per service for filtering and monitoring
4. Middleware implementation for request context propagation
5. AWS SDK calls automatically traced

## Usage

No additional configuration is required as tracing is enabled by default. However, you can:

1. View traces in AWS X-Ray console
2. Filter traces by service using the service-specific X-Ray groups
3. Monitor error rates and latency across service boundaries
4. Debug cross-service communication issues

## Dependencies

- aws-xray-sdk-core: For Lambda function instrumentation
- aws-cdk-lib/aws-xray: For X-Ray group creation and configuration
