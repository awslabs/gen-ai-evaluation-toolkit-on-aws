# EventBridge Configuration for Lambda Plugin
# Creates EventBridge rule and target to trigger the plugin Lambda

locals {
  event_bus_name = element(split("/", var.event_bus_arn), 1)
}

# =============================================================================
# EventBridge Rule
# =============================================================================

# Rule to route plugin trigger events to this Lambda
resource "aws_cloudwatch_event_rule" "plugin_trigger" {
  name           = "${local.name_prefix}-trigger"
  description    = "Trigger ${var.plugin_name} plugin on ${var.trigger_event_type} events"
  event_bus_name = local.event_bus_name

  # Event pattern matches:
  # - source: GenAiEvaluationToolkit
  # - detail-type: trigger_event_type (e.g., genAiEtkEvaluationMetricTriggerEvent)
  # - detail.plugin: [plugin_name]
  event_pattern = jsonencode({
    source      = ["GenAiEvaluationToolkit"]
    detail-type = [var.trigger_event_type]
    detail = {
      plugin = [var.plugin_name]
    }
  })

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-trigger-rule"
  })
}

# =============================================================================
# EventBridge Target
# =============================================================================

# Target to invoke the plugin Lambda function
resource "aws_cloudwatch_event_target" "plugin_lambda" {
  rule           = aws_cloudwatch_event_rule.plugin_trigger.name
  target_id      = "${var.plugin_name}-lambda"
  arn            = aws_lambda_function.plugin.arn
  event_bus_name = local.event_bus_name
}

# =============================================================================
# Lambda Permission for EventBridge
# =============================================================================

# CRITICAL: Lambda permission must use the EVENT RULE ARN as source_arn,
# NOT the event bus ARN. This is a common mistake that causes permission errors.
resource "aws_lambda_permission" "eventbridge_invoke" {
  statement_id  = "AllowEventBridgeInvoke-${var.plugin_name}"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.plugin.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.plugin_trigger.arn
}
