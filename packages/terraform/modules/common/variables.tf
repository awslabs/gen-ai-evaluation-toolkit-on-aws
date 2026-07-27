# Variables for Common Module

variable "project_name" {
  description = "Project name for resource naming"
  type        = string
  default     = "etk"

  validation {
    condition     = length(var.project_name) > 0
    error_message = "project_name must be a non-empty string."
  }
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "dev"
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be dev, staging, or prod"
  }
}

variable "region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

# VPC Configuration
variable "vpc_cidr" {
  description = "CIDR block for VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "isolated_subnets_secondary_cidr" {
  description = "Secondary CIDR block attached to the VPC for isolated (airgapped) subnets used by agent-as-judge. Kept disjoint from vpc_cidr so it is fully additive."
  type        = string
  default     = "10.1.0.0/16"
}

variable "availability_zones" {
  description = "List of availability zones (leave empty to auto-detect from region)"
  type        = list(string)
  default     = []

  # The /19-per-AZ subnet layout (see networking.tf) carves the /16 into 8 /19
  # blocks, reserves offset 0 for legacy /24 coexistence, and places public[0]
  # at offset 6 — which only stays collision-free for up to 3 AZs. Auto-detect
  # (empty) already slices to 3; this guards the explicit-override path.
  validation {
    condition     = length(var.availability_zones) <= 3
    error_message = "availability_zones supports at most 3 zones; the /19-per-AZ CIDR layout collides beyond that."
  }
}

variable "enable_nat_gateway" {
  description = "Enable NAT Gateway for private subnets"
  type        = bool
  default     = true
}

variable "enable_vpc_endpoints" {
  description = "Enable VPC endpoints for S3 and DynamoDB"
  type        = bool
  default     = true
}

variable "enable_private_api_endpoints" {
  description = "Enable private API Gateway endpoints"
  type        = bool
  default     = false
}

# =============================================================================
# existing VPC (Bring Your Own VPC) Configuration
# =============================================================================

variable "use_existing_vpc" {
  description = "Set to true to use an existing VPC instead of creating a new one"
  type        = bool
  default     = false
}

variable "existing_vpc_id" {
  description = "ID of existing VPC (required if use_existing_vpc is true)"
  type        = string
  default     = null
}

variable "existing_private_subnet_ids" {
  description = "List of existing private subnet IDs (required if use_existing_vpc is true)"
  type        = list(string)
  default     = []
}

variable "existing_public_subnet_ids" {
  description = "List of existing public subnet IDs (optional)"
  type        = list(string)
  default     = []
}

variable "existing_isolated_subnet_ids" {
  description = "List of existing isolated (no-internet) subnet IDs for the always-deployed agent-as-judge evaluator, required when use_existing_vpc is true (at least 2 across distinct AZs). The subnets must have NO internet route (no IGW/NAT) and must reach the required VPC endpoints (Bedrock-Runtime, EventBridge, CloudWatch + logs, execute-api interface endpoints, and the S3 gateway endpoint). ETK does not create these when using an existing VPC — the caller owns their routing and endpoint connectivity."
  type        = list(string)
  default     = []

  validation {
    condition     = var.use_existing_vpc == false || length(var.existing_isolated_subnet_ids) >= 2
    error_message = "At least 2 isolated subnet IDs (across distinct AZs) are required when use_existing_vpc is true — the agent-as-judge evaluator is always deployed and must run in airgapped subnets."
  }
}

variable "existing_api_gw_vpc_endpoint_id" {
  description = "Existing execute-api interface VPC endpoint ID, required when use_existing_vpc is true — the private REST API binds to it and the module creates no VPC endpoints on the existing-VPC path."
  type        = string
  default     = null

  validation {
    condition     = var.use_existing_vpc == false || (var.use_existing_vpc == true && var.existing_api_gw_vpc_endpoint_id != null)
    error_message = "existing_api_gw_vpc_endpoint_id is required when use_existing_vpc is true — the private REST API must bind to an existing execute-api interface VPC endpoint (the module creates no endpoints when using an existing VPC)."
  }
}

variable "existing_security_group_ids" {
  description = "Optional: Use existing security groups instead of creating new ones"
  type = object({
    lambda = optional(string)
    ecs    = optional(string)
  })
  default = {}
}

# Security Configuration
variable "encryption_key_arn" {
  description = "ARN of KMS key for encryption (optional)"
  type        = string
  default     = null
}

# Tags
variable "tags" {
  description = "Additional tags for all resources"
  type        = map(string)
  default     = {}
}

# Logging Configuration
variable "log_retention_days" {
  description = "CloudWatch log retention in days. Required — root main.tf passes local.log_retention_eighteen_months (545, matching CDK RetentionDays.EIGHTEEN_MONTHS)."
  type        = number
}

# API Gateway public endpoint type. Mirrors CDK ApiGatewayProps.publicEndpointType.
#   - "EDGE"     (default): public API with an edge-optimized CloudFront endpoint.
#   - "REGIONAL": public API with a regional endpoint.
#   - "DISABLED": no public API — private-only deployment (single private API GW).
# The private API is always created regardless of this value.
variable "public_endpoint_type" {
  description = "Public API Gateway endpoint type: EDGE (default), REGIONAL, or DISABLED (private-only)."
  type        = string
  default     = "EDGE"

  validation {
    condition     = contains(["EDGE", "REGIONAL", "DISABLED"], var.public_endpoint_type)
    error_message = "public_endpoint_type must be one of EDGE, REGIONAL, or DISABLED."
  }
}

variable "aws_account_id" {
  description = "AWS account ID (passed from root to avoid data source dependency issues)"
  type        = string
}

variable "access_logs_retention_days" {
  description = "Number of days before access log objects expire. Short default for dev/test; override with longer retention for production."
  type        = number
  default     = 30

  validation {
    condition     = var.access_logs_retention_days >= 1
    error_message = "access_logs_retention_days must be at least 1."
  }
}
