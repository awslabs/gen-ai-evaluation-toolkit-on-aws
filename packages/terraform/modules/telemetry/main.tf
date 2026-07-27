# Telemetry Module - Main Entry Point
# Creates CloudWatch dashboard and alarms for GenAI ETK monitoring
# Based on CDK cdk-monitoring-constructs patterns

locals {
  # Resolved alarm thresholds with defaults matching CDK
  thresholds = {
    api_5xx_error = {
      warning  = try(var.alarm_thresholds.api_5xx_error.warning, 0.01)
      critical = try(var.alarm_thresholds.api_5xx_error.critical, 0.05)
    }
    lambda_error = {
      warning  = try(var.alarm_thresholds.lambda_error.warning, 0.01)
      critical = try(var.alarm_thresholds.lambda_error.critical, 0.05)
    }
    lambda_throttle = {
      warning  = try(var.alarm_thresholds.lambda_throttle.warning, 0.01)
      critical = try(var.alarm_thresholds.lambda_throttle.critical, 0.05)
    }
    dynamodb_read_throttle = {
      warning  = try(var.alarm_thresholds.dynamodb_read_throttle.warning, 0.01)
      critical = try(var.alarm_thresholds.dynamodb_read_throttle.critical, 0.05)
    }
    dynamodb_write_throttle = {
      warning  = try(var.alarm_thresholds.dynamodb_write_throttle.warning, 0.01)
      critical = try(var.alarm_thresholds.dynamodb_write_throttle.critical, 0.05)
    }
    dynamodb_error = {
      warning  = try(var.alarm_thresholds.dynamodb_error.warning, 0.01)
      critical = try(var.alarm_thresholds.dynamodb_error.critical, 0.05)
    }
    state_machine_failed = {
      warning  = try(var.alarm_thresholds.state_machine_failed.warning, 0)
      critical = try(var.alarm_thresholds.state_machine_failed.critical, 10)
    }
    state_machine_throttled = {
      warning  = try(var.alarm_thresholds.state_machine_throttled.warning, 0)
      critical = try(var.alarm_thresholds.state_machine_throttled.critical, 10)
    }
    state_machine_aborted = {
      warning  = try(var.alarm_thresholds.state_machine_aborted.warning, 0)
      critical = try(var.alarm_thresholds.state_machine_aborted.critical, 10)
    }
    state_machine_timed_out = {
      warning  = try(var.alarm_thresholds.state_machine_timed_out.warning, 0)
      critical = try(var.alarm_thresholds.state_machine_timed_out.critical, 10)
    }
    dlq_messages = {
      warning  = try(var.alarm_thresholds.dlq_messages.warning, 0)
      critical = try(var.alarm_thresholds.dlq_messages.critical, 10)
    }
  }

  # Common naming prefix
  name_prefix = "${var.project_name}-${var.environment}"

  # Alarm name prefix matching CDK pattern
  alarm_prefix = "GenAiEtk"

  # Common tags
  common_tags = merge(
    var.tags,
    {
      Module      = "telemetry"
      Environment = var.environment
    }
  )

  # SNS actions for alarms (empty list if no topic provided)
  alarm_actions = var.alarm_sns_topic_arn != null ? [var.alarm_sns_topic_arn] : []
}
