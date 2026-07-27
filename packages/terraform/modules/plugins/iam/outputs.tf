# Outputs for Plugin IAM Module

# =============================================================================
# Lambda Plugin Outputs
# =============================================================================

output "lambda_role_arn" {
  description = "ARN of the Lambda plugin execution role"
  value       = local.create_lambda_role ? aws_iam_role.lambda_plugin[0].arn : null
}

output "lambda_role_name" {
  description = "Name of the Lambda plugin execution role"
  value       = local.create_lambda_role ? aws_iam_role.lambda_plugin[0].name : null
}

output "lambda_role_id" {
  description = "ID of the Lambda plugin execution role"
  value       = local.create_lambda_role ? aws_iam_role.lambda_plugin[0].id : null
}

# =============================================================================
# ECS Plugin Outputs
# =============================================================================

output "ecs_task_role_arn" {
  description = "ARN of the ECS task role (application permissions)"
  value       = local.create_ecs_roles ? aws_iam_role.ecs_task[0].arn : null
}

output "ecs_task_role_name" {
  description = "Name of the ECS task role"
  value       = local.create_ecs_roles ? aws_iam_role.ecs_task[0].name : null
}

output "ecs_task_role_id" {
  description = "ID of the ECS task role"
  value       = local.create_ecs_roles ? aws_iam_role.ecs_task[0].id : null
}

output "ecs_execution_role_arn" {
  description = "ARN of the ECS task execution role (agent permissions)"
  value       = local.create_ecs_roles ? aws_iam_role.ecs_execution[0].arn : null
}

output "ecs_execution_role_name" {
  description = "Name of the ECS task execution role"
  value       = local.create_ecs_roles ? aws_iam_role.ecs_execution[0].name : null
}

output "ecs_execution_role_id" {
  description = "ID of the ECS task execution role"
  value       = local.create_ecs_roles ? aws_iam_role.ecs_execution[0].id : null
}

# =============================================================================
# Bedrock Batch Job Role Outputs
# =============================================================================

output "bedrock_batch_role_arn" {
  description = "ARN of the Bedrock batch job role (assumed by bedrock.amazonaws.com for batch inference). Null unless bedrock_mode is batch."
  value       = local.bedrock_batch_mode ? aws_iam_role.bedrock_batch_job[0].arn : null
}

# =============================================================================
# Convenience Outputs (for module consumers)
# =============================================================================

output "plugin_type" {
  description = "Type of plugin (lambda or ecs)"
  value       = var.plugin_type
}

output "plugin_name" {
  description = "Name of the plugin"
  value       = var.plugin_name
}
