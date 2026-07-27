# Variables for ECS Plugin Module
# Reusable ECS plugin module for event-driven container plugins
# Matches CDK patterns from ecsPlugin.ts and eventDrivenEcs.ts

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
  description = "Unique name for the plugin (used in EventBridge routing)"
  type        = string
  validation {
    condition     = can(regex("^[a-zA-Z][a-zA-Z0-9-_]{0,62}$", var.plugin_name))
    error_message = "Plugin name must start with a letter, contain only alphanumeric characters, hyphens, or underscores, and be 1-63 characters long"
  }
}

variable "trigger_event_type" {
  description = "EventBridge detail-type to trigger this plugin (e.g., genAiEtkEvaluationMetricTriggerEvent)"
  type        = string
  validation {
    condition     = can(regex("^[a-zA-Z][a-zA-Z0-9]+$", var.trigger_event_type))
    error_message = "Trigger event type must be alphanumeric starting with a letter"
  }
}

variable "image_uri" {
  description = "ECR image URI for the plugin container"
  type        = string
}

variable "cluster_arn" {
  description = "ARN of the ECS cluster to run tasks on (typically the evaluation cluster)"
  type        = string
}

variable "task_role_arn" {
  description = "ARN of the IAM role for the ECS task (application permissions)"
  type        = string
}

variable "execution_role_arn" {
  description = "ARN of the IAM role for ECS task execution (agent permissions - pull images, write logs)"
  type        = string
}

variable "subnet_ids" {
  description = "List of subnet IDs for ECS tasks (private subnets recommended)"
  type        = list(string)
  validation {
    condition     = length(var.subnet_ids) > 0
    error_message = "At least one subnet ID must be provided"
  }
}

variable "vpc_id" {
  description = "VPC ID for ECS task security group"
  type        = string
}

variable "event_bus_arn" {
  description = "ARN of the EventBridge event bus for plugin communication"
  type        = string
}

variable "trigger_lambda_filename" {
  description = "Path to the Lambda deployment package (ZIP file) for the trigger function"
  type        = string
}

# =============================================================================
# Optional Variables - ECS Task Configuration
# =============================================================================

variable "cpu" {
  description = "CPU units for Fargate task (256, 512, 1024, 2048, 4096)"
  type        = number
  default     = 2048
  validation {
    condition     = contains([256, 512, 1024, 2048, 4096], var.cpu)
    error_message = "CPU must be one of: 256, 512, 1024, 2048, 4096"
  }
}

variable "memory" {
  description = "Memory (MB) for Fargate task"
  type        = number
  default     = 8192
  validation {
    condition     = var.memory >= 512 && var.memory <= 30720
    error_message = "Memory must be between 512 and 30720 MB"
  }
}

variable "container_name" {
  description = "Name for the plugin container"
  type        = string
  default     = "PluginContainer"
}

# =============================================================================
# Optional Variables - Lambda Configuration
# =============================================================================

variable "trigger_lambda_handler" {
  description = "Handler for the trigger Lambda function"
  type        = string
  default     = "index.triggerLambda.lambdaHandler"
}

variable "trigger_lambda_runtime" {
  description = "Runtime for the trigger Lambda function"
  type        = string
  default     = "nodejs22.x" # Match CDK SecuredNodejsFunction NODEJS_22_X
}

variable "trigger_lambda_timeout" {
  description = "Timeout in seconds for the trigger Lambda"
  type        = number
  default     = 60 # Match CDK SecuredNodejsFunction DEFAULT_LAMBDA_TIMEOUT
}

variable "trigger_lambda_memory" {
  description = "Memory size in MB for the trigger Lambda"
  type        = number
  default     = 512 # Match CDK SecuredNodejsFunction DEFAULT_MEMORY_SIZE - higher memory = faster cold starts
}

variable "trigger_lambda_vpc_config" {
  description = "Whether to deploy trigger Lambda in VPC"
  type        = bool
  default     = true
}

variable "lambda_security_group_id" {
  description = "Security group ID for trigger Lambda (if VPC enabled)"
  type        = string
  default     = null
}

variable "lambda_layers" {
  description = "List of Lambda layer ARNs to attach to the trigger function"
  type        = list(string)
  default     = []
}

# =============================================================================
# Optional Variables - Observability
# =============================================================================

variable "log_retention_days" {
  description = "CloudWatch log retention in days"
  type        = number
  default     = 7
}

variable "log_level" {
  description = "Log level for plugin container and Lambda (DEBUG, INFO, WARN, ERROR)"
  type        = string
  default     = "INFO"
}

variable "encryption_key_arn" {
  description = "ARN of KMS key for encryption (logs, etc.)"
  type        = string
  default     = null
}

# =============================================================================
# Optional Variables - EventBridge Source
# =============================================================================

variable "event_source" {
  description = "EventBridge source name for matching events"
  type        = string
  default     = "GenAiEvaluationToolkit"
}

# =============================================================================
# Optional Variables - Dead Letter Queue
# =============================================================================

variable "enable_dlq" {
  description = "Enable dead letter queue for EventBridge target"
  type        = bool
  default     = true
}

variable "dlq_arn" {
  description = "ARN of existing SQS DLQ for EventBridge target (if not provided, one will be created)"
  type        = string
  default     = null
}

# =============================================================================
# Optional Variables - Container Environment
# =============================================================================

variable "additional_task_environment" {
  description = "Additional environment variables for the ECS task container"
  type        = map(string)
  default     = {}
}

# =============================================================================
# =============================================================================
# Optional Variables - X-Ray Tracing
# =============================================================================

variable "enable_xray" {
  description = "Enable AWS X-Ray tracing for the trigger Lambda"
  type        = bool
  default     = true
}

# =============================================================================
# Optional Variables - OTEL Collector Sidecar
# =============================================================================

variable "enable_otel_sidecar" {
  description = "Enable AWS OpenTelemetry Collector sidecar container for tracing"
  type        = bool
  default     = true
}

variable "otel_collector_image" {
  description = "Container image for the AWS OTEL Collector sidecar"
  type        = string
  default     = "public.ecr.aws/aws-observability/aws-otel-collector:latest"
}

# =============================================================================
# Optional Variables - Tagging
# =============================================================================

variable "tags" {
  description = "Additional tags for all resources"
  type        = map(string)
  default     = {}
}
