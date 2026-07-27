# CloudWatch Alarms for GenAI ETK Monitoring
# Based on CDK cdk-monitoring-constructs DEFAULT_THRESHOLDS

# ==================== API Gateway Alarms ====================

resource "aws_cloudwatch_metric_alarm" "api_5xx_warning" {
  count = var.enable_observability ? 1 : 0

  alarm_name          = "${local.alarm_prefix}${var.rest_api_name}5XXErrorAlarmWarning"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  threshold           = local.thresholds.api_5xx_error.warning
  alarm_description   = "API Gateway 5XX error rate exceeded warning threshold"
  treat_missing_data  = "ignore"

  metric_name = "5XXError"
  namespace   = "AWS/ApiGateway"
  period      = 60
  statistic   = "Average"

  dimensions = {
    ApiName = var.rest_api_name
    Stage   = var.api_stage_name
  }

  alarm_actions = local.alarm_actions
  ok_actions    = local.alarm_actions

  tags = merge(local.common_tags, { Name = "${local.name_prefix}-api-5xx-warning", AlarmType = "Warning" })
}

resource "aws_cloudwatch_metric_alarm" "api_5xx_critical" {
  count = var.enable_observability ? 1 : 0

  alarm_name          = "${local.alarm_prefix}${var.rest_api_name}5XXErrorAlarmCritical"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  threshold           = local.thresholds.api_5xx_error.critical
  alarm_description   = "API Gateway 5XX error rate exceeded critical threshold"
  treat_missing_data  = "ignore"

  metric_name = "5XXError"
  namespace   = "AWS/ApiGateway"
  period      = 60
  statistic   = "Average"

  dimensions = {
    ApiName = var.rest_api_name
    Stage   = var.api_stage_name
  }

  alarm_actions = local.alarm_actions
  ok_actions    = local.alarm_actions

  tags = merge(local.common_tags, { Name = "${local.name_prefix}-api-5xx-critical", AlarmType = "Critical" })
}

# ==================== Lambda Alarms ====================

resource "aws_cloudwatch_metric_alarm" "lambda_error_warning" {
  for_each = var.enable_observability ? var.lambda_functions : {}

  alarm_name          = "${local.alarm_prefix}${each.value.display_name}ErrorAlarmWarning"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  threshold           = local.thresholds.lambda_error.warning
  alarm_description   = "Lambda ${each.value.display_name} error rate exceeded warning threshold"
  treat_missing_data  = "ignore"

  metric_name = "Errors"
  namespace   = "AWS/Lambda"
  period      = 60
  statistic   = "Average"

  dimensions = {
    FunctionName = each.value.function_name
  }

  alarm_actions = local.alarm_actions
  ok_actions    = local.alarm_actions

  tags = merge(local.common_tags, { Name = "${local.name_prefix}-lambda-${each.key}-error-warning", AlarmType = "Warning" })
}

resource "aws_cloudwatch_metric_alarm" "lambda_error_critical" {
  for_each = var.enable_observability ? var.lambda_functions : {}

  alarm_name          = "${local.alarm_prefix}${each.value.display_name}ErrorAlarmCritical"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  threshold           = local.thresholds.lambda_error.critical
  alarm_description   = "Lambda ${each.value.display_name} error rate exceeded critical threshold"
  treat_missing_data  = "ignore"

  metric_name = "Errors"
  namespace   = "AWS/Lambda"
  period      = 60
  statistic   = "Average"

  dimensions = {
    FunctionName = each.value.function_name
  }

  alarm_actions = local.alarm_actions
  ok_actions    = local.alarm_actions

  tags = merge(local.common_tags, { Name = "${local.name_prefix}-lambda-${each.key}-error-critical", AlarmType = "Critical" })
}

resource "aws_cloudwatch_metric_alarm" "lambda_throttle_warning" {
  for_each = var.enable_observability ? var.lambda_functions : {}

  alarm_name          = "${local.alarm_prefix}${each.value.display_name}ThrottleAlarmWarning"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  threshold           = local.thresholds.lambda_throttle.warning
  alarm_description   = "Lambda ${each.value.display_name} throttle rate exceeded warning threshold"
  treat_missing_data  = "ignore"

  metric_name = "Throttles"
  namespace   = "AWS/Lambda"
  period      = 60
  statistic   = "Average"

  dimensions = {
    FunctionName = each.value.function_name
  }

  alarm_actions = local.alarm_actions
  ok_actions    = local.alarm_actions

  tags = merge(local.common_tags, { Name = "${local.name_prefix}-lambda-${each.key}-throttle-warning", AlarmType = "Warning" })
}

resource "aws_cloudwatch_metric_alarm" "lambda_throttle_critical" {
  for_each = var.enable_observability ? var.lambda_functions : {}

  alarm_name          = "${local.alarm_prefix}${each.value.display_name}ThrottleAlarmCritical"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  threshold           = local.thresholds.lambda_throttle.critical
  alarm_description   = "Lambda ${each.value.display_name} throttle rate exceeded critical threshold"
  treat_missing_data  = "ignore"

  metric_name = "Throttles"
  namespace   = "AWS/Lambda"
  period      = 60
  statistic   = "Average"

  dimensions = {
    FunctionName = each.value.function_name
  }

  alarm_actions = local.alarm_actions
  ok_actions    = local.alarm_actions

  tags = merge(local.common_tags, { Name = "${local.name_prefix}-lambda-${each.key}-throttle-critical", AlarmType = "Critical" })
}

# ==================== DynamoDB Alarms ====================

resource "aws_cloudwatch_metric_alarm" "dynamodb_read_throttle_warning" {
  for_each = var.enable_observability ? var.dynamodb_tables : {}

  alarm_name          = "${local.alarm_prefix}${each.value.display_name}ReadThrottleAlarmWarning"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  threshold           = local.thresholds.dynamodb_read_throttle.warning
  alarm_description   = "DynamoDB ${each.value.display_name} read throttle exceeded warning threshold"
  treat_missing_data  = "ignore"

  metric_name = "ReadThrottleEvents"
  namespace   = "AWS/DynamoDB"
  period      = 60
  statistic   = "Sum"

  dimensions = {
    TableName = each.value.table_name
  }

  alarm_actions = local.alarm_actions
  ok_actions    = local.alarm_actions

  tags = merge(local.common_tags, { Name = "${local.name_prefix}-ddb-${each.key}-read-throttle-warning", AlarmType = "Warning" })
}

resource "aws_cloudwatch_metric_alarm" "dynamodb_read_throttle_critical" {
  for_each = var.enable_observability ? var.dynamodb_tables : {}

  alarm_name          = "${local.alarm_prefix}${each.value.display_name}ReadThrottleAlarmCritical"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  threshold           = local.thresholds.dynamodb_read_throttle.critical
  alarm_description   = "DynamoDB ${each.value.display_name} read throttle exceeded critical threshold"
  treat_missing_data  = "ignore"

  metric_name = "ReadThrottleEvents"
  namespace   = "AWS/DynamoDB"
  period      = 60
  statistic   = "Sum"

  dimensions = {
    TableName = each.value.table_name
  }

  alarm_actions = local.alarm_actions
  ok_actions    = local.alarm_actions

  tags = merge(local.common_tags, { Name = "${local.name_prefix}-ddb-${each.key}-read-throttle-critical", AlarmType = "Critical" })
}

resource "aws_cloudwatch_metric_alarm" "dynamodb_write_throttle_warning" {
  for_each = var.enable_observability ? var.dynamodb_tables : {}

  alarm_name          = "${local.alarm_prefix}${each.value.display_name}WriteThrottleAlarmWarning"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  threshold           = local.thresholds.dynamodb_write_throttle.warning
  alarm_description   = "DynamoDB ${each.value.display_name} write throttle exceeded warning threshold"
  treat_missing_data  = "ignore"

  metric_name = "WriteThrottleEvents"
  namespace   = "AWS/DynamoDB"
  period      = 60
  statistic   = "Sum"

  dimensions = {
    TableName = each.value.table_name
  }

  alarm_actions = local.alarm_actions
  ok_actions    = local.alarm_actions

  tags = merge(local.common_tags, { Name = "${local.name_prefix}-ddb-${each.key}-write-throttle-warning", AlarmType = "Warning" })
}

resource "aws_cloudwatch_metric_alarm" "dynamodb_write_throttle_critical" {
  for_each = var.enable_observability ? var.dynamodb_tables : {}

  alarm_name          = "${local.alarm_prefix}${each.value.display_name}WriteThrottleAlarmCritical"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  threshold           = local.thresholds.dynamodb_write_throttle.critical
  alarm_description   = "DynamoDB ${each.value.display_name} write throttle exceeded critical threshold"
  treat_missing_data  = "ignore"

  metric_name = "WriteThrottleEvents"
  namespace   = "AWS/DynamoDB"
  period      = 60
  statistic   = "Sum"

  dimensions = {
    TableName = each.value.table_name
  }

  alarm_actions = local.alarm_actions
  ok_actions    = local.alarm_actions

  tags = merge(local.common_tags, { Name = "${local.name_prefix}-ddb-${each.key}-write-throttle-critical", AlarmType = "Critical" })
}

# ==================== Step Functions Alarms ====================

resource "aws_cloudwatch_metric_alarm" "sfn_failed_warning" {
  for_each = var.enable_observability ? var.state_machines : {}

  alarm_name          = "${local.alarm_prefix}${each.value.display_name}FailedAlarmWarning"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  threshold           = local.thresholds.state_machine_failed.warning
  alarm_description   = "Step Function ${each.value.display_name} failed executions exceeded warning threshold"
  treat_missing_data  = "ignore"

  metric_name = "ExecutionsFailed"
  namespace   = "AWS/States"
  period      = 300
  statistic   = "Sum"

  dimensions = {
    StateMachineArn = "arn:aws:states:${var.region}:*:stateMachine:${each.value.state_machine_name}"
  }

  alarm_actions = local.alarm_actions
  ok_actions    = local.alarm_actions

  tags = merge(local.common_tags, { Name = "${local.name_prefix}-sfn-${each.key}-failed-warning", AlarmType = "Warning" })
}

resource "aws_cloudwatch_metric_alarm" "sfn_failed_critical" {
  for_each = var.enable_observability ? var.state_machines : {}

  alarm_name          = "${local.alarm_prefix}${each.value.display_name}FailedAlarmCritical"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  threshold           = local.thresholds.state_machine_failed.critical
  alarm_description   = "Step Function ${each.value.display_name} failed executions exceeded critical threshold"
  treat_missing_data  = "ignore"

  metric_name = "ExecutionsFailed"
  namespace   = "AWS/States"
  period      = 300
  statistic   = "Sum"

  dimensions = {
    StateMachineArn = "arn:aws:states:${var.region}:*:stateMachine:${each.value.state_machine_name}"
  }

  alarm_actions = local.alarm_actions
  ok_actions    = local.alarm_actions

  tags = merge(local.common_tags, { Name = "${local.name_prefix}-sfn-${each.key}-failed-critical", AlarmType = "Critical" })
}

# ==================== Step Functions Throttled Alarms ====================

resource "aws_cloudwatch_metric_alarm" "sfn_throttled_warning" {
  for_each = var.enable_observability ? var.state_machines : {}

  alarm_name          = "${local.alarm_prefix}${each.value.display_name}ThrottledAlarmWarning"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  threshold           = local.thresholds.state_machine_throttled.warning
  alarm_description   = "Step Function ${each.value.display_name} throttled executions exceeded warning threshold"
  treat_missing_data  = "ignore"

  metric_name = "ExecutionThrottled"
  namespace   = "AWS/States"
  period      = 300
  statistic   = "Sum"

  dimensions = {
    StateMachineArn = "arn:aws:states:${var.region}:*:stateMachine:${each.value.state_machine_name}"
  }

  alarm_actions = local.alarm_actions
  ok_actions    = local.alarm_actions

  tags = merge(local.common_tags, { Name = "${local.name_prefix}-sfn-${each.key}-throttled-warning", AlarmType = "Warning" })
}

resource "aws_cloudwatch_metric_alarm" "sfn_throttled_critical" {
  for_each = var.enable_observability ? var.state_machines : {}

  alarm_name          = "${local.alarm_prefix}${each.value.display_name}ThrottledAlarmCritical"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  threshold           = local.thresholds.state_machine_throttled.critical
  alarm_description   = "Step Function ${each.value.display_name} throttled executions exceeded critical threshold"
  treat_missing_data  = "ignore"

  metric_name = "ExecutionThrottled"
  namespace   = "AWS/States"
  period      = 300
  statistic   = "Sum"

  dimensions = {
    StateMachineArn = "arn:aws:states:${var.region}:*:stateMachine:${each.value.state_machine_name}"
  }

  alarm_actions = local.alarm_actions
  ok_actions    = local.alarm_actions

  tags = merge(local.common_tags, { Name = "${local.name_prefix}-sfn-${each.key}-throttled-critical", AlarmType = "Critical" })
}

# ==================== Step Functions Aborted Alarms ====================

resource "aws_cloudwatch_metric_alarm" "sfn_aborted_warning" {
  for_each = var.enable_observability ? var.state_machines : {}

  alarm_name          = "${local.alarm_prefix}${each.value.display_name}AbortedAlarmWarning"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  threshold           = local.thresholds.state_machine_aborted.warning
  alarm_description   = "Step Function ${each.value.display_name} aborted executions exceeded warning threshold"
  treat_missing_data  = "ignore"

  metric_name = "ExecutionsAborted"
  namespace   = "AWS/States"
  period      = 300
  statistic   = "Sum"

  dimensions = {
    StateMachineArn = "arn:aws:states:${var.region}:*:stateMachine:${each.value.state_machine_name}"
  }

  alarm_actions = local.alarm_actions
  ok_actions    = local.alarm_actions

  tags = merge(local.common_tags, { Name = "${local.name_prefix}-sfn-${each.key}-aborted-warning", AlarmType = "Warning" })
}

resource "aws_cloudwatch_metric_alarm" "sfn_aborted_critical" {
  for_each = var.enable_observability ? var.state_machines : {}

  alarm_name          = "${local.alarm_prefix}${each.value.display_name}AbortedAlarmCritical"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  threshold           = local.thresholds.state_machine_aborted.critical
  alarm_description   = "Step Function ${each.value.display_name} aborted executions exceeded critical threshold"
  treat_missing_data  = "ignore"

  metric_name = "ExecutionsAborted"
  namespace   = "AWS/States"
  period      = 300
  statistic   = "Sum"

  dimensions = {
    StateMachineArn = "arn:aws:states:${var.region}:*:stateMachine:${each.value.state_machine_name}"
  }

  alarm_actions = local.alarm_actions
  ok_actions    = local.alarm_actions

  tags = merge(local.common_tags, { Name = "${local.name_prefix}-sfn-${each.key}-aborted-critical", AlarmType = "Critical" })
}

# ==================== Step Functions TimedOut Alarms ====================

resource "aws_cloudwatch_metric_alarm" "sfn_timed_out_warning" {
  for_each = var.enable_observability ? var.state_machines : {}

  alarm_name          = "${local.alarm_prefix}${each.value.display_name}TimedOutAlarmWarning"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  threshold           = local.thresholds.state_machine_timed_out.warning
  alarm_description   = "Step Function ${each.value.display_name} timed out executions exceeded warning threshold"
  treat_missing_data  = "ignore"

  metric_name = "ExecutionsTimedOut"
  namespace   = "AWS/States"
  period      = 300
  statistic   = "Sum"

  dimensions = {
    StateMachineArn = "arn:aws:states:${var.region}:*:stateMachine:${each.value.state_machine_name}"
  }

  alarm_actions = local.alarm_actions
  ok_actions    = local.alarm_actions

  tags = merge(local.common_tags, { Name = "${local.name_prefix}-sfn-${each.key}-timed-out-warning", AlarmType = "Warning" })
}

resource "aws_cloudwatch_metric_alarm" "sfn_timed_out_critical" {
  for_each = var.enable_observability ? var.state_machines : {}

  alarm_name          = "${local.alarm_prefix}${each.value.display_name}TimedOutAlarmCritical"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  threshold           = local.thresholds.state_machine_timed_out.critical
  alarm_description   = "Step Function ${each.value.display_name} timed out executions exceeded critical threshold"
  treat_missing_data  = "ignore"

  metric_name = "ExecutionsTimedOut"
  namespace   = "AWS/States"
  period      = 300
  statistic   = "Sum"

  dimensions = {
    StateMachineArn = "arn:aws:states:${var.region}:*:stateMachine:${each.value.state_machine_name}"
  }

  alarm_actions = local.alarm_actions
  ok_actions    = local.alarm_actions

  tags = merge(local.common_tags, { Name = "${local.name_prefix}-sfn-${each.key}-timed-out-critical", AlarmType = "Critical" })
}

# ==================== DynamoDB SystemErrors Alarms ====================

resource "aws_cloudwatch_metric_alarm" "dynamodb_error_warning" {
  for_each = var.enable_observability ? var.dynamodb_tables : {}

  alarm_name          = "${local.alarm_prefix}${each.value.display_name}ErrorAlarmWarning"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  threshold           = local.thresholds.dynamodb_error.warning
  alarm_description   = "DynamoDB ${each.value.display_name} system errors exceeded warning threshold"
  treat_missing_data  = "ignore"

  metric_name = "SystemErrors"
  namespace   = "AWS/DynamoDB"
  period      = 60
  statistic   = "Sum"

  dimensions = {
    TableName = each.value.table_name
  }

  alarm_actions = local.alarm_actions
  ok_actions    = local.alarm_actions

  tags = merge(local.common_tags, { Name = "${local.name_prefix}-ddb-${each.key}-error-warning", AlarmType = "Warning" })
}

resource "aws_cloudwatch_metric_alarm" "dynamodb_error_critical" {
  for_each = var.enable_observability ? var.dynamodb_tables : {}

  alarm_name          = "${local.alarm_prefix}${each.value.display_name}ErrorAlarmCritical"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  threshold           = local.thresholds.dynamodb_error.critical
  alarm_description   = "DynamoDB ${each.value.display_name} system errors exceeded critical threshold"
  treat_missing_data  = "ignore"

  metric_name = "SystemErrors"
  namespace   = "AWS/DynamoDB"
  period      = 60
  statistic   = "Sum"

  dimensions = {
    TableName = each.value.table_name
  }

  alarm_actions = local.alarm_actions
  ok_actions    = local.alarm_actions

  tags = merge(local.common_tags, { Name = "${local.name_prefix}-ddb-${each.key}-error-critical", AlarmType = "Critical" })
}

# ==================== DynamoDB GSI Throttle Alarms ====================

locals {
  gsi_entries = merge([
    for table_key, table in var.dynamodb_tables : {
      for gsi_name in table.gsi_names : "${table_key}_${gsi_name}" => {
        table_name   = table.table_name
        gsi_name     = gsi_name
        display_name = gsi_name
      }
    }
  ]...)
}

resource "aws_cloudwatch_metric_alarm" "gsi_read_throttle_warning" {
  for_each = var.enable_observability ? local.gsi_entries : {}

  alarm_name          = "${local.alarm_prefix}${each.value.display_name}ReadThrottleAlarmWarning"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  threshold           = local.thresholds.dynamodb_read_throttle.warning
  alarm_description   = "DynamoDB GSI ${each.value.display_name} read throttle exceeded warning threshold"
  treat_missing_data  = "ignore"

  metric_name = "ReadThrottleEvents"
  namespace   = "AWS/DynamoDB"
  period      = 60
  statistic   = "Sum"

  dimensions = {
    TableName                = each.value.table_name
    GlobalSecondaryIndexName = each.value.gsi_name
  }

  alarm_actions = local.alarm_actions
  ok_actions    = local.alarm_actions

  tags = merge(local.common_tags, { Name = "${local.name_prefix}-gsi-${each.key}-read-throttle-warning", AlarmType = "Warning" })
}

resource "aws_cloudwatch_metric_alarm" "gsi_read_throttle_critical" {
  for_each = var.enable_observability ? local.gsi_entries : {}

  alarm_name          = "${local.alarm_prefix}${each.value.display_name}ReadThrottleAlarmCritical"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  threshold           = local.thresholds.dynamodb_read_throttle.critical
  alarm_description   = "DynamoDB GSI ${each.value.display_name} read throttle exceeded critical threshold"
  treat_missing_data  = "ignore"

  metric_name = "ReadThrottleEvents"
  namespace   = "AWS/DynamoDB"
  period      = 60
  statistic   = "Sum"

  dimensions = {
    TableName                = each.value.table_name
    GlobalSecondaryIndexName = each.value.gsi_name
  }

  alarm_actions = local.alarm_actions
  ok_actions    = local.alarm_actions

  tags = merge(local.common_tags, { Name = "${local.name_prefix}-gsi-${each.key}-read-throttle-critical", AlarmType = "Critical" })
}

resource "aws_cloudwatch_metric_alarm" "gsi_write_throttle_warning" {
  for_each = var.enable_observability ? local.gsi_entries : {}

  alarm_name          = "${local.alarm_prefix}${each.value.display_name}WriteThrottleAlarmWarning"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  threshold           = local.thresholds.dynamodb_write_throttle.warning
  alarm_description   = "DynamoDB GSI ${each.value.display_name} write throttle exceeded warning threshold"
  treat_missing_data  = "ignore"

  metric_name = "WriteThrottleEvents"
  namespace   = "AWS/DynamoDB"
  period      = 60
  statistic   = "Sum"

  dimensions = {
    TableName                = each.value.table_name
    GlobalSecondaryIndexName = each.value.gsi_name
  }

  alarm_actions = local.alarm_actions
  ok_actions    = local.alarm_actions

  tags = merge(local.common_tags, { Name = "${local.name_prefix}-gsi-${each.key}-write-throttle-warning", AlarmType = "Warning" })
}

resource "aws_cloudwatch_metric_alarm" "gsi_write_throttle_critical" {
  for_each = var.enable_observability ? local.gsi_entries : {}

  alarm_name          = "${local.alarm_prefix}${each.value.display_name}WriteThrottleAlarmCritical"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  threshold           = local.thresholds.dynamodb_write_throttle.critical
  alarm_description   = "DynamoDB GSI ${each.value.display_name} write throttle exceeded critical threshold"
  treat_missing_data  = "ignore"

  metric_name = "WriteThrottleEvents"
  namespace   = "AWS/DynamoDB"
  period      = 60
  statistic   = "Sum"

  dimensions = {
    TableName                = each.value.table_name
    GlobalSecondaryIndexName = each.value.gsi_name
  }

  alarm_actions = local.alarm_actions
  ok_actions    = local.alarm_actions

  tags = merge(local.common_tags, { Name = "${local.name_prefix}-gsi-${each.key}-write-throttle-critical", AlarmType = "Critical" })
}

# ==================== SQS DLQ Alarms ====================

resource "aws_cloudwatch_metric_alarm" "dlq_warning" {
  for_each = var.enable_observability ? var.dlq_queues : {}

  alarm_name          = "${local.alarm_prefix}${each.value.display_name}AlarmWarning"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  threshold           = local.thresholds.dlq_messages.warning
  alarm_description   = "DLQ ${each.value.display_name} message count exceeded warning threshold"
  treat_missing_data  = "ignore"

  metric_name = "NumberOfMessagesSent"
  namespace   = "AWS/SQS"
  period      = 300
  statistic   = "Sum"

  dimensions = {
    QueueName = each.value.queue_name
  }

  alarm_actions = local.alarm_actions
  ok_actions    = local.alarm_actions

  tags = merge(local.common_tags, { Name = "${local.name_prefix}-dlq-${each.key}-warning", AlarmType = "Warning" })
}

resource "aws_cloudwatch_metric_alarm" "dlq_critical" {
  for_each = var.enable_observability ? var.dlq_queues : {}

  alarm_name          = "${local.alarm_prefix}${each.value.display_name}AlarmCritical"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  threshold           = local.thresholds.dlq_messages.critical
  alarm_description   = "DLQ ${each.value.display_name} message count exceeded critical threshold"
  treat_missing_data  = "ignore"

  metric_name = "NumberOfMessagesSent"
  namespace   = "AWS/SQS"
  period      = 300
  statistic   = "Sum"

  dimensions = {
    QueueName = each.value.queue_name
  }

  alarm_actions = local.alarm_actions
  ok_actions    = local.alarm_actions

  tags = merge(local.common_tags, { Name = "${local.name_prefix}-dlq-${each.key}-critical", AlarmType = "Critical" })
}
