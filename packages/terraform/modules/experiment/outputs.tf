# Output Values for Experiment Module

# ============================================================================
# Lambda Function ARNs
# ============================================================================

output "experiment_handler_arns" {
  description = "ARNs of experiment handler Lambda functions"
  value = {
    for key, func in aws_lambda_function.experiment_handlers :
    key => func.arn
  }
}

output "mlflow_handler_arns" {
  description = "ARNs of MLflow integration handler Lambda functions"
  value = {
    for key, func in aws_lambda_function.mlflow_handlers :
    key => func.arn
  }
}

# ============================================================================
# API Gateway Resources
# ============================================================================

output "experiments_resource_id" {
  description = "API Gateway resource ID for /experiments (private API)"
  value       = aws_api_gateway_resource.experiments["private"].id
}

# ============================================================================
# EventBridge Rules
# ============================================================================

output "evaluation_run_start_rule_arn" {
  description = "ARN of the EventBridge rule for evaluation run start events"
  value       = aws_cloudwatch_event_rule.evaluation_run_start.arn
}

output "evaluation_run_finished_rule_arn" {
  description = "ARN of the EventBridge rule for evaluation run finished events"
  value       = aws_cloudwatch_event_rule.evaluation_run_finished.arn
}

output "evaluation_run_failed_rule_arn" {
  description = "ARN of the EventBridge rule for evaluation run failed events"
  value       = aws_cloudwatch_event_rule.evaluation_run_failed.arn
}

# ============================================================================
# MLflow Server
# ============================================================================

output "mlflow_tracking_server_arn" {
  description = "ARN of the MLflow tracking server"
  value       = aws_sagemaker_mlflow_tracking_server.mlflow.arn
}

output "mlflow_tracking_server_name" {
  description = "Name of the MLflow tracking server"
  value       = aws_sagemaker_mlflow_tracking_server.mlflow.tracking_server_name
}

output "mlflow_artifact_bucket_arn" {
  description = "ARN of the MLflow artifact S3 bucket"
  value       = aws_s3_bucket.mlflow_artifacts.arn
}

output "mlflow_artifact_bucket_name" {
  description = "Name of the MLflow artifact S3 bucket"
  value       = aws_s3_bucket.mlflow_artifacts.id
}

# ============================================================================
# API Gateway Deployment
# ============================================================================
# Note: Deployment is now handled by root module - output is in api.tf

# Telemetry-compatible outputs — used by the telemetry module via merge()
output "telemetry_lambda_functions" {
  description = "All Lambda functions in telemetry-compatible format"
  value = merge(
    { for key, fn in aws_lambda_function.experiment_handlers : "experiment_${key}" => {
      function_name = fn.function_name
      display_name  = key
    } },
    { for key, fn in aws_lambda_function.mlflow_handlers : "experiment_${key}" => {
      function_name = fn.function_name
      display_name  = key
    } }
  )
}

# ============================================================================
# Lambda code bucket + SDKv2 python-api package (consumed by the evaluation module)
# ============================================================================

output "lambda_code_bucket_id" {
  description = "Name of the shared S3 bucket holding Lambda deployment packages"
  value       = aws_s3_bucket.lambda_code.id
}

output "python_api_s3_key" {
  description = "Content-addressed S3 key of the uploaded python-api.zip package"
  value       = aws_s3_object.python_api.key
}

output "python_api_source_hash" {
  description = "Base64 SHA256 of python-api.zip for Lambda code change detection"
  value       = try(filebase64sha256(local.python_api_zip_path), "")
}
