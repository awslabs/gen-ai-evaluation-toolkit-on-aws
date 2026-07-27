# Main configuration for Generation Module
# This file composes all generation module resources

# The generation module includes:
# - Lambda functions for generation API operations (startGeneration, getGeneration, stopGeneration, listGenerations)
# - Step Functions state machine for generation workflow orchestration
# - API Gateway integration for generation endpoints
# - S3 bucket for generation artifacts
# - IAM roles and policies for Lambda and Step Functions execution

# All resources are defined in separate files:
# - lambda.tf: Lambda functions and permissions
# - stepfunctions.tf: Step Functions state machine and IAM roles
# - api.tf: API Gateway resources and integrations
# - s3.tf: S3 bucket for generation artifacts
# - variables.tf: Input variables
# - outputs.tf: Output values
