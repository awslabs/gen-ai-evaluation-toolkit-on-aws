# EventBridge Configuration for ETK
# Converted from CDK BaseStack eventBus and DLQ setup

# Data sources

# =============================================================================
# EventBus Dead Letter Queue
# =============================================================================

# SQS Dead Letter Queue for EventBridge
resource "aws_sqs_queue" "eventbus_dlq" {
  name = "${var.project_name}-${var.environment}-eventbus-dlq"

  # Encryption - use CMK if provided, otherwise AWS managed key
  kms_master_key_id = var.encryption_key_arn != null ? var.encryption_key_arn : "alias/aws/sqs"

  # message_retention_seconds not set — defaults to 4 days (SQS default),
  # matching CDK baseStack.ts eventBusDlq which also relies on the default.

  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-eventbus-dlq"
  })
}

# SQS Queue Policy to allow EventBridge to send messages
resource "aws_sqs_queue_policy" "eventbus_dlq" {
  queue_url = aws_sqs_queue.eventbus_dlq.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowEventBridgeToDLQ"
        Effect = "Allow"
        Principal = {
          Service = "events.amazonaws.com"
        }
        Action   = "sqs:SendMessage"
        Resource = aws_sqs_queue.eventbus_dlq.arn
        Condition = {
          ArnEquals = {
            "aws:SourceArn" = aws_cloudwatch_event_bus.main.arn
          }
        }
      },
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "sqs:*"
        Resource  = aws_sqs_queue.eventbus_dlq.arn
        Condition = {
          Bool = {
            "aws:SecureTransport" = "false"
          }
        }
      }
    ]
  })
}

# =============================================================================
# Custom EventBus
# =============================================================================

# Custom EventBus for ETK events
resource "aws_cloudwatch_event_bus" "main" {
  name = "${var.project_name}-${var.environment}-eventbus"

  tags = merge(var.tags, {
    Name        = "${var.project_name}-${var.environment}-eventbus"
    Description = "Event Bus for Gen AI Evaluation Toolkit"
  })
}

# EventBridge Archive for event replay (optional but recommended)
resource "aws_cloudwatch_event_archive" "main" {
  name             = "${var.project_name}-${var.environment}-archive"
  description      = "Archive for ETK events"
  event_source_arn = aws_cloudwatch_event_bus.main.arn
  retention_days   = 30

  event_pattern = jsonencode({
    source = [{ prefix = "" }]
  })
}

# =============================================================================
# Scheduler Group
# =============================================================================

# EventBridge Scheduler Group for evaluation job scheduling
resource "aws_scheduler_schedule_group" "evaluation_jobs" {
  name = "GenAiEtkEvaluationJobSchedulerGroup"

  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-evaluation-scheduler-group"
  })
}
