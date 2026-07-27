# Lambda Plugin IAM Role and Policies
# Matches CDK patterns from lambdaPlugin.ts

# =============================================================================
# Lambda Execution Role
# =============================================================================

resource "aws_iam_role" "lambda_plugin" {
  count = local.create_lambda_role ? 1 : 0

  # Use shorter name to avoid 64 character limit
  name = "${local.short_name_prefix}-lambda-role"

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
      Name = "${local.short_name_prefix}-lambda-role"
    }
  )
}

# =============================================================================
# CloudWatch Logs Policy
# =============================================================================

resource "aws_iam_role_policy" "lambda_cloudwatch_logs" {
  count = local.create_lambda_role ? 1 : 0

  name = "${local.name_prefix}-cloudwatch-logs"
  role = aws_iam_role.lambda_plugin[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup"
        ]
        Resource = "arn:${data.aws_partition.current.partition}:logs:${var.region}:${var.account_id}:*"
      },
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:${data.aws_partition.current.partition}:logs:${var.region}:${var.account_id}:log-group:/aws/lambda/${local.name_prefix}*:*"
      }
    ]
  })
}

# =============================================================================
# EventBridge PutEvents Policy
# =============================================================================

resource "aws_iam_role_policy" "lambda_eventbridge" {
  count = local.create_lambda_role ? 1 : 0

  name = "${local.name_prefix}-eventbridge"
  role = aws_iam_role.lambda_plugin[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "events:PutEvents"
        ]
        Resource = var.event_bus_arn
      }
    ]
  })
}

# =============================================================================
# S3 Access Policy
# =============================================================================

resource "aws_iam_role_policy" "lambda_s3" {
  count = local.create_lambda_role ? 1 : 0

  name = "${local.name_prefix}-s3"
  role = aws_iam_role.lambda_plugin[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject"
        ]
        Resource = "${var.bucket_arn}/*"
      },
      {
        Effect = "Allow"
        Action = [
          "s3:ListBucket",
          "s3:GetBucketLocation"
        ]
        Resource = var.bucket_arn
      }
    ]
  })
}

# =============================================================================
# VPC Access Policy (Conditional)
# =============================================================================

resource "aws_iam_role_policy" "lambda_vpc" {
  # checkov:skip=CKV_AWS_290: EC2 ENI actions (CreateNetworkInterface/DescribeNetworkInterfaces/DeleteNetworkInterface/Assign*PrivateIpAddresses) are required by the Lambda VPC integration and do not meaningfully support resource-level permissions in this context — the ENI doesn't exist until the action runs. Parity with the AWS-managed AWSLambdaVPCAccessExecutionRole policy and CDK's lambda.VpcConfig auto-grant.
  # checkov:skip=CKV_AWS_355: Same rationale as CKV_AWS_290 above — EC2 ENI lifecycle actions are unrestrictable.
  count = local.create_lambda_role && var.vpc_enabled ? 1 : 0

  name = "${local.name_prefix}-vpc"
  role = aws_iam_role.lambda_plugin[0].id

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
# Bedrock Access Policy (Conditional)
# Matches CDK grantBedrockAccess function from lambdaPlugin.ts:99-129
# =============================================================================

resource "aws_iam_role_policy" "lambda_bedrock" {
  count = local.create_lambda_role && local.effective_bedrock_mode != "none" ? 1 : 0

  name = "${local.name_prefix}-bedrock"
  role = aws_iam_role.lambda_plugin[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "bedrock:InvokeModel",
          "bedrock:CreateModelInvocationJob",
          "bedrock:GetModelInvocationJob"
        ]
        Resource = [
          # Model invocation jobs - all regions
          "arn:${data.aws_partition.current.partition}:bedrock:*:${var.account_id}:model-invocation-job/*",
          # Inference profiles - all regions
          "arn:${data.aws_partition.current.partition}:bedrock:*:${var.account_id}:inference-profile/*",
          # Foundation models - all regions, no account (AWS-owned)
          "arn:${data.aws_partition.current.partition}:bedrock:*::foundation-model/*"
        ]
      }
    ]
  })
}

# =============================================================================
# KMS Access Policy (Conditional)
# =============================================================================

resource "aws_iam_role_policy" "lambda_kms" {
  count = local.create_lambda_role && var.encryption_key_arn != null ? 1 : 0

  name = "${local.name_prefix}-kms"
  role = aws_iam_role.lambda_plugin[0].id

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

# =============================================================================
# AgentCore Evaluations API Access Policy (Conditional)
# For agentcoreEval plugin - matches CDK external-plugins.ts
# =============================================================================

resource "aws_iam_role_policy" "lambda_agentcore" {
  count = local.create_lambda_role && var.allow_agentcore ? 1 : 0

  name = "${local.name_prefix}-agentcore"
  role = aws_iam_role.lambda_plugin[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "bedrock-agentcore:Evaluate"
        ]
        Resource = "arn:${data.aws_partition.current.partition}:bedrock-agentcore:*:${var.account_id}:evaluator/*"
      },
      {
        Effect = "Allow"
        Action = [
          "bedrock-agentcore:ListEvaluators",
          "bedrock-agentcore:CreateEvaluator"
        ]
        Resource = "arn:${data.aws_partition.current.partition}:bedrock-agentcore:*:${var.account_id}:evaluator/*"
      }
    ]
  })
}
