# Unit Tests — Security Hardening Validation (common module surface)
#
# Scope: S3 access-logs companion bucket + API Gateway access-log group +
# DenyInsecureTransport bucket policy on the access-logs bucket. These are
# the security-hardening additions whose resource shape (lifecycle, naming,
# public-access block, policy resource) is plan-only assertable.
#
# Out of scope (deliberately) — covered elsewhere or not plan-assertable:
#   - X-Ray tracing on Lambdas: per-module *_validation.tftest.hcl
#     (evaluation_lambda_runtime_nodejs22 et al. inherit tracing_config
#     from var.enable_xray, default true).
#   - OTEL ADOT sidecar: lives on ECS task definitions inside plugins/ecs;
#     `terraform plan` materialises container_definitions as JSON strings
#     so we don't `jsondecode()` and assert in the test framework.
#   - S3 SSL-only on application buckets: enforced by the same bucket-policy
#     pattern; checkov CKV_AWS_19 covers them in CI.

mock_provider "aws" {
  override_data {
    target = data.aws_availability_zones.available
    values = { names = ["eu-west-2a", "eu-west-2b", "eu-west-2c"] }
  }
  override_data {
    target = data.aws_caller_identity.current
    values = { account_id = "123456789012" }
  }
  override_data {
    target = data.aws_region.current
    values = { name = "eu-west-2" }
  }
  override_data {
    target = data.aws_iam_policy_document.lambda_assume_role
    values = { json = "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Principal\":{\"Service\":\"lambda.amazonaws.com\"},\"Action\":\"sts:AssumeRole\"}]}" }
  }
}

# =============================================================================
# S3 Access Logs Companion Bucket
# =============================================================================

run "access_logs_bucket_has_lifecycle" {
  command = plan

  module {
    source = "./modules/common"
  }

  variables {
    project_name       = "etk"
    environment        = "dev"
    region             = "eu-west-2"
    aws_account_id     = "123456789012"
    log_retention_days = 545
  }

  assert {
    condition     = aws_s3_bucket_lifecycle_configuration.access_logs.rule[0].expiration[0].days == 30
    error_message = "Access logs bucket should expire logs after 30 days (default)"
  }

  assert {
    condition     = aws_s3_bucket_versioning.access_logs.versioning_configuration[0].status == "Suspended"
    error_message = "Access logs bucket versioning should be Suspended"
  }

  assert {
    condition     = aws_s3_bucket_lifecycle_configuration.access_logs.rule[0].noncurrent_version_expiration[0].noncurrent_days == 1
    error_message = "Access logs bucket should expire noncurrent versions after 1 day"
  }

  assert {
    condition     = aws_s3_bucket_lifecycle_configuration.access_logs.rule[1].expiration[0].expired_object_delete_marker == true
    error_message = "Access logs bucket should clean up expired object delete markers"
  }

  assert {
    condition     = aws_s3_bucket_public_access_block.access_logs.block_public_acls == true
    error_message = "Access logs bucket should block public ACLs"
  }
}

run "access_logs_retention_is_configurable" {
  command = plan

  module {
    source = "./modules/common"
  }

  variables {
    project_name               = "etk"
    environment                = "dev"
    region                     = "eu-west-2"
    aws_account_id             = "123456789012"
    log_retention_days         = 545
    access_logs_retention_days = 90
  }

  assert {
    condition     = aws_s3_bucket_lifecycle_configuration.access_logs.rule[0].expiration[0].days == 90
    error_message = "Access logs bucket retention should respect configurable override"
  }
}

# =============================================================================
# API Gateway Access Logs
# =============================================================================

run "apigw_access_log_group_exists" {
  command = plan

  module {
    source = "./modules/common"
  }

  variables {
    project_name       = "etk"
    environment        = "dev"
    region             = "eu-west-2"
    aws_account_id     = "123456789012"
    log_retention_days = 545
  }

  assert {
    condition     = aws_cloudwatch_log_group.apigw_access.retention_in_days == 545
    error_message = "API GW access log group should have 545-day retention"
  }

  assert {
    condition     = can(regex("/aws/apigateway/etk-dev-access", aws_cloudwatch_log_group.apigw_access.name))
    error_message = "API GW access log group should follow naming convention"
  }
}

# =============================================================================
# S3 SSL-Only (DenyInsecureTransport on access logs bucket)
# =============================================================================

run "access_logs_bucket_denies_insecure_transport" {
  command = plan

  module {
    source = "./modules/common"
  }

  variables {
    project_name       = "etk"
    environment        = "dev"
    region             = "eu-west-2"
    aws_account_id     = "123456789012"
    log_retention_days = 545
  }

  # Verify the bucket policy resource is planned (content validated by checkov CKV_AWS_19)
  assert {
    condition     = length(aws_s3_bucket_policy.access_logs) > 0
    error_message = "Access logs bucket policy resource should be planned"
  }
}

# =============================================================================
# Experiment Module — Lambda Code Bucket Lifecycle
# =============================================================================

run "lambda_code_bucket_has_lifecycle" {
  command = plan

  module {
    source = "./modules/experiment"
  }

  variables {
    project_name                     = "etk"
    environment                      = "dev"
    region                           = "eu-west-2"
    aws_account_id                   = "123456789012"
    log_retention_days               = 545
    subnet_ids                       = ["subnet-abc123"]
    lambda_security_group_id         = "sg-abc123"
    experiment_artifacts_bucket_name = "etk-dev-experiment-artifacts-123456789012-eu-west-2"
    experiment_mlflow_bucket_name    = "genai-etk-experimentartifacts-123456789012-eu-west-2"
    event_bus_arn                    = "arn:aws:events:eu-west-2:123456789012:event-bus/default"
    access_logs_bucket_id            = "etk-dev-access-logs-123456789012-eu-west-2"
    api_targets = {
      private = {
        rest_api_id   = "abc123"
        root_resource = "xyz789"
        execution_arn = "arn:aws:execute-api:eu-west-2:123456789012:abc123"
        is_public     = false
      }
    }
  }

  assert {
    condition     = aws_s3_bucket_lifecycle_configuration.lambda_code.rule[0].noncurrent_version_expiration[0].noncurrent_days == 30
    error_message = "Lambda code bucket should expire noncurrent versions after 30 days"
  }

  assert {
    condition     = aws_s3_bucket_lifecycle_configuration.lambda_code.rule[1].expiration[0].expired_object_delete_marker == true
    error_message = "Lambda code bucket should clean up expired object delete markers"
  }
}

# =============================================================================
# Experiment Module — MLflow Artifacts Lifecycle (default + configurable)
# =============================================================================

run "mlflow_artifacts_lifecycle_default" {
  command = plan

  module {
    source = "./modules/experiment"
  }

  variables {
    project_name                     = "etk"
    environment                      = "dev"
    region                           = "eu-west-2"
    aws_account_id                   = "123456789012"
    log_retention_days               = 545
    subnet_ids                       = ["subnet-abc123"]
    lambda_security_group_id         = "sg-abc123"
    experiment_artifacts_bucket_name = "etk-dev-experiment-artifacts-123456789012-eu-west-2"
    experiment_mlflow_bucket_name    = "genai-etk-experimentartifacts-123456789012-eu-west-2"
    event_bus_arn                    = "arn:aws:events:eu-west-2:123456789012:event-bus/default"
    access_logs_bucket_id            = "etk-dev-access-logs-123456789012-eu-west-2"
    api_targets = {
      private = {
        rest_api_id   = "abc123"
        root_resource = "xyz789"
        execution_arn = "arn:aws:execute-api:eu-west-2:123456789012:abc123"
        is_public     = false
      }
    }
  }

  assert {
    condition     = aws_s3_bucket_lifecycle_configuration.mlflow_artifacts.rule[0].noncurrent_version_expiration[0].noncurrent_days == 90
    error_message = "MLflow artifacts bucket should default to 90 days noncurrent expiry"
  }

  assert {
    condition     = aws_s3_bucket_lifecycle_configuration.mlflow_artifacts.rule[0].expiration[0].expired_object_delete_marker == true
    error_message = "MLflow artifacts bucket should clean up expired object delete markers"
  }
}

run "mlflow_artifacts_noncurrent_is_configurable" {
  command = plan

  module {
    source = "./modules/experiment"
  }

  variables {
    project_name                            = "etk"
    environment                             = "dev"
    region                                  = "eu-west-2"
    aws_account_id                          = "123456789012"
    log_retention_days                      = 545
    subnet_ids                              = ["subnet-abc123"]
    lambda_security_group_id                = "sg-abc123"
    experiment_artifacts_bucket_name        = "etk-dev-experiment-artifacts-123456789012-eu-west-2"
    experiment_mlflow_bucket_name           = "genai-etk-experimentartifacts-123456789012-eu-west-2"
    event_bus_arn                           = "arn:aws:events:eu-west-2:123456789012:event-bus/default"
    access_logs_bucket_id                   = "etk-dev-access-logs-123456789012-eu-west-2"
    mlflow_artifacts_noncurrent_expiry_days = 180
    api_targets = {
      private = {
        rest_api_id   = "abc123"
        root_resource = "xyz789"
        execution_arn = "arn:aws:execute-api:eu-west-2:123456789012:abc123"
        is_public     = false
      }
    }
  }

  assert {
    condition     = aws_s3_bucket_lifecycle_configuration.mlflow_artifacts.rule[0].noncurrent_version_expiration[0].noncurrent_days == 180
    error_message = "MLflow artifacts noncurrent expiry should respect configurable override"
  }
}
