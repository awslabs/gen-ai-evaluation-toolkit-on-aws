# Outputs for Datastore Module

# DynamoDB Outputs
output "datastore_table_name" {
  description = "Name of the datastore DynamoDB table"
  value       = aws_dynamodb_table.datastore.name
}

output "datastore_table_arn" {
  description = "ARN of the datastore DynamoDB table"
  value       = aws_dynamodb_table.datastore.arn
}

# S3 Outputs
output "datastore_bucket_name" {
  description = "Name of the datastore S3 bucket"
  value       = aws_s3_bucket.datastore.id
}

output "datastore_bucket_arn" {
  description = "ARN of the datastore S3 bucket"
  value       = aws_s3_bucket.datastore.arn
}

output "datastore_bucket_domain_name" {
  description = "Domain name of the datastore S3 bucket"
  value       = aws_s3_bucket.datastore.bucket_domain_name
}

# Lambda Outputs
output "api_handler_function_names" {
  description = "Map of API handler Lambda function names"
  value = {
    for key, lambda in aws_lambda_function.api_handlers : key => lambda.function_name
  }
}

output "api_handler_function_arns" {
  description = "Map of API handler Lambda function ARNs"
  value = {
    for key, lambda in aws_lambda_function.api_handlers : key => lambda.arn
  }
}

output "versioning_worker_function_name" {
  description = "Name of the versioning worker Lambda function"
  value       = aws_lambda_function.versioning_worker.function_name
}

output "versioning_worker_function_arn" {
  description = "ARN of the versioning worker Lambda function"
  value       = aws_lambda_function.versioning_worker.arn
}

output "restore_worker_function_name" {
  description = "Name of the restore worker Lambda function"
  value       = aws_lambda_function.restore_worker.function_name
}

output "restore_worker_function_arn" {
  description = "ARN of the restore worker Lambda function"
  value       = aws_lambda_function.restore_worker.arn
}

output "annotation_seeder_function_name" {
  description = "Name of the annotation seeder Lambda function"
  value       = aws_lambda_function.annotation_seeder.function_name
}

output "annotation_seeder_function_arn" {
  description = "ARN of the annotation seeder Lambda function"
  value       = aws_lambda_function.annotation_seeder.arn
}

# SQS Outputs
output "versioning_queue_url" {
  description = "URL of the versioning trigger queue"
  value       = aws_sqs_queue.versioning_trigger.url
}

output "versioning_queue_arn" {
  description = "ARN of the versioning trigger queue"
  value       = aws_sqs_queue.versioning_trigger.arn
}

output "restore_queue_url" {
  description = "URL of the restore trigger queue"
  value       = aws_sqs_queue.restore_trigger.url
}

output "restore_queue_arn" {
  description = "ARN of the restore trigger queue"
  value       = aws_sqs_queue.restore_trigger.arn
}

# DLQ Outputs for Telemetry
output "versioning_dlq_name" {
  description = "Name of the versioning DLQ"
  value       = aws_sqs_queue.versioning_dlq.name
}

output "restore_dlq_name" {
  description = "Name of the restore DLQ"
  value       = aws_sqs_queue.restore_dlq.name
}

# Telemetry-compatible outputs — used by the telemetry module via merge()
output "telemetry_lambda_functions" {
  description = "All Lambda functions in telemetry-compatible format"
  value = merge(
    { for key, fn in aws_lambda_function.api_handlers : "datastore_${key}" => {
      function_name = fn.function_name
      display_name  = key
    } },
    {
      datastore_versioningWorker = {
        function_name = aws_lambda_function.versioning_worker.function_name
        display_name  = "VersioningWorker"
      }
      datastore_restoreWorker = {
        function_name = aws_lambda_function.restore_worker.function_name
        display_name  = "RestoreWorker"
      }
      datastore_annotationSeeder = {
        function_name = aws_lambda_function.annotation_seeder.function_name
        display_name  = "AnnotationSeeder"
      }
    }
  )
}

output "telemetry_dynamodb_tables" {
  description = "All DynamoDB tables in telemetry-compatible format"
  value = {
    datastore = {
      table_name   = aws_dynamodb_table.datastore.name
      display_name = "Datastore"
      gsi_names    = [for gsi in aws_dynamodb_table.datastore.global_secondary_index : gsi.name]
    }
  }
}

output "telemetry_dlq_queues" {
  description = "All DLQ queues in telemetry-compatible format"
  value = {
    versioning_dlq = {
      queue_name   = aws_sqs_queue.versioning_dlq.name
      display_name = "VersioningDLQ"
    }
    restore_dlq = {
      queue_name   = aws_sqs_queue.restore_dlq.name
      display_name = "RestoreDLQ"
    }
  }
}

