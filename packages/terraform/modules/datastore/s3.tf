# S3 Buckets for ETK Datastore
# Converted from CDK SecuredBucket

# Datastore Bucket for datasets and test cases
resource "aws_s3_bucket" "datastore" {
  bucket = "${var.project_name}-${var.environment}-datastore-${var.aws_account_id}-${var.region}"

  tags = merge(
    var.tags,
    {
      Name = "${var.project_name}-${var.environment}-datastore"
    }
  )
}

# Bucket versioning
resource "aws_s3_bucket_versioning" "datastore" {
  bucket = aws_s3_bucket.datastore.id

  versioning_configuration {
    status = var.enable_versioning ? "Enabled" : "Suspended"
  }
}

# Bucket encryption - uses CMK if provided, otherwise S3-managed
resource "aws_s3_bucket_server_side_encryption_configuration" "datastore" {
  bucket = aws_s3_bucket.datastore.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = var.encryption_key_arn != null ? "aws:kms" : "AES256"
      kms_master_key_id = var.encryption_key_arn
    }
    bucket_key_enabled = var.encryption_key_arn != null
  }
}

# Block public access
resource "aws_s3_bucket_public_access_block" "datastore" {
  bucket = aws_s3_bucket.datastore.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Bucket lifecycle configuration
resource "aws_s3_bucket_lifecycle_configuration" "datastore" {
  count = var.enable_lifecycle_rules ? 1 : 0

  bucket = aws_s3_bucket.datastore.id

  rule {
    id     = "transition-old-versions"
    status = "Enabled"

    filter {}

    noncurrent_version_transition {
      noncurrent_days = 30
      storage_class   = "STANDARD_IA"
    }

    noncurrent_version_transition {
      noncurrent_days = 90
      storage_class   = "GLACIER"
    }

    noncurrent_version_expiration {
      noncurrent_days = 365
    }

    expiration {
      expired_object_delete_marker = true
    }
  }

  rule {
    id     = "delete-incomplete-multipart-uploads"
    status = "Enabled"

    filter {}

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

# Bucket logging — unconditional, targets shared access-logs bucket
resource "aws_s3_bucket_logging" "datastore" {
  bucket = aws_s3_bucket.datastore.id

  target_bucket = var.access_logs_bucket_id
  target_prefix = "datastore-logs/"
}

# Bucket policy for secure access
resource "aws_s3_bucket_policy" "datastore" {
  bucket = aws_s3_bucket.datastore.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource = [
          aws_s3_bucket.datastore.arn,
          "${aws_s3_bucket.datastore.arn}/*"
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

# Data source for current AWS account (defined in lambda.tf)

# Note: /genai-etk/datastoreBucketName SSM parameter is in root main.tf

# SSM Parameter for customer provided bucket name (used by tests)
resource "aws_ssm_parameter" "customer_provided_bucket_name" {
  name        = "/genai-${var.project_name}/customerProvidedBucketName"
  description = "Name of the customer provided bucket (datastore bucket)"
  type        = "String"
  value       = aws_s3_bucket.datastore.id

  tags = merge(
    var.tags,
    {
      Name = "${var.project_name}-${var.environment}-customer-bucket-name"
    }
  )
}
