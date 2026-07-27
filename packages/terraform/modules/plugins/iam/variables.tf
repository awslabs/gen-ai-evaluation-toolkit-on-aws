# Variables for Plugin IAM Module
# Provides reusable IAM resources for both Lambda and ECS plugins

# =============================================================================
# Required Variables
# =============================================================================

variable "project_name" {
  description = "Project name for resource naming"
  type        = string
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be dev, staging, or prod"
  }
}

variable "region" {
  description = "AWS region"
  type        = string
}

variable "account_id" {
  description = "AWS account ID"
  type        = string
}

variable "plugin_name" {
  description = "Unique name for the plugin"
  type        = string
  validation {
    condition     = can(regex("^[a-zA-Z][a-zA-Z0-9-_]{0,62}$", var.plugin_name))
    error_message = "Plugin name must start with a letter, contain only alphanumeric characters, hyphens, or underscores, and be 1-63 characters long"
  }
}

variable "plugin_type" {
  description = "Type of plugin (lambda or ecs)"
  type        = string
  validation {
    condition     = contains(["lambda", "ecs"], var.plugin_type)
    error_message = "Plugin type must be lambda or ecs"
  }
}

variable "event_bus_arn" {
  description = "ARN of the EventBridge event bus for plugin communication"
  type        = string
}

variable "bucket_arn" {
  description = "ARN of the S3 bucket for plugin data (evaluation or generation bucket)"
  type        = string
}

# =============================================================================
# Optional Variables
# =============================================================================

variable "vpc_enabled" {
  description = "Enable VPC permissions for Lambda plugins (ec2:CreateNetworkInterface, etc.)"
  type        = bool
  default     = false
}

variable "allow_bedrock" {
  description = "(DEPRECATED — use bedrock_mode instead) Grant Amazon Bedrock API permissions (InvokeModel, CreateModelInvocationJob, GetModelInvocationJob). Retained for backward compatibility: when bedrock_mode is null, true maps to bedrock_mode=\"batch\" and false to \"none\"."
  type        = bool
  default     = false
}

# Bedrock access shape for generation plugins. For ECS plugins this mirrors CDK
# external-plugins.ts:
#   - "batch"    (generateTestCases / rag, llmAsAJudge): a separate batch role
#     (bedrock.amazonaws.com) gets bedrock:InvokeModel (fm + inference-profile)
#     and RW on the plugin's OWN internal bucket; the task role gets ONLY
#     iam:PassRole to that batch role; env BEDROCK_ROLE_ARN is set.
#     (CDK grantBatchBedrockAccess)
#   - "converse" (agenticTestCases): the task role gets bedrock:InvokeModel +
#     bedrock:InvokeModelWithResponseStream directly; NO batch role, NO PassRole,
#     NO BEDROCK_ROLE_ARN. (CDK grantBedrockConverseAccess)
#   - "none": no Bedrock access.
# For Lambda plugins, any non-"none" mode grants the (batch-shaped) Lambda
# Bedrock policy; "batch"/"converse" are only distinguished for ECS roles.
# When null, falls back to allow_bedrock for backward compatibility (true =>
# "batch" to preserve prior behaviour).
variable "bedrock_mode" {
  description = "Bedrock access shape for generation plugins: batch, converse, or none. Null falls back to allow_bedrock."
  type        = string
  default     = null

  validation {
    condition     = var.bedrock_mode == null || contains(["batch", "converse", "none"], var.bedrock_mode)
    error_message = "bedrock_mode must be one of batch, converse, none (or null)."
  }
}

# ARN of the plugin's dedicated internal S3 bucket. In batch mode the Bedrock
# batch role gets read/write on this bucket (CDK plugin.internalBucket.grantReadWrite(bedrockRole)).
variable "internal_bucket_arn" {
  description = "ARN of the plugin's own internal S3 bucket (batch Bedrock role gets RW on it). Optional."
  type        = string
  default     = null
}

variable "allow_agentcore" {
  description = "Grant Bedrock AgentCore Evaluations API permissions (for agentcoreEval plugin)"
  type        = bool
  default     = false
}

variable "encryption_key_arn" {
  description = "ARN of KMS key for encryption (optional, enables KMS permissions)"
  type        = string
  default     = null
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days"
  type        = number
  default     = 7
}

variable "tags" {
  description = "Additional tags for all resources"
  type        = map(string)
  default     = {}
}
