# Variables for Generation Module

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

variable "aws_account_id" {
  description = "AWS account ID"
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

# IAM Configuration

# Step Functions Configuration
variable "event_bus_arn" {
  description = "EventBridge event bus ARN"
  type        = string
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


variable "enable_xray" {
  description = "Enable AWS X-Ray tracing"
  type        = bool
  default     = true
}

# API Gateway Configuration
variable "api_targets" {
  description = "Map of API Gateway targets (private + optional public) to register routes on"
  type = map(object({
    rest_api_id   = string
    root_resource = string
    execution_arn = string
    is_public     = bool
  }))
}

# Encryption Configuration
variable "encryption_key_arn" {
  description = "KMS key ARN for encryption"
  type        = string
  default     = null
}

# Tags
variable "tags" {
  description = "Additional tags"
  type        = map(string)
  default     = {}
}

# Plugin Configuration
variable "generation_plugins" {
  description = "Configuration for generation plugins"
  type = map(object({
    enabled       = bool
    type          = string # "lambda", "ecs", or "stepfunction"
    image_uri     = optional(string)
    handler       = optional(string)
    timeout       = optional(number, 900)
    memory        = optional(number, 256)
    memory_ecs    = optional(number, 8192)
    cpu           = optional(number, 2048)
    allow_bedrock = optional(bool, false)
  }))
  default = {}
}

variable "deployed_image_uris" {
  description = "Map of plugin deploy_key → fully-qualified `<repo>:<tag>` ECR image URI. Caller-supplied (the deployment package builds it from an SSM manifest; customers wire it however they like)."
  type        = map(string)
  default     = {}
}

variable "rest_api_invoke_url" {
  description = "REST API invoke URL for datastore export plugin"
  type        = string
  default     = ""
}

variable "datastore_bucket_arn" {
  description = "ARN of the datastore S3 bucket (for generation plugins to read source data)"
  type        = string
  default     = ""
}

variable "access_logs_bucket_id" {
  description = "S3 bucket ID for access logs (from common module)"
  type        = string
}
