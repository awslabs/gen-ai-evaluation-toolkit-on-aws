# Outputs for Common Module
# Uses local references to support both new VPC and BYOVPC modes

# VPC Outputs
output "vpc_id" {
  description = "ID of the VPC"
  value       = local.vpc_id
}

output "vpc_cidr" {
  description = "CIDR block of the VPC"
  value       = local.vpc_cidr
}

output "public_subnet_ids" {
  description = "IDs of public subnets"
  value       = local.public_subnet_ids
}

output "private_subnet_ids" {
  description = "IDs of private subnets"
  value       = local.private_subnet_ids
}

output "isolated_subnet_ids" {
  description = "IDs of isolated (no-internet) subnets for airgapped evaluators (e.g. agent-as-judge). Empty when no isolated subnets exist."
  value       = local.isolated_subnet_ids
}

output "apigw_vpc_endpoint_id" {
  description = "ID of the execute-api interface VPC endpoint (null on BYO-VPC unless supplied via existing_api_gw_vpc_endpoint_id)"
  value       = local.apigw_vpc_endpoint_id
}

output "nat_gateway_ids" {
  description = "IDs of NAT gateways"
  value       = local.create_vpc && var.enable_nat_gateway ? aws_nat_gateway.main[*].id : []
}

# Security Group Outputs
output "lambda_security_group_id" {
  description = "ID of Lambda security group"
  value       = local.lambda_security_group_id
}

output "ecs_security_group_id" {
  description = "ID of ECS security group"
  value       = local.ecs_security_group_id
}

output "api_gateway_vpc_endpoint_security_group_id" {
  description = "ID of API Gateway VPC endpoint security group"
  value       = var.enable_private_api_endpoints ? aws_security_group.api_gateway_vpc_endpoint[0].id : null
}

# IAM Role Outputs
output "ecs_task_execution_role_arn" {
  description = "ARN of ECS task execution role"
  value       = aws_iam_role.ecs_task_execution.arn
}

output "ecs_task_role_arn" {
  description = "ARN of ECS task role"
  value       = aws_iam_role.ecs_task.arn
}

output "sfn_execution_role_arn" {
  description = "ARN of Step Functions execution role"
  value       = aws_iam_role.sfn_execution.arn
}

output "scheduler_execution_role_arn" {
  description = "ARN of EventBridge Scheduler execution role"
  value       = aws_iam_role.scheduler_execution.arn
}

output "api_gateway_cloudwatch_role_arn" {
  description = "ARN of API Gateway CloudWatch role"
  value       = aws_iam_role.api_gateway_cloudwatch.arn
}

# VPC Endpoint Outputs
# Note: VPC endpoints are only created for new VPCs, not BYOVPC
output "s3_vpc_endpoint_id" {
  description = "ID of S3 VPC endpoint (null for BYOVPC)"
  value       = local.create_vpc && var.enable_vpc_endpoints ? aws_vpc_endpoint.s3[0].id : null
}

output "dynamodb_vpc_endpoint_id" {
  description = "ID of DynamoDB VPC endpoint (null for BYOVPC)"
  value       = local.create_vpc && var.enable_vpc_endpoints ? aws_vpc_endpoint.dynamodb[0].id : null
}

# API Gateway Outputs
output "rest_api_id" {
  description = "ID of the private REST API"
  value       = aws_api_gateway_rest_api.main.id
}

output "rest_api_root_resource_id" {
  description = "Root resource ID of the private REST API"
  value       = aws_api_gateway_rest_api.main.root_resource_id
}

output "rest_api_execution_arn" {
  description = "Execution ARN of the private REST API"
  value       = aws_api_gateway_rest_api.main.execution_arn
}

# Public API outputs (null when public_endpoint_type == "DISABLED")
output "public_rest_api_id" {
  description = "ID of the public REST API (null when disabled)"
  value       = var.public_endpoint_type == "DISABLED" ? null : aws_api_gateway_rest_api.public[0].id
}

output "public_rest_api_root_resource_id" {
  description = "Root resource ID of the public REST API (null when disabled)"
  value       = var.public_endpoint_type == "DISABLED" ? null : aws_api_gateway_rest_api.public[0].root_resource_id
}

output "public_rest_api_execution_arn" {
  description = "Execution ARN of the public REST API (null when disabled)"
  value       = var.public_endpoint_type == "DISABLED" ? null : aws_api_gateway_rest_api.public[0].execution_arn
}

# api_targets: the map route modules iterate over (for_each) to register every
# route on BOTH APIs. Keyed "private" (always) and "public" (when enabled).
# Each value carries the rest_api_id, root_resource_id and execution_arn used by
# the route's resource/method/integration/lambda-permission resources.
output "api_targets" {
  description = "Map of API targets (private + optional public) for route modules to iterate over"
  value = merge(
    {
      private = {
        rest_api_id   = aws_api_gateway_rest_api.main.id
        root_resource = aws_api_gateway_rest_api.main.root_resource_id
        execution_arn = aws_api_gateway_rest_api.main.execution_arn
        is_public     = false
      }
    },
    var.public_endpoint_type == "DISABLED" ? {} : {
      public = {
        rest_api_id   = aws_api_gateway_rest_api.public[0].id
        root_resource = aws_api_gateway_rest_api.public[0].root_resource_id
        execution_arn = aws_api_gateway_rest_api.public[0].execution_arn
        is_public     = true
      }
    }
  )
}

output "apigw_access_log_group_arn" {
  description = "ARN of the private API Gateway access log group"
  value       = aws_cloudwatch_log_group.apigw_access.arn
}

output "apigw_access_log_group_arn_public" {
  description = "ARN of the public API Gateway access log group (null when disabled)"
  value       = var.public_endpoint_type == "DISABLED" ? null : aws_cloudwatch_log_group.apigw_access_public[0].arn
}

# EventBridge Outputs
output "event_bus_arn" {
  description = "ARN of the custom EventBridge event bus"
  value       = aws_cloudwatch_event_bus.main.arn
}

output "eventbus_dlq_arn" {
  description = "ARN of the EventBus dead letter queue"
  value       = aws_sqs_queue.eventbus_dlq.arn
}

# Scheduler Outputs
output "scheduler_group_name" {
  description = "Name of the EventBridge Scheduler group for evaluation jobs"
  value       = aws_scheduler_schedule_group.evaluation_jobs.name
}

output "scheduler_group_arn" {
  description = "ARN of the EventBridge Scheduler group for evaluation jobs"
  value       = aws_scheduler_schedule_group.evaluation_jobs.arn
}

output "rest_api_name" {
  description = "Name of the REST API"
  value       = aws_api_gateway_rest_api.main.name
}

# S3 Access Logs
output "access_logs_bucket_id" {
  description = "ID of the shared S3 access logs bucket"
  value       = aws_s3_bucket.access_logs.id
}
