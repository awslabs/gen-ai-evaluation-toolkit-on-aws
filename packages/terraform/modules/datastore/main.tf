# Datastore Module - Main Configuration
# This module provides data storage infrastructure for ETK:
# - DynamoDB table (single-table design)
# - S3 bucket for datasets
# - Lambda functions for data operations
# - SQS queues for asynchronous processing

terraform {
  required_version = ">= 1.9.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    null = {
      source  = "hashicorp/null"
      version = "~> 3.0"
    }
  }
}
