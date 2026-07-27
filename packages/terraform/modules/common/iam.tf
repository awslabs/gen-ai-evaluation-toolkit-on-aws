# IAM Roles and Policies for ETK

# ECS Task Execution Role
resource "aws_iam_role" "ecs_task_execution" {
  name = "${var.project_name}-${var.environment}-ecs-task-execution-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name = "${var.project_name}-${var.environment}-ecs-task-execution-role"
  }
}

# ECS Task Execution Policy
resource "aws_iam_role_policy_attachment" "ecs_task_execution" {
  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# ECS Task Execution KMS Policy
resource "aws_iam_role_policy" "ecs_task_execution_kms" {
  count = var.encryption_key_arn != null ? 1 : 0

  name = "${var.project_name}-${var.environment}-ecs-task-execution-kms"
  role = aws_iam_role.ecs_task_execution.id

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

# ECS Task Role (for application permissions)
resource "aws_iam_role" "ecs_task" {
  name = "${var.project_name}-${var.environment}-ecs-task-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name = "${var.project_name}-${var.environment}-ecs-task-role"
  }
}

# ECS Task X-Ray Policy
resource "aws_iam_role_policy_attachment" "ecs_task_xray" {
  role       = aws_iam_role.ecs_task.name
  policy_arn = "arn:aws:iam::aws:policy/AWSXRayDaemonWriteAccess"
}

# ECS Task KMS Policy (if encryption enabled)
# Required for ECS tasks to access CMK-encrypted resources (S3, DynamoDB, logs)
resource "aws_iam_role_policy" "ecs_task_kms" {
  count = var.encryption_key_arn != null ? 1 : 0

  name = "${var.project_name}-${var.environment}-ecs-task-kms"
  role = aws_iam_role.ecs_task.id

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

# Step Functions Execution Role
resource "aws_iam_role" "sfn_execution" {
  name = "${var.project_name}-${var.environment}-sfn-execution-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "states.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name = "${var.project_name}-${var.environment}-sfn-execution-role"
  }
}

# Step Functions CloudWatch Logs Policy
resource "aws_iam_role_policy" "sfn_cloudwatch_logs" {
  name = "${var.project_name}-${var.environment}-sfn-cloudwatch-logs"
  role = aws_iam_role.sfn_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogDelivery",
          "logs:GetLogDelivery",
          "logs:UpdateLogDelivery",
          "logs:DeleteLogDelivery",
          "logs:ListLogDeliveries",
          "logs:PutResourcePolicy",
          "logs:DescribeResourcePolicies",
          "logs:DescribeLogGroups"
        ]
        Resource = "*"
      }
    ]
  })
}

# Step Functions X-Ray Policy
resource "aws_iam_role_policy_attachment" "sfn_xray" {
  role       = aws_iam_role.sfn_execution.name
  policy_arn = "arn:aws:iam::aws:policy/AWSXRayDaemonWriteAccess"
}

# Step Functions KMS Policy (if encryption enabled)
# Required for Step Functions to write to CMK-encrypted CloudWatch log groups
resource "aws_iam_role_policy" "sfn_cloudwatch_kms" {
  count = var.encryption_key_arn != null ? 1 : 0

  name = "${var.project_name}-${var.environment}-sfn-cloudwatch-kms"
  role = aws_iam_role.sfn_execution.id

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

# EventBridge Scheduler Execution Role
resource "aws_iam_role" "scheduler_execution" {
  name = "${var.project_name}-${var.environment}-scheduler-execution-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "scheduler.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name = "${var.project_name}-${var.environment}-scheduler-execution-role"
  }
}

# API Gateway CloudWatch Logs Role
resource "aws_iam_role" "api_gateway_cloudwatch" {
  name = "${var.project_name}-${var.environment}-api-gateway-cloudwatch-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "apigateway.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name = "${var.project_name}-${var.environment}-api-gateway-cloudwatch-role"
  }
}

# API Gateway CloudWatch Logs Policy
resource "aws_iam_role_policy_attachment" "api_gateway_cloudwatch" {
  role       = aws_iam_role.api_gateway_cloudwatch.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonAPIGatewayPushToCloudWatchLogs"
}

# API Gateway CloudWatch KMS Policy (if encryption enabled)
# Required for API Gateway to write logs to CMK-encrypted CloudWatch log groups
resource "aws_iam_role_policy" "api_gateway_cloudwatch_kms" {
  count = var.encryption_key_arn != null ? 1 : 0

  name = "${var.project_name}-${var.environment}-api-gateway-cloudwatch-kms"
  role = aws_iam_role.api_gateway_cloudwatch.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "kms:Encrypt",
          "kms:Decrypt",
          "kms:GenerateDataKey*"
        ]
        Resource = var.encryption_key_arn
      }
    ]
  })
}
