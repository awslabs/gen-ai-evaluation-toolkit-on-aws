# Input Variables for Experiment Module

variable "project_name" {
  description = "Project name for resource naming"
  type        = string
}

variable "environment" {
  description = "Environment (dev, staging, prod)"
  type        = string
}

variable "region" {
  description = "AWS region"
  type        = string
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days. Required — root main.tf passes local.log_retention_eighteen_months (545, matching CDK RetentionDays.EIGHTEEN_MONTHS)."
  type        = number
}

variable "log_level" {
  description = "Log level for Lambda functions"
  type        = string
  default     = "INFO"
}

variable "default_lambda_memory_size" {
  description = "Default memory size for Lambda functions in MB"
  type        = number
  default     = 512
}

variable "default_lambda_timeout" {
  description = "Default timeout for Lambda functions in seconds"
  type        = number
  default     = 60
}

# ============================================================================
# Security Configuration
# ============================================================================

variable "encryption_key_arn" {
  description = "ARN of customer-managed KMS key for encryption. If null, AWS-managed keys are used."
  type        = string
  default     = null
}

# ============================================================================
# VPC and Networking
# ============================================================================

variable "subnet_ids" {
  description = "List of subnet IDs for Lambda VPC configuration"
  type        = list(string)
}

variable "lambda_security_group_id" {
  description = "Security group ID for Lambda functions"
  type        = string
}

# ============================================================================
# API Gateway
# ============================================================================

variable "api_targets" {
  description = "Map of API Gateway targets (private + optional public) to register routes on"
  type = map(object({
    rest_api_id   = string
    root_resource = string
    execution_arn = string
    is_public     = bool
  }))
}

# ============================================================================
# S3 Buckets
# ============================================================================

variable "experiment_artifacts_bucket_name" {
  description = "Name of the S3 bucket for experiment artifacts"
  type        = string
}

variable "experiment_mlflow_bucket_name" {
  description = "Name of the S3 bucket for MLflow artifacts"
  type        = string
}

# ============================================================================
# MLflow
# ============================================================================

variable "mlflow_tracking_server_arn" {
  description = "ARN of the MLflow tracking server (will be created by this module)"
  type        = string
  default     = ""
}

# ============================================================================
# EventBridge
# ============================================================================

variable "event_bus_arn" {
  description = "ARN of the EventBridge event bus"
  type        = string
}

# ============================================================================
# Observability
# ============================================================================

variable "enable_xray" {
  description = "Enable AWS X-Ray tracing"
  type        = bool
  default     = true
}

variable "access_logs_bucket_id" {
  description = "ID of the shared S3 access logs bucket for server access logging"
  type        = string
}

# ============================================================================
# Tags
# ============================================================================

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default     = {}
}

variable "aws_account_id" {
  description = "AWS account ID (passed from root to avoid data source dependency issues)"
  type        = string
}

variable "mlflow_artifacts_noncurrent_expiry_days" {
  description = "Number of days before noncurrent MLflow artifact versions expire. Default 90 days matches CDK stable bucket policy; override for production if needed."
  type        = number
  default     = 90

  validation {
    condition     = var.mlflow_artifacts_noncurrent_expiry_days >= 1
    error_message = "mlflow_artifacts_noncurrent_expiry_days must be at least 1."
  }
}
