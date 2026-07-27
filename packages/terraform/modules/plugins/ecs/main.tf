# ECS Plugin Module - Main Configuration
# Creates ECS task definition, security group, and CloudWatch log group
# Matches CDK patterns from baseEcs.ts and eventDrivenEcs.ts

terraform {
  required_version = ">= 1.9.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# =============================================================================
# Local Values
# =============================================================================

locals {
  # Common naming prefix for resources
  name_prefix = "${var.project_name}-${var.environment}-plugin-${var.plugin_name}"

  # Common tags for all resources
  common_tags = merge(
    var.tags,
    {
      PluginName = var.plugin_name
      PluginType = "ecs"
      Module     = "plugins/ecs"
    }
  )

  # Extract cluster name from ARN for environment variables
  cluster_name = element(split("/", var.cluster_arn), 1)

  # Subnet IDs as comma-separated string for Lambda environment
  subnet_ids_string = join(",", var.subnet_ids)

  # Main plugin container definition
  main_container = {
    name      = var.container_name
    image     = var.image_uri
    essential = true

    environment = concat([
      { name = "PLUGIN_NAME", value = var.plugin_name },
      { name = "EVENT_BUS_ARN", value = var.event_bus_arn },
      { name = "LOG_LEVEL", value = var.log_level }
    ], [for k, v in var.additional_task_environment : { name = k, value = v }])

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.ecs_plugin.name
        "awslogs-region"        = var.region
        "awslogs-stream-prefix" = var.plugin_name
      }
    }
  }

  # OTEL Collector sidecar container definition
  otel_container = {
    name      = "aws-otel-collector"
    image     = var.otel_collector_image
    essential = false

    portMappings = [
      { containerPort = 4317, protocol = "tcp" },
      { containerPort = 4318, protocol = "tcp" }
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.ecs_plugin.name
        "awslogs-region"        = var.region
        "awslogs-stream-prefix" = "otel-collector"
      }
    }

    environment = [
      {
        name = "AOT_CONFIG_CONTENT"
        value = yamlencode({
          receivers = {
            otlp = {
              protocols = {
                grpc = { endpoint = "0.0.0.0:4317" }
                http = { endpoint = "0.0.0.0:4318" }
              }
            }
          }
          exporters = {
            awsxray = {}
          }
          service = {
            pipelines = {
              traces = {
                receivers = ["otlp"]
                exporters = ["awsxray"]
              }
            }
          }
        })
      }
    ]
  }

  # Conditionally include OTEL sidecar
  containers = concat([local.main_container], var.enable_otel_sidecar ? [local.otel_container] : [])
}

# =============================================================================
# Data Sources
# =============================================================================


data "aws_partition" "current" {}

# =============================================================================
# CloudWatch Log Group for ECS Tasks
# =============================================================================

resource "aws_cloudwatch_log_group" "ecs_plugin" {
  name              = "/aws/ecs/${local.name_prefix}"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.encryption_key_arn

  tags = merge(
    local.common_tags,
    {
      Name = "${local.name_prefix}-ecs-logs"
    }
  )
}

# =============================================================================
# Security Group for ECS Tasks
# Egress-only: plugins need outbound access but no inbound
# =============================================================================

resource "aws_security_group" "ecs_plugin" {
  # checkov:skip=CKV_AWS_382: All-egress required for ECS plugin tasks to reach AWS service endpoints (Bedrock, S3, EventBridge) and outbound HTTPS for evaluator backends. Parity with CDK's BaseEcs (allowAllOutbound: true).
  name        = "${local.name_prefix}-ecs-sg"
  description = "Security group for ${var.plugin_name} ECS plugin tasks"
  vpc_id      = var.vpc_id

  # Allow all outbound traffic (plugins need to call AWS services, EventBridge, etc.)
  egress {
    description = "Allow all outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # No inbound rules - plugins are event-driven, not accepting connections

  tags = merge(
    local.common_tags,
    {
      Name = "${local.name_prefix}-ecs-sg"
    }
  )

  lifecycle {
    create_before_destroy = true
  }
}

# =============================================================================
# ECS Task Definition
# Fargate task with awsvpc network mode
# Matches CDK FargateTaskDefinition from baseEcs.ts
# =============================================================================

resource "aws_ecs_task_definition" "plugin" {
  family                   = local.name_prefix
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = tostring(var.cpu)
  memory                   = tostring(var.memory)
  execution_role_arn       = var.execution_role_arn
  task_role_arn            = var.task_role_arn

  # Runtime platform - X86_64 Linux (matches CDK)
  runtime_platform {
    cpu_architecture        = "X86_64"
    operating_system_family = "LINUX"
  }

  container_definitions = jsonencode(local.containers)

  tags = merge(
    local.common_tags,
    {
      Name = "${local.name_prefix}-task-definition"
    }
  )

  depends_on = [
    aws_cloudwatch_log_group.ecs_plugin
  ]
}
