# Unit Tests - CMK (Customer Managed Key) Encryption Validation

mock_provider "aws" {
  override_data {
    target = data.aws_availability_zones.available
    values = {
      names = ["us-east-1a", "us-east-1b", "us-east-1c"]
    }
  }

  override_data {
    target = data.aws_vpc.existing
    values = {
      id         = "vpc-12345678"
      cidr_block = "10.0.0.0/16"
    }
  }
}

# Shared defaults — each run may override specific vars.
variables {
  log_retention_days = 545
  aws_account_id     = "123456789012"
}

# Test: Default uses AWS-managed keys (encryption_key_arn = null)
run "default_uses_aws_managed_keys" {
  command = plan

  variables {
    project_name       = "test-etk"
    environment        = "dev"
    region             = "us-east-1"
    encryption_key_arn = null
  }

  module {
    source = "./modules/common"
  }

  # CloudWatch log group should not have kms_key_id when using AWS-managed keys
  assert {
    condition     = aws_cloudwatch_log_group.api_gateway.kms_key_id == null
    error_message = "CloudWatch log group should use AWS-managed keys when encryption_key_arn is null"
  }
}

# Test: CMK encryption applied when provided
run "cmk_encryption_applied" {
  command = plan

  variables {
    project_name       = "test-etk"
    environment        = "dev"
    region             = "us-east-1"
    encryption_key_arn = "arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012"
  }

  module {
    source = "./modules/common"
  }

  # CloudWatch log group should have kms_key_id when using CMK
  assert {
    condition     = aws_cloudwatch_log_group.api_gateway.kms_key_id == "arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012"
    error_message = "CloudWatch log group should use CMK when encryption_key_arn is provided"
  }
}

# Test: CMK with existing VPC mode
run "cmk_with_existing_vpc" {
  command = plan

  variables {
    project_name                    = "test-etk"
    environment                     = "dev"
    region                          = "us-east-1"
    use_existing_vpc                = true
    existing_vpc_id                 = "vpc-12345678"
    existing_private_subnet_ids     = ["subnet-priv1", "subnet-priv2"]
    existing_public_subnet_ids      = ["subnet-pub1", "subnet-pub2"]
    existing_isolated_subnet_ids    = ["subnet-iso1", "subnet-iso2"]
    existing_api_gw_vpc_endpoint_id = "vpce-0existing123"
    encryption_key_arn              = "arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012"
  }

  module {
    source = "./modules/common"
  }

  # VPC should not be created
  assert {
    condition     = length(aws_vpc.main) == 0
    error_message = "VPC should not be created when use_existing_vpc is true"
  }

  # CloudWatch log group should use CMK
  assert {
    condition     = aws_cloudwatch_log_group.api_gateway.kms_key_id == "arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012"
    error_message = "CloudWatch log group should use CMK when encryption_key_arn is provided"
  }
}

# Test: EventBus DLQ uses CMK when provided
run "eventbus_dlq_uses_cmk" {
  command = plan

  variables {
    project_name       = "test-etk"
    environment        = "dev"
    region             = "us-east-1"
    encryption_key_arn = "arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012"
  }

  module {
    source = "./modules/common"
  }

  # EventBus DLQ should use CMK
  assert {
    condition     = aws_sqs_queue.eventbus_dlq.kms_master_key_id == "arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012"
    error_message = "EventBus DLQ should use CMK when encryption_key_arn is provided"
  }
}

# Test: EventBus DLQ uses AWS managed key when no CMK
run "eventbus_dlq_uses_aws_managed_key" {
  command = plan

  variables {
    project_name       = "test-etk"
    environment        = "dev"
    region             = "us-east-1"
    encryption_key_arn = null
  }

  module {
    source = "./modules/common"
  }

  # EventBus DLQ should use AWS managed SQS key
  assert {
    condition     = aws_sqs_queue.eventbus_dlq.kms_master_key_id == "alias/aws/sqs"
    error_message = "EventBus DLQ should use AWS managed key (alias/aws/sqs) when encryption_key_arn is null"
  }
}
