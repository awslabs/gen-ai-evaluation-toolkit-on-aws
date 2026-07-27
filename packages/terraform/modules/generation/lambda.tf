# Lambda Functions for Generation Module
# Converted from CDK generation Lambda handlers
# These functions handle:
# - startGeneration: Start generation workflow execution
# - getGeneration: Get generation workflow status
# - stopGeneration: Stop generation workflow execution
# - listGenerations: List generation workflow executions

locals {
  # API handler Lambda functions for generation operations
  api_handlers = {
    startGeneration = {
      handler = "index.startGenerationLambda.lambdaHandler"
    }
    listGenerations = {
      handler = "index.listGenerationsLambda.lambdaHandler"
    }
    getGeneration = {
      handler = "index.getGenerationLambda.lambdaHandler"
    }
    stopGeneration = {
      handler = "index.stopGenerationLambda.lambdaHandler"
    }
  }
}

# CloudWatch Log Group for Lambda Functions
resource "aws_cloudwatch_log_group" "generation_lambda" {
  name              = "/aws/lambda/${var.project_name}-${var.environment}-generation"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.encryption_key_arn

  tags = {
    Name = "${var.project_name}-${var.environment}-generation-lambda-logs"
  }

  lifecycle {
    create_before_destroy = true
  }
}

# Data source for current AWS account

# API Handler Lambda Functions
resource "aws_lambda_function" "api_handlers" {
  for_each = local.api_handlers

  function_name = "${var.project_name}-${var.environment}-generation-${each.key}"
  role          = aws_iam_role.api_handlers.arn
  handler       = each.value.handler
  runtime       = "nodejs22.x"
  timeout       = lookup(each.value, "timeout", var.default_lambda_timeout)
  memory_size   = lookup(each.value, "memory", var.default_lambda_memory_size)

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
    variables = {
      GENERATION_WORKFLOW_ARN = aws_sfn_state_machine.generation.arn
      LOG_LEVEL               = var.log_level
      ACCOUNT_ID              = var.aws_account_id
      REGION                  = var.region
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.generation_lambda
  ]

  tags = {
    Name = "${var.project_name}-${var.environment}-generation-${each.key}"
  }
}

# CloudWatch Log Groups for API Handlers
resource "aws_cloudwatch_log_group" "api_handlers" {
  for_each = local.api_handlers

  name              = "/aws/lambda/${aws_lambda_function.api_handlers[each.key].function_name}"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.encryption_key_arn

  tags = {
    Name = "${var.project_name}-${var.environment}-generation-${each.key}-logs"
  }

  lifecycle {
    create_before_destroy = true
  }
}

# IAM Policy for Lambda to invoke Step Functions
resource "aws_iam_role_policy" "lambda_invoke_sfn" {
  name = "${var.project_name}-${var.environment}-generation-lambda-invoke-sfn"
  role = aws_iam_role.api_handlers.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "states:StartExecution",
          "states:ListExecutions"
        ]
        Resource = aws_sfn_state_machine.generation.arn
      },
      {
        Effect = "Allow"
        Action = [
          "states:DescribeExecution",
          "states:StopExecution"
        ]
        Resource = "arn:aws:states:${var.region}:${var.aws_account_id}:execution:${aws_sfn_state_machine.generation.name}:*"
      }
    ]
  })
}

# =============================================================================
# Async/Await Handlers for Generation Workflow
# These implement the WAIT_FOR_TASK_TOKEN pattern:
# - asyncHandler: Sends plugin trigger event with task token embedded
# - awaitHandler: Receives plugin done event and calls SendTaskSuccess/Failure
# =============================================================================

# CloudWatch Log Groups for async/await handlers
resource "aws_cloudwatch_log_group" "gen_async_handler" {
  name              = "/aws/lambda/${var.project_name}-${var.environment}-generation-asyncHandler"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.encryption_key_arn

  tags = { Name = "${var.project_name}-${var.environment}-generation-asyncHandler-logs" }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_cloudwatch_log_group" "gen_await_handler" {
  name              = "/aws/lambda/${var.project_name}-${var.environment}-generation-awaitHandler"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.encryption_key_arn

  tags = { Name = "${var.project_name}-${var.environment}-generation-awaitHandler-logs" }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_lambda_function" "gen_async_handler" {
  function_name = "${var.project_name}-${var.environment}-generation-asyncHandler"
  role          = aws_iam_role.gen_async_handler.arn
  handler       = "index.asyncHandler.lambdaHandler"
  runtime       = "nodejs22.x"
  timeout       = 60
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
    variables = {
      LOG_LEVEL                             = var.log_level
      ASYNC_AWAIT_STEP_REQUEST_DETAIL_TYPE  = "genAiEtkGenerationPluginTriggerEvent"
      ASYNC_AWAIT_STEP_RESPONSE_DETAIL_TYPE = "genAiEtkGenerationPluginDoneEvent"
      ASYNC_AWAIT_STEP_SOURCE               = "GenAiEvaluationToolkit"
      ASYNC_AWAIT_STEP_EVENT_BUS            = var.event_bus_arn
    }
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-generation-asyncHandler"
  }

  depends_on = [aws_cloudwatch_log_group.gen_async_handler]
}

resource "aws_lambda_function" "gen_await_handler" {
  function_name = "${var.project_name}-${var.environment}-generation-awaitHandler"
  role          = aws_iam_role.gen_await_handler.arn
  handler       = "index.awaitHandler.lambdaHandler"
  runtime       = "nodejs22.x"
  timeout       = 60
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
    variables = {
      LOG_LEVEL                             = var.log_level
      ASYNC_AWAIT_STEP_REQUEST_DETAIL_TYPE  = "genAiEtkGenerationPluginTriggerEvent"
      ASYNC_AWAIT_STEP_RESPONSE_DETAIL_TYPE = "genAiEtkGenerationPluginDoneEvent"
      ASYNC_AWAIT_STEP_SOURCE               = "GenAiEvaluationToolkit"
      ASYNC_AWAIT_STEP_EVENT_BUS            = var.event_bus_arn
    }
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-generation-awaitHandler"
  }

  depends_on = [aws_cloudwatch_log_group.gen_await_handler]
}

# IAM: asyncHandler needs EventBridge PutEvents
resource "aws_iam_role_policy" "gen_async_handler_eventbridge" {
  name = "${var.project_name}-${var.environment}-gen-async-handler-eventbridge"
  role = aws_iam_role.gen_async_handler.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["events:PutEvents"]
        Resource = var.event_bus_arn
      }
    ]
  })
}

# IAM: awaitHandler needs SendTaskSuccess/Failure/Heartbeat on generation SFN
resource "aws_iam_role_policy" "gen_await_handler_sfn" {
  name = "${var.project_name}-${var.environment}-gen-await-handler-sfn"
  role = aws_iam_role.gen_await_handler.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "states:SendTaskSuccess",
          "states:SendTaskFailure",
          "states:SendTaskHeartbeat"
        ]
        Resource = aws_sfn_state_machine.generation.arn
      }
    ]
  })
}

# EventBridge Rule: genAiEtkGenerationPluginDoneEvent → awaitHandler
resource "aws_cloudwatch_event_rule" "generation_plugin_done" {
  name           = "${var.project_name}-${var.environment}-generation-plugin-done"
  event_bus_name = local.event_bus_name

  event_pattern = jsonencode({
    "detail-type" = ["genAiEtkGenerationPluginDoneEvent"]
  })

  tags = {
    Name = "${var.project_name}-${var.environment}-generation-plugin-done"
  }
}

resource "aws_cloudwatch_event_target" "generation_plugin_done_target" {
  rule           = aws_cloudwatch_event_rule.generation_plugin_done.name
  target_id      = "GenAwaitHandlerLambda"
  arn            = aws_lambda_function.gen_await_handler.arn
  event_bus_name = local.event_bus_name
}

resource "aws_lambda_permission" "gen_await_handler_eventbridge" {
  statement_id  = "AllowEventBridgeInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.gen_await_handler.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.generation_plugin_done.arn
}

# Lambda permission for Step Functions to invoke asyncHandler
resource "aws_lambda_permission" "gen_async_handler_sfn" {
  statement_id  = "AllowStepFunctionsInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.gen_async_handler.function_name
  principal     = "states.amazonaws.com"
  source_arn    = aws_sfn_state_machine.generation.arn
}
