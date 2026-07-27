# Per-function IAM roles for Datastore Lambda functions

locals {
  lambda_assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

# =============================================================================
# API Handlers Role (shared across all API handler Lambdas)
# =============================================================================

resource "aws_iam_role" "api_handlers" {
  name               = "${var.project_name}-${var.environment}-datastore-api-handlers-role"
  assume_role_policy = local.lambda_assume_role_policy
  tags               = var.tags
}

resource "aws_iam_role_policy_attachment" "api_handlers_basic" {
  role       = aws_iam_role.api_handlers.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "api_handlers_vpc" {
  role       = aws_iam_role.api_handlers.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

resource "aws_iam_role_policy_attachment" "api_handlers_xray" {
  role       = aws_iam_role.api_handlers.name
  policy_arn = "arn:aws:iam::aws:policy/AWSXRayDaemonWriteAccess"
}

resource "aws_iam_role_policy" "api_handlers_kms" {
  count = var.encryption_key_arn != null ? 1 : 0
  name  = "${var.project_name}-${var.environment}-datastore-api-handlers-kms"
  role  = aws_iam_role.api_handlers.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["kms:Decrypt", "kms:GenerateDataKey"]
      Resource = var.encryption_key_arn
    }]
  })
}

# =============================================================================
# Versioning Worker Role
# =============================================================================

resource "aws_iam_role" "versioning_worker" {
  name               = "${var.project_name}-${var.environment}-datastore-versioning-worker-role"
  assume_role_policy = local.lambda_assume_role_policy
  tags               = var.tags
}

resource "aws_iam_role_policy_attachment" "versioning_worker_basic" {
  role       = aws_iam_role.versioning_worker.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "versioning_worker_vpc" {
  role       = aws_iam_role.versioning_worker.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

resource "aws_iam_role_policy_attachment" "versioning_worker_xray" {
  role       = aws_iam_role.versioning_worker.name
  policy_arn = "arn:aws:iam::aws:policy/AWSXRayDaemonWriteAccess"
}

resource "aws_iam_role_policy" "versioning_worker_kms" {
  count = var.encryption_key_arn != null ? 1 : 0
  name  = "${var.project_name}-${var.environment}-datastore-versioning-worker-kms"
  role  = aws_iam_role.versioning_worker.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["kms:Decrypt", "kms:GenerateDataKey"]
      Resource = var.encryption_key_arn
    }]
  })
}

resource "aws_iam_role_policy" "versioning_worker_dynamodb" {
  name = "${var.project_name}-${var.environment}-datastore-versioning-worker-dynamodb"
  role = aws_iam_role.versioning_worker.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem",
        "dynamodb:DeleteItem", "dynamodb:Query", "dynamodb:Scan",
        "dynamodb:BatchWriteItem", "dynamodb:BatchGetItem"
      ]
      Resource = [
        aws_dynamodb_table.datastore.arn,
        "${aws_dynamodb_table.datastore.arn}/index/*"
      ]
    }]
  })
}

resource "aws_iam_role_policy" "versioning_worker_s3" {
  name = "${var.project_name}-${var.environment}-datastore-versioning-worker-s3"
  role = aws_iam_role.versioning_worker.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"]
      Resource = [
        aws_s3_bucket.datastore.arn,
        "${aws_s3_bucket.datastore.arn}/*"
      ]
    }]
  })
}

# =============================================================================
# Restore Worker Role
# =============================================================================

resource "aws_iam_role" "restore_worker" {
  name               = "${var.project_name}-${var.environment}-datastore-restore-worker-role"
  assume_role_policy = local.lambda_assume_role_policy
  tags               = var.tags
}

resource "aws_iam_role_policy_attachment" "restore_worker_basic" {
  role       = aws_iam_role.restore_worker.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "restore_worker_vpc" {
  role       = aws_iam_role.restore_worker.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

resource "aws_iam_role_policy_attachment" "restore_worker_xray" {
  role       = aws_iam_role.restore_worker.name
  policy_arn = "arn:aws:iam::aws:policy/AWSXRayDaemonWriteAccess"
}

resource "aws_iam_role_policy" "restore_worker_kms" {
  count = var.encryption_key_arn != null ? 1 : 0
  name  = "${var.project_name}-${var.environment}-datastore-restore-worker-kms"
  role  = aws_iam_role.restore_worker.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["kms:Decrypt", "kms:GenerateDataKey"]
      Resource = var.encryption_key_arn
    }]
  })
}

resource "aws_iam_role_policy" "restore_worker_dynamodb" {
  name = "${var.project_name}-${var.environment}-datastore-restore-worker-dynamodb"
  role = aws_iam_role.restore_worker.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem",
        "dynamodb:DeleteItem", "dynamodb:Query", "dynamodb:Scan",
        "dynamodb:BatchWriteItem", "dynamodb:BatchGetItem"
      ]
      Resource = [
        aws_dynamodb_table.datastore.arn,
        "${aws_dynamodb_table.datastore.arn}/index/*"
      ]
    }]
  })
}

resource "aws_iam_role_policy" "restore_worker_s3" {
  name = "${var.project_name}-${var.environment}-datastore-restore-worker-s3"
  role = aws_iam_role.restore_worker.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"]
      Resource = [
        aws_s3_bucket.datastore.arn,
        "${aws_s3_bucket.datastore.arn}/*"
      ]
    }]
  })
}

# =============================================================================
# Annotation Seeder Role
# =============================================================================

resource "aws_iam_role" "annotation_seeder" {
  name               = "${var.project_name}-${var.environment}-datastore-annotation-seeder-role"
  assume_role_policy = local.lambda_assume_role_policy
  tags               = var.tags
}

resource "aws_iam_role_policy_attachment" "annotation_seeder_basic" {
  role       = aws_iam_role.annotation_seeder.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "annotation_seeder_vpc" {
  role       = aws_iam_role.annotation_seeder.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

resource "aws_iam_role_policy_attachment" "annotation_seeder_xray" {
  role       = aws_iam_role.annotation_seeder.name
  policy_arn = "arn:aws:iam::aws:policy/AWSXRayDaemonWriteAccess"
}

resource "aws_iam_role_policy" "annotation_seeder_kms" {
  count = var.encryption_key_arn != null ? 1 : 0
  name  = "${var.project_name}-${var.environment}-datastore-annotation-seeder-kms"
  role  = aws_iam_role.annotation_seeder.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["kms:Decrypt", "kms:GenerateDataKey"]
      Resource = var.encryption_key_arn
    }]
  })
}

resource "aws_iam_role_policy" "annotation_seeder_dynamodb" {
  name = "${var.project_name}-${var.environment}-datastore-annotation-seeder-dynamodb"
  role = aws_iam_role.annotation_seeder.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem",
        "dynamodb:DeleteItem", "dynamodb:Query", "dynamodb:Scan",
        "dynamodb:BatchWriteItem", "dynamodb:BatchGetItem"
      ]
      Resource = [
        aws_dynamodb_table.datastore.arn,
        "${aws_dynamodb_table.datastore.arn}/index/*"
      ]
    }]
  })
}

# SQS receive policy for restore worker (consumes from restore queue)
resource "aws_iam_role_policy" "restore_worker_sqs" {
  name = "${var.project_name}-${var.environment}-datastore-restore-worker-sqs"
  role = aws_iam_role.restore_worker.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"]
      Resource = aws_sqs_queue.restore_trigger.arn
    }]
  })
}

# =============================================================================
# Outputs
# =============================================================================

output "api_handlers_role_arn" {
  description = "IAM role ARN for API handler Lambda functions"
  value       = aws_iam_role.api_handlers.arn
}

output "versioning_worker_role_arn" {
  description = "IAM role ARN for versioning worker Lambda"
  value       = aws_iam_role.versioning_worker.arn
}

output "restore_worker_role_arn" {
  description = "IAM role ARN for restore worker Lambda"
  value       = aws_iam_role.restore_worker.arn
}

output "annotation_seeder_role_arn" {
  description = "IAM role ARN for annotation seeder Lambda"
  value       = aws_iam_role.annotation_seeder.arn
}
