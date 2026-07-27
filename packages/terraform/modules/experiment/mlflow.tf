# MLflow Tracking Server for Experiment Module
# Converted from CDK experiment MLflow construct
# Creates a SageMaker MLflow tracking server for experiment tracking

# ============================================================================
# S3 Bucket for MLflow Artifacts
# ============================================================================

resource "aws_s3_bucket" "mlflow_artifacts" {
  # checkov:skip=CKV2_AWS_61: Customer research data (experiment-tracking outputs) whose retention is the customer's decision. Adding a lifecycle policy would silently delete experiment results customers may need indefinitely.
  bucket = "genai-${var.project_name}-experimentartifacts-${var.aws_account_id}-${var.region}"

  tags = {
    Name = "${var.project_name}-${var.environment}-mlflow-artifacts"
  }
}

# Bucket versioning
resource "aws_s3_bucket_versioning" "mlflow_artifacts" {
  bucket = aws_s3_bucket.mlflow_artifacts.id

  versioning_configuration {
    status = "Enabled"
  }
}

# Block public access
resource "aws_s3_bucket_public_access_block" "mlflow_artifacts" {
  bucket = aws_s3_bucket.mlflow_artifacts.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Bucket encryption - uses CMK if provided, otherwise S3-managed
resource "aws_s3_bucket_server_side_encryption_configuration" "mlflow_artifacts" {
  bucket = aws_s3_bucket.mlflow_artifacts.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = var.encryption_key_arn != null ? "aws:kms" : "AES256"
      kms_master_key_id = var.encryption_key_arn
    }
    bucket_key_enabled = var.encryption_key_arn != null
  }
}

# Bucket logging — targets shared access-logs bucket
resource "aws_s3_bucket_logging" "mlflow_artifacts" {
  bucket        = aws_s3_bucket.mlflow_artifacts.id
  target_bucket = var.access_logs_bucket_id
  target_prefix = "mlflow-artifacts/"
}

# Lifecycle — clean up noncurrent versions and orphaned delete markers
resource "aws_s3_bucket_lifecycle_configuration" "mlflow_artifacts" {
  bucket = aws_s3_bucket.mlflow_artifacts.id

  rule {
    id     = "cleanup-noncurrent-and-markers"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = var.mlflow_artifacts_noncurrent_expiry_days
    }

    expiration {
      expired_object_delete_marker = true
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

# ============================================================================
# IAM Role for MLflow Tracking Server
# ============================================================================

resource "aws_iam_role" "mlflow_role" {
  name = "${var.project_name}-${var.environment}-mlflow-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "sagemaker.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name = "${var.project_name}-${var.environment}-mlflow-role"
  }
}

# ============================================================================
# IAM Policy for MLflow to access S3 bucket
# ============================================================================

resource "aws_iam_role_policy" "mlflow_s3_access" {
  name = "${var.project_name}-${var.environment}-mlflow-s3-access"
  role = aws_iam_role.mlflow_role.id

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
          "arn:aws:s3:::${aws_s3_bucket.mlflow_artifacts.id}",
          "arn:aws:s3:::${aws_s3_bucket.mlflow_artifacts.id}/*"
        ]
      }
    ]
  })
}

# ============================================================================
# IAM Policy for MLflow to use KMS key (when CMK encryption is enabled)
# ============================================================================

resource "aws_iam_role_policy" "mlflow_kms_access" {
  count = var.encryption_key_arn != null ? 1 : 0

  name = "${var.project_name}-${var.environment}-mlflow-kms-access"
  role = aws_iam_role.mlflow_role.id

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

# ============================================================================
# SageMaker MLflow Tracking Server
# ============================================================================

resource "aws_sagemaker_mlflow_tracking_server" "mlflow" {
  tracking_server_name = "GenAiEvaluationToolkitMLFlow"
  artifact_store_uri   = "s3://${aws_s3_bucket.mlflow_artifacts.id}"
  role_arn             = aws_iam_role.mlflow_role.arn

  tags = {
    Name = "${var.project_name}-${var.environment}-mlflow-tracking-server"
  }

  depends_on = [
    aws_iam_role_policy.mlflow_s3_access,
    aws_s3_bucket_public_access_block.mlflow_artifacts
  ]
}
