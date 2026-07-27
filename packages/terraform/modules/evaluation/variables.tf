# Variables for Evaluation Module (SDKV2)

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

# IAM Configuration
variable "scheduler_execution_role_arn" {
  description = "EventBridge Scheduler execution role ARN from common module"
  type        = string
}

variable "scheduler_group_name" {
  description = "EventBridge Scheduler group name for evaluation jobs"
  type        = string
  default     = "GenAiEtkEvaluationJobSchedulerGroup"
}

# EventBridge Configuration
variable "event_bus_arn" {
  description = "EventBridge event bus ARN"
  type        = string
}

# S3 / MLflow Configuration
variable "mlflow_artifact_bucket_arn" {
  description = "ARN of the MLflow artifact S3 bucket"
  type        = string
}

variable "mlflow_server_arn" {
  description = "ARN of the MLflow tracking server"
  type        = string
}

variable "datastore_bucket_arn" {
  description = "ARN of the datastore S3 bucket"
  type        = string
}

# Datastore Configuration
variable "datastore_table_name" {
  description = "Name of the DynamoDB datastore table"
  type        = string
}

# Lambda Configuration
variable "lambda_code_bucket" {
  description = "S3 bucket containing Lambda deployment packages"
  type        = string
}

variable "python_api_s3_key" {
  description = "S3 key for the python-api.zip Lambda deployment package"
  type        = string
  default     = "lambda/python-api.zip"
}

variable "python_api_source_hash" {
  description = "Base64-encoded SHA256 hash of the python-api.zip for change detection. When null, Lambda code updates are not triggered by hash changes."
  type        = string
  default     = null
}

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
  description = "CloudWatch log retention in days"
  type        = number
}

variable "enable_xray" {
  description = "Enable AWS X-Ray tracing"
  type        = bool
  default     = true
}

# API Gateway Configuration
# api_targets: map of API targets (private + optional public) from the common
# module. Routes are registered on every target. In-VPC callers (builtin/AAJ
# evaluators) address the PRIVATE target — see local.private_rest_api_* in api.tf.
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

# S3 Configuration
variable "evaluation_temp_test_data_expire_after" {
  description = "Number of days before temporary test data in evaluation bucket expires"
  type        = number
  default     = 7
}

# Tags
variable "tags" {
  description = "Additional tags"
  type        = map(string)
  default     = {}
}

variable "access_logs_bucket_id" {
  description = "S3 bucket ID for access logs (from common module)"
  type        = string
}

variable "aws_account_id" {
  description = "AWS account ID"
  type        = string
}

variable "config_bucket_name" {
  description = "S3 bucket name for configuration storage (experiment/MLflow artifacts bucket)"
  type        = string
}

# Evaluator-builtin Docker image
variable "evaluator_builtin_image_uri" {
  description = "ECR image URI for the evaluator-builtin Lambda (consolidated LLM-as-Judge + RAGAS + AgentCore)"
  type        = string
  default     = null
}

# Evaluator-agent-as-judge Docker image
variable "evaluator_agent_as_judge_image_uri" {
  description = "ECR image URI for the evaluator-agent-as-judge Lambda (isolated OpenCode-agent judge). Required — the evaluator is always deployed; a null URI fails the plan."
  type        = string
  default     = null
}

variable "isolated_subnet_ids" {
  description = "Isolated (no-internet) subnet IDs for the agent-as-judge Lambda. When empty the Lambda falls back to var.subnet_ids (egress-enabled) — the in-Lambda network guard will fail at runtime, so use only for testing."
  type        = list(string)
  default     = []
}

# Optional AI Gateway config for the builtin evaluator.
# When set, the builtin evaluator routes LLM calls through the gateway (mirrors
# the CDK gatewayConfig path). Leave null to disable.
variable "gateway_config" {
  description = "Optional AI Gateway config for the builtin evaluator: endpoints, OAuth2 client id, client-secret ARN, and model id. Null disables gateway routing."
  type = object({
    gateway_endpoint  = string
    token_endpoint    = string
    client_id         = string
    client_secret_arn = string
    model_id          = string
    scope             = optional(string) # OAuth2 scope(s); omit when the IdP requires none
  })
  default = null
}

