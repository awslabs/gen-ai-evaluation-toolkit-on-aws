# IAM Configuration for ECS Plugin Trigger Lambda
# Provides permissions for Lambda to run ECS tasks and pass roles
# Matches CDK IAM policies from eventDrivenEcs.ts

# =============================================================================
# Trigger Lambda IAM Role
# =============================================================================

resource "aws_iam_role" "trigger_lambda" {
  name = "${local.name_prefix}-trigger-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })

  tags = merge(
    local.common_tags,
    {
      Name = "${local.name_prefix}-trigger-role"
    }
  )
}

# =============================================================================
# ECS RunTask Permission
# Allows Lambda to start ECS tasks
# =============================================================================

resource "aws_iam_role_policy" "trigger_lambda_ecs" {
  name = "${local.name_prefix}-ecs-runtask"
  role = aws_iam_role.trigger_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ecs:RunTask",
          "ecs:DescribeTasks"
        ]
        Resource = aws_ecs_task_definition.plugin.arn
        Condition = {
          ArnEquals = {
            "ecs:cluster" = var.cluster_arn
          }
        }
      }
    ]
  })
}

# =============================================================================
# IAM PassRole Permission
# Allows Lambda to pass task and execution roles to ECS
# =============================================================================

resource "aws_iam_role_policy" "trigger_lambda_pass_role" {
  name = "${local.name_prefix}-pass-role"
  role = aws_iam_role.trigger_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "iam:PassRole"
        ]
        Resource = [
          var.task_role_arn,
          var.execution_role_arn
        ]
        Condition = {
          StringEquals = {
            "iam:PassedToService" = "ecs-tasks.amazonaws.com"
          }
        }
      }
    ]
  })
}

# =============================================================================
# CloudWatch Logs Permission
# Allows Lambda to write logs
# =============================================================================

resource "aws_iam_role_policy" "trigger_lambda_logs" {
  name = "${local.name_prefix}-logs"
  role = aws_iam_role.trigger_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "${aws_cloudwatch_log_group.trigger_lambda.arn}:*"
      }
    ]
  })
}

# =============================================================================
# VPC Permissions (Conditional)
# Required if Lambda is deployed in VPC
# =============================================================================

resource "aws_iam_role_policy" "trigger_lambda_vpc" {
  # checkov:skip=CKV_AWS_290: EC2 ENI actions (CreateNetworkInterface/DescribeNetworkInterfaces/DeleteNetworkInterface/Assign*PrivateIpAddresses) are required by the Lambda VPC integration and do not meaningfully support resource-level permissions in this context — the ENI doesn't exist until the action runs. Parity with the AWS-managed AWSLambdaVPCAccessExecutionRole policy and CDK's lambda.VpcConfig auto-grant.
  # checkov:skip=CKV_AWS_355: Same rationale as CKV_AWS_290 above — EC2 ENI lifecycle actions are unrestrictable.
  # Gate purely on the static `trigger_lambda_vpc_config` bool. The
  # `&& var.lambda_security_group_id != null` half-check failed
  # `terraform plan` on fresh state because the SG id is computed from
  # an `aws_security_group` in the parent module — not knowable at
  # plan time. The policy body references no SG attributes, only static
  # EC2 ENI actions on `*`, so dropping the SG-id guard is safe; if the
  # caller misconfigures (sets vpc_config = true but no SG), the lambda
  # itself will fail to deploy with a clear error.
  count = var.trigger_lambda_vpc_config ? 1 : 0

  name = "${local.name_prefix}-vpc"
  role = aws_iam_role.trigger_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ec2:CreateNetworkInterface",
          "ec2:DescribeNetworkInterfaces",
          "ec2:DeleteNetworkInterface",
          "ec2:AssignPrivateIpAddresses",
          "ec2:UnassignPrivateIpAddresses"
        ]
        Resource = "*"
      }
    ]
  })
}

# =============================================================================
# KMS Permissions (Conditional)
# Required if encryption key is specified
# =============================================================================

resource "aws_iam_role_policy" "trigger_lambda_kms" {
  count = var.encryption_key_arn != null ? 1 : 0

  name = "${local.name_prefix}-kms"
  role = aws_iam_role.trigger_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:GenerateDataKey"
        ]
        Resource = var.encryption_key_arn
      }
    ]
  })
}
