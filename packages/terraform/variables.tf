# Root Module Variables — public TF API for ETK customer deploys.
#
# This file is the contract. Once a variable ships, its name + type are
# customer-facing. Add new variables only when a customer genuinely needs
# to control the value. Internal knobs belong inside modules/, not here.

# =============================================================================
# Account & Naming
# =============================================================================

variable "aws_account_id" {
  description = "AWS Account ID. Optional — if left empty, derived from the caller's AWS credentials via aws_caller_identity."
  type        = string
  default     = ""
}

variable "aws_region" {
  description = "AWS Region. Optional — if left empty, derived from the configured AWS provider region (AWS_REGION env / ~/.aws/config)."
  type        = string
  default     = ""
}

variable "project_name" {
  description = "Project name for resource naming. Defaults to 'etk'; override via mise.toml (TF_VAR_project_name) or terraform.tfvars."
  type        = string
  default     = "etk"
}

variable "environment" {
  description = "Environment name (dev, staging, prod). Defaults to 'dev'; override via mise.toml (TF_VAR_environment) or terraform.tfvars."
  type        = string
  default     = "dev"
}

variable "tags" {
  description = "Additional tags merged onto every resource."
  type        = map(string)
  default     = {}
}

# =============================================================================
# Encryption (CMK)
# =============================================================================

# Customer-managed CMK requirements when supplied:
#   - Key policy MUST grant the deploying principal kms:* on the key (otherwise
#     terraform apply fails creating CMK-encrypted resources).
#   - Key policy MUST grant the AWS service principals used by encrypted
#     resources (logs.<region>.amazonaws.com for CloudWatch Logs,
#     lambda.amazonaws.com for env-var encryption, sqs.amazonaws.com for
#     queue encryption) kms:Encrypt / kms:Decrypt / kms:GenerateDataKey* /
#     kms:DescribeKey via Service condition.
#   - Key MUST be in the same region as the deployment.
# A symmetric KMS key with the AWS-managed default policy + the above grants
# is sufficient. See docs/solution_guide § BYOK for a worked example.
variable "encryption_key_arn" {
  description = "ARN of customer-managed KMS key for encryption at rest. If null, AWS-managed keys are used (AWS-owned CMKs for S3/DynamoDB/SQS, AWS-managed for CloudWatch Logs). When non-null, the key policy must grant the deploying principal full kms:* and grant logs/lambda/sqs service principals kms:Encrypt + kms:Decrypt + kms:GenerateDataKey* + kms:DescribeKey."
  type        = string
  default     = null
}

# =============================================================================
# Networking
# =============================================================================

variable "vpc_cidr" {
  description = "VPC CIDR block. Used only when use_existing_vpc = false. Must not overlap with VPCs the deployment will need to peer with."
  type        = string
  default     = "10.0.0.0/16"
}

# existing VPC (Bring Your Own VPC). When using existing VPC, the existing VPC MUST have
# one of the following:
#   1. NAT gateway in public subnets with routes from private subnets, OR
#   2. VPC endpoints for S3 and DynamoDB already configured.
# Without these, Lambda functions in VPC cannot access AWS services.
#
# Required VPC endpoints (interface endpoints unless noted) when option (2):
#   - com.amazonaws.<region>.s3        (Gateway endpoint — required for
#                                       Lambda deploy package download)
#   - com.amazonaws.<region>.dynamodb  (Gateway endpoint — required for any
#                                       DDB-backed plugin / state store)
#   - com.amazonaws.<region>.bedrock-runtime          (allow_bedrock plugins)
#   - com.amazonaws.<region>.bedrock-agentcore        (agentcoreLambda plugin)
#   - com.amazonaws.<region>.logs                     (CloudWatch Logs)
#   - com.amazonaws.<region>.ssm                      (SSM parameter reads)
#   - com.amazonaws.<region>.ecr.api / .ecr.dkr       (ECS plugin image pulls)
#   - com.amazonaws.<region>.secretsmanager           (only if using BYOK
#                                                       secrets — optional)
# The interface endpoints' security groups must allow inbound :443 from the
# Lambda/ECS security groups in this module.
variable "use_existing_vpc" {
  description = "Set to true to use an existing VPC instead of creating a new one. The VPC must have NAT gateway or VPC endpoints for S3/DynamoDB."
  type        = bool
  default     = false
}

variable "existing_vpc_id" {
  description = "ID of existing VPC (required if use_existing_vpc is true)."
  type        = string
  default     = null

  validation {
    condition     = var.use_existing_vpc == false || (var.use_existing_vpc == true && var.existing_vpc_id != null)
    error_message = "existing_vpc_id is required when use_existing_vpc is true"
  }
}

variable "existing_private_subnet_ids" {
  description = "List of existing private subnet IDs (required if use_existing_vpc is true). At least 2 IDs across distinct AZs."
  type        = list(string)
  default     = []

  validation {
    condition     = var.use_existing_vpc == false || (var.use_existing_vpc == true && length(var.existing_private_subnet_ids) >= 2)
    error_message = "At least 2 private subnet IDs are required when use_existing_vpc is true"
  }
}

variable "existing_public_subnet_ids" {
  description = "List of existing public subnet IDs (optional, for NAT gateway)."
  type        = list(string)
  default     = []
}

variable "existing_isolated_subnet_ids" {
  description = "List of existing isolated (no-internet) subnet IDs for the always-deployed agent-as-judge evaluator, required when use_existing_vpc is true (at least 2 across distinct AZs). The subnets must have NO internet route (no IGW/NAT) and must reach the required VPC endpoints (Bedrock-Runtime, EventBridge, CloudWatch + logs, execute-api interface endpoints, and the S3 gateway endpoint). ETK does not create these when using an existing VPC — you own their routing and endpoint connectivity."
  type        = list(string)
  default     = []

  validation {
    condition     = var.use_existing_vpc == false || length(var.existing_isolated_subnet_ids) >= 2
    error_message = "At least 2 isolated subnet IDs (across distinct AZs) are required when use_existing_vpc is true — the agent-as-judge evaluator is always deployed and must run in airgapped subnets. See the variable description for the isolation/endpoint contract."
  }
}

variable "existing_api_gw_vpc_endpoint_id" {
  description = "ID of an existing execute-api interface VPC endpoint (vpce-...), required when use_existing_vpc is true. The private REST API is bound to this endpoint; ETK creates no VPC endpoints when using an existing VPC, so the endpoint must already exist in the VPC (private DNS enabled, security group allowing :443 from the Lambda/ECS security groups)."
  type        = string
  default     = null

  validation {
    condition     = var.use_existing_vpc == false || (var.use_existing_vpc == true && var.existing_api_gw_vpc_endpoint_id != null)
    error_message = "existing_api_gw_vpc_endpoint_id is required when use_existing_vpc is true — the private REST API must bind to an existing execute-api interface VPC endpoint (ETK creates no endpoints when using an existing VPC)."
  }
}

variable "existing_security_group_ids" {
  description = "Optional: existing security group IDs for Lambda / ECS, in place of the ones the module would create."
  type = object({
    lambda = optional(string)
    ecs    = optional(string)
  })
  default = {}
}

# =============================================================================
# API Gateway VPC restriction
# =============================================================================

variable "public_endpoint_type" {
  description = "Public API Gateway endpoint type: EDGE (default), REGIONAL, or DISABLED (private-only deployment). The private API is always created. Mirrors CDK ApiGatewayProps.publicEndpointType."
  type        = string
  default     = "EDGE"

  validation {
    condition     = contains(["EDGE", "REGIONAL", "DISABLED"], var.public_endpoint_type)
    error_message = "public_endpoint_type must be one of EDGE, REGIONAL, or DISABLED."
  }
}

# =============================================================================
# AI Gateway (optional) — routes builtin-evaluator LLM calls through a gateway
# =============================================================================

variable "gateway_config" {
  description = "Optional AI Gateway config for the builtin evaluator. When set, the builtin evaluator routes LLM calls through the gateway. Null disables."
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

# =============================================================================
# Logging & Observability
# =============================================================================

variable "log_level" {
  description = "Log level for Lambda functions (DEBUG, INFO, WARN, ERROR)."
  type        = string
  default     = "INFO"
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days. Default null falls back to 18 months (matches CDK SecuredLogGroup pentest sign-off)."
  type        = number
  default     = null
}

variable "enable_cloudwatch_alarms" {
  description = "Create CloudWatch alarms for Lambda errors, throttles, and Step Function failures."
  type        = bool
  default     = true
}

variable "enable_xray" {
  description = "Enable AWS X-Ray tracing on Lambdas, API Gateway, and Step Functions. Defaults to true (always-on) for CDK parity."
  type        = bool
  default     = true
}

# Operational observability — the in-account CloudWatch dashboard + alarms.
variable "enable_observability" {
  description = "Create the CloudWatch dashboard + comprehensive alarm set for in-account operational monitoring."
  type        = bool
  default     = true
}

variable "alarm_sns_topic_arn" {
  description = "SNS topic ARN to receive alarm notifications. If null, alarms are created but unsubscribed."
  type        = string
  default     = null
}

# =============================================================================
# Plugin Registry Configuration
# =============================================================================

variable "evaluation_plugins" {
  description = "Plugin registry: which evaluation plugins to deploy. Each entry declares only the deployment shape (enabled, type, image source, IAM boundary). Resource sizing (Lambda memory/timeout, ECS CPU/memory) is module-owned — we know what our built-in plugins need, and customers shipping their own plugin own the resource lifecycle of their Lambda/ECS task themselves and just pass an image URI."
  type = map(object({
    enabled       = bool
    type          = string                # "lambda" or "ecs"
    image_uri     = optional(string)      # Customer-shipped image URI; bypasses var.deployed_image_uris lookup
    filename      = optional(string)      # ZIP-based Lambda plugins
    handler       = optional(string)      # Lambda handler entry point
    allow_bedrock = optional(bool, false) # Security boundary — grants bedrock:InvokeModel to the plugin's IAM role
  }))
  # Defaults mirror CDK's `packages/deployment/lib/stacks/external-plugins.ts`
  # so integration tests have parity. Disable an individual built-in by
  # overriding `enabled = false` in your tfvars (noop plugins stay on so
  # smoke tests run end-to-end).
  default = {
    evalNoopPlugin = {
      enabled = true
      type    = "lambda"
      handler = "index.noopPluginHandlerLambda.handler"
    }
    # ECS plugins — heavy compute, Bedrock-backed. Mirror CDK
    # external-plugins.ts setupEvalEcsPlugins().
    ragas = {
      enabled       = true
      type          = "ecs"
      allow_bedrock = true
    }
    llmAsJudge = {
      enabled       = true
      type          = "ecs"
      allow_bedrock = true
    }
    # agentCore ECS variant has no CDK counterpart — kept disabled to avoid
    # deploying resources that aren't exercised by the integration suite.
    agentCore = {
      enabled       = false
      type          = "ecs"
      allow_bedrock = true
    }
    # Lambda variants of the same eval plugins. CDK external-plugins.ts
    # setupEvalLambdaPlugins() registers all three unconditionally.
    ragasLambda = {
      enabled       = true
      type          = "lambda"
      allow_bedrock = true
    }
    llmAsJudgeLambda = {
      enabled       = true
      type          = "lambda"
      allow_bedrock = true
    }
    agentcoreLambda = {
      enabled = true
      type    = "lambda"
      # bedrock-agentcore API direct — does not need bedrock:InvokeModel.
      allow_bedrock = false
    }
  }
}

variable "generation_plugins" {
  description = "Plugin registry: which generation plugins to deploy. Same shape as evaluation_plugins — see its description for the rationale on what is (and isn't) tunable here."
  type = map(object({
    enabled       = bool
    type          = string # "lambda", "ecs", or "stepfunction"
    image_uri     = optional(string)
    handler       = optional(string)
    allow_bedrock = optional(bool, false)
  }))
  # Defaults mirror CDK PluginsStack + external-plugins.ts — DatastoreExport
  # always deploys via PluginsStack; rag + llmAsJudge ECS plugins always
  # deploy via setupGenEcsPlugins.
  default = {
    genNoopPlugin = {
      enabled = true
      type    = "lambda"
      handler = "index.noopPluginHandlerLambda.handler"
    }
    # DatastoreExport — Step-Functions-based plugin that exports generated
    # test cases into the datastore + mints a new dataset version. Wired
    # in modules/generation/plugins.tf, gated on
    # `local.datastore_export_enabled`. CDK's PluginsStack always
    # instantiates this; matches here to avoid a silent feature gap.
    DatastoreExport = {
      enabled = true
      type    = "stepfunction"
    }
    rag = {
      enabled       = true
      type          = "ecs"
      allow_bedrock = true
    }
    llmAsJudge = {
      enabled       = true
      type          = "ecs"
      allow_bedrock = true
    }
    agenticTestCases = {
      enabled       = true
      type          = "ecs"
      allow_bedrock = true
    }
  }
}

# =============================================================================
# Plugin Image URIs (caller-supplied)
# =============================================================================
# Map of plugin `deploy_key` (matching modules/{evaluation,generation}/plugins.tf
# `_resolve_image` contract) → fully-qualified image URI (e.g.
# `123456789012.dkr.ecr.eu-west-2.amazonaws.com/<repo>:<tag>`).
#
# How callers populate this:
#  - Monorepo's `packages/terraform-deployment/` reads a JSON SSM manifest
#    parameter (`/genai-etk/<env>/deployed-image-manifest`) and decodes it
#    via `jsondecode()`. The manifest is written by either CI's
#    `tf:set-image-tag` job (single tag for all plugins) or the local
#    `build-and-push-images.sh` (per-plugin content-hash tags).
#  - Customer deploys typically hardcode a tag they've pushed, or use
#    `data "aws_ecr_repository"` themselves and compose the map inline.
#
# Required keys depend on which plugins are enabled in
# var.evaluation_plugins / var.generation_plugins. Plugin modules
# fall through to a placeholder if a key is missing (resource is
# created but with no image), so partial maps are safe during phased
# rollouts.
#
# Example caller value (customer module, hardcoded tags):
#
#   deployed_image_uris = {
#     ragas             = "123456789012.dkr.ecr.eu-west-2.amazonaws.com/genai-etk-plugin-eval-ragas-ecs:v1.2.3"
#     llmAsJudge        = "123456789012.dkr.ecr.eu-west-2.amazonaws.com/genai-etk-plugin-eval-llmasjudge-ecs:v1.2.3"
#     ragasLambda       = "123456789012.dkr.ecr.eu-west-2.amazonaws.com/genai-etk-plugin-eval-ragas-lambda:v1.2.3"
#     llmAsJudgeLambda  = "123456789012.dkr.ecr.eu-west-2.amazonaws.com/genai-etk-plugin-eval-llmasjudge-lambda:v1.2.3"
#     agentcoreLambda   = "123456789012.dkr.ecr.eu-west-2.amazonaws.com/genai-etk-plugin-eval-agentcore-lambda:v1.2.3"
#     rag               = "123456789012.dkr.ecr.eu-west-2.amazonaws.com/genai-etk-plugin-gen-rag-ecs:v1.2.3"
#     llmAsJudgeGen     = "123456789012.dkr.ecr.eu-west-2.amazonaws.com/genai-etk-plugin-gen-llmasjudge-ecs:v1.2.3"
#   }
#
# Equivalent, sourced from a JSON SSM manifest (deployment package pattern):
#
#   deployed_image_uris = jsondecode(
#     data.aws_ssm_parameter.deployed_image_manifest.value
#   )

variable "deployed_image_uris" {
  description = "Map of plugin deploy_key → fully-qualified `<repo-url>:<tag>` image URI. See file header for population strategies and example values."
  type        = map(string)
  default     = {}
}

# =============================================================================
# S3 Lifecycle Configuration
# =============================================================================

variable "access_logs_retention_days" {
  description = "Number of days before access log objects expire. Mirrors CDK SecuredBucketProps.accessLogsRetentionDays. Short default for dev/test; override with longer retention for production."
  type        = number
  default     = 30

  validation {
    condition     = var.access_logs_retention_days >= 1
    error_message = "access_logs_retention_days must be at least 1."
  }
}

variable "mlflow_artifacts_noncurrent_expiry_days" {
  description = "Number of days before noncurrent MLflow artifact versions expire. Mirrors CDK SecuredBucketProps.noncurrentVersionExpiryDays (default 90d for stable buckets)."
  type        = number
  default     = 90

  validation {
    condition     = var.mlflow_artifacts_noncurrent_expiry_days >= 1
    error_message = "mlflow_artifacts_noncurrent_expiry_days must be at least 1."
  }
}
