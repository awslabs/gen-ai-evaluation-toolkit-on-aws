# Lambda Functions for Evaluation Module (SDKV2)
#
# Architecture:
# - 1 Python Lambda (EvaluatorApiLambda) handles ALL 15 /v2/ routes via internal routing
# - 3 Python Lambdas for async task processing (post-processing, internal-handler, scheduler-trigger)
# - 5 TypeScript Lambdas for scheduler CRUD (one per operation, v1 pattern)
# - 1 TypeScript Lambda for EventBridge Scheduler trigger (jobTriggeredHandler)

# =============================================================================
# SDKV2 Python Lambdas — evaluator core
# =============================================================================

resource "aws_cloudwatch_log_group" "evaluator_api" {
  name              = "/aws/lambda/${var.project_name}-${var.environment}-evaluator-api"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.encryption_key_arn

  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-evaluator-api-logs"
  })

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_lambda_function" "evaluator_api" {
  function_name = "${var.project_name}-${var.environment}-evaluator-api"
  role          = aws_iam_role.evaluator_api.arn
  handler       = "evaluator_api.handler.handler"
  runtime       = "python3.12"
  timeout       = 28
  memory_size   = 512

  s3_bucket        = var.lambda_code_bucket
  s3_key           = var.python_api_s3_key
  source_code_hash = var.python_api_source_hash

  vpc_config {
    subnet_ids         = var.subnet_ids
    security_group_ids = [var.lambda_security_group_id]
  }

  tracing_config {
    mode = var.enable_xray ? "Active" : "PassThrough"
  }

  kms_key_arn = var.encryption_key_arn

  environment {
    variables = merge(local.evaluator_shared_env, {
      POWERTOOLS_SERVICE_NAME = "evaluator-api"
      LOG_LEVEL               = var.log_level
    })
  }

  depends_on = [aws_cloudwatch_log_group.evaluator_api]

  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-evaluator-api"
  })
}

resource "aws_cloudwatch_log_group" "evaluator_post_processing" {
  name              = "/aws/lambda/${var.project_name}-${var.environment}-evaluator-post-processing"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.encryption_key_arn

  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-evaluator-post-processing-logs"
  })

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_lambda_function" "evaluator_post_processing" {
  function_name = "${var.project_name}-${var.environment}-evaluator-post-processing"
  role          = aws_iam_role.evaluator_post_processing.arn
  handler       = "evaluator_api.post_processing_handler.handler"
  runtime       = "python3.12"
  timeout       = 900
  memory_size   = 1024

  s3_bucket        = var.lambda_code_bucket
  s3_key           = var.python_api_s3_key
  source_code_hash = var.python_api_source_hash

  vpc_config {
    subnet_ids         = var.subnet_ids
    security_group_ids = [var.lambda_security_group_id]
  }

  tracing_config {
    mode = var.enable_xray ? "Active" : "PassThrough"
  }

  kms_key_arn = var.encryption_key_arn

  environment {
    variables = merge(local.evaluator_shared_env, {
      POWERTOOLS_SERVICE_NAME = "evaluator-post-processing"
      LOG_LEVEL               = var.log_level
    })
  }

  depends_on = [aws_cloudwatch_log_group.evaluator_post_processing]

  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-evaluator-post-processing"
  })
}

resource "aws_cloudwatch_log_group" "evaluator_internal_handler" {
  name              = "/aws/lambda/${var.project_name}-${var.environment}-evaluator-internal-handler"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.encryption_key_arn

  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-evaluator-internal-handler-logs"
  })

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_lambda_function" "evaluator_internal_handler" {
  function_name = "${var.project_name}-${var.environment}-evaluator-internal-handler"
  role          = aws_iam_role.evaluator_internal_handler.arn
  handler       = "evaluator_api.internal_handlers.handler"
  runtime       = "python3.12"
  timeout       = 900
  memory_size   = 512

  s3_bucket        = var.lambda_code_bucket
  s3_key           = var.python_api_s3_key
  source_code_hash = var.python_api_source_hash

  vpc_config {
    subnet_ids         = var.subnet_ids
    security_group_ids = [var.lambda_security_group_id]
  }

  tracing_config {
    mode = var.enable_xray ? "Active" : "PassThrough"
  }

  kms_key_arn = var.encryption_key_arn

  environment {
    variables = merge(local.evaluator_shared_env, {
      POWERTOOLS_SERVICE_NAME = "evaluator-internal-handler"
      LOG_LEVEL               = var.log_level
    })
  }

  depends_on = [aws_cloudwatch_log_group.evaluator_internal_handler]

  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-evaluator-internal-handler"
  })
}

resource "aws_cloudwatch_log_group" "evaluator_scheduler_trigger" {
  name              = "/aws/lambda/${var.project_name}-${var.environment}-evaluator-scheduler-trigger"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.encryption_key_arn

  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-evaluator-scheduler-trigger-logs"
  })

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_lambda_function" "evaluator_scheduler_trigger" {
  function_name = "${var.project_name}-${var.environment}-evaluator-scheduler-trigger"
  role          = aws_iam_role.evaluator_scheduler_trigger.arn
  handler       = "evaluator_api.scheduler_handler.handler"
  runtime       = "python3.12"
  timeout       = 60
  memory_size   = 256

  s3_bucket        = var.lambda_code_bucket
  s3_key           = var.python_api_s3_key
  source_code_hash = var.python_api_source_hash

  vpc_config {
    subnet_ids         = var.subnet_ids
    security_group_ids = [var.lambda_security_group_id]
  }

  tracing_config {
    mode = var.enable_xray ? "Active" : "PassThrough"
  }

  kms_key_arn = var.encryption_key_arn

  environment {
    variables = merge(local.evaluator_shared_env, {
      POWERTOOLS_SERVICE_NAME = "evaluator-scheduler"
      LOG_LEVEL               = var.log_level
    })
  }

  depends_on = [aws_cloudwatch_log_group.evaluator_scheduler_trigger]

  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-evaluator-scheduler-trigger"
  })
}

# =============================================================================
# Scheduler CRUD TypeScript Lambdas (v1 pattern — one per operation)
# =============================================================================

locals {
  scheduler_handlers = {
    createJobScheduler = {
      handler = "index.createJobSchedulerLambda.lambdaHandler"
    }
    listJobSchedulers = {
      handler = "index.listJobSchedulersLambda.lambdaHandler"
    }
    getJobScheduler = {
      handler = "index.getJobSchedulerLambda.lambdaHandler"
    }
    updateJobScheduler = {
      handler = "index.updateJobSchedulerLambda.lambdaHandler"
    }
    deleteJobScheduler = {
      handler = "index.deleteJobSchedulerLambda.lambdaHandler"
    }
    createConfiguration = {
      handler = "index.createConfigurationLambda.lambdaHandler"
    }
    listConfigurations = {
      handler = "index.listConfigurationsLambda.lambdaHandler"
    }
    getConfiguration = {
      handler = "index.getConfigurationLambda.lambdaHandler"
    }
    updateConfiguration = {
      handler = "index.updateConfigurationLambda.lambdaHandler"
    }
  }
}

resource "aws_cloudwatch_log_group" "scheduler_handlers" {
  for_each = local.scheduler_handlers

  name              = "/aws/lambda/${var.project_name}-${var.environment}-evaluation-${each.key}"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.encryption_key_arn

  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-evaluation-${each.key}-logs"
  })

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_lambda_function" "scheduler_handlers" {
  for_each = local.scheduler_handlers

  function_name = "${var.project_name}-${var.environment}-evaluation-${each.key}"
  role          = aws_iam_role.scheduler_handlers.arn
  handler       = each.value.handler
  runtime       = "nodejs22.x"
  timeout       = 29
  memory_size   = 512

  filename         = "${path.module}/../../assets/lambda/nodejs-handlers.zip"
  source_code_hash = filebase64sha256("${path.module}/../../assets/lambda/nodejs-handlers.zip")

  vpc_config {
    subnet_ids         = var.subnet_ids
    security_group_ids = [var.lambda_security_group_id]
  }

  tracing_config {
    mode = var.enable_xray ? "Active" : "PassThrough"
  }

  kms_key_arn = var.encryption_key_arn

  environment {
    variables = merge(
      {
        LOG_LEVEL      = var.log_level
        ACCOUNT_ID     = var.aws_account_id
        REGION         = var.region
        S3_BUCKET_NAME = var.config_bucket_name
      },
      contains(["createJobScheduler", "updateJobScheduler"], each.key) ? {
        TARGET_LAMBDA_ARN  = aws_lambda_function.evaluator_scheduler_trigger.arn
        SCHEDULER_ROLE_ARN = var.scheduler_execution_role_arn
      } : {}
    )
  }

  depends_on = [aws_cloudwatch_log_group.scheduler_handlers]

  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-evaluation-${each.key}"
  })
}

# =============================================================================
# Lambda Permissions
# =============================================================================

resource "aws_lambda_permission" "evaluator_scheduler_trigger_from_scheduler" {
  # checkov:skip=CKV_AWS_364: SourceArn cannot be bound at deploy time — schedules are created dynamically at runtime by the createJobScheduler API and live under the evaluation_jobs schedule group, whose name is not known here. Defense-in-depth lives on the scheduler execution role (aws_iam_role_policy.scheduler_invoke_lambda) which scopes lambda:InvokeFunction to this exact function ARN. Parity with CDK's JobSchedulerIntegration.ts:48 which uses the same pattern; cross-cutting hardening (source_arn = ".../<group>/*") tracked as a follow-up across both deployment paths.
  statement_id  = "AllowEventBridgeSchedulerInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.evaluator_scheduler_trigger.function_name
  principal     = "scheduler.amazonaws.com"
}

# EventBridge Scheduler execution role needs to invoke the scheduler-trigger Lambda
resource "aws_iam_role_policy" "scheduler_invoke_lambda" {
  name = "${var.project_name}-${var.environment}-scheduler-invoke-lambda"
  role = split("/", var.scheduler_execution_role_arn)[1]

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["lambda:InvokeFunction"]
      Resource = aws_lambda_function.evaluator_scheduler_trigger.arn
    }]
  })
}

# =============================================================================
# Builtin Evaluator Lambda (Docker image — consolidated LLM-as-Judge + RAGAS + AgentCore)
# =============================================================================

resource "aws_cloudwatch_log_group" "evaluator_builtin" {
  count = var.evaluator_builtin_image_uri != null ? 1 : 0

  name              = "/aws/lambda/${var.project_name}-${var.environment}-evaluator-builtin"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.encryption_key_arn

  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-evaluator-builtin-logs"
  })

  lifecycle {
    create_before_destroy = true
  }
}

# SSM parameter exposing the builtin evaluator's log group name.
# Literal path /genai-etk/evaluatorLogGroupName matches CDK
# (external-plugins.ts: StringParameter 'EvaluatorLogGroupName'); the
# evaluator-sdk e2e test (test_orchestration_e2e.py) reads it to locate logs.
resource "aws_ssm_parameter" "evaluator_log_group_name" {
  count = var.evaluator_builtin_image_uri != null ? 1 : 0

  name        = "/genai-etk/evaluatorLogGroupName"
  type        = "String"
  value       = aws_cloudwatch_log_group.evaluator_builtin[0].name
  description = "Log group name for the GenAI ETK builtin evaluator Lambda"

  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-evaluator-log-group-name"
  })
}

resource "aws_lambda_function" "evaluator_builtin" {
  count = var.evaluator_builtin_image_uri != null ? 1 : 0

  function_name = "${var.project_name}-${var.environment}-evaluator-builtin"
  role          = aws_iam_role.evaluator_builtin[0].arn
  package_type  = "Image"
  image_uri     = var.evaluator_builtin_image_uri
  timeout       = 900
  memory_size   = 2048

  vpc_config {
    subnet_ids         = var.subnet_ids
    security_group_ids = [var.lambda_security_group_id]
  }

  tracing_config {
    mode = var.enable_xray ? "Active" : "PassThrough"
  }

  kms_key_arn = var.encryption_key_arn

  environment {
    variables = merge({
      EVALUATOR_NAME          = "builtin"
      ETK_API_ENDPOINT        = "https://${local.private_rest_api_id}.execute-api.${var.region}.amazonaws.com/${var.environment}"
      BEDROCK_MODEL_ID        = "global.anthropic.claude-sonnet-4-6"
      POWERTOOLS_SERVICE_NAME = "evaluator-builtin"
      LOG_LEVEL               = var.log_level
    }, local.builtin_gateway_env)
  }

  depends_on = [aws_cloudwatch_log_group.evaluator_builtin]

  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-evaluator-builtin"
  })
}
