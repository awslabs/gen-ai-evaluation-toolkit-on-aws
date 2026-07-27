# Unit Tests - existing VPC (Bring Your Own VPC) Feature Validation

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

# Test: Default creates new VPC (use_existing_vpc = false)
run "default_creates_new_vpc" {
  command = plan

  variables {
    project_name     = "test-etk"
    environment      = "dev"
    region           = "us-east-1"
    use_existing_vpc = false
  }

  module {
    source = "./modules/common"
  }

  assert {
    condition     = length(aws_vpc.main) == 1
    error_message = "VPC should be created when use_existing_vpc is false"
  }

  assert {
    condition     = length(aws_subnet.private) > 0
    error_message = "Private subnets should be created when use_existing_vpc is false"
  }

  assert {
    condition     = length(aws_subnet.public) > 0
    error_message = "Public subnets should be created when use_existing_vpc is false"
  }
}

# Test: existing VPC mode skips VPC creation
run "existing_vpc_skips_vpc_creation" {
  command = plan

  variables {
    project_name                    = "test-etk"
    environment                     = "dev"
    region                          = "us-east-1"
    use_existing_vpc                = true
    existing_vpc_id                 = "vpc-12345678"
    existing_private_subnet_ids     = ["subnet-priv1", "subnet-priv2"]
    existing_isolated_subnet_ids    = ["subnet-iso1", "subnet-iso2"]
    existing_public_subnet_ids      = ["subnet-pub1", "subnet-pub2"]
    existing_api_gw_vpc_endpoint_id = "vpce-0existing123"
  }

  module {
    source = "./modules/common"
  }

  assert {
    condition     = length(aws_vpc.main) == 0
    error_message = "VPC should not be created when use_existing_vpc is true"
  }

  assert {
    condition     = length(aws_subnet.private) == 0
    error_message = "Private subnets should not be created when using existing VPC"
  }

  assert {
    condition     = length(aws_subnet.public) == 0
    error_message = "Public subnets should not be created when using existing VPC"
  }
}

# Test: existing VPC binds the private REST API to the caller-supplied execute-api
# VPC endpoint. Regression test: the endpoint id must be forwarded end-to-end,
# otherwise the private API is created with vpc_endpoint_ids = [null].
run "existing_vpc_forwards_api_gw_vpc_endpoint" {
  command = plan

  variables {
    project_name                    = "test-etk"
    environment                     = "dev"
    region                          = "us-east-1"
    use_existing_vpc                = true
    existing_vpc_id                 = "vpc-12345678"
    existing_private_subnet_ids     = ["subnet-priv1", "subnet-priv2"]
    existing_isolated_subnet_ids    = ["subnet-iso1", "subnet-iso2"]
    existing_api_gw_vpc_endpoint_id = "vpce-0existing123"
  }

  module {
    source = "./modules/common"
  }

  assert {
    condition     = local.apigw_vpc_endpoint_id == "vpce-0existing123"
    error_message = "apigw_vpc_endpoint_id should resolve to the supplied existing_api_gw_vpc_endpoint_id when using an existing VPC"
  }

  assert {
    condition     = contains(tolist(aws_api_gateway_rest_api.main.endpoint_configuration[0].vpc_endpoint_ids), "vpce-0existing123")
    error_message = "Private REST API should bind to the supplied execute-api VPC endpoint when using an existing VPC"
  }
}

# Test: existing VPC with custom Lambda security group
run "existing_vpc_with_custom_lambda_sg" {
  command = plan

  variables {
    project_name                    = "test-etk"
    environment                     = "dev"
    region                          = "us-east-1"
    use_existing_vpc                = true
    existing_vpc_id                 = "vpc-12345678"
    existing_private_subnet_ids     = ["subnet-priv1", "subnet-priv2"]
    existing_isolated_subnet_ids    = ["subnet-iso1", "subnet-iso2"]
    existing_api_gw_vpc_endpoint_id = "vpce-0existing123"
    existing_security_group_ids = {
      lambda = "sg-lambda123"
    }
  }

  module {
    source = "./modules/common"
  }

  assert {
    condition     = length(aws_security_group.lambda) == 0
    error_message = "Lambda SG should not be created when provided via existing_security_group_ids"
  }
}

# Test: existing VPC with custom ECS security group
run "existing_vpc_with_custom_ecs_sg" {
  command = plan

  variables {
    project_name                    = "test-etk"
    environment                     = "dev"
    region                          = "us-east-1"
    use_existing_vpc                = true
    existing_vpc_id                 = "vpc-12345678"
    existing_private_subnet_ids     = ["subnet-priv1", "subnet-priv2"]
    existing_isolated_subnet_ids    = ["subnet-iso1", "subnet-iso2"]
    existing_api_gw_vpc_endpoint_id = "vpce-0existing123"
    existing_security_group_ids = {
      ecs = "sg-ecs456"
    }
  }

  module {
    source = "./modules/common"
  }

  assert {
    condition     = length(aws_security_group.ecs) == 0
    error_message = "ECS SG should not be created when provided via existing_security_group_ids"
  }
}

# Test: existing VPC creates security groups when not provided
run "existing_vpc_creates_sgs_when_not_provided" {
  command = plan

  variables {
    project_name                    = "test-etk"
    environment                     = "dev"
    region                          = "us-east-1"
    use_existing_vpc                = true
    existing_vpc_id                 = "vpc-12345678"
    existing_private_subnet_ids     = ["subnet-priv1", "subnet-priv2"]
    existing_isolated_subnet_ids    = ["subnet-iso1", "subnet-iso2"]
    existing_api_gw_vpc_endpoint_id = "vpce-0existing123"
    existing_security_group_ids     = {}
  }

  module {
    source = "./modules/common"
  }

  assert {
    condition     = length(aws_security_group.lambda) == 1
    error_message = "Lambda SG should be created when not provided via existing_security_group_ids"
  }

  assert {
    condition     = length(aws_security_group.ecs) == 1
    error_message = "ECS SG should be created when not provided via existing_security_group_ids"
  }
}

# Test: existing VPC skips VPC endpoints (existing VPC must have NAT or its own endpoints)
run "existing_vpc_skips_vpc_endpoints" {
  command = plan

  variables {
    project_name                    = "test-etk"
    environment                     = "dev"
    region                          = "us-east-1"
    use_existing_vpc                = true
    existing_vpc_id                 = "vpc-12345678"
    existing_private_subnet_ids     = ["subnet-priv1", "subnet-priv2"]
    existing_isolated_subnet_ids    = ["subnet-iso1", "subnet-iso2"]
    existing_api_gw_vpc_endpoint_id = "vpce-0existing123"
    enable_vpc_endpoints            = true
  }

  module {
    source = "./modules/common"
  }

  # VPC endpoints should NOT be created in existing VPC mode
  assert {
    condition     = length(aws_vpc_endpoint.s3) == 0
    error_message = "S3 VPC endpoint should not be created when using existing VPC"
  }

  assert {
    condition     = length(aws_vpc_endpoint.dynamodb) == 0
    error_message = "DynamoDB VPC endpoint should not be created when using existing VPC"
  }
}

# Test: existing VPC requires at least 2 isolated subnets (agent-as-judge is always
# deployed and must run in airgapped subnets).
run "existing_vpc_requires_isolated_subnets" {
  command = plan

  variables {
    project_name                    = "test-etk"
    environment                     = "dev"
    region                          = "us-east-1"
    use_existing_vpc                = true
    existing_vpc_id                 = "vpc-12345678"
    existing_private_subnet_ids     = ["subnet-priv1", "subnet-priv2"]
    existing_isolated_subnet_ids    = []
    existing_api_gw_vpc_endpoint_id = "vpce-0existing123"
  }

  module {
    source = "./modules/common"
  }

  expect_failures = [
    var.existing_isolated_subnet_ids,
  ]
}

# Test: existing VPC requires an existing execute-api VPC endpoint id — without it
# the private REST API would be created with vpc_endpoint_ids = [null].
run "existing_vpc_requires_api_gw_vpc_endpoint" {
  command = plan

  variables {
    project_name                    = "test-etk"
    environment                     = "dev"
    region                          = "us-east-1"
    use_existing_vpc                = true
    existing_vpc_id                 = "vpc-12345678"
    existing_private_subnet_ids     = ["subnet-priv1", "subnet-priv2"]
    existing_isolated_subnet_ids    = ["subnet-iso1", "subnet-iso2"]
    existing_api_gw_vpc_endpoint_id = null
  }

  module {
    source = "./modules/common"
  }

  expect_failures = [
    var.existing_api_gw_vpc_endpoint_id,
  ]
}
