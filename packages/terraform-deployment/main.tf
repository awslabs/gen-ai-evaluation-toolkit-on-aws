# Deployment-side root for ETK.
# Mirrors packages/deployment/lib/app.ts in the CDK split: this package
# decides which environment to deploy to, instantiates the customer
# module from packages/terraform/, and supplies deploy-time wiring
# (plugin ECR lookups, SSM image-tag, beta-account overrides).
#
# Customers should not need to modify this file. They consume the
# customer module at packages/terraform/ directly with their own
# deployment harness.

terraform {
  required_version = ">= 1.9.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Backend declared in backend.tf with concrete values supplied at
# `terraform init -backend-config=backend.hcl`.

provider "aws" {
  region = var.aws_region != "" ? var.aws_region : null

  default_tags {
    tags = merge(
      {
        Project     = var.project_name
        Environment = var.environment
        ManagedBy   = "Terraform"
      },
      var.tags
    )
  }
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  aws_account_id = var.aws_account_id != "" ? var.aws_account_id : data.aws_caller_identity.current.account_id
  aws_region     = var.aws_region != "" ? var.aws_region : data.aws_region.current.name
}

# =============================================================================
# Plugin image resolution — deployment-side concern
# =============================================================================
# Reads the plugin image manifest from a bootstrap-seeded SSM parameter
# (`/genai-etk/<env>/deployed-image-manifest`) — a JSON object mapping each
# plugin's `deploy_key` to its fully-qualified `<repo>:<tag>` ECR image URI.
# The manifest is written by either `tf:set-image-tag` (CI, single tag for
# all plugins) or `build-and-push-images.sh` (local, content-hash tag per
# plugin). Read here, decoded, and passed to the customer module at
# packages/terraform/ via the `deployed_image_uris` variable.
#
# This file is the ONLY place that reads SSM / ECR data sources. The
# customer module is decoupled — it accepts a plain `map(string)` and never
# performs lookups itself. Customers consuming packages/terraform/ directly
# wire the same map however they like (hardcode, separate stack output,
# their own SSM convention) without inheriting this package's bootstrap
# layout.

data "aws_ssm_parameter" "deployed_image_manifest" {
  name = "/genai-etk/${var.ssm_image_tag_env}/deployed-image-manifest"
}

locals {
  deployed_image_uris = jsondecode(data.aws_ssm_parameter.deployed_image_manifest.value)
}

# =============================================================================
# ETK module — sourced from the customer package
# =============================================================================
module "etk" {
  source = "../terraform"

  aws_account_id = local.aws_account_id
  aws_region     = local.aws_region
  project_name   = var.project_name
  environment    = var.environment
  tags           = var.tags

  # Encryption + networking inputs (passthrough)
  encryption_key_arn              = var.encryption_key_arn
  vpc_cidr                        = var.vpc_cidr
  use_existing_vpc                = var.use_existing_vpc
  existing_vpc_id                 = var.existing_vpc_id
  existing_private_subnet_ids     = var.existing_private_subnet_ids
  existing_public_subnet_ids      = var.existing_public_subnet_ids
  existing_isolated_subnet_ids    = var.existing_isolated_subnet_ids
  existing_api_gw_vpc_endpoint_id = var.existing_api_gw_vpc_endpoint_id
  existing_security_group_ids     = var.existing_security_group_ids

  # API Gateway public endpoint type (EDGE default / REGIONAL / DISABLED).
  public_endpoint_type = var.public_endpoint_type

  # Optional AI Gateway config for the builtin evaluator (null disables)
  gateway_config = var.gateway_config

  # Logging + observability
  log_level                = var.log_level
  log_retention_days       = var.log_retention_days
  enable_cloudwatch_alarms = var.enable_cloudwatch_alarms
  enable_xray              = var.enable_xray
  enable_observability     = var.enable_observability
  alarm_sns_topic_arn      = var.alarm_sns_topic_arn

  # Plugin sets + image URIs (the deployment-side glue).
  # evaluation_plugins / generation_plugins intentionally not forwarded — the
  # inner module's defaults are the canonical built-in registry. Override on
  # the inner module via tfvars if you need to customise.
  deployed_image_uris = local.deployed_image_uris
}
