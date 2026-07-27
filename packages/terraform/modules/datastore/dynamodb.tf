# DynamoDB Table for ETK Datastore
# Converted from CDK SecuredTable - Single-table design
# Partition Key: entityType, Sort Key: entityId

resource "aws_dynamodb_table" "datastore" {
  name         = "${var.project_name}-${var.environment}-datastore"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "entityType"
  range_key    = "entityId"

  # Partition Key
  attribute {
    name = "entityType"
    type = "S"
  }

  # Sort Key
  attribute {
    name = "entityId"
    type = "S"
  }

  # Point-in-time recovery
  point_in_time_recovery {
    enabled = var.enable_point_in_time_recovery
  }

  # Server-side encryption - uses CMK if provided, otherwise AWS-managed key
  server_side_encryption {
    enabled     = true
    kms_key_arn = var.encryption_key_arn # null = AWS-managed key
  }

  # TTL configuration (if needed for temporary data)
  ttl {
    enabled        = var.enable_ttl
    attribute_name = "ttl"
  }

  # Deletion protection
  deletion_protection_enabled = var.environment == "prod" ? true : false

  tags = merge(
    var.tags,
    {
      Name = "${var.project_name}-${var.environment}-datastore"
    }
  )
}

# CloudWatch Alarms for DynamoDB
resource "aws_cloudwatch_metric_alarm" "dynamodb_read_throttle" {
  count = var.enable_cloudwatch_alarms ? 1 : 0

  alarm_name          = "${var.project_name}-${var.environment}-dynamodb-read-throttle"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "ReadThrottleEvents"
  namespace           = "AWS/DynamoDB"
  period              = 300
  statistic           = "Sum"
  threshold           = 10
  alarm_description   = "This metric monitors DynamoDB read throttle events"
  treat_missing_data  = "notBreaching"

  dimensions = {
    TableName = aws_dynamodb_table.datastore.name
  }
}

resource "aws_cloudwatch_metric_alarm" "dynamodb_write_throttle" {
  count = var.enable_cloudwatch_alarms ? 1 : 0

  alarm_name          = "${var.project_name}-${var.environment}-dynamodb-write-throttle"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "WriteThrottleEvents"
  namespace           = "AWS/DynamoDB"
  period              = 300
  statistic           = "Sum"
  threshold           = 10
  alarm_description   = "This metric monitors DynamoDB write throttle events"
  treat_missing_data  = "notBreaching"

  dimensions = {
    TableName = aws_dynamodb_table.datastore.name
  }
}
