# Security Groups for ETK
# Supports both creating new security groups or using existing ones (BYOVPC)

# =============================================================================
# Local Variables for Security Group Abstraction
# =============================================================================
locals {
  # Determine if we should create security groups
  create_lambda_sg = var.existing_security_group_ids.lambda == null
  create_ecs_sg    = var.existing_security_group_ids.ecs == null

  # Security Group IDs - use existing or created
  lambda_security_group_id = var.existing_security_group_ids.lambda != null ? var.existing_security_group_ids.lambda : aws_security_group.lambda[0].id
  ecs_security_group_id    = var.existing_security_group_ids.ecs != null ? var.existing_security_group_ids.ecs : aws_security_group.ecs[0].id
}

# Lambda Security Group (only created when not using existing)
resource "aws_security_group" "lambda" {
  # checkov:skip=CKV_AWS_382: All-egress required for VPC-attached Lambdas to reach AWS service endpoints (DynamoDB, S3, KMS, Bedrock, etc.) when no per-service VPC endpoints are deployed. Parity with CDK's BaseEcs/SecuredNodejsFunction (allowAllOutbound: true). BYOVPC customers can supply their own SG via lambda_security_group_id.
  # checkov:skip=CKV2_AWS_5: False positive — this SG is referenced by Lambda functions via `vpc_config { security_group_ids = [var.lambda_security_group_id] }` interpolated from a parent module's locals.lambda_security_group_id. Checkov's static graph does not follow variable boundaries between modules and reports it as unattached.
  count = local.create_lambda_sg ? 1 : 0

  name        = "${var.project_name}-${var.environment}-lambda-sg"
  description = "Security group for Lambda functions"
  vpc_id      = local.vpc_id

  egress {
    description = "Allow all outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-lambda-sg"
  }
}

# ECS Security Group (only created when not using existing)
resource "aws_security_group" "ecs" {
  # checkov:skip=CKV_AWS_382: All-egress required for ECS tasks to reach AWS service endpoints (S3, ECR, EventBridge, etc.) and for ragas/llm-as-judge plugins to reach Bedrock. Parity with CDK's BaseEcs (allowAllOutbound: true).
  # checkov:skip=CKV2_AWS_5: False positive — this SG is referenced by ECS task definitions via `network_configuration { security_groups = [var.ecs_security_group_id] }` interpolated from a parent module's locals.ecs_security_group_id. Checkov's static graph does not follow variable boundaries between modules.
  count = local.create_ecs_sg ? 1 : 0

  name        = "${var.project_name}-${var.environment}-ecs-sg"
  description = "Security group for ECS tasks"
  vpc_id      = local.vpc_id

  egress {
    description = "Allow all outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-ecs-sg"
  }
}

# API Gateway VPC Endpoint Security Group (if private endpoints enabled)
resource "aws_security_group" "api_gateway_vpc_endpoint" {
  # checkov:skip=CKV_AWS_382: All-egress required so the API Gateway VPC endpoint can reach AWS service endpoints. Parity with CDK's BaseEcs/SecuredNodejsFunction (allowAllOutbound: true). Ingress is already locked down to HTTPS from the VPC CIDR; egress is the cross-cutting hardening follow-up tracked across both deployment paths.
  # checkov:skip=CKV2_AWS_5: False positive — this SG is attached to the aws_vpc_endpoint API Gateway interface endpoint via the security_group_ids argument in the parent module. Checkov's static graph does not follow that cross-module reference.
  count = var.enable_private_api_endpoints ? 1 : 0

  name        = "${var.project_name}-${var.environment}-apigw-vpce-sg"
  description = "Security group for API Gateway VPC endpoint"
  vpc_id      = local.vpc_id

  ingress {
    description = "Allow HTTPS from VPC"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [local.vpc_cidr]
  }

  egress {
    description = "Allow all outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-apigw-vpce-sg"
  }
}

# Allow Lambda to communicate with ECS (only when both SGs are created by us)
resource "aws_security_group_rule" "lambda_to_ecs" {
  count = local.create_lambda_sg && local.create_ecs_sg ? 1 : 0

  type                     = "ingress"
  from_port                = 0
  to_port                  = 65535
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.lambda[0].id
  security_group_id        = aws_security_group.ecs[0].id
  description              = "Allow Lambda to communicate with ECS tasks"
}

# Allow ECS to communicate with Lambda (only when both SGs are created by us)
resource "aws_security_group_rule" "ecs_to_lambda" {
  count = local.create_lambda_sg && local.create_ecs_sg ? 1 : 0

  type                     = "ingress"
  from_port                = 0
  to_port                  = 65535
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.ecs[0].id
  security_group_id        = aws_security_group.lambda[0].id
  description              = "Allow ECS tasks to communicate with Lambda"
}
