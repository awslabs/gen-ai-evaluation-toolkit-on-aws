# Plugin IAM Module - Main Configuration
# Common data sources and locals for plugin IAM resources

terraform {
  required_version = ">= 1.9.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# =============================================================================
# Local Values
# =============================================================================

locals {
  # Common naming prefix for resources
  # Must match the ECS/Lambda module pattern: project-env-plugin-name
  name_prefix = "${var.project_name}-${var.environment}-plugin-${var.plugin_name}"

  # Shorter prefix for IAM roles to avoid 64 character limit
  # Uses project-env-plugin_name without 'plugin-' to save 7 characters
  short_name_prefix = "${var.project_name}-${var.environment}-${var.plugin_name}"

  # Common tags for all resources
  common_tags = merge(
    var.tags,
    {
      PluginName = var.plugin_name
      PluginType = var.plugin_type
      Module     = "plugins/iam"
    }
  )

  # Determine which resources to create based on plugin type
  create_lambda_role = var.plugin_type == "lambda"
  create_ecs_roles   = var.plugin_type == "ecs"

  # Extract bucket name from ARN for resource patterns
  bucket_name = element(split(":::", var.bucket_arn), 1)

  # Effective Bedrock mode. Explicit bedrock_mode wins; otherwise fall back to
  # the legacy allow_bedrock bool (true => "batch" to preserve prior behaviour).
  effective_bedrock_mode = coalesce(var.bedrock_mode, var.allow_bedrock ? "batch" : "none")
  bedrock_batch_mode     = local.create_ecs_roles && local.effective_bedrock_mode == "batch"
  bedrock_converse_mode  = local.create_ecs_roles && local.effective_bedrock_mode == "converse"

  # Internal bucket the batch role gets RW on (CDK: plugin.internalBucket).
  # Falls back to the shared bucket_arn when no dedicated internal bucket is set.
  batch_internal_bucket_arn = coalesce(var.internal_bucket_arn, var.bucket_arn)
}

# =============================================================================
# Data Sources
# =============================================================================


data "aws_partition" "current" {}
