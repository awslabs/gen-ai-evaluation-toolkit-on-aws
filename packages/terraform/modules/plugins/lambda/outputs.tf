# Outputs for Lambda Plugin Module

# =============================================================================
# Lambda Function Outputs
# =============================================================================

output "function_arn" {
  description = "ARN of the Lambda plugin function"
  value       = aws_lambda_function.plugin.arn
}

output "function_name" {
  description = "Name of the Lambda plugin function"
  value       = aws_lambda_function.plugin.function_name
}

output "invoke_arn" {
  description = "Invoke ARN of the Lambda plugin function (for API Gateway integration)"
  value       = aws_lambda_function.plugin.invoke_arn
}

# =============================================================================
# CloudWatch Log Group Outputs
# =============================================================================

output "log_group_name" {
  description = "Name of the CloudWatch Log Group"
  value       = aws_cloudwatch_log_group.plugin.name
}

output "log_group_arn" {
  description = "ARN of the CloudWatch Log Group"
  value       = aws_cloudwatch_log_group.plugin.arn
}

# =============================================================================
# EventBridge Outputs
# =============================================================================

output "event_rule_arn" {
  description = "ARN of the EventBridge rule that triggers this plugin"
  value       = aws_cloudwatch_event_rule.plugin_trigger.arn
}

output "event_rule_name" {
  description = "Name of the EventBridge rule that triggers this plugin"
  value       = aws_cloudwatch_event_rule.plugin_trigger.name
}
