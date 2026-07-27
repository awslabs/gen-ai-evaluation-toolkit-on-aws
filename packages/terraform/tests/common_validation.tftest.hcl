# Unit Tests - Common Module Variable Validations

mock_provider "aws" {
  override_data {
    target = data.aws_availability_zones.available
    values = {
      names = ["us-east-1a", "us-east-1b", "us-east-1c"]
    }
  }
}

variables {
  project_name       = "test-etk"
  environment        = "dev"
  region             = "us-east-1"
  aws_account_id     = "123456789012"
  log_retention_days = 545
}

# Test: Environment validation rejects invalid value
run "environment_rejects_invalid" {
  command = plan

  variables {
    environment = "invalid"
  }

  module {
    source = "./modules/common"
  }

  expect_failures = [
    var.environment,
  ]
}

# Test: Environment accepts dev and propagates to resource names
run "environment_accepts_dev" {
  command = plan

  variables {
    environment = "dev"
  }

  module {
    source = "./modules/common"
  }

  assert {
    condition     = aws_cloudwatch_event_bus.main.name == "test-etk-dev-eventbus"
    error_message = "EventBridge bus name should contain 'dev' environment"
  }
}

# Test: Environment accepts staging and propagates to resource names
run "environment_accepts_staging" {
  command = plan

  variables {
    environment = "staging"
  }

  module {
    source = "./modules/common"
  }

  assert {
    condition     = aws_cloudwatch_event_bus.main.name == "test-etk-staging-eventbus"
    error_message = "EventBridge bus name should contain 'staging' environment"
  }
}

# Test: Environment accepts prod and propagates to resource names
run "environment_accepts_prod" {
  command = plan

  variables {
    environment = "prod"
  }

  module {
    source = "./modules/common"
  }

  assert {
    condition     = aws_cloudwatch_event_bus.main.name == "test-etk-prod-eventbus"
    error_message = "EventBridge bus name should contain 'prod' environment"
  }
}

# Test: EventBridge custom bus is created
run "eventbridge_custom_bus_created" {
  command = plan

  module {
    source = "./modules/common"
  }

  assert {
    condition     = aws_cloudwatch_event_bus.main.name == "test-etk-dev-eventbus"
    error_message = "Custom EventBridge bus should be created with correct name"
  }
}

# Test: Scheduler group is created
run "scheduler_group_created" {
  command = plan

  module {
    source = "./modules/common"
  }

  assert {
    condition     = aws_scheduler_schedule_group.evaluation_jobs.name == "GenAiEtkEvaluationJobSchedulerGroup"
    error_message = "Scheduler group should be created with correct name"
  }
}

# =============================================================================
# Isolated (airgapped) networking — for agent-as-judge (CDK vpc.ts parity)
# =============================================================================

# Test: secondary CIDR + one isolated /20 subnet per AZ are created
run "isolated_subnets_created" {
  command = plan

  module {
    source = "./modules/common"
  }

  # Mock returns 3 AZs and the module slices to all 3 (matching CDK maxAzs: 3
  # and the public/private subnet allocation).
  assert {
    condition     = length(aws_subnet.isolated) == 3
    error_message = "One isolated subnet should be created per selected AZ (3)"
  }

  assert {
    condition     = aws_vpc_ipv4_cidr_block_association.secondary[0].cidr_block == "10.1.0.0/16"
    error_message = "Secondary CIDR 10.1.0.0/16 should be attached to the VPC"
  }

  assert {
    condition     = aws_subnet.isolated[0].cidr_block == "10.1.0.0/20"
    error_message = "First isolated subnet should be 10.1.0.0/20"
  }

  assert {
    condition     = aws_subnet.isolated[1].cidr_block == "10.1.16.0/20"
    error_message = "Second isolated subnet should be 10.1.16.0/20"
  }

  assert {
    condition     = aws_subnet.isolated[0].map_public_ip_on_launch == false
    error_message = "Isolated subnets must not auto-assign public IPs"
  }
}

# Test: the isolated route table exists with no NAT/IGW wiring and the isolated
# subnets are associated with it (route set is computed at apply, so we assert
# on the route table + associations rather than the unknown route block).
run "isolated_route_table_has_no_internet_route" {
  command = plan

  module {
    source = "./modules/common"
  }

  assert {
    condition     = length(aws_route_table.isolated) == 1
    error_message = "A single isolated route table should be created"
  }

  assert {
    condition     = length(aws_route_table_association.isolated) == 3
    error_message = "Each isolated subnet should be associated with the isolated route table"
  }
}

# Test: required interface VPC endpoints are created (incl. Bedrock + Events + execute-api)
run "interface_vpc_endpoints_created" {
  command = plan

  module {
    source = "./modules/common"
  }

  assert {
    condition     = length(aws_vpc_endpoint.interface) == 5
    error_message = "Five interface VPC endpoints should be created"
  }

  assert {
    condition     = !contains(keys(aws_vpc_endpoint.interface), "ecr_api") && !contains(keys(aws_vpc_endpoint.interface), "ecr_dkr")
    error_message = "No ECR interface endpoints should be created (agent-as-judge is Lambda-based and pulls no container images)"
  }

  assert {
    condition     = aws_vpc_endpoint.interface["bedrock_runtime"].service_name == "com.amazonaws.us-east-1.bedrock-runtime"
    error_message = "Bedrock-Runtime interface endpoint must be created (required by agent-as-judge)"
  }

  assert {
    condition     = aws_vpc_endpoint.interface["events"].service_name == "com.amazonaws.us-east-1.events"
    error_message = "EventBridge interface endpoint must be created (required by agent-as-judge)"
  }

  assert {
    condition     = aws_vpc_endpoint.interface["execute_api"].private_dns_enabled == true
    error_message = "execute-api endpoint must have private DNS ENABLED (private REST API resolves in-VPC via the endpoint, matching CDK)"
  }

  assert {
    condition     = aws_vpc_endpoint.interface["events"].private_dns_enabled == true
    error_message = "events endpoint must have private DNS ENABLED (matches CDK vpc.ts privateDnsEnabled: true on all interface endpoints)"
  }

  assert {
    condition     = aws_vpc_endpoint.interface["bedrock_runtime"].private_dns_enabled == true
    error_message = "AWS-service interface endpoints (bedrock-runtime) must keep private DNS enabled"
  }
}

# Test: VPC flow logs are on by default (CDK parity — always-on)
run "flow_logs_enabled_by_default" {
  command = plan

  module {
    source = "./modules/common"
  }

  assert {
    condition     = length(aws_flow_log.main) == 1
    error_message = "VPC flow logs should be enabled by default"
  }

  assert {
    condition     = aws_cloudwatch_log_group.vpc_flow_logs[0].retention_in_days == 365
    error_message = "VPC flow log group should retain 365 days (CDK RetentionDays.ONE_YEAR parity)"
  }
}
