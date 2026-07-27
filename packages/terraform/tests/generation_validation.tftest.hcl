# Unit Tests - Generation Module Validation
# Tests S3 bucket configuration, Lambda runtimes, Step Functions naming, and variable validation

mock_provider "aws" {}

variables {
  project_name             = "test-etk"
  environment              = "dev"
  region                   = "us-east-1"
  aws_account_id           = "123456789012"
  vpc_id                   = "vpc-12345678"
  subnet_ids               = ["subnet-1", "subnet-2"]
  lambda_security_group_id = "sg-12345678"
  event_bus_arn            = "arn:aws:events:us-east-1:123456789012:event-bus/test"
  event_bus_name           = "test-bus"
  api_targets = {
    private = {
      rest_api_id   = "abc123"
      root_resource = "root123"
      execution_arn = "arn:aws:execute-api:us-east-1:123456789012:abc123"
      is_public     = false
    }
  }
  log_retention_days    = 545
  access_logs_bucket_id = "test-etk-dev-access-logs-123456789012-us-east-1"
}

# =============================================================================
# Variable Validation Tests
# =============================================================================

# Test: Log level rejects invalid value
run "generation_log_level_rejects_invalid" {
  command = plan

  variables {
    log_level = "INVALID"
  }

  module {
    source = "./modules/generation"
  }

  expect_failures = [
    var.log_level,
  ]
}

# Test: Log level accepts valid values
run "generation_log_level_accepts_info" {
  command = plan

  variables {
    log_level = "INFO"
  }

  module {
    source = "./modules/generation"
  }
}

# =============================================================================
# S3 Bucket Configuration Tests
# =============================================================================

# Test: Generation S3 bucket naming
run "generation_s3_bucket_naming" {
  command = plan

  module {
    source = "./modules/generation"
  }

  assert {
    condition     = aws_s3_bucket.generation.bucket == "test-etk-dev-generation-123456789012"
    error_message = "Generation S3 bucket should follow naming convention: {project}-{env}-generation-{account}"
  }
}

# Test: Generation S3 bucket versioning enabled
run "generation_s3_versioning_enabled" {
  command = plan

  module {
    source = "./modules/generation"
  }

  assert {
    condition     = aws_s3_bucket_versioning.generation.versioning_configuration[0].status == "Enabled"
    error_message = "Generation S3 bucket should have versioning enabled"
  }
}

# Test: Generation S3 lifecycle covers all objects with 30-day expiry
run "generation_s3_lifecycle_30_day" {
  command = plan

  module {
    source = "./modules/generation"
  }

  assert {
    condition     = aws_s3_bucket_lifecycle_configuration.generation.rule[0].id == "monthly-delete"
    error_message = "Generation S3 lifecycle rule should be named 'monthly-delete'"
  }

  assert {
    condition     = aws_s3_bucket_lifecycle_configuration.generation.rule[0].expiration[0].days == 30
    error_message = "Generation S3 lifecycle should expire objects after 30 days (CDK SecuredBucket parity)"
  }

  assert {
    condition     = aws_s3_bucket_lifecycle_configuration.generation.rule[0].status == "Enabled"
    error_message = "Generation S3 lifecycle rule should be enabled"
  }
}

# Test: Generation S3 public access blocked
run "generation_s3_public_access_blocked" {
  command = plan

  module {
    source = "./modules/generation"
  }

  assert {
    condition     = aws_s3_bucket_public_access_block.generation.block_public_acls == true
    error_message = "Generation S3 bucket should block public ACLs"
  }

  assert {
    condition     = aws_s3_bucket_public_access_block.generation.block_public_policy == true
    error_message = "Generation S3 bucket should block public policies"
  }

  assert {
    condition     = aws_s3_bucket_public_access_block.generation.restrict_public_buckets == true
    error_message = "Generation S3 bucket should restrict public buckets"
  }
}

# =============================================================================
# Lambda Runtime Tests
# =============================================================================

# Test: Generation Lambda functions use nodejs22.x runtime
run "generation_lambda_runtime_nodejs22" {
  command = plan

  module {
    source = "./modules/generation"
  }

  assert {
    condition     = aws_lambda_function.gen_async_handler.runtime == "nodejs22.x"
    error_message = "Generation asyncHandler should use nodejs22.x runtime"
  }

  assert {
    condition     = aws_lambda_function.gen_await_handler.runtime == "nodejs22.x"
    error_message = "Generation awaitHandler should use nodejs22.x runtime"
  }
}

# =============================================================================
# Step Functions Tests
# =============================================================================

# Test: Generation Step Functions naming
run "generation_sfn_naming" {
  command = plan

  module {
    source = "./modules/generation"
  }

  assert {
    condition     = aws_sfn_state_machine.generation.name == "test-etk-dev-generation"
    error_message = "Generation state machine should follow naming convention: {project}-{env}-generation"
  }
}

# =============================================================================
# CMK Encryption Tests
# =============================================================================

# Test: Generation S3 uses CMK when provided
run "generation_s3_cmk_encryption" {
  command = plan

  variables {
    encryption_key_arn = "arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012"
  }

  module {
    source = "./modules/generation"
  }

  assert {
    condition     = one(aws_s3_bucket_server_side_encryption_configuration.generation.rule[*].apply_server_side_encryption_by_default[0].sse_algorithm) == "aws:kms"
    error_message = "Generation S3 bucket should use aws:kms encryption when CMK is provided"
  }

  assert {
    condition     = one(aws_s3_bucket_server_side_encryption_configuration.generation.rule[*].apply_server_side_encryption_by_default[0].kms_master_key_id) == "arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012"
    error_message = "Generation S3 bucket should use the provided CMK ARN"
  }

  assert {
    condition     = aws_cloudwatch_log_group.generation_sfn.kms_key_id == "arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012"
    error_message = "Generation SFN log group should use CMK when provided"
  }
}

# Test: Generation S3 uses AES256 when no CMK
run "generation_s3_default_encryption" {
  command = plan

  variables {
    encryption_key_arn = null
  }

  module {
    source = "./modules/generation"
  }

  assert {
    condition     = one(aws_s3_bucket_server_side_encryption_configuration.generation.rule[*].apply_server_side_encryption_by_default[0].sse_algorithm) == "AES256"
    error_message = "Generation S3 bucket should use AES256 when no CMK is provided"
  }
}
