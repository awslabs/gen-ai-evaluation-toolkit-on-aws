# EventBridge Rule and Target for ECS Plugin
# Routes events to trigger Lambda based on plugin name and event type
# Matches CDK events.Rule from eventDrivenEcs.ts

locals {
  event_bus_name = element(split("/", var.event_bus_arn), 1)
}

# =============================================================================
# EventBridge Rule
# Matches events by source, detail-type, and plugin name
# =============================================================================

resource "aws_cloudwatch_event_rule" "plugin_trigger" {
  name           = "${local.name_prefix}-trigger"
  description    = "Rule to invoke ECS task for plugin: ${var.plugin_name}"
  event_bus_name = local.event_bus_name

  # Event pattern matching CDK implementation
  # source: ServiceName (GenAiEvaluationToolkit)
  # detail-type: trigger event type (e.g., genAiEtkEvaluationMetricTriggerEvent)
  # detail.plugin: plugin name
  event_pattern = jsonencode({
    source      = [var.event_source]
    detail-type = [var.trigger_event_type]
    detail = {
      plugin = [var.plugin_name]
    }
  })

  tags = merge(
    local.common_tags,
    {
      Name = "${local.name_prefix}-trigger-rule"
    }
  )
}

# =============================================================================
# Dead Letter Queue (Optional)
# For failed event deliveries
# =============================================================================

resource "aws_sqs_queue" "dlq" {
  count = var.enable_dlq && var.dlq_arn == null ? 1 : 0

  name                       = "${local.name_prefix}-dlq"
  visibility_timeout_seconds = 300
  kms_master_key_id          = var.encryption_key_arn != null ? var.encryption_key_arn : null
  # message_retention_seconds not set — defaults to 4 days (SQS default),
  # consistent with CDK's reliance on the default.

  tags = merge(
    local.common_tags,
    {
      Name = "${local.name_prefix}-dlq"
    }
  )
}

# DLQ Policy to allow EventBridge to send messages
resource "aws_sqs_queue_policy" "dlq" {
  count = var.enable_dlq && var.dlq_arn == null ? 1 : 0

  queue_url = aws_sqs_queue.dlq[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowEventBridgeSendMessage"
        Effect = "Allow"
        Principal = {
          Service = "events.amazonaws.com"
        }
        Action   = "sqs:SendMessage"
        Resource = aws_sqs_queue.dlq[0].arn
        Condition = {
          ArnEquals = {
            "aws:SourceArn" = aws_cloudwatch_event_rule.plugin_trigger.arn
          }
        }
      }
    ]
  })
}

# =============================================================================
# EventBridge Target
# Send events to trigger Lambda with transformed input
# =============================================================================

resource "aws_cloudwatch_event_target" "trigger_lambda" {
  rule           = aws_cloudwatch_event_rule.plugin_trigger.name
  target_id      = "${var.plugin_name}-TriggerLambda"
  arn            = aws_lambda_function.trigger.arn
  event_bus_name = local.event_bus_name

  # Transform input to pass only detail field to Lambda
  # This matches CDK: RuleTargetInput.fromObject({ detail: EventField.fromPath('$.detail') })
  input_transformer {
    input_paths = {
      detail = "$.detail"
    }
    input_template = <<-EOF
      {
        "detail": <detail>
      }
    EOF
  }

  # Dead letter queue configuration
  dynamic "dead_letter_config" {
    for_each = var.enable_dlq ? [1] : []
    content {
      arn = var.dlq_arn != null ? var.dlq_arn : aws_sqs_queue.dlq[0].arn
    }
  }
}

# =============================================================================
# Lambda Permission for EventBridge
# IMPORTANT: Use rule ARN as source_arn, not event bus ARN
# =============================================================================

resource "aws_lambda_permission" "eventbridge_invoke" {
  statement_id  = "AllowEventBridge-${var.plugin_name}"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.trigger.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.plugin_trigger.arn
}
