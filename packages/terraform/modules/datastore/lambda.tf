# Lambda Functions for Datastore Module
# This file defines all Lambda functions for datastore operations including:
# - API handlers for CRUD operations on datasets, test cases, and annotations
# - Worker functions for versioning and restore operations
# - System annotation seeder (custom resource)

# Data source for current AWS region

# Common Lambda configuration
locals {
  lambda_runtime     = "nodejs22.x" # Matches CDK: lambda.Runtime.NODEJS_22_X
  lambda_timeout     = 29           # API Gateway default timeout
  lambda_memory_size = 1024

  # Lambda package path — relative to the module so it works whether this
  # module is consumed from the root customer package or from a wrapping
  # deployment package (where path.root would resolve to the wrapper).
  lambda_package_path = "${path.module}/../../assets/lambda/nodejs-handlers.zip"

  # Common environment variables for all datastore Lambdas
  common_env_vars = {
    DYNAMO_TABLE_NAME                   = aws_dynamodb_table.datastore.name
    S3_BUCKET_NAME                      = aws_s3_bucket.datastore.id
    LOG_LEVEL                           = var.log_level
    AWS_NODEJS_CONNECTION_REUSE_ENABLED = "1"
  }

  # API handler Lambda functions
  # These correspond to the DATASTORE_HANDLERS set in datastoreApiGatewayIntegration.ts
  api_handlers = {
    # Dataset operations
    createDataset = {
      handler     = "index.createDatasetLambda.lambdaHandler"
      description = "Create a new dataset"
      permissions = "readwrite"
    }
    getDataset = {
      handler     = "index.getDatasetLambda.lambdaHandler"
      description = "Get dataset details"
      permissions = "read"
    }
    listDatasets = {
      handler     = "index.listDatasetsLambda.lambdaHandler"
      description = "List all datasets"
      permissions = "read"
    }
    deleteDataset = {
      handler     = "index.deleteDatasetLambda.lambdaHandler"
      description = "Delete a dataset"
      permissions = "readwrite"
    }
    restoreDataset = {
      handler     = "index.restoreDatasetLambda.lambdaHandler"
      description = "Restore a dataset to a previous version"
      permissions = "readwrite"
      env_vars = {
        ROLLBACK_SQS_URL = aws_sqs_queue.restore_trigger.url
      }
    }

    # Dataset version operations
    createDatasetVersion = {
      handler     = "index.createDatasetVersionLambda.lambdaHandler"
      description = "Create a new dataset version"
      permissions = "readwrite"
      env_vars = {
        VERSIONING_SQS_URL = aws_sqs_queue.versioning_trigger.url
      }
    }
    getDatasetVersion = {
      handler     = "index.getDatasetVersionLambda.lambdaHandler"
      description = "Get dataset version details"
      permissions = "read"
    }
    listDatasetVersions = {
      handler     = "index.listDatasetVersionsLambda.lambdaHandler"
      description = "List all versions of a dataset"
      permissions = "read"
    }

    # Test case operations
    createTestCase = {
      handler     = "index.createTestCaseLambda.lambdaHandler"
      description = "Create a new test case"
      permissions = "readwrite"
    }
    getTestCase = {
      handler     = "index.getTestCaseLambda.lambdaHandler"
      description = "Get test case details"
      permissions = "read"
    }
    listTestCases = {
      handler     = "index.listTestCasesLambda.lambdaHandler"
      description = "List all test cases"
      permissions = "read"
    }
    deleteTestCase = {
      handler     = "index.deleteTestCaseLambda.lambdaHandler"
      description = "Delete a test case"
      permissions = "readwrite"
    }

    # Annotation schema operations
    createAnnotationSchema = {
      handler     = "index.createAnnotationSchemaLambda.lambdaHandler"
      description = "Create a new annotation schema"
      permissions = "readwrite"
    }
    getAnnotationSchema = {
      handler     = "index.getAnnotationSchemaLambda.lambdaHandler"
      description = "Get annotation schema details"
      permissions = "read"
    }
    listAnnotationSchemas = {
      handler     = "index.listAnnotationSchemasLambda.lambdaHandler"
      description = "List all annotation schemas"
      permissions = "read"
    }
    archiveAnnotationSchema = {
      handler     = "index.archiveAnnotationSchemaLambda.lambdaHandler"
      description = "Archive an annotation schema"
      permissions = "readwrite"
    }

    # Annotation operations
    putDatasetVersionAnnotation = {
      handler     = "index.putDatasetVersionAnnotationLambda.lambdaHandler"
      description = "Add or update annotation on a dataset version"
      permissions = "readwrite"
    }
    putTestCaseAnnotation = {
      handler     = "index.putTestCaseAnnotationLambda.lambdaHandler"
      description = "Add or update annotation on a test case"
      permissions = "readwrite"
    }
    deleteDatasetVersionAnnotation = {
      handler     = "index.deleteDatasetVersionAnnotationLambda.lambdaHandler"
      description = "Delete annotation from a dataset version"
      permissions = "readwrite"
    }
    deleteTestCaseAnnotation = {
      handler     = "index.deleteTestCaseAnnotationLambda.lambdaHandler"
      description = "Delete annotation from a test case"
      permissions = "readwrite"
    }
  }
}

# API Handler Lambda Functions
resource "aws_lambda_function" "api_handlers" {
  for_each = local.api_handlers

  function_name = "${var.project_name}-${var.environment}-datastore-${each.key}"
  description   = each.value.description

  filename         = local.lambda_package_path
  source_code_hash = filebase64sha256(local.lambda_package_path)

  runtime       = local.lambda_runtime
  handler       = each.value.handler
  role          = aws_iam_role.api_handlers.arn
  architectures = ["arm64"] # Matches CDK: lambda.Architecture.ARM_64

  timeout     = local.lambda_timeout
  memory_size = local.lambda_memory_size

  kms_key_arn = var.encryption_key_arn

  environment {
    variables = merge(
      local.common_env_vars,
      lookup(each.value, "env_vars", {})
    )
  }

  vpc_config {
    subnet_ids         = var.subnet_ids
    security_group_ids = [var.lambda_security_group_id]
  }

  tracing_config {
    mode = var.enable_xray ? "Active" : "PassThrough"
  }

  tags = merge(
    var.tags,
    {
      Name        = "${var.project_name}-${var.environment}-datastore-${each.key}"
      Module      = "datastore"
      Environment = var.environment
    }
  )
}

# CloudWatch Log Groups for API Handlers
resource "aws_cloudwatch_log_group" "api_handlers" {
  for_each = local.api_handlers

  name              = "/aws/lambda/${aws_lambda_function.api_handlers[each.key].function_name}"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.encryption_key_arn

  tags = merge(
    var.tags,
    {
      Name        = "${var.project_name}-${var.environment}-datastore-${each.key}-logs"
      Module      = "datastore"
      Environment = var.environment
    }
  )

  lifecycle {
    create_before_destroy = true
  }
}

# Consolidated IAM Policies for All Datastore Lambda Functions
# This avoids hitting the 10KB policy size limit per role

# Single policy for all Lambda functions to access DynamoDB
resource "aws_iam_role_policy" "datastore_lambdas_dynamodb" {
  name = "${var.project_name}-${var.environment}-datastore-lambdas-dynamodb"
  role = aws_iam_role.api_handlers.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan",
          "dynamodb:BatchWriteItem",
          "dynamodb:BatchGetItem"
        ]
        Resource = [
          aws_dynamodb_table.datastore.arn,
          "${aws_dynamodb_table.datastore.arn}/index/*"
        ]
      }
    ]
  })
}

# Single policy for all Lambda functions to access S3
resource "aws_iam_role_policy" "datastore_lambdas_s3" {
  name = "${var.project_name}-${var.environment}-datastore-lambdas-s3"
  role = aws_iam_role.api_handlers.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:ListBucket"
        ]
        Resource = [
          aws_s3_bucket.datastore.arn,
          "${aws_s3_bucket.datastore.arn}/*"
        ]
      }
    ]
  })
}

# Grant SQS send permissions for createDatasetVersion and restoreDataset handlers
resource "aws_iam_role_policy" "versioning_sqs_send" {
  name = "${var.project_name}-${var.environment}-datastore-versioning-sqs"
  role = aws_iam_role.api_handlers.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "sqs:SendMessage",
          "sqs:GetQueueAttributes"
        ]
        Resource = aws_sqs_queue.versioning_trigger.arn
      }
    ]
  })
}

resource "aws_iam_role_policy" "restore_sqs_send" {
  name = "${var.project_name}-${var.environment}-datastore-restore-sqs"
  role = aws_iam_role.api_handlers.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "sqs:SendMessage",
          "sqs:GetQueueAttributes"
        ]
        Resource = aws_sqs_queue.restore_trigger.arn
      }
    ]
  })
}


# ============================================================================
# Worker Lambda Functions
# ============================================================================

# Versioning Worker Lambda
# Processes dataset versioning operations asynchronously via SQS
resource "aws_lambda_function" "versioning_worker" {
  function_name = "${var.project_name}-${var.environment}-datastore-versioningWorker"
  description   = "Worker function for dataset versioning operations"

  filename         = local.lambda_package_path
  source_code_hash = filebase64sha256(local.lambda_package_path)

  runtime       = local.lambda_runtime
  handler       = "index.versioningWorkerLambda.lambdaHandler"
  role          = aws_iam_role.versioning_worker.arn
  architectures = ["arm64"]

  timeout     = 900 # 15 minutes for long-running operations
  memory_size = local.lambda_memory_size

  kms_key_arn = var.encryption_key_arn

  environment {
    variables = local.common_env_vars
  }

  vpc_config {
    subnet_ids         = var.subnet_ids
    security_group_ids = [var.lambda_security_group_id]
  }

  tracing_config {
    mode = var.enable_xray ? "Active" : "PassThrough"
  }

  tags = merge(
    var.tags,
    {
      Name        = "${var.project_name}-${var.environment}-datastore-versioningWorker"
      Module      = "datastore"
      Environment = var.environment
    }
  )
}

# CloudWatch Log Group for Versioning Worker
resource "aws_cloudwatch_log_group" "versioning_worker" {
  name              = "/aws/lambda/${aws_lambda_function.versioning_worker.function_name}"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.encryption_key_arn

  tags = merge(
    var.tags,
    {
      Name        = "${var.project_name}-${var.environment}-datastore-versioningWorker-logs"
      Module      = "datastore"
      Environment = var.environment
    }
  )

  lifecycle {
    create_before_destroy = true
  }
}

# SQS Event Source for Versioning Worker
resource "aws_lambda_event_source_mapping" "versioning_worker" {
  event_source_arn = aws_sqs_queue.versioning_trigger.arn
  function_name    = aws_lambda_function.versioning_worker.arn

  batch_size                         = 1 # Single invocation per event to avoid timeouts
  maximum_batching_window_in_seconds = 0

  function_response_types = ["ReportBatchItemFailures"]
}

# Worker Lambda policies are covered by the consolidated policies above
# SQS permissions for workers
resource "aws_iam_role_policy" "versioning_worker_sqs" {
  name = "${var.project_name}-${var.environment}-datastore-workers-sqs"
  role = aws_iam_role.versioning_worker.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes"
        ]
        Resource = [
          aws_sqs_queue.versioning_trigger.arn
        ]
      }
    ]
  })
}

# KMS permissions for Lambda to access CMK-encrypted SQS queues
# When SQS queues use CMK encryption, Lambda needs kms:Decrypt to receive messages
# and kms:GenerateDataKey to send messages
resource "aws_iam_role_policy" "datastore_lambdas_sqs_kms" {
  count = var.encryption_key_arn != null ? 1 : 0

  name = "${var.project_name}-${var.environment}-datastore-lambdas-sqs-kms"
  role = aws_iam_role.versioning_worker.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:GenerateDataKey"
        ]
        Resource = var.encryption_key_arn
      }
    ]
  })
}

# Restore Dataset Worker Lambda
# Processes dataset restore operations asynchronously via SQS
resource "aws_lambda_function" "restore_worker" {
  function_name = "${var.project_name}-${var.environment}-datastore-restoreWorker"
  description   = "Worker function for dataset restore operations"

  filename         = local.lambda_package_path
  source_code_hash = filebase64sha256(local.lambda_package_path)

  runtime       = local.lambda_runtime
  handler       = "index.restoreDatasetWorkerLambda.lambdaHandler"
  role          = aws_iam_role.restore_worker.arn
  architectures = ["arm64"]

  timeout     = 900 # 15 minutes for long-running operations
  memory_size = local.lambda_memory_size

  kms_key_arn = var.encryption_key_arn

  environment {
    variables = local.common_env_vars
  }

  vpc_config {
    subnet_ids         = var.subnet_ids
    security_group_ids = [var.lambda_security_group_id]
  }

  tracing_config {
    mode = var.enable_xray ? "Active" : "PassThrough"
  }

  tags = merge(
    var.tags,
    {
      Name        = "${var.project_name}-${var.environment}-datastore-restoreWorker"
      Module      = "datastore"
      Environment = var.environment
    }
  )
}

# CloudWatch Log Group for Restore Worker
resource "aws_cloudwatch_log_group" "restore_worker" {
  name              = "/aws/lambda/${aws_lambda_function.restore_worker.function_name}"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.encryption_key_arn

  tags = merge(
    var.tags,
    {
      Name        = "${var.project_name}-${var.environment}-datastore-restoreWorker-logs"
      Module      = "datastore"
      Environment = var.environment
    }
  )

  lifecycle {
    create_before_destroy = true
  }
}

# SQS Event Source for Restore Worker
resource "aws_lambda_event_source_mapping" "restore_worker" {
  event_source_arn = aws_sqs_queue.restore_trigger.arn
  function_name    = aws_lambda_function.restore_worker.arn

  batch_size                         = 1 # Single invocation per event to avoid timeouts
  maximum_batching_window_in_seconds = 0

  function_response_types = ["ReportBatchItemFailures"]
}

# IAM policies for restore worker are covered by consolidated policies above

# ============================================================================
# System Annotation Seeder Lambda (Custom Resource)
# ============================================================================

# System Annotation Seeder Lambda
# Seeds system-defined annotation schemas on stack creation
resource "aws_lambda_function" "annotation_seeder" {
  function_name = "${var.project_name}-${var.environment}-datastore-annotationSeeder"
  description   = "Seeds system-defined annotation schemas"

  filename         = local.lambda_package_path
  source_code_hash = filebase64sha256(local.lambda_package_path)

  runtime       = local.lambda_runtime
  handler       = "index.systemDefinedAnnotationsSeederHandler.lambdaHandler"
  role          = aws_iam_role.annotation_seeder.arn
  architectures = ["arm64"]

  timeout     = 300 # 5 minutes
  memory_size = local.lambda_memory_size

  kms_key_arn = var.encryption_key_arn

  environment {
    variables = {
      DYNAMO_TABLE_NAME = aws_dynamodb_table.datastore.name
      LOG_LEVEL         = var.log_level
    }
  }

  vpc_config {
    subnet_ids         = var.subnet_ids
    security_group_ids = [var.lambda_security_group_id]
  }

  tracing_config {
    mode = var.enable_xray ? "Active" : "PassThrough"
  }

  tags = merge(
    var.tags,
    {
      Name        = "${var.project_name}-${var.environment}-datastore-annotationSeeder"
      Module      = "datastore"
      Environment = var.environment
    }
  )
}

# CloudWatch Log Group for Annotation Seeder
resource "aws_cloudwatch_log_group" "annotation_seeder" {
  name              = "/aws/lambda/${aws_lambda_function.annotation_seeder.function_name}"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.encryption_key_arn

  tags = merge(
    var.tags,
    {
      Name        = "${var.project_name}-${var.environment}-datastore-annotationSeeder-logs"
      Module      = "datastore"
      Environment = var.environment
    }
  )

  lifecycle {
    create_before_destroy = true
  }
}

# IAM policy for annotation seeder is covered by consolidated policies above

# Invoke Annotation Seeder on deployment
# This uses aws_lambda_invocation to seed annotations on initial deployment
resource "aws_lambda_invocation" "seed_annotations" {
  function_name = aws_lambda_function.annotation_seeder.function_name

  input = jsonencode({
    RequestType = "Create"
    ResourceProperties = {
      annotations = file("${path.module}/data/annotations.json")
    }
  })

  lifecycle {
    # Only seed on first deployment, ignore subsequent changes
    ignore_changes = [input]
  }

  depends_on = [
    aws_lambda_function.annotation_seeder,
    aws_dynamodb_table.datastore
  ]
}
