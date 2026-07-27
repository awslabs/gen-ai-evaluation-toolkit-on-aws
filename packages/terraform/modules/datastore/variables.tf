# Variables for Datastore Module

variable "project_name" {
  description = "Project name for resource naming"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "region" {
  description = "AWS region"
  type        = string
}

# VPC Configuration
variable "vpc_id" {
  description = "VPC ID from common module"
  type        = string
}

variable "subnet_ids" {
  description = "Subnet IDs for Lambda functions"
  type        = list(string)
}

variable "lambda_security_group_id" {
  description = "Security group ID for Lambda functions"
  type        = string
}

# DynamoDB Configuration
variable "enable_point_in_time_recovery" {
  description = "Enable DynamoDB point-in-time recovery"
  type        = bool
  default     = true
}

variable "enable_ttl" {
  description = "Enable DynamoDB TTL"
  type        = bool
  default     = false
}

variable "enable_cloudwatch_alarms" {
  description = "Enable CloudWatch alarms for DynamoDB"
  type        = bool
  default     = true
}

# S3 Configuration
variable "enable_versioning" {
  description = "Enable S3 bucket versioning"
  type        = bool
  default     = true
}

variable "enable_lifecycle_rules" {
  description = "Enable S3 lifecycle rules"
  type        = bool
  default     = true
}

variable "access_logs_bucket_id" {
  description = "S3 bucket ID for access logs (from common module)"
  type        = string
}

# Encryption Configuration
variable "encryption_key_arn" {
  description = "KMS key ARN for encryption"
  type        = string
  default     = null
}

# Lambda Configuration
variable "log_level" {
  description = "Log level for Lambda functions"
  type        = string
  default     = "INFO"
  validation {
    condition     = contains(["DEBUG", "INFO", "WARN", "ERROR"], var.log_level)
    error_message = "Log level must be one of: DEBUG, INFO, WARN, ERROR"
  }
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days. Required — root main.tf passes local.log_retention_eighteen_months (545, matching CDK RetentionDays.EIGHTEEN_MONTHS)."
  type        = number
}


variable "enable_xray" {
  description = "Enable AWS X-Ray tracing for Lambda functions"
  type        = bool
  default     = true
}

# Tags
variable "tags" {
  description = "Additional tags"
  type        = map(string)
  default     = {}
}

# API Gateway Configuration
# api_targets: map of API targets (private + optional public) from the common
# module. Each route is registered on every target. Keys: "private", "public".
variable "api_targets" {
  description = "Map of API Gateway targets (private + optional public) to register routes on"
  type = map(object({
    rest_api_id   = string
    root_resource = string
    execution_arn = string
    is_public     = bool
  }))
}

variable "aws_account_id" {
  description = "AWS account ID (passed from root to avoid data source dependency issues)"
  type        = string
}
