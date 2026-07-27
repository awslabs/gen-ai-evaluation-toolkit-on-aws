# S3 Bucket for Evaluation Module
# Matches CDK BaseStack evaluationBucket with auto-expiration of temp test data

# Evaluation Bucket for Test Data (Temporary)
resource "aws_s3_bucket" "evaluation" {
  bucket = "${var.project_name}-${var.environment}-evaluation-${var.aws_account_id}-${var.region}"

  tags = merge(
    var.tags,
    {
      Name = "${var.project_name}-${var.environment}-evaluation"
    }
  )
}

# Enable versioning (matches CDK SecuredBucket default: versioned=true)
resource "aws_s3_bucket_versioning" "evaluation" {
  bucket = aws_s3_bucket.evaluation.id

  versioning_configuration {
    status = "Enabled"
  }
}

# Bucket encryption - uses CMK if provided, otherwise S3-managed
resource "aws_s3_bucket_server_side_encryption_configuration" "evaluation" {
  bucket = aws_s3_bucket.evaluation.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = var.encryption_key_arn != null ? "aws:kms" : "AES256"
      kms_master_key_id = var.encryption_key_arn
    }
    bucket_key_enabled = var.encryption_key_arn != null
  }
}

# Block public access to evaluation bucket
resource "aws_s3_bucket_public_access_block" "evaluation" {
  bucket = aws_s3_bucket.evaluation.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Lifecycle configuration for evaluation bucket - auto-expire temp test data
resource "aws_s3_bucket_lifecycle_configuration" "evaluation" {
  bucket = aws_s3_bucket.evaluation.id

  rule {
    id     = "expire-temp-test-data"
    status = "Enabled"

    filter {}

    expiration {
      days = var.evaluation_temp_test_data_expire_after
    }

    noncurrent_version_expiration {
      noncurrent_days = var.evaluation_temp_test_data_expire_after
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

# Bucket logging — unconditional, targets shared access-logs bucket
resource "aws_s3_bucket_logging" "evaluation" {
  bucket = aws_s3_bucket.evaluation.id

  target_bucket = var.access_logs_bucket_id
  target_prefix = "evaluation-logs/"
}

# Bucket policy for secure access
resource "aws_s3_bucket_policy" "evaluation" {
  bucket = aws_s3_bucket.evaluation.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource = [
          aws_s3_bucket.evaluation.arn,
          "${aws_s3_bucket.evaluation.arn}/*"
        ]
        Condition = {
          Bool = {
            "aws:SecureTransport" = "false"
          }
        }
      }
    ]
  })
}
