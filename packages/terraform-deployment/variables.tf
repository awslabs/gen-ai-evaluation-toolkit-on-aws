# Deployment-side variables. Most are passthrough to the customer module
# at ../terraform/variables.tf — keep descriptions in sync. The few
# variables here that DON'T exist on the customer side are deployment-only
# (ssm_image_tag_env, account/region pinning).

# =============================================================================
# Account & Naming
# =============================================================================

variable "aws_account_id" {
  description = "AWS Account ID. Optional — derived from caller credentials when empty."
  type        = string
  default     = ""
}

variable "aws_region" {
  description = "AWS Region. Optional — derived from the active AWS provider region when empty."
  type        = string
  default     = ""
}

variable "project_name" {
  description = "Project name for resource naming."
  type        = string
  default     = "etk"
}

variable "environment" {
  description = "Environment name (dev, staging, prod)."
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

variable "encryption_key_arn" {
  description = "ARN of customer-managed KMS key for encryption at rest. Null = AWS-managed keys."
  type        = string
  default     = null
}

# =============================================================================
# Networking
# =============================================================================

variable "vpc_cidr" {
  description = "VPC CIDR block. Used only when use_existing_vpc = false."
  type        = string
  default     = "10.0.0.0/16"
}

variable "use_existing_vpc" {
  description = "Set to true to use an existing VPC instead of creating a new one."
  type        = bool
  default     = false
}

variable "existing_vpc_id" {
  description = "ID of existing VPC (required if use_existing_vpc is true)."
  type        = string
  default     = null

  validation {
    condition     = var.existing_vpc_id == null || can(regex("^vpc-[0-9a-f]{8,17}$", var.existing_vpc_id))
    error_message = "existing_vpc_id must be a valid VPC ID (vpc-...)."
  }
}

variable "existing_private_subnet_ids" {
  description = "List of existing private subnet IDs (required if use_existing_vpc is true)."
  type        = list(string)
  default     = []

  validation {
    condition     = alltrue([for id in var.existing_private_subnet_ids : can(regex("^subnet-[0-9a-f]{8,17}$", id))])
    error_message = "existing_private_subnet_ids must contain valid subnet IDs (subnet-...)."
  }
}

variable "existing_public_subnet_ids" {
  description = "List of existing public subnet IDs (optional, for NAT gateway)."
  type        = list(string)
  default     = []

  validation {
    condition     = alltrue([for id in var.existing_public_subnet_ids : can(regex("^subnet-[0-9a-f]{8,17}$", id))])
    error_message = "existing_public_subnet_ids must contain valid subnet IDs (subnet-...)."
  }
}

variable "existing_isolated_subnet_ids" {
  description = "List of existing isolated (no-internet) subnet IDs for airgapped evaluators (e.g. agent-as-judge), used only when use_existing_vpc is true."
  type        = list(string)
  default     = []

  validation {
    condition     = alltrue([for id in var.existing_isolated_subnet_ids : can(regex("^subnet-[0-9a-f]{8,17}$", id))])
    error_message = "existing_isolated_subnet_ids must contain valid subnet IDs (subnet-...)."
  }
}

variable "existing_api_gw_vpc_endpoint_id" {
  description = "ID of an existing execute-api interface VPC endpoint (vpce-...), required when use_existing_vpc is true. The private REST API binds to it — ETK creates no VPC endpoints when using an existing VPC."
  type        = string
  default     = null

  validation {
    condition     = var.existing_api_gw_vpc_endpoint_id == null || can(regex("^vpce-[0-9a-f]{8,17}$", var.existing_api_gw_vpc_endpoint_id))
    error_message = "existing_api_gw_vpc_endpoint_id must be a valid VPC endpoint ID (vpce-...)."
  }
}

variable "existing_security_group_ids" {
  description = "Optional: existing security group IDs for Lambda / ECS."
  type = object({
    lambda = optional(string)
    ecs    = optional(string)
  })
  default = {}
}

variable "public_endpoint_type" {
  description = "Public API Gateway endpoint type: EDGE (default), REGIONAL, or DISABLED (private-only). The private API is always created. Mirrors CDK ApiGatewayProps.publicEndpointType."
  type        = string
  default     = "EDGE"

  validation {
    condition     = contains(["EDGE", "REGIONAL", "DISABLED"], var.public_endpoint_type)
    error_message = "public_endpoint_type must be one of EDGE, REGIONAL, or DISABLED."
  }
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
  description = "CloudWatch log retention in days. Null falls back to 18 months."
  type        = number
  default     = null
}

variable "enable_cloudwatch_alarms" {
  description = "Create CloudWatch alarms for Lambda errors, throttles, and Step Function failures."
  type        = bool
  default     = true
}

variable "enable_xray" {
  description = "Enable AWS X-Ray tracing on Lambdas, API Gateway, and Step Functions."
  type        = bool
  default     = true
}

variable "enable_observability" {
  description = "Create the CloudWatch dashboard + comprehensive alarm set."
  type        = bool
  default     = true
}

variable "alarm_sns_topic_arn" {
  description = "SNS topic ARN to receive alarm notifications."
  type        = string
  default     = null
}

# =============================================================================
# Deployment-only — bootstrap + CI plumbing
# =============================================================================
# Lives only in this package because customers deploying the customer
# module standalone don't have a bootstrap-owned SSM parameter to read.

# SSM path segment that selects the per-environment image manifest. The
# bootstrap stack seeds an empty `{}` manifest at
# `/genai-etk/<ssm_image_tag_env>/deployed-image-manifest`; CI's
# set-image-tag.sh and local build-and-push-images.sh overwrite it with
# real plugin URIs.
#
# Why this is decoupled from var.environment:
#   - var.environment shapes resource names ("genai-etk-<env>-<resource>")
#     and is plumbed into tags. Customers commonly pick "dev" / "staging"
#     / "prod" without coordinating with our SSM layout.
#   - ssm_image_tag_env names the SSM parameter the bootstrap stack
#     created. The beta account uses "tf-beta" historically, but the
#     resources it deploys are tagged "dev". Forcing the two to match
#     would break either the SSM lookup or the resource-name convention.
#
# Set this to whatever value `nx run terraform-deployment:bootstrap-apply`
# wrote (default `dev`; beta CI sets `tf-beta`).
variable "ssm_image_tag_env" {
  # Scope: this variable is **deployment-internal** — it lives only in
  # `packages/terraform-deployment/` (the monorepo's deploy harness), not in
  # the customer constructs library at `packages/terraform/`. Customers
  # consuming the library wire image URIs directly via `deployed_image_uris`
  # (a map(string)) and never see SSM. Don't add this variable to the
  # customer module.
  description = "Deployment-internal: environment segment in the deployed-image-manifest SSM parameter path (`/genai-etk/<ssm_image_tag_env>/deployed-image-manifest`). Must match the value bootstrap seeded for the target account. Decoupled from var.environment so resource-name env and SSM-path env can differ. Not exposed in the customer module — customers supply image URIs directly via `deployed_image_uris`."
  type        = string
  default     = "dev"
}

# Optional AI Gateway config for the builtin evaluator (passthrough to the
# customer module). Null disables gateway routing.
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
