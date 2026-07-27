# Lambda Functions for Experiment Module
# Converted from CDK experiment Lambda handlers
# These functions handle:
# - Experiment management (Create, Get, Update, List, Delete)
# - MLflow integration for experiment tracking
# - Evaluation run parameter and metric reporting to MLflow
# - Evaluation run termination handling
#
# Note: Configuration management Lambda functions are handled by the
# evaluation module and are shared across both evaluation and experiment operations.

# ============================================================================
# S3 Bucket for Lambda Code
# ============================================================================

resource "aws_s3_bucket" "lambda_code" {
  # checkov:skip=CKV2_AWS_61: Deploy-time asset zips referenced by current Lambda resource state; lifecycle expiration would break rollback to prior versions. Retention is a deployment-management concern, not a security control.
  bucket = "${var.project_name}-${var.environment}-lambda-code-${var.aws_account_id}"

  tags = {
    Name = "${var.project_name}-${var.environment}-lambda-code"
  }
}

# Enable versioning (matches CDK SecuredBucket default: versioned=true)
resource "aws_s3_bucket_versioning" "lambda_code" {
  bucket = aws_s3_bucket.lambda_code.id

  versioning_configuration {
    status = "Enabled"
  }
}

# Block public access to the bucket
resource "aws_s3_bucket_public_access_block" "lambda_code" {
  bucket = aws_s3_bucket.lambda_code.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Bucket encryption - uses CMK if provided, otherwise S3-managed
resource "aws_s3_bucket_server_side_encryption_configuration" "lambda_code" {
  bucket = aws_s3_bucket.lambda_code.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = var.encryption_key_arn != null ? "aws:kms" : "AES256"
      kms_master_key_id = var.encryption_key_arn
    }
    bucket_key_enabled = var.encryption_key_arn != null
  }
}

# Bucket logging — targets shared access-logs bucket
resource "aws_s3_bucket_logging" "lambda_code" {
  bucket        = aws_s3_bucket.lambda_code.id
  target_bucket = var.access_logs_bucket_id
  target_prefix = "lambda-code/"
}

# Lifecycle — clean up noncurrent versions and orphaned delete markers
resource "aws_s3_bucket_lifecycle_configuration" "lambda_code" {
  bucket = aws_s3_bucket.lambda_code.id

  rule {
    id     = "cleanup-noncurrent"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 30
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  rule {
    id     = "cleanup-delete-markers"
    status = "Enabled"

    filter {}

    expiration {
      expired_object_delete_marker = true
    }
  }
}

# Upload Lambda code to S3 using local-exec with retry logic
# ============================================================================
# Experiment Lambda package — content-addressed upload
# ============================================================================
# Content-addressed key ensures:
#   - a new build publishes to a NEW key, forcing Lambdas to the new code
#   - a missing/failed upload fails loud (NoSuchKey) instead of silently
#     serving stale bytes from a fixed mutable key
locals {
  experiment_lambda_zip_path = "${path.module}/../../assets/lambda/Lambda.zip"
  experiment_lambda_s3_key   = "lambda/Lambda-${try(filemd5(local.experiment_lambda_zip_path), "placeholder")}.zip"
}

resource "aws_s3_object" "experiment_lambda_code" {
  bucket = aws_s3_bucket.lambda_code.id
  key    = local.experiment_lambda_s3_key
  source = local.experiment_lambda_zip_path
  etag   = try(filemd5(local.experiment_lambda_zip_path), "")

  depends_on = [
    aws_s3_bucket.lambda_code,
    aws_s3_bucket_public_access_block.lambda_code
  ]
}

# ============================================================================
# SDKv2 python-api Lambda package — content-addressed upload
# ============================================================================
# The python-api.zip package backs the evaluation module's four Python
# Lambdas (evaluator-api, post-processing, internal-handler, scheduler-trigger).
# It is uploaded here because the shared lambda_code bucket is defined in this
# module. Unlike the fixed-key Lambda.zip above, the object key embeds the
# content hash so that:
#   - a new build publishes to a NEW key, forcing the Lambdas to the new code
#     (no stale reuse of a mutable fixed key in a versioned bucket), and
#   - a missing/failed upload fails loud at CreateFunction (NoSuchKey on a
#     key that was never written) instead of silently serving an old object.
# The staged zip is produced by `nx run terraform:stage-assets`.
locals {
  python_api_zip_path = "${path.module}/../../assets/lambda/python-api.zip"
}

resource "aws_s3_object" "python_api" {
  bucket = aws_s3_bucket.lambda_code.id
  key    = "lambda/python-api-${try(filemd5(local.python_api_zip_path), "placeholder")}.zip"
  source = local.python_api_zip_path
  etag   = try(filemd5(local.python_api_zip_path), "")

  depends_on = [
    aws_s3_bucket.lambda_code,
    aws_s3_bucket_public_access_block.lambda_code
  ]
}

# Data source to get current region

# Data source to get current AWS account ID

locals {
  # Python API handlers for experiment management
  experiment_handlers = {
    CreateExperiment = {
      handler = "experiment_lambda.api.create_experiment_lambda.handler"
    }
    GetExperiment = {
      handler = "experiment_lambda.api.get_experiment_lambda.handler"
    }
    UpdateExperiment = {
      handler = "experiment_lambda.api.update_experiment_lambda.handler"
    }
    ListExperiments = {
      handler = "experiment_lambda.api.list_experiments_lambda.handler"
    }
    ListExperimentOutputs = {
      handler = "experiment_lambda.api.list_experiment_outputs_lambda.handler"
    }
    DeleteExperiment = {
      handler = "experiment_lambda.api.delete_experiment_lambda.handler"
    }
  }

  # Python Lambda functions for MLflow integration (not exposed via API)
  mlflow_handlers = {
    EvaluationRunParamReporting = {
      handler = "experiment_lambda.eventbridge.report_configuration_lambda.handler"
    }
    EvaluationRunMetricReporting = {
      handler = "experiment_lambda.eventbridge.report_metrics_lambda.handler"
    }
    EvaluationRunTermination = {
      handler = "experiment_lambda.eventbridge.terminate_run_handler.handler"
    }
  }
}

# CloudWatch Log Group for Lambda Functions
resource "aws_cloudwatch_log_group" "experiment_lambda" {
  name              = "/aws/lambda/${var.project_name}-${var.environment}-experiment"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.encryption_key_arn

  tags = {
    Name = "${var.project_name}-${var.environment}-experiment-lambda-logs"
  }

  lifecycle {
    create_before_destroy = true
  }
}

# ============================================================================
# Experiment Handler Lambda Functions (Python)
# ============================================================================

resource "aws_lambda_function" "experiment_handlers" {
  for_each = local.experiment_handlers

  function_name = "${var.project_name}-${var.environment}-experiment-${each.key}"
  role          = aws_iam_role.experiment_handlers.arn
  handler       = each.value.handler
  runtime       = "python3.12"
  timeout       = lookup(each.value, "timeout", var.default_lambda_timeout)
  memory_size   = lookup(each.value, "memory", var.default_lambda_memory_size)

  s3_bucket        = aws_s3_bucket.lambda_code.id
  s3_key           = local.experiment_lambda_s3_key
  source_code_hash = try(filebase64sha256(local.experiment_lambda_zip_path), "")

  vpc_config {
    subnet_ids         = var.subnet_ids
    security_group_ids = [var.lambda_security_group_id]
  }

  tracing_config {
    mode = var.enable_xray ? "Active" : "PassThrough"
  }

  kms_key_arn = var.encryption_key_arn

  environment {
    variables = {
      MLFLOW_TRACKING_SERVER_ARN = aws_sagemaker_mlflow_tracking_server.mlflow.arn
      LOG_LEVEL                  = var.log_level
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.experiment_lambda,
    aws_sagemaker_mlflow_tracking_server.mlflow,
    aws_s3_object.experiment_lambda_code
  ]

  tags = {
    Name = "${var.project_name}-${var.environment}-experiment-${each.key}"
  }
}

# CloudWatch Log Groups for Experiment Handlers
resource "aws_cloudwatch_log_group" "experiment_handlers" {
  for_each = local.experiment_handlers

  name              = "/aws/lambda/${aws_lambda_function.experiment_handlers[each.key].function_name}"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.encryption_key_arn

  tags = {
    Name = "${var.project_name}-${var.environment}-experiment-${each.key}-logs"
  }

  lifecycle {
    create_before_destroy = true
  }
}

# ============================================================================
# MLflow Integration Lambda Functions (Python)
# ============================================================================

resource "aws_lambda_function" "mlflow_handlers" {
  for_each = local.mlflow_handlers

  function_name = "${var.project_name}-${var.environment}-experiment-${each.key}"
  role          = aws_iam_role.mlflow_handlers.arn
  handler       = each.value.handler
  runtime       = "python3.12"
  timeout       = lookup(each.value, "timeout", var.default_lambda_timeout)
  memory_size   = lookup(each.value, "memory", var.default_lambda_memory_size)

  s3_bucket        = aws_s3_bucket.lambda_code.id
  s3_key           = local.experiment_lambda_s3_key
  source_code_hash = try(filebase64sha256(local.experiment_lambda_zip_path), "")

  vpc_config {
    subnet_ids         = var.subnet_ids
    security_group_ids = [var.lambda_security_group_id]
  }

  tracing_config {
    mode = var.enable_xray ? "Active" : "PassThrough"
  }

  kms_key_arn = var.encryption_key_arn

  environment {
    variables = {
      MLFLOW_TRACKING_SERVER_ARN = aws_sagemaker_mlflow_tracking_server.mlflow.arn
      LOG_LEVEL                  = var.log_level
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.experiment_lambda,
    aws_sagemaker_mlflow_tracking_server.mlflow,
    aws_s3_object.experiment_lambda_code
  ]

  tags = {
    Name = "${var.project_name}-${var.environment}-experiment-${each.key}"
  }
}

# CloudWatch Log Groups for MLflow Handlers
resource "aws_cloudwatch_log_group" "mlflow_handlers" {
  for_each = local.mlflow_handlers

  name              = "/aws/lambda/${aws_lambda_function.mlflow_handlers[each.key].function_name}"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.encryption_key_arn

  tags = {
    Name = "${var.project_name}-${var.environment}-experiment-${each.key}-logs"
  }

  lifecycle {
    create_before_destroy = true
  }
}

# ============================================================================
# Lambda Permissions for API Gateway
# ============================================================================
# API Gateway invoke permissions for experiment_handlers are defined in api.tf
# (aws_lambda_permission.route), one per (handler × API target), so they cover
# both the private and public API.

# ============================================================================
# Lambda Permissions for EventBridge
# ============================================================================

# Permission for EvaluationRunParamReporting Lambda to be invoked by evaluation_run_start rule
resource "aws_lambda_permission" "evaluation_run_param_reporting_eventbridge" {
  statement_id  = "AllowEventBridgeInvokeFromEvalRunStart"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.mlflow_handlers["EvaluationRunParamReporting"].function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.evaluation_run_start.arn
}

# Permission for EvaluationRunMetricReporting Lambda to be invoked by evaluation_run_finished rule
resource "aws_lambda_permission" "evaluation_run_metric_reporting_eventbridge" {
  statement_id  = "AllowEventBridgeInvokeFromEvalRunFinished"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.mlflow_handlers["EvaluationRunMetricReporting"].function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.evaluation_run_finished.arn
}

# Permission for EvaluationRunTermination Lambda to be invoked by evaluation_run_failed rule
resource "aws_lambda_permission" "evaluation_run_termination_eventbridge" {
  statement_id  = "AllowEventBridgeInvokeFromEvalRunFailed"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.mlflow_handlers["EvaluationRunTermination"].function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.evaluation_run_failed.arn
}

# ============================================================================
# IAM Policies for Lambda Functions
# ============================================================================

# Policy for experiment handlers to access MLflow
resource "aws_iam_role_policy" "experiment_handlers_mlflow" {
  name = "${var.project_name}-${var.environment}-experiment-handlers-mlflow"
  role = aws_iam_role.experiment_handlers.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "sagemaker-mlflow:CreateExperiment",
          "sagemaker-mlflow:DeleteExperiment",
          "sagemaker-mlflow:RestoreExperiment",
          "sagemaker-mlflow:UpdateExperiment",
          "sagemaker-mlflow:GetExperiment",
          "sagemaker-mlflow:GetExperimentByName",
          "sagemaker-mlflow:SearchExperiments",
          "sagemaker-mlflow:SearchRuns",
          "sagemaker-mlflow:GetRun",
          "sagemaker-mlflow:ListArtifacts",
          "sagemaker-mlflow:SetTag",
          "sagemaker-mlflow:SetExperimentTag",
          "sagemaker-mlflow:DeleteTag"
        ]
        Resource = aws_sagemaker_mlflow_tracking_server.mlflow.arn
      }
    ]
  })
}

# Policy for MLflow handlers to access MLflow (read/write for param and metric reporting)
resource "aws_iam_role_policy" "mlflow_handlers_mlflow" {
  name = "${var.project_name}-${var.environment}-mlflow-handlers-mlflow"
  role = aws_iam_role.mlflow_handlers.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "sagemaker-mlflow:CreateRun",
          "sagemaker-mlflow:GetExperiment",
          "sagemaker-mlflow:LogParam",
          "sagemaker-mlflow:LogMetric",
          "sagemaker-mlflow:GetExperimentByName",
          "sagemaker-mlflow:GetRun",
          "sagemaker-mlflow:UpdateRun",
          "sagemaker-mlflow:LogBatch",
          "sagemaker-mlflow:SearchRuns"
        ]
        Resource = aws_sagemaker_mlflow_tracking_server.mlflow.arn
      }
    ]
  })
}
