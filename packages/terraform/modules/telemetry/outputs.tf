# Telemetry Module Outputs

output "dashboard_arn" {
  description = "ARN of the CloudWatch dashboard"
  value       = var.enable_observability ? aws_cloudwatch_dashboard.main[0].dashboard_arn : null
}

output "dashboard_name" {
  description = "Name of the CloudWatch dashboard"
  value       = var.enable_observability ? aws_cloudwatch_dashboard.main[0].dashboard_name : null
}

output "dashboard_url" {
  description = "URL to the CloudWatch dashboard"
  value       = var.enable_observability ? "https://${var.region}.console.aws.amazon.com/cloudwatch/home?region=${var.region}#dashboards:name=${aws_cloudwatch_dashboard.main[0].dashboard_name}" : null
}

output "api_5xx_alarm_arns" {
  description = "ARNs of API Gateway 5XX error alarms"
  value = var.enable_observability ? {
    warning  = aws_cloudwatch_metric_alarm.api_5xx_warning[0].arn
    critical = aws_cloudwatch_metric_alarm.api_5xx_critical[0].arn
  } : null
}

output "lambda_error_alarm_arns" {
  description = "Map of Lambda error alarm ARNs by function"
  value = var.enable_observability ? {
    for k, v in var.lambda_functions : k => {
      warning  = aws_cloudwatch_metric_alarm.lambda_error_warning[k].arn
      critical = aws_cloudwatch_metric_alarm.lambda_error_critical[k].arn
    }
  } : null
}

output "sfn_failed_alarm_arns" {
  description = "Map of Step Functions failed alarm ARNs"
  value = var.enable_observability ? {
    for k, v in var.state_machines : k => {
      warning  = aws_cloudwatch_metric_alarm.sfn_failed_warning[k].arn
      critical = aws_cloudwatch_metric_alarm.sfn_failed_critical[k].arn
    }
  } : null
}

output "dlq_alarm_arns" {
  description = "Map of DLQ alarm ARNs"
  value = var.enable_observability ? {
    for k, v in var.dlq_queues : k => {
      warning  = aws_cloudwatch_metric_alarm.dlq_warning[k].arn
      critical = aws_cloudwatch_metric_alarm.dlq_critical[k].arn
    }
  } : null
}
