# Step Functions — SDKV2 orchestration state machine
# Replaces the old v1 evaluation workflow. Uses EventBridge putEvents.waitForTaskToken
# pattern: the SFN emits EvaluatorTaskDispatched events, external evaluator Lambdas
# process them and call back via SendTaskSuccess/SendTaskFailure.

resource "aws_iam_role" "orchestration_sfn" {
  name = "${var.project_name}-${var.environment}-evaluator-sfn-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "states.amazonaws.com" }
    }]
  })

  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-evaluator-sfn-role"
  })
}

resource "aws_iam_role_policy" "orchestration_sfn" {
  name = "${var.project_name}-${var.environment}-evaluator-sfn-policy"
  role = aws_iam_role.orchestration_sfn.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["events:PutEvents"]
        Resource = [var.event_bus_arn]
      },
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

resource "aws_cloudwatch_log_group" "orchestration_sfn" {
  name              = "/aws/states/${var.project_name}-${var.environment}-evaluator-orchestration"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.encryption_key_arn

  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-evaluator-orchestration-logs"
  })
}

resource "aws_sfn_state_machine" "orchestration" {
  name     = "${var.project_name}-${var.environment}-evaluator-orchestration"
  role_arn = aws_iam_role.orchestration_sfn.arn

  definition = templatefile("${path.module}/orchestration-asl.json", {
    EventBusName = local.event_bus_name
  })

  logging_configuration {
    log_destination        = "${aws_cloudwatch_log_group.orchestration_sfn.arn}:*"
    include_execution_data = true
    level                  = "ERROR"
  }

  dynamic "encryption_configuration" {
    for_each = var.encryption_key_arn != null ? [1] : []
    content {
      type       = "CUSTOMER_MANAGED_KMS_KEY"
      kms_key_id = var.encryption_key_arn
    }
  }

  tracing_configuration {
    enabled = var.enable_xray
  }

  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-evaluator-orchestration"
  })
}
