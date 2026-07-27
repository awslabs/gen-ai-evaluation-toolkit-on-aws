# EventBridge Rules for Evaluation Module (SDKV2)
# Routes EvaluatorTaskDispatched events from the orchestration SFN to the
# appropriate handler Lambdas based on jobType or event source.

# =============================================================================
# Rule 1: POST_PROCESS tasks → Post-Processing Lambda
# =============================================================================

resource "aws_cloudwatch_event_rule" "task_to_post_process" {
  name           = "${var.project_name}-${var.environment}-task-to-post-process"
  description    = "Routes post-processing tasks from SFN to post-processing Lambda"
  event_bus_name = local.event_bus_name

  event_pattern = jsonencode({
    source      = ["GenAiEvaluationToolkit"]
    detail-type = ["EvaluatorTaskDispatched"]
    detail      = { jobType = ["POST_PROCESS"] }
  })

  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-task-to-post-process"
  })
}

resource "aws_cloudwatch_event_target" "task_to_post_process" {
  rule           = aws_cloudwatch_event_rule.task_to_post_process.name
  target_id      = "PostProcessingLambda"
  arn            = aws_lambda_function.evaluator_post_processing.arn
  event_bus_name = local.event_bus_name
}

resource "aws_lambda_permission" "post_processing_from_eventbridge" {
  statement_id  = "AllowEventBridgeInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.evaluator_post_processing.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.task_to_post_process.arn
}

# =============================================================================
# Rule 2: COPY_RESULTS tasks → Internal Handler Lambda
# =============================================================================

resource "aws_cloudwatch_event_rule" "task_to_copy_results" {
  name           = "${var.project_name}-${var.environment}-task-to-copy-results"
  description    = "Routes copy-results tasks from SFN to internal handler"
  event_bus_name = local.event_bus_name

  event_pattern = jsonencode({
    source      = ["GenAiEvaluationToolkit"]
    detail-type = ["EvaluatorTaskDispatched"]
    detail      = { jobType = ["COPY_RESULTS"] }
  })

  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-task-to-copy-results"
  })
}

resource "aws_cloudwatch_event_target" "task_to_copy_results" {
  rule           = aws_cloudwatch_event_rule.task_to_copy_results.name
  target_id      = "InternalHandlerLambda"
  arn            = aws_lambda_function.evaluator_internal_handler.arn
  event_bus_name = local.event_bus_name
}

resource "aws_lambda_permission" "internal_handler_from_copy_results" {
  statement_id  = "AllowEventBridgeCopyResults"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.evaluator_internal_handler.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.task_to_copy_results.arn
}

# =============================================================================
# Rule 3: Task timeout → Internal Handler Lambda
# =============================================================================

resource "aws_cloudwatch_event_rule" "task_timeout" {
  name           = "${var.project_name}-${var.environment}-task-timeout"
  description    = "Routes task timeout events to internal handler"
  event_bus_name = local.event_bus_name

  event_pattern = jsonencode({
    source      = ["GenAiEvaluationToolkit"]
    detail-type = ["EvaluatorTaskTimedOut"]
  })

  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-task-timeout"
  })
}

resource "aws_cloudwatch_event_target" "task_timeout" {
  rule           = aws_cloudwatch_event_rule.task_timeout.name
  target_id      = "InternalHandlerLambda"
  arn            = aws_lambda_function.evaluator_internal_handler.arn
  event_bus_name = local.event_bus_name
}

resource "aws_lambda_permission" "internal_handler_from_timeout" {
  statement_id  = "AllowEventBridgeTimeout"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.evaluator_internal_handler.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.task_timeout.arn
}

# =============================================================================
# Rule 4: Lambda invocation failure → Internal Handler Lambda
# =============================================================================

resource "aws_cloudwatch_event_rule" "lambda_failure" {
  name           = "${var.project_name}-${var.environment}-lambda-failure"
  description    = "Routes Lambda crash/OOM events to internal handler for SFN recovery"
  event_bus_name = local.event_bus_name

  event_pattern = jsonencode({
    source      = ["lambda"]
    detail-type = ["Lambda Function Invocation Result - Failure"]
  })

  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-lambda-failure"
  })
}

resource "aws_cloudwatch_event_target" "lambda_failure" {
  rule           = aws_cloudwatch_event_rule.lambda_failure.name
  target_id      = "InternalHandlerLambda"
  arn            = aws_lambda_function.evaluator_internal_handler.arn
  event_bus_name = local.event_bus_name
}

resource "aws_lambda_permission" "internal_handler_from_lambda_failure" {
  statement_id  = "AllowEventBridgeLambdaFailure"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.evaluator_internal_handler.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.lambda_failure.arn
}

# =============================================================================
# Lambda async invoke configuration (on-failure destination → EventBridge)
# =============================================================================

resource "aws_lambda_function_event_invoke_config" "post_processing" {
  function_name          = aws_lambda_function.evaluator_post_processing.function_name
  maximum_retry_attempts = 1

  destination_config {
    on_failure {
      destination = var.event_bus_arn
    }
  }
}

resource "aws_lambda_function_event_invoke_config" "internal_handler" {
  function_name          = aws_lambda_function.evaluator_internal_handler.function_name
  maximum_retry_attempts = 1

  destination_config {
    on_failure {
      destination = var.event_bus_arn
    }
  }
}

# =============================================================================
# Rule 5: Builtin evaluator task dispatch → BuiltinEvaluatorLambda
# =============================================================================

resource "aws_cloudwatch_event_rule" "builtin_evaluator_task" {
  count = var.evaluator_builtin_image_uri != null ? 1 : 0

  name           = "${var.project_name}-${var.environment}-builtin-evaluator-task"
  description    = "Routes evaluation tasks for the builtin evaluator"
  event_bus_name = local.event_bus_name

  event_pattern = jsonencode({
    source      = ["GenAiEvaluationToolkit"]
    detail-type = ["EvaluatorTaskDispatched"]
    detail      = { evaluatorName = ["builtin"] }
  })

  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-builtin-evaluator-task"
  })
}

resource "aws_cloudwatch_event_target" "builtin_evaluator_task" {
  count = var.evaluator_builtin_image_uri != null ? 1 : 0

  rule           = aws_cloudwatch_event_rule.builtin_evaluator_task[0].name
  target_id      = "BuiltinEvaluatorLambda"
  arn            = aws_lambda_function.evaluator_builtin[0].arn
  event_bus_name = local.event_bus_name
}

resource "aws_lambda_permission" "builtin_evaluator_from_eventbridge" {
  count = var.evaluator_builtin_image_uri != null ? 1 : 0

  statement_id  = "AllowEventBridgeInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.evaluator_builtin[0].function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.builtin_evaluator_task[0].arn
}

resource "aws_lambda_function_event_invoke_config" "builtin_evaluator" {
  count = var.evaluator_builtin_image_uri != null ? 1 : 0

  function_name          = aws_lambda_function.evaluator_builtin[0].function_name
  maximum_retry_attempts = 1

  destination_config {
    on_failure {
      destination = var.event_bus_arn
    }
  }
}
