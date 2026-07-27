# ETK Terraform Root Module
# This module composes all infrastructure modules

terraform {
  required_version = ">= 1.9.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    null = {
      source  = "hashicorp/null"
      version = "~> 3.0"
    }
    local = {
      source  = "hashicorp/local"
      version = "~> 2.0"
    }
  }
}

# AWS Provider Configuration
# When var.aws_region is empty the provider picks up AWS_REGION from env
# or the active AWS profile. Explicit var wins when provided.
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

# Auto-derive account / region from caller credentials when the vars are
# left empty — so `AWS_PROFILE=<admin> nx run terraform-deployment:plan` works
# without touching tfvars.
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# =============================================================================
# Log Retention (matches CDK SecuredLogGroup default)
# =============================================================================
locals {
  # Auto-derived when var is empty (the common case for customer deploys).
  aws_account_id = var.aws_account_id != "" ? var.aws_account_id : data.aws_caller_identity.current.account_id
  aws_region     = var.aws_region != "" ? var.aws_region : data.aws_region.current.name

  # CDK SecuredLogGroup uses RetentionDays.EIGHTEEN_MONTHS = 545 days
  log_retention_eighteen_months = 545

  # Default log retention - matches CDK SecuredLogGroup
  log_retention_days = coalesce(var.log_retention_days, local.log_retention_eighteen_months)

}

# Plugin image URIs are supplied by the caller via var.deployed_image_uris.
# Each entry is a `<deploy_key>` (matching modules/{evaluation,generation}/plugins.tf
# `_resolve_image` contract) → fully-qualified `<repo-url>:<tag>` image URI.
#
# Customers wire this map however they like (SSM lookup, hardcoded, output
# from another TF stack). The monorepo's deployment package
# (`packages/terraform-deployment/`) supplies it from a JSON SSM manifest
# parameter (`/genai-etk/<env>/deployed-image-manifest`) written by either
# CI's `tf:set-image-tag` job or the local `build-and-push-images.sh`.
locals {
  deployed_image_uris = var.deployed_image_uris
}

# Common Infrastructure Module
module "common" {
  source = "./modules/common"

  project_name = var.project_name
  environment  = var.environment
  region       = local.aws_region
  vpc_cidr     = var.vpc_cidr

  # existing VPC Configuration
  use_existing_vpc                = var.use_existing_vpc
  existing_vpc_id                 = var.existing_vpc_id
  existing_private_subnet_ids     = var.existing_private_subnet_ids
  existing_public_subnet_ids      = var.existing_public_subnet_ids
  existing_isolated_subnet_ids    = var.existing_isolated_subnet_ids
  existing_api_gw_vpc_endpoint_id = var.existing_api_gw_vpc_endpoint_id
  existing_security_group_ids     = var.existing_security_group_ids

  log_retention_days = local.log_retention_days

  # CMK Configuration
  encryption_key_arn = var.encryption_key_arn

  aws_account_id = local.aws_account_id

  # API Gateway public endpoint type (EDGE default / REGIONAL / DISABLED).
  public_endpoint_type = var.public_endpoint_type

  access_logs_retention_days = var.access_logs_retention_days

  tags = var.tags
}

# Datastore Module
module "datastore" {
  source = "./modules/datastore"

  project_name = var.project_name
  environment  = var.environment
  region       = local.aws_region

  # VPC Configuration from Common module
  vpc_id                   = module.common.vpc_id
  subnet_ids               = module.common.private_subnet_ids
  lambda_security_group_id = module.common.lambda_security_group_id

  # API Gateway Configuration from Common module
  api_targets = module.common.api_targets

  # Lambda Configuration
  log_level          = var.log_level
  log_retention_days = local.log_retention_days
  enable_xray        = var.enable_xray

  # CMK Configuration
  encryption_key_arn = var.encryption_key_arn

  # Monitoring
  enable_cloudwatch_alarms = var.enable_cloudwatch_alarms

  # S3 Access Logs
  access_logs_bucket_id = module.common.access_logs_bucket_id

  # Account ID (avoids data source dependency issues in child modules)
  aws_account_id = local.aws_account_id

  tags = var.tags

  depends_on = [module.common]
}

# Experiment Module (must be created before Evaluation to provide MLflow outputs)
module "experiment" {
  source = "./modules/experiment"

  project_name = var.project_name
  environment  = var.environment
  region       = local.aws_region

  # VPC Configuration from Common module
  subnet_ids               = module.common.private_subnet_ids
  lambda_security_group_id = module.common.lambda_security_group_id


  # API Gateway Configuration from Common module
  api_targets = module.common.api_targets

  # S3 Buckets
  experiment_artifacts_bucket_name = "${var.project_name}-${var.environment}-experiment-artifacts-${local.aws_account_id}-${local.aws_region}"
  experiment_mlflow_bucket_name    = "genai-${var.project_name}-experimentartifacts-${local.aws_account_id}-${local.aws_region}"

  # MLflow (will be created by this module)
  mlflow_tracking_server_arn = ""

  # EventBridge Configuration - use custom event bus from common module
  event_bus_arn = module.common.event_bus_arn

  # Lambda Configuration
  log_level          = var.log_level
  log_retention_days = local.log_retention_days
  enable_xray        = var.enable_xray

  # CMK Configuration
  encryption_key_arn = var.encryption_key_arn

  # S3 Access Logs
  access_logs_bucket_id = module.common.access_logs_bucket_id

  # S3 Lifecycle
  mlflow_artifacts_noncurrent_expiry_days = var.mlflow_artifacts_noncurrent_expiry_days

  aws_account_id = local.aws_account_id

  tags = var.tags

  depends_on = [module.common]
}

# Evaluation Module
module "evaluation" {
  source = "./modules/evaluation"

  project_name = var.project_name
  environment  = var.environment
  region       = local.aws_region

  # VPC Configuration from Common module
  vpc_id                   = module.common.vpc_id
  subnet_ids               = module.common.private_subnet_ids
  lambda_security_group_id = module.common.lambda_security_group_id

  # IAM Configuration from Common module
  scheduler_execution_role_arn = module.common.scheduler_execution_role_arn
  scheduler_group_name         = module.common.scheduler_group_name

  # API Gateway Configuration from Common module
  api_targets = module.common.api_targets

  # EventBridge Configuration
  event_bus_arn = module.common.event_bus_arn

  # S3 / MLflow Configuration
  mlflow_artifact_bucket_arn = module.experiment.mlflow_artifact_bucket_arn
  mlflow_server_arn          = module.experiment.mlflow_tracking_server_arn
  datastore_bucket_arn       = module.datastore.datastore_bucket_arn
  config_bucket_name         = module.experiment.mlflow_artifact_bucket_name

  # Datastore Configuration
  datastore_table_name = module.datastore.datastore_table_name

  # SDKV2 Python API Lambda package (via S3 — zip exceeds 50MB direct upload limit).
  # Bucket, content-addressed key, and source hash come from the experiment module,
  # which owns the shared lambda_code bucket and uploads python-api.zip. Referencing
  # the experiment outputs also orders the upload before the Lambdas' CreateFunction.
  lambda_code_bucket     = module.experiment.lambda_code_bucket_id
  python_api_s3_key      = module.experiment.python_api_s3_key
  python_api_source_hash = module.experiment.python_api_source_hash

  # Evaluator-builtin Docker image (consolidated scorer Lambda)
  evaluator_builtin_image_uri = lookup(local.deployed_image_uris, "evaluator-builtin", null)

  # Agent-as-Judge evaluator Docker image (isolated OpenCode-agent judge) +
  # isolated subnets it runs in (airgapped; see modules/common/isolated-networking.tf).
  evaluator_agent_as_judge_image_uri = lookup(local.deployed_image_uris, "evaluator-agent-as-judge", null)
  isolated_subnet_ids                = module.common.isolated_subnet_ids

  # Optional AI Gateway config for the builtin evaluator (LLM calls routed
  # through the gateway). Null disables — see var.gateway_config.
  gateway_config = var.gateway_config

  # Lambda Configuration
  log_level          = var.log_level
  log_retention_days = local.log_retention_days
  enable_xray        = var.enable_xray

  # CMK Configuration
  encryption_key_arn = var.encryption_key_arn

  # S3 Access Logs
  access_logs_bucket_id = module.common.access_logs_bucket_id

  aws_account_id = local.aws_account_id

  tags = var.tags

  depends_on = [module.common, module.datastore, module.experiment]
}

# Generation Module
module "generation" {
  source = "./modules/generation"

  project_name   = var.project_name
  environment    = var.environment
  region         = local.aws_region
  aws_account_id = local.aws_account_id

  # VPC Configuration from Common module
  vpc_id                   = module.common.vpc_id
  subnet_ids               = module.common.private_subnet_ids
  lambda_security_group_id = module.common.lambda_security_group_id


  # API Gateway Configuration from Common module
  api_targets = module.common.api_targets

  # EventBridge Configuration
  event_bus_arn = module.common.event_bus_arn

  # Lambda Configuration
  log_level          = var.log_level
  log_retention_days = local.log_retention_days
  enable_xray        = var.enable_xray

  # CMK Configuration
  encryption_key_arn = var.encryption_key_arn

  # Generation Plugins (ECS + Step Function)
  generation_plugins   = var.generation_plugins
  deployed_image_uris  = local.deployed_image_uris
  rest_api_invoke_url  = "https://${module.common.rest_api_id}.execute-api.${local.aws_region}.amazonaws.com/${var.environment}"
  datastore_bucket_arn = module.datastore.datastore_bucket_arn

  # S3 Access Logs
  access_logs_bucket_id = module.common.access_logs_bucket_id

  tags = var.tags

  depends_on = [module.common, module.datastore]
}

# API Gateway deployment + stage, one per API target (private + optional public).
# Created at the root AFTER all modules define their methods/integrations on both
# APIs. The deployment redeploys whenever any module's methods change.
resource "aws_api_gateway_deployment" "final" {
  for_each = module.common.api_targets

  rest_api_id = each.value.rest_api_id

  # Force redeployment when any module's integrations change (on either API —
  # the per-module triggers hash methods across all targets).
  triggers = {
    redeployment = sha1(jsonencode([
      module.datastore.api_gateway_deployment_trigger,
      module.evaluation.api_gateway_deployment_trigger,
      module.generation.api_gateway_deployment_trigger,
      module.experiment.api_gateway_deployment_trigger,
    ]))
  }

  lifecycle {
    create_before_destroy = true
  }

  depends_on = [
    module.datastore,
    module.evaluation,
    module.generation,
    module.experiment,
  ]
}

resource "aws_api_gateway_stage" "main" {
  for_each = module.common.api_targets

  deployment_id = aws_api_gateway_deployment.final[each.key].id
  rest_api_id   = each.value.rest_api_id
  stage_name    = var.environment

  xray_tracing_enabled = var.enable_xray

  access_log_settings {
    destination_arn = each.value.is_public ? module.common.apigw_access_log_group_arn_public : module.common.apigw_access_log_group_arn
    format          = "$context.identity.sourceIp $context.identity.caller $context.identity.user [$context.requestTime] \"$context.httpMethod $context.resourcePath $context.protocol\" $context.status $context.responseLength $context.requestId"
  }

  tags = merge(
    var.tags,
    {
      Name = "${var.project_name}-${var.environment}-api-stage-${each.key}"
    }
  )

  depends_on = [module.datastore, module.evaluation, module.generation, module.experiment]
}

# API Gateway Method Settings, one per API target.
resource "aws_api_gateway_method_settings" "main" {
  for_each = module.common.api_targets

  rest_api_id = each.value.rest_api_id
  stage_name  = aws_api_gateway_stage.main[each.key].stage_name
  method_path = "*/*"

  settings {
    metrics_enabled    = true
    logging_level      = "INFO"
    data_trace_enabled = var.enable_xray

    throttling_burst_limit = 5000
    throttling_rate_limit  = 10000
  }
}

# =============================================================================
# SSM Parameters
# =============================================================================

# SSM Parameter for REST API Endpoint (required for tests + clients).
# Literal path /genai-etk/restApiEndpoint matches CDK (baseStack.ts) and is what
# the test helpers and evaluator e2e fixtures read. Value is the PUBLIC API stage
# URL when a public API exists; otherwise the private stage URL (private-only
# deployment).
resource "aws_ssm_parameter" "rest_api_endpoint" {
  name        = "/genai-etk/restApiEndpoint"
  type        = "String"
  value       = var.public_endpoint_type == "DISABLED" ? aws_api_gateway_stage.main["private"].invoke_url : aws_api_gateway_stage.main["public"].invoke_url
  description = "URL for GenAI ETK REST API endpoints"

  tags = {
    Name = "${var.project_name}-${var.environment}-rest-api-endpoint"
  }
}

# SSM Parameter for MLflow Artifact Bucket Name
resource "aws_ssm_parameter" "mlflow_bucket" {
  name        = "/genai-${var.project_name}/experimentMlFlowBucketName"
  type        = "String"
  value       = module.experiment.mlflow_artifact_bucket_name
  description = "The name of the GenAI ETK experiment MLFlow bucket"

  tags = {
    Name = "${var.project_name}-${var.environment}-mlflow-bucket-ssm"
  }
}

# SSM Parameter for Event Bus Name
resource "aws_ssm_parameter" "event_bus_name" {
  name        = "/genai-${var.project_name}/eventBusName"
  type        = "String"
  value       = element(split("/", module.common.event_bus_arn), 1)
  description = "Name of the EventBridge event bus for GenAI ETK"

  tags = {
    Name = "${var.project_name}-${var.environment}-event-bus-name-ssm"
  }
}

# SSM Parameter for Datastore Bucket Name
resource "aws_ssm_parameter" "datastore_bucket" {
  name        = "/genai-${var.project_name}/datastoreBucketName"
  type        = "String"
  value       = module.datastore.datastore_bucket_name
  description = "Name of the GenAI ETK datastore S3 bucket"

  tags = {
    Name = "${var.project_name}-${var.environment}-datastore-bucket-ssm"
  }
}

# SSM Parameter for Datastore DynamoDB Table Name.
# Integration tests (packages/tests-ts) resolve DATASTORE_TABLE_NAME from here
# so the test suite works against both TF and CDK deployments with no per-env
# table-name hardcoding in test code. CDK hardcodes the table to
# GenAiEtkDatastoreDdbTable; TF uses env-scoped "${project_name}-${environment}-datastore".
resource "aws_ssm_parameter" "datastore_table_name" {
  name        = "/genai-${var.project_name}/datastoreTableName"
  type        = "String"
  value       = module.datastore.datastore_table_name
  description = "Name of the GenAI ETK datastore DynamoDB table (TF-specific publish; CDK hardcodes the name)"

  tags = {
    Name = "${var.project_name}-${var.environment}-datastore-table-ssm"
  }
}

# SSM Parameter for Evaluation Bucket Name
resource "aws_ssm_parameter" "evaluation_bucket" {
  name        = "/genai-${var.project_name}/evaluationBucketName"
  type        = "String"
  value       = module.evaluation.evaluation_bucket_name
  description = "Name of the GenAI ETK evaluation S3 bucket"

  tags = {
    Name = "${var.project_name}-${var.environment}-evaluation-bucket-ssm"
  }
}

# =============================================================================
# Telemetry Module - CloudWatch Dashboard and Alarms
# Based on CDK GenAiEtkDashboard (monitoring-dashboard.ts)
# =============================================================================

module "telemetry" {
  source = "./modules/telemetry"

  count = var.enable_observability ? 1 : 0

  project_name = var.project_name
  environment  = var.environment
  region       = local.aws_region

  enable_observability = var.enable_observability
  alarm_sns_topic_arn  = var.alarm_sns_topic_arn

  # API Gateway Configuration (telemetry monitors the private API + its stage)
  rest_api_id    = module.common.rest_api_id
  rest_api_name  = module.common.rest_api_name
  api_stage_name = aws_api_gateway_stage.main["private"].stage_name

  # Resource maps — auto-populated from module outputs, no manual updates needed
  lambda_functions = merge(
    module.datastore.telemetry_lambda_functions,
    module.evaluation.telemetry_lambda_functions,
    module.generation.telemetry_lambda_functions,
    module.experiment.telemetry_lambda_functions,
  )

  dynamodb_tables = module.datastore.telemetry_dynamodb_tables

  state_machines = merge(
    module.evaluation.telemetry_state_machines,
    module.generation.telemetry_state_machines,
  )

  dlq_queues = module.datastore.telemetry_dlq_queues

  tags = var.tags

  depends_on = [
    module.common,
    module.datastore,
    module.evaluation,
    module.generation,
    module.experiment,
    aws_api_gateway_stage.main
  ]
}
