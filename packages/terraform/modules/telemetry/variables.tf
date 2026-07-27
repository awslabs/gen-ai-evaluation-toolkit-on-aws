# Telemetry Module Variables
# Provides configuration for CloudWatch dashboard and alarms

variable "project_name" {
  description = "Project name for resource naming"
  type        = string
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
}

variable "region" {
  description = "AWS region"
  type        = string
}

variable "enable_observability" {
  description = "Create the CloudWatch dashboard + alarms for in-account operational monitoring."
  type        = bool
  default     = true
}

variable "alarm_sns_topic_arn" {
  description = "SNS topic ARN for alarm notifications (optional)"
  type        = string
  default     = null
}

# API Gateway Configuration
variable "rest_api_id" {
  description = "REST API Gateway ID"
  type        = string
}

variable "rest_api_name" {
  description = "REST API Gateway name for dashboard display"
  type        = string
}

variable "api_stage_name" {
  description = "API Gateway stage name"
  type        = string
}

# Lambda Function Configuration
variable "lambda_functions" {
  description = "Map of Lambda function configurations for monitoring"
  type = map(object({
    function_name = string
    display_name  = string
  }))
  default = {}
}

# DynamoDB Configuration
variable "dynamodb_tables" {
  description = "Map of DynamoDB table configurations for monitoring"
  type = map(object({
    table_name   = string
    display_name = string
    gsi_names    = optional(list(string), [])
  }))
  default = {}
}

# Step Functions Configuration
variable "state_machines" {
  description = "Map of Step Function state machine configurations for monitoring"
  type = map(object({
    state_machine_name = string
    display_name       = string
  }))
  default = {}
}

# SQS DLQ Configuration
variable "dlq_queues" {
  description = "Map of SQS DLQ configurations for monitoring"
  type = map(object({
    queue_name   = string
    display_name = string
  }))
  default = {}
}

# Alarm Thresholds (matching CDK cdk-monitoring-constructs defaults)
variable "alarm_thresholds" {
  description = "Alarm thresholds for warning and critical levels"
  type = object({
    api_5xx_error = optional(object({
      warning  = optional(number, 0.01)
      critical = optional(number, 0.05)
    }), {})
    lambda_error = optional(object({
      warning  = optional(number, 0.01)
      critical = optional(number, 0.05)
    }), {})
    lambda_throttle = optional(object({
      warning  = optional(number, 0.01)
      critical = optional(number, 0.05)
    }), {})
    dynamodb_read_throttle = optional(object({
      warning  = optional(number, 0.01)
      critical = optional(number, 0.05)
    }), {})
    dynamodb_write_throttle = optional(object({
      warning  = optional(number, 0.01)
      critical = optional(number, 0.05)
    }), {})
    dynamodb_error = optional(object({
      warning  = optional(number, 0.01)
      critical = optional(number, 0.05)
    }), {})
    state_machine_failed = optional(object({
      warning  = optional(number, 0)
      critical = optional(number, 10)
    }), {})
    state_machine_throttled = optional(object({
      warning  = optional(number, 0)
      critical = optional(number, 10)
    }), {})
    state_machine_aborted = optional(object({
      warning  = optional(number, 0)
      critical = optional(number, 10)
    }), {})
    state_machine_timed_out = optional(object({
      warning  = optional(number, 0)
      critical = optional(number, 10)
    }), {})
    dlq_messages = optional(object({
      warning  = optional(number, 0)
      critical = optional(number, 10)
    }), {})
  })
  default = {}
}

variable "tags" {
  description = "Additional tags for all resources"
  type        = map(string)
  default     = {}
}
