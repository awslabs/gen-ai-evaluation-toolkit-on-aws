# Outputs for ECS Plugin Module

# =============================================================================
# ECS Task Definition Outputs
# =============================================================================

output "task_definition_arn" {
  description = "ARN of the ECS task definition"
  value       = aws_ecs_task_definition.plugin.arn
}

output "task_definition_family" {
  description = "Family name of the ECS task definition"
  value       = aws_ecs_task_definition.plugin.family
}

output "task_definition_revision" {
  description = "Revision number of the ECS task definition"
  value       = aws_ecs_task_definition.plugin.revision
}

# =============================================================================
# Security Group Outputs
# =============================================================================

output "security_group_id" {
  description = "ID of the ECS task security group"
  value       = aws_security_group.ecs_plugin.id
}

output "security_group_arn" {
  description = "ARN of the ECS task security group"
  value       = aws_security_group.ecs_plugin.arn
}

# =============================================================================
# Trigger Lambda Outputs
# =============================================================================

output "trigger_lambda_arn" {
  description = "ARN of the trigger Lambda function"
  value       = aws_lambda_function.trigger.arn
}

output "trigger_lambda_name" {
  description = "Name of the trigger Lambda function"
  value       = aws_lambda_function.trigger.function_name
}

output "trigger_lambda_role_arn" {
  description = "ARN of the trigger Lambda execution role"
  value       = aws_iam_role.trigger_lambda.arn
}

output "trigger_lambda_role_name" {
  description = "Name of the trigger Lambda execution role"
  value       = aws_iam_role.trigger_lambda.name
}

# =============================================================================
# EventBridge Outputs
# =============================================================================

output "eventbridge_rule_arn" {
  description = "ARN of the EventBridge rule"
  value       = aws_cloudwatch_event_rule.plugin_trigger.arn
}

output "eventbridge_rule_name" {
  description = "Name of the EventBridge rule"
  value       = aws_cloudwatch_event_rule.plugin_trigger.name
}

# =============================================================================
# CloudWatch Log Group Outputs
# =============================================================================

output "ecs_log_group_name" {
  description = "Name of the CloudWatch log group for ECS tasks"
  value       = aws_cloudwatch_log_group.ecs_plugin.name
}

output "ecs_log_group_arn" {
  description = "ARN of the CloudWatch log group for ECS tasks"
  value       = aws_cloudwatch_log_group.ecs_plugin.arn
}

output "trigger_lambda_log_group_name" {
  description = "Name of the CloudWatch log group for trigger Lambda"
  value       = aws_cloudwatch_log_group.trigger_lambda.name
}

output "trigger_lambda_log_group_arn" {
  description = "ARN of the CloudWatch log group for trigger Lambda"
  value       = aws_cloudwatch_log_group.trigger_lambda.arn
}

# =============================================================================
# Dead Letter Queue Outputs
# =============================================================================

output "dlq_arn" {
  description = "ARN of the dead letter queue (if created)"
  value       = var.enable_dlq && var.dlq_arn == null ? aws_sqs_queue.dlq[0].arn : var.dlq_arn
}

output "dlq_url" {
  description = "URL of the dead letter queue (if created)"
  value       = var.enable_dlq && var.dlq_arn == null ? aws_sqs_queue.dlq[0].url : null
}

# =============================================================================
# Convenience Outputs
# =============================================================================

output "plugin_name" {
  description = "Name of the plugin"
  value       = var.plugin_name
}

output "container_name" {
  description = "Name of the plugin container"
  value       = var.container_name
}

output "cluster_arn" {
  description = "ARN of the ECS cluster (pass-through)"
  value       = var.cluster_arn
}
