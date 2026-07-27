# Variables for Lambda Plugin Module
# Provides a reusable Lambda function for ETK plugins

# =============================================================================
# Required Variables
# =============================================================================

variable "plugin_name" {
  description = "Unique name for the plugin (used in event routing)"
  type        = string
  validation {
    condition     = can(regex("^[a-zA-Z][a-zA-Z0-9-_]{0,62}$", var.plugin_name))
    error_message = "Plugin name must start with a letter, contain only alphanumeric characters, hyphens, or underscores, and be 1-63 characters long"
  }
}

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

variable "role_arn" {
  description = "ARN of the IAM role for Lambda execution"
  type        = string
}

variable "filename" {
  description = "Path to the Lambda deployment package (zip file). Required for ZIP package type."
  type        = string
  default     = null
}

variable "handler" {
  description = "Lambda handler function (e.g., index.handler). Required for ZIP package type."
  type        = string
  default     = null
}

variable "image_uri" {
  description = "ECR image URI for Docker-based Lambda. Required for Image package type."
  type        = string
  default     = null
}

variable "package_type" {
  description = "Lambda deployment package type: Zip or Image"
  type        = string
  default     = "Zip"
  validation {
    condition     = contains(["Zip", "Image"], var.package_type)
    error_message = "Package type must be Zip or Image"
  }
}

variable "event_bus_arn" {
  description = "ARN of the EventBridge event bus for plugin communication"
  type        = string
}

# =============================================================================
# Network Configuration
# =============================================================================

variable "subnet_ids" {
  description = "List of subnet IDs for Lambda VPC configuration"
  type        = list(string)
}

variable "security_group_ids" {
  description = "List of security group IDs for Lambda VPC configuration"
  type        = list(string)
}

# =============================================================================
# Optional Variables
# =============================================================================

variable "trigger_event_type" {
  description = "EventBridge detail-type that triggers this plugin"
  type        = string
  default     = "genAiEtkEvaluationMetricTriggerEvent"
}

variable "runtime" {
  description = "Lambda runtime"
  type        = string
  default     = "nodejs22.x"
}

variable "architecture" {
  description = "Lambda architecture (x86_64 or arm64)"
  type        = string
  default     = "x86_64"
  validation {
    condition     = contains(["x86_64", "arm64"], var.architecture)
    error_message = "Architecture must be x86_64 or arm64"
  }
}

variable "timeout" {
  description = "Lambda timeout in seconds"
  type        = number
  default     = 60
}

variable "memory_size" {
  description = "Lambda memory size in MB"
  type        = number
  default     = 256
}

variable "log_level" {
  description = "Log level for the Lambda function"
  type        = string
  default     = "INFO"
  validation {
    condition     = contains(["DEBUG", "INFO", "WARN", "ERROR"], var.log_level)
    error_message = "Log level must be DEBUG, INFO, WARN, or ERROR"
  }
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days"
  type        = number
  default     = 7
}

variable "encryption_key_arn" {
  description = "ARN of KMS key for CloudWatch log encryption (optional)"
  type        = string
  default     = null
}

variable "layers" {
  description = "List of Lambda layer ARNs"
  type        = list(string)
  default     = []
}

variable "additional_environment_variables" {
  description = "Additional environment variables for the Lambda function"
  type        = map(string)
  default     = {}
}


variable "enable_xray" {
  description = "Enable AWS X-Ray tracing for the Lambda function"
  type        = bool
  default     = true
}

variable "tags" {
  description = "Additional tags for all resources"
  type        = map(string)
  default     = {}
}
