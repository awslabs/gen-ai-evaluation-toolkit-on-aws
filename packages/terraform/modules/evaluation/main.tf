# Evaluation Module - Main Configuration
# This module provides the SDKV2 evaluation infrastructure for ETK:
# - DynamoDB table for evaluator data (jobs, reports, results)
# - Step Functions orchestration state machine
# - Python Lambda functions for evaluator API and task processing
# - EventBridge rules for task routing
# - Scheduler CRUD TypeScript Lambda functions
# - IAM roles and policies for all components

terraform {
  required_version = ">= 1.9.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

locals {
  event_bus_name = element(split("/", var.event_bus_arn), 1)

  evaluator_shared_env = {
    EVALUATOR_TABLE            = aws_dynamodb_table.evaluator.name
    EVENT_BUS_NAME             = local.event_bus_name
    EVALUATION_BUCKET          = aws_s3_bucket.evaluation.id
    MLFLOW_TRACKING_SERVER_ARN = var.mlflow_server_arn
    STATE_MACHINE_ARN          = aws_sfn_state_machine.orchestration.arn
  }

  # Optional AI Gateway env for the builtin evaluator — mirrors the CDK
  # addGatewayEnvironment() AI_GATEWAY_* contract. Empty when no gateway is configured.
  builtin_gateway_env = var.gateway_config != null ? merge({
    AI_GATEWAY_ENDPOINT          = var.gateway_config.gateway_endpoint
    AI_GATEWAY_TOKEN_ENDPOINT    = var.gateway_config.token_endpoint
    AI_GATEWAY_CLIENT_ID         = var.gateway_config.client_id
    AI_GATEWAY_CLIENT_SECRET_ARN = var.gateway_config.client_secret_arn
    AI_GATEWAY_MODEL_ID          = var.gateway_config.model_id
    },
    # Scope is optional — omitted from the environment (and thus the token
    # request) when the gateway's IdP does not require one.
    var.gateway_config.scope != null ? { AI_GATEWAY_SCOPE = var.gateway_config.scope } : {}
  ) : {}
}

# =============================================================================
# DynamoDB Table — single-table design for evaluator data
# =============================================================================

resource "aws_dynamodb_table" "evaluator" {
  name         = "evaluatortable"
  billing_mode = "PAY_PER_REQUEST"

  hash_key  = "pk"
  range_key = "sk"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  deletion_protection_enabled = true

  # Server-side encryption — uses CMK if provided, otherwise AWS-managed key.
  # Mirrors the CDK SecuredTable construct and modules/datastore/dynamodb.tf.
  server_side_encryption {
    enabled     = true
    kms_key_arn = var.encryption_key_arn # null = AWS-managed key
  }

  lifecycle {
    prevent_destroy = true
  }

  tags = merge(var.tags, {
    Name = "evaluatortable"
  })
}
