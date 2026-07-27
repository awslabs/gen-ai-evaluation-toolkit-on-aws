# S3 Bucket for Generation Module
# Stores test case generation artifacts and outputs

# Generation S3 Bucket
resource "aws_s3_bucket" "generation" {
  bucket = "${var.project_name}-${var.environment}-generation-${var.aws_account_id}"

  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-generation"
  })
}

# Enable versioning
resource "aws_s3_bucket_versioning" "generation" {
  bucket = aws_s3_bucket.generation.id

  versioning_configuration {
    status = "Enabled"
  }
}

# Bucket encryption - uses CMK if provided, otherwise S3-managed
resource "aws_s3_bucket_server_side_encryption_configuration" "generation" {
  bucket = aws_s3_bucket.generation.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = var.encryption_key_arn != null ? "aws:kms" : "AES256"
      kms_master_key_id = var.encryption_key_arn
    }
    bucket_key_enabled = var.encryption_key_arn != null
  }
}

# Block public access
resource "aws_s3_bucket_public_access_block" "generation" {
  bucket = aws_s3_bucket.generation.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Bucket logging — unconditional, targets shared access-logs bucket
resource "aws_s3_bucket_logging" "generation" {
  bucket = aws_s3_bucket.generation.id

  target_bucket = var.access_logs_bucket_id
  target_prefix = "generation-logs/"
}

# Deny insecure (HTTP) access — matches CDK SecuredBucket
resource "aws_s3_bucket_policy" "generation" {
  bucket = aws_s3_bucket.generation.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource = [
          aws_s3_bucket.generation.arn,
          "${aws_s3_bucket.generation.arn}/*"
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

# Lifecycle policy — expire all objects after 30 days (matches CDK SecuredBucket)
resource "aws_s3_bucket_lifecycle_configuration" "generation" {
  bucket = aws_s3_bucket.generation.id

  rule {
    id     = "monthly-delete"
    status = "Enabled"

    filter {}

    expiration {
      days = 30
    }

    noncurrent_version_expiration {
      noncurrent_days = 30
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 30
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

# =============================================================================
# Per-plugin internal buckets (one SecuredBucket-equivalent per ECS gen plugin).
# Mirrors CDK GenerationEcsPlugin, which creates a dedicated SecuredBucket
# ("RAGInternalBucket") per plugin for intermediate generation data and sets
# INTERNAL_S3_BUCKET to it. Each plugin reads/writes ONLY its own internal
# bucket; the batch Bedrock role (batch-mode plugins) also gets RW on it.
#
# Hardening matches the shared generation bucket above and CDK SecuredBucket:
# versioning, SSE (CMK or AES256), block-all-public, deny-insecure-transport,
# access-logging to the shared access-logs bucket, 30-day lifecycle.
# =============================================================================

locals {
  # ECS generation plugins that each get a dedicated internal bucket. Keys match
  # the plugin names used in plugins.tf / CDK (generateTestCases, llmAsAJudge,
  # agenticTestCases).
  gen_internal_bucket_plugins = toset(["generateTestCases", "llmAsAJudge", "agenticTestCases"])
}

resource "aws_s3_bucket" "generation_internal" {
  for_each = local.gen_internal_bucket_plugins

  # Bucket names must be <=63 chars and globally unique. Use a short hash of the
  # plugin name to stay within the limit while remaining stable per plugin.
  bucket = "${var.project_name}-${var.environment}-gen-int-${substr(sha1(each.key), 0, 8)}-${var.aws_account_id}"

  tags = merge(var.tags, {
    Name   = "${var.project_name}-${var.environment}-gen-internal-${each.key}"
    Plugin = each.key
  })
}

resource "aws_s3_bucket_versioning" "generation_internal" {
  for_each = local.gen_internal_bucket_plugins
  bucket   = aws_s3_bucket.generation_internal[each.key].id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "generation_internal" {
  for_each = local.gen_internal_bucket_plugins
  bucket   = aws_s3_bucket.generation_internal[each.key].id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = var.encryption_key_arn != null ? "aws:kms" : "AES256"
      kms_master_key_id = var.encryption_key_arn
    }
    bucket_key_enabled = var.encryption_key_arn != null
  }
}

resource "aws_s3_bucket_public_access_block" "generation_internal" {
  for_each = local.gen_internal_bucket_plugins
  bucket   = aws_s3_bucket.generation_internal[each.key].id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_logging" "generation_internal" {
  for_each = local.gen_internal_bucket_plugins
  bucket   = aws_s3_bucket.generation_internal[each.key].id

  target_bucket = var.access_logs_bucket_id
  target_prefix = "generation-internal-${each.key}-logs/"
}

resource "aws_s3_bucket_policy" "generation_internal" {
  for_each = local.gen_internal_bucket_plugins
  bucket   = aws_s3_bucket.generation_internal[each.key].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource = [
          aws_s3_bucket.generation_internal[each.key].arn,
          "${aws_s3_bucket.generation_internal[each.key].arn}/*"
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

resource "aws_s3_bucket_lifecycle_configuration" "generation_internal" {
  for_each = local.gen_internal_bucket_plugins
  bucket   = aws_s3_bucket.generation_internal[each.key].id

  rule {
    id     = "monthly-delete"
    status = "Enabled"

    filter {}

    expiration {
      days = 30
    }

    noncurrent_version_expiration {
      noncurrent_days = 30
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 30
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
