# Lambda Plugin Module - Main Configuration
# Creates a Lambda function for ETK plugin execution

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
  name_prefix = "${var.project_name}-${var.environment}-plugin-${var.plugin_name}"

  # Common tags for all resources
  common_tags = merge(
    var.tags,
    {
      PluginName = var.plugin_name
      PluginType = "lambda"
      Module     = "plugins/lambda"
    }
  )

  # Default environment variables for all plugins
  default_environment_variables = {
    LOG_LEVEL     = var.log_level
    PLUGIN_NAME   = var.plugin_name
    EVENT_BUS_ARN = var.event_bus_arn
  }

  # Merged environment variables (user-provided can override defaults)
  environment_variables = merge(
    local.default_environment_variables,
    var.additional_environment_variables
  )
}

# =============================================================================
# CloudWatch Log Group
# =============================================================================

resource "aws_cloudwatch_log_group" "plugin" {
  name              = "/aws/lambda/${local.name_prefix}"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.encryption_key_arn

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-logs"
  })

  lifecycle {
    create_before_destroy = true
  }
}

# =============================================================================
# Lambda Function
# =============================================================================

resource "aws_lambda_function" "plugin" {
  function_name = local.name_prefix
  role          = var.role_arn
  timeout       = var.timeout
  memory_size   = var.memory_size
  package_type  = var.package_type
  architectures = [var.architecture]

  # ZIP package configuration (handler, runtime, filename)
  handler          = var.package_type == "Zip" ? var.handler : null
  runtime          = var.package_type == "Zip" ? var.runtime : null
  filename         = var.package_type == "Zip" ? var.filename : null
  source_code_hash = var.package_type == "Zip" && var.filename != null ? filebase64sha256(var.filename) : null

  # Docker image configuration
  image_uri = var.package_type == "Image" ? var.image_uri : null

  # VPC Configuration
  vpc_config {
    subnet_ids         = var.subnet_ids
    security_group_ids = var.security_group_ids
  }

  # Environment Variables
  kms_key_arn = var.encryption_key_arn

  environment {
    variables = local.environment_variables
  }

  # Lambda Layers (only for ZIP packages, filter out empty strings)
  layers = var.package_type == "Zip" ? compact(var.layers) : null

  # X-Ray Tracing Configuration
  tracing_config {
    mode = var.enable_xray ? "Active" : "PassThrough"
  }

  depends_on = [
    aws_cloudwatch_log_group.plugin
  ]

  tags = merge(local.common_tags, {
    Name = local.name_prefix
  })
}
