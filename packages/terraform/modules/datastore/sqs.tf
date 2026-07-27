# SQS Queues for Datastore Module
# Provides asynchronous processing for long-running operations

# Versioning Trigger Queue
# Used by createDatasetVersion Lambda to trigger versioning worker
resource "aws_sqs_queue" "versioning_trigger" {
  name = "${var.project_name}-${var.environment}-datastore-versioning-trigger"

  # Visibility timeout must match or exceed Lambda timeout
  visibility_timeout_seconds = 900 # 15 minutes (matches Lambda timeout)

  # message_retention_seconds not set — defaults to 4 days (SQS default),
  # matching CDK which also relies on the default.

  # Server-side encryption - uses CMK if provided, otherwise SQS-managed SSE
  sqs_managed_sse_enabled = var.encryption_key_arn == null ? true : null
  kms_master_key_id       = var.encryption_key_arn

  # Dead letter queue configuration
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.versioning_dlq.arn
    maxReceiveCount     = 3
  })

  tags = merge(
    var.tags,
    {
      Name        = "${var.project_name}-${var.environment}-datastore-versioning-trigger"
      Module      = "datastore"
      Environment = var.environment
    }
  )
}

# Versioning Dead Letter Queue
resource "aws_sqs_queue" "versioning_dlq" {
  name = "${var.project_name}-${var.environment}-datastore-versioning-dlq"

  # message_retention_seconds not set — defaults to 4 days (SQS default),
  # matching CDK which also relies on the default.

  # Server-side encryption - uses CMK if provided, otherwise SQS-managed SSE
  sqs_managed_sse_enabled = var.encryption_key_arn == null ? true : null
  kms_master_key_id       = var.encryption_key_arn

  tags = merge(
    var.tags,
    {
      Name        = "${var.project_name}-${var.environment}-datastore-versioning-dlq"
      Module      = "datastore"
      Environment = var.environment
    }
  )
}

# Restore Trigger Queue
# Used by restoreDataset Lambda to trigger restore worker
resource "aws_sqs_queue" "restore_trigger" {
  name = "${var.project_name}-${var.environment}-datastore-restore-trigger"

  # Visibility timeout must match or exceed Lambda timeout
  visibility_timeout_seconds = 900 # 15 minutes (matches Lambda timeout)

  # message_retention_seconds not set — defaults to 4 days (SQS default),
  # matching CDK which also relies on the default.

  # Server-side encryption - uses CMK if provided, otherwise SQS-managed SSE
  sqs_managed_sse_enabled = var.encryption_key_arn == null ? true : null
  kms_master_key_id       = var.encryption_key_arn

  # Dead letter queue configuration
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.restore_dlq.arn
    maxReceiveCount     = 3
  })

  tags = merge(
    var.tags,
    {
      Name        = "${var.project_name}-${var.environment}-datastore-restore-trigger"
      Module      = "datastore"
      Environment = var.environment
    }
  )
}

# Restore Dead Letter Queue
resource "aws_sqs_queue" "restore_dlq" {
  name = "${var.project_name}-${var.environment}-datastore-restore-dlq"

  # message_retention_seconds not set — defaults to 4 days (SQS default),
  # matching CDK which also relies on the default.

  # Server-side encryption - uses CMK if provided, otherwise SQS-managed SSE
  sqs_managed_sse_enabled = var.encryption_key_arn == null ? true : null
  kms_master_key_id       = var.encryption_key_arn

  tags = merge(
    var.tags,
    {
      Name        = "${var.project_name}-${var.environment}-datastore-restore-dlq"
      Module      = "datastore"
      Environment = var.environment
    }
  )
}

# CloudWatch Alarms for Queue Monitoring (optional)
resource "aws_cloudwatch_metric_alarm" "versioning_dlq_messages" {
  count = var.enable_cloudwatch_alarms ? 1 : 0

  alarm_name          = "${var.project_name}-${var.environment}-datastore-versioning-dlq-messages"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 300
  statistic           = "Average"
  threshold           = 0
  alarm_description   = "Alert when messages appear in versioning DLQ"
  treat_missing_data  = "notBreaching"

  dimensions = {
    QueueName = aws_sqs_queue.versioning_dlq.name
  }

  tags = merge(
    var.tags,
    {
      Name        = "${var.project_name}-${var.environment}-datastore-versioning-dlq-alarm"
      Module      = "datastore"
      Environment = var.environment
    }
  )
}

resource "aws_cloudwatch_metric_alarm" "restore_dlq_messages" {
  count = var.enable_cloudwatch_alarms ? 1 : 0

  alarm_name          = "${var.project_name}-${var.environment}-datastore-restore-dlq-messages"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 300
  statistic           = "Average"
  threshold           = 0
  alarm_description   = "Alert when messages appear in restore DLQ"
  treat_missing_data  = "notBreaching"

  dimensions = {
    QueueName = aws_sqs_queue.restore_dlq.name
  }

  tags = merge(
    var.tags,
    {
      Name        = "${var.project_name}-${var.environment}-datastore-restore-dlq-alarm"
      Module      = "datastore"
      Environment = var.environment
    }
  )
}
