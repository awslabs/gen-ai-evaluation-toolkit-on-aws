# Outputs for Generation Module

output "generation_state_machine_arn" {
  description = "ARN of the generation state machine"
  value       = aws_sfn_state_machine.generation.arn
}

output "generation_state_machine_name" {
  description = "Name of the generation state machine"
  value       = aws_sfn_state_machine.generation.name
}

output "generation_bucket_name" {
  description = "Name of the generation S3 bucket"
  value       = aws_s3_bucket.generation.id
}

output "generation_bucket_arn" {
  description = "ARN of the generation S3 bucket"
  value       = aws_s3_bucket.generation.arn
}

output "generation_api_endpoint" {
  description = "Generation API endpoint"
  value       = "https://${local.api_targets["private"].rest_api_id}.execute-api.${var.region}.amazonaws.com/prod/generation-jobs"
}

output "generation_lambda_arns" {
  description = "ARNs of generation Lambda functions"
  value = {
    for key, func in aws_lambda_function.api_handlers :
    key => func.arn
  }
}

# Telemetry-compatible outputs — used by the telemetry module via merge()
output "telemetry_lambda_functions" {
  description = "All Lambda functions in telemetry-compatible format"
  value = {
    for key, fn in aws_lambda_function.api_handlers : "generation_${key}" => {
      function_name = fn.function_name
      display_name  = key
    }
  }
}

output "telemetry_state_machines" {
  description = "All state machines in telemetry-compatible format"
  value = {
    generation = {
      state_machine_name = aws_sfn_state_machine.generation.name
      display_name       = "Generation"
    }
  }
}

