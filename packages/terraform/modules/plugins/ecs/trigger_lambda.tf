# Trigger Lambda for ECS Plugin
# Receives EventBridge events and starts ECS tasks
# Matches CDK SecuredNodejsFunction from eventDrivenEcs.ts

# =============================================================================
# CloudWatch Log Group for Trigger Lambda
# =============================================================================

resource "aws_cloudwatch_log_group" "trigger_lambda" {
  name              = "/aws/lambda/${local.name_prefix}-trigger"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.encryption_key_arn

  tags = merge(
    local.common_tags,
    {
      Name = "${local.name_prefix}-trigger-lambda-logs"
    }
  )
}

# =============================================================================
# Trigger Lambda Function
# =============================================================================

resource "aws_lambda_function" "trigger" {
  function_name = "${local.name_prefix}-trigger"
  description   = "Lambda function to trigger ${var.plugin_name} ECS plugin"
  role          = aws_iam_role.trigger_lambda.arn
  handler       = var.trigger_lambda_handler
  runtime       = var.trigger_lambda_runtime
  timeout       = var.trigger_lambda_timeout
  memory_size   = var.trigger_lambda_memory
  architectures = ["arm64"] # Match CDK SecuredNodejsFunction ARM64 - faster cold starts

  filename         = var.trigger_lambda_filename
  source_code_hash = filebase64sha256(var.trigger_lambda_filename)

  # Environment variables matching CDK triggerLambda.ts requirements
  # PLUGIN_ECS_CLUSTER_NAME, PLUGIN_ECS_TASK_DEFINITION, etc.
  kms_key_arn = var.encryption_key_arn

  environment {
    variables = {
      PLUGIN_ECS_CLUSTER_NAME           = local.cluster_name
      PLUGIN_ECS_TASK_DEFINITION        = aws_ecs_task_definition.plugin.arn
      PLUGIN_ECS_TASK_CONTAINER_NAME    = var.container_name
      PLUGIN_ECS_TASK_SECURITY_GROUP_ID = aws_security_group.ecs_plugin.id
      PLUGIN_ECS_SUBNET_IDS             = local.subnet_ids_string
      LOG_LEVEL                         = var.log_level
    }
  }

  # VPC configuration (optional but recommended for plugins)
  dynamic "vpc_config" {
    for_each = var.trigger_lambda_vpc_config && var.lambda_security_group_id != null ? [1] : []
    content {
      subnet_ids         = var.subnet_ids
      security_group_ids = [var.lambda_security_group_id]
    }
  }

  # Lambda layers (Powertools, shared dependencies, etc.)
  layers = var.lambda_layers

  tracing_config {
    mode = var.enable_xray ? "Active" : "PassThrough"
  }

  tags = merge(
    local.common_tags,
    {
      Name = "${local.name_prefix}-trigger"
    }
  )

  depends_on = [
    aws_cloudwatch_log_group.trigger_lambda,
    aws_iam_role_policy.trigger_lambda_ecs,
    aws_iam_role_policy.trigger_lambda_logs,
    aws_iam_role_policy.trigger_lambda_pass_role
  ]
}
