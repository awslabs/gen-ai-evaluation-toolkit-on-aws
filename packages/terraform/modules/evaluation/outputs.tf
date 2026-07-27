# Outputs for Evaluation Module (SDKV2)

# Step Functions
output "orchestration_state_machine_arn" {
  description = "ARN of the SDKV2 orchestration state machine"
  value       = aws_sfn_state_machine.orchestration.arn
}

output "orchestration_state_machine_name" {
  description = "Name of the SDKV2 orchestration state machine"
  value       = aws_sfn_state_machine.orchestration.name
}

# DynamoDB
output "evaluator_table_name" {
  description = "Name of the evaluator DynamoDB table"
  value       = aws_dynamodb_table.evaluator.name
}

output "evaluator_table_arn" {
  description = "ARN of the evaluator DynamoDB table"
  value       = aws_dynamodb_table.evaluator.arn
}

# Lambda Functions
output "evaluator_api_lambda_arn" {
  description = "ARN of the EvaluatorApi Lambda (handles all /v2/ routes)"
  value       = aws_lambda_function.evaluator_api.arn
}

output "evaluator_api_lambda_invoke_arn" {
  description = "Invoke ARN of the EvaluatorApi Lambda"
  value       = aws_lambda_function.evaluator_api.invoke_arn
}

output "evaluator_scheduler_trigger_lambda_arn" {
  description = "ARN of the scheduler trigger Lambda (invoked by EventBridge Scheduler)"
  value       = aws_lambda_function.evaluator_scheduler_trigger.arn
}

# S3
output "evaluation_bucket_name" {
  description = "Name of the evaluation S3 bucket"
  value       = aws_s3_bucket.evaluation.id
}

output "evaluation_bucket_arn" {
  description = "ARN of the evaluation S3 bucket"
  value       = aws_s3_bucket.evaluation.arn
}

# EventBridge (event bus name derived from ARN — for use by external plugin modules)
output "event_bus_name" {
  description = "EventBridge event bus name used by evaluation rules"
  value       = local.event_bus_name
}

# Telemetry integration outputs (consumed by telemetry module for monitoring)
output "telemetry_lambda_functions" {
  description = "All Lambda functions in telemetry-compatible format"
  value = merge(
    {
      evaluator_api = {
        function_name = aws_lambda_function.evaluator_api.function_name
        display_name  = "EvaluatorApi"
      }
      evaluator_post_processing = {
        function_name = aws_lambda_function.evaluator_post_processing.function_name
        display_name  = "EvaluatorPostProcessing"
      }
      evaluator_internal_handler = {
        function_name = aws_lambda_function.evaluator_internal_handler.function_name
        display_name  = "EvaluatorInternalHandler"
      }
      evaluator_scheduler_trigger = {
        function_name = aws_lambda_function.evaluator_scheduler_trigger.function_name
        display_name  = "EvaluatorSchedulerTrigger"
      }
    },
    { for key, fn in aws_lambda_function.scheduler_handlers : "evaluation_${key}" => {
      function_name = fn.function_name
      display_name  = key
    } },
  )
}

output "telemetry_state_machines" {
  description = "All Step Functions state machines in telemetry-compatible format"
  value = {
    evaluator_orchestration = {
      state_machine_name = aws_sfn_state_machine.orchestration.name
      display_name       = "EvaluatorOrchestration"
    }
  }
}
