terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
  }
}

provider "aws" {}

# -----------------------------------------------------------------------------
# Account and region are derived from the caller's AWS profile — so
# `AWS_PROFILE=<admin-for-account-X> nx run terraform-deployment:bootstrap-apply`
# just works, no tfvars edits. Only `environment` is an explicit input because
# it's a naming choice (not discoverable from the profile).
# -----------------------------------------------------------------------------
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

variable "environment" {
  description = "Environment name used in the deployed-image-manifest SSM parameter path. Default 'dev' matches the root module's var.environment default + mise.toml TF_VAR_environment. Beta CI overrides to 'tf-beta' via TF_ENV for historical continuity."
  type        = string
  default     = "dev"
}

variable "project_name" {
  description = "Project name used for resource naming. Bootstrap resources are prefixed with genai-<project_name> (e.g. genai-etk-terraform-state). Must match the project_name passed to the main module."
  type        = string
  default     = "etk"
}

locals {
  # Bootstrap names use "genai-<project_name>" prefix for backward compatibility.
  bootstrap_prefix = "genai-${var.project_name}"
  account_id       = data.aws_caller_identity.current.account_id
  region           = data.aws_region.current.name
  environment      = var.environment

  # Plugin registry — single source of truth in ../plugins.yaml.
  # Same file drives main.tf's deploy_key lookup and .gitlab/pipeline.yml's
  # docker:plugin matrix. Adding a plugin = one YAML entry.
  plugins          = yamldecode(file("${path.module}/../plugins.yaml")).plugins
  plugin_ecr_repos = [for p in local.plugins : p.ecr_repo]

  # Kaniko layer-cache repo. Shared across all docker:plugin-* jobs so
  # unchanged base layers are reused between MR pipelines.
  kaniko_cache_repo = "${local.bootstrap_prefix}-kaniko-cache"

  # Keep the last 5 kaniko cache entries per plugin. The cache repo is shared
  # across all plugin builds, so the retention count scales with plugin count:
  # an idle plugin won't get its cache evicted by a handful of active plugins.
  # Bump `kaniko_cache_per_plugin` if per-build layer count grows.
  kaniko_cache_per_plugin  = 5
  kaniko_cache_image_count = length(local.plugins) * local.kaniko_cache_per_plugin
}

# --- S3 State Backend ---

resource "aws_s3_bucket" "tf_state" {
  bucket = "${local.bootstrap_prefix}-terraform-state-${local.account_id}"
}

resource "aws_s3_bucket_versioning" "tf_state" {
  bucket = aws_s3_bucket.tf_state.id
  versioning_configuration { status = "Enabled" }
}

# Expire noncurrent state versions after 90d and clean up aborted multipart
# uploads. Versioning is required for terraform remote state, but unbounded
# version growth is wasteful — 90d gives plenty of time for rollback while
# keeping storage in check.
resource "aws_s3_bucket_lifecycle_configuration" "tf_state" {
  bucket = aws_s3_bucket.tf_state.id

  rule {
    id     = "expire-noncurrent-versions"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 90
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  depends_on = [aws_s3_bucket_versioning.tf_state]
}

resource "aws_s3_bucket_server_side_encryption_configuration" "tf_state" {
  bucket = aws_s3_bucket.tf_state.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "aws:kms" }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "tf_state" {
  bucket                  = aws_s3_bucket.tf_state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_policy" "tf_state_deny_insecure" {
  bucket = aws_s3_bucket.tf_state.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource = [
          aws_s3_bucket.tf_state.arn,
          "${aws_s3_bucket.tf_state.arn}/*"
        ]
        Condition = {
          Bool = { "aws:SecureTransport" = "false" }
        }
      }
    ]
  })
}

# --- DynamoDB State Lock Table ---

resource "aws_dynamodb_table" "tf_locks" {
  # checkov:skip=CKV_AWS_28: Lock items are ephemeral markers written during `terraform plan/apply` and deleted immediately on release. Point-in-time recovery on the lock table adds cost with no recovery value.
  # checkov:skip=CKV_AWS_119: Lock items contain only lock identifiers and timestamps — no secrets, no customer data. Explicit `server_side_encryption { enabled = true }` below uses the AWS-managed DynamoDB KMS key (alias/aws/dynamodb), parity with the state bucket's aws:kms SSE which also uses an AWS-managed key. No CMK is provisioned for the terraform backend.
  name         = "${local.bootstrap_prefix}-terraform-locks"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }

  # Enable explicit SSE so lock IDs and timestamps are encrypted at rest with
  # the AWS-managed DynamoDB KMS key (alias/aws/dynamodb). Mirrors the state
  # bucket's aws:kms SSE (both use AWS-managed keys by design — no CMK is
  # provisioned for the terraform backend).
  server_side_encryption {
    enabled = true
  }
}

# =============================================================================
# Plugin image delivery: kaniko pushes directly to ECR in CI.
#
# Bootstrap owns the plugin ECR repositories plus a shared kaniko layer-cache
# repo. `docker:plugin-*` CI jobs authenticate to ECR and push
# <repo>:<CI_COMMIT_SHORT_SHA> before `tf:apply`. Main TF reads repo URIs via
# `data "aws_ecr_repository"` and the image tag via a single SSM parameter
# written by the pipeline's `tf:set-image-tag` job.
#
# No S3 detour, no Lambda pusher, no Docker daemon on any bootstrap host.
# kaniko already builds the images in CI — having it also push is cheaper.
# =============================================================================

# --- Plugin image ECR repositories ---

resource "aws_ecr_repository" "plugins" {
  for_each = toset(local.plugin_ecr_repos)

  name                 = each.value
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = {
    Name = each.value
  }
}

# Keep last 30 tagged images + expire untagged after 7 days. Tuned for CI
# churn — each MR pipeline pushes a new SHA-tagged image per plugin.
resource "aws_ecr_lifecycle_policy" "plugins" {
  for_each = aws_ecr_repository.plugins

  repository = each.value.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Expire untagged images after 7 days"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 7
        }
        action = { type = "expire" }
      },
      {
        # Scope to tagged images only so this rule cannot evict an untagged
        # reference that the pipeline hasn't yet promoted. Rule 1 (priority 1)
        # handles untagged images on its own cadence. Tag pattern `*` matches
        # every plugin image tag (short-SHAs, semantic versions, etc.).
        #
        # Migration note: this previously was `tagStatus = "any"` with the
        # same countNumber = 30. When first re-applied against an existing
        # repo, ECR re-evaluates the rule against only tagged images — the
        # count threshold is unchanged, so no surprise deletion of currently
        # tagged images beyond what the old rule would have already pruned.
        rulePriority = 2
        description  = "Keep only the last 30 tagged images"
        selection = {
          tagStatus      = "tagged"
          tagPatternList = ["*"]
          countType      = "imageCountMoreThan"
          countNumber    = 30
        }
        action = { type = "expire" }
      }
    ]
  })
}

# --- Kaniko layer-cache repo ---

resource "aws_ecr_repository" "kaniko_cache" {
  name                 = local.kaniko_cache_repo
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = false # Cache layers — no point scanning
  }

  tags = {
    Name = local.kaniko_cache_repo
  }
}

# Count-based retention so idle stretches (no MR pipelines for weeks) don't
# evict the cache and force cold builds on resume. Count scales with the
# plugin list (kaniko_cache_per_plugin × len(plugins)) — see locals above.
resource "aws_ecr_lifecycle_policy" "kaniko_cache" {
  repository = aws_ecr_repository.kaniko_cache.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep the last ${local.kaniko_cache_per_plugin} cache entries per plugin (${local.kaniko_cache_image_count} total)"
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = local.kaniko_cache_image_count
        }
        action = { type = "expire" }
      }
    ]
  })
}

# --- SSM: deployed image manifest (written by pipeline before tf:apply) ---
#
# Bootstrap seeds an empty-object placeholder so `terraform plan` doesn't
# error on a missing parameter in accounts that haven't run a CI deploy yet.
# Subsequently overwritten by:
#   - CI's `tf:set-image-tag` job → manifest mapping every plugin's
#     deploy_key to <repo>:$CI_COMMIT_SHORT_SHA.
#   - Local `nx run terraform-deployment:build-and-push-images` → manifest
#     mapping each plugin's deploy_key to its content-hash tag.
# Main TF reads via `data "aws_ssm_parameter"` + `jsondecode()`.
resource "aws_ssm_parameter" "deployed_image_manifest" {
  name        = "/${local.bootstrap_prefix}/${local.environment}/deployed-image-manifest"
  type        = "String"
  value       = "{}"
  description = "JSON map of plugin deploy_key → fully-qualified <repo>:<tag> ECR image URI. Written by tf:set-image-tag (CI) or build-and-push-images.sh (local); seeded here as an empty object."

  # Writers overwrite this; ignore drift so bootstrap re-apply does not
  # stomp on the live value.
  lifecycle {
    ignore_changes = [value]
  }
}

# -----------------------------------------------------------------------------
# Outputs
# -----------------------------------------------------------------------------

output "plugin_ecr_repository_urls" {
  description = "Map of plugin short-name to ECR repository URL"
  value = {
    for name, repo in aws_ecr_repository.plugins : name => repo.repository_url
  }
}

output "plugin_ecr_repository_arns" {
  description = "Map of plugin short-name to ECR repository ARN"
  value = {
    for name, repo in aws_ecr_repository.plugins : name => repo.arn
  }
}

output "kaniko_cache_repository_url" {
  description = "ECR repository URL for the kaniko layer cache"
  value       = aws_ecr_repository.kaniko_cache.repository_url
}
