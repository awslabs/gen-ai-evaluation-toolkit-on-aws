# Root Module Outputs

# Common Module Outputs
output "vpc_id" {
  description = "VPC ID"
  value       = module.common.vpc_id
}

output "private_subnet_ids" {
  description = "Private subnet IDs"
  value       = module.common.private_subnet_ids
}

output "public_subnet_ids" {
  description = "Public subnet IDs"
  value       = module.common.public_subnet_ids
}

# Datastore Module Outputs
output "datastore_table_name" {
  description = "DynamoDB datastore table name"
  value       = module.datastore.datastore_table_name
}

output "datastore_table_arn" {
  description = "DynamoDB datastore table ARN"
  value       = module.datastore.datastore_table_arn
}

output "datastore_bucket_name" {
  description = "S3 datastore bucket name"
  value       = module.datastore.datastore_bucket_name
}

output "datastore_bucket_arn" {
  description = "S3 datastore bucket ARN"
  value       = module.datastore.datastore_bucket_arn
}

output "api_handler_function_names" {
  description = "Map of API handler Lambda function names"
  value       = module.datastore.api_handler_function_names
}

output "versioning_worker_function_name" {
  description = "Versioning worker Lambda function name"
  value       = module.datastore.versioning_worker_function_name
}

output "restore_worker_function_name" {
  description = "Restore worker Lambda function name"
  value       = module.datastore.restore_worker_function_name
}

output "versioning_queue_url" {
  description = "Versioning SQS queue URL"
  value       = module.datastore.versioning_queue_url
}

output "restore_queue_url" {
  description = "Restore SQS queue URL"
  value       = module.datastore.restore_queue_url
}

# Evaluation Module Outputs (SDKV2)
output "evaluator_orchestration_state_machine_arn" {
  description = "ARN of the SDKV2 evaluator orchestration state machine"
  value       = module.evaluation.orchestration_state_machine_arn
}

output "evaluator_table_name" {
  description = "Name of the evaluator DynamoDB table"
  value       = module.evaluation.evaluator_table_name
}

output "evaluator_api_lambda_arn" {
  description = "ARN of the EvaluatorApi Lambda (handles all /v2/ routes)"
  value       = module.evaluation.evaluator_api_lambda_arn
}

# Generation Module Outputs
output "generation_state_machine_arn" {
  description = "ARN of the generation workflow state machine"
  value       = module.generation.generation_state_machine_arn
}

output "generation_state_machine_name" {
  description = "Name of the generation workflow state machine"
  value       = module.generation.generation_state_machine_name
}

output "generation_bucket_name" {
  description = "Name of the generation S3 bucket"
  value       = module.generation.generation_bucket_name
}

output "generation_bucket_arn" {
  description = "ARN of the generation S3 bucket"
  value       = module.generation.generation_bucket_arn
}

output "generation_api_endpoint" {
  description = "Generation API endpoint"
  value       = module.generation.generation_api_endpoint
}

output "generation_lambda_arns" {
  description = "ARNs of generation Lambda functions"
  value       = module.generation.generation_lambda_arns
}

# API Gateway Outputs
# Public-facing invoke URL (what external clients use). Falls back to the private
# stage URL when the public API is disabled (private-only deployment).
output "api_gateway_invoke_url" {
  description = "Invoke URL of the public API Gateway (private stage URL when public API disabled)"
  value       = var.public_endpoint_type == "DISABLED" ? aws_api_gateway_stage.main["private"].invoke_url : aws_api_gateway_stage.main["public"].invoke_url
}

output "api_gateway_private_invoke_url" {
  description = "Invoke URL of the private API Gateway (in-VPC callers)"
  value       = aws_api_gateway_stage.main["private"].invoke_url
}

output "api_gateway_stage_name" {
  description = "Name of the API Gateway stage"
  value       = aws_api_gateway_stage.main["private"].stage_name
}

# Telemetry Module Outputs
output "telemetry_dashboard_url" {
  description = "URL to the CloudWatch monitoring dashboard"
  value       = try(module.telemetry[0].dashboard_url, null)
}

output "telemetry_dashboard_name" {
  description = "Name of the CloudWatch monitoring dashboard"
  value       = try(module.telemetry[0].dashboard_name, null)
}
