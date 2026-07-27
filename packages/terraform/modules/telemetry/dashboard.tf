# CloudWatch Dashboard for GenAI ETK Monitoring
# Based on CDK monitoring-dashboard.ts patterns

resource "aws_cloudwatch_dashboard" "main" {
  count = var.enable_observability ? 1 : 0

  dashboard_name = "MonitoringDashboard-${var.region}-${local.name_prefix}"

  dashboard_body = jsonencode({
    widgets = local.all_widgets
  })
}

locals {
  # Widget dimensions
  widget_width  = 6
  widget_height = 4

  # Y positions for each section (widget_height = 4)
  api_header_y     = 0
  api_widgets_y    = 1
  lambda_header_y  = 5  # 1 + 4
  lambda_widgets_y = 6  # 5 + 1
  ddb_header_y     = 10 # 6 + 4
  ddb_widgets_y    = 11 # 10 + 1
  sfn_header_y     = 15 # 11 + 4
  sfn_widgets_y    = 16 # 15 + 1
  dlq_header_y     = 20 # 16 + 4
  dlq_widgets_y    = 21 # 20 + 1

  # Combine all widgets
  all_widgets = concat(
    local.api_gateway_widgets,
    local.lambda_widgets,
    local.dynamodb_widgets,
    local.step_functions_widgets,
    local.dlq_widgets
  )

  # ==================== API Gateway Widgets ====================
  api_gateway_widgets = [
    # Header
    {
      type   = "text"
      x      = 0
      y      = local.api_header_y
      width  = 24
      height = 1
      properties = {
        markdown = "## API Gateway"
      }
    },
    # 4XX Errors
    {
      type   = "metric"
      x      = 0
      y      = local.api_widgets_y
      width  = local.widget_width
      height = local.widget_height
      properties = {
        title   = "4XX Errors"
        region  = var.region
        view    = "timeSeries"
        stacked = false
        period  = 60
        metrics = [
          ["AWS/ApiGateway", "4XXError", "ApiName", var.rest_api_name, "Stage", var.api_stage_name, { stat = "Average", label = "${var.rest_api_name} 4XX Error" }]
        ]
        yAxis = {
          left = { showUnits = false, label = "Rate" }
        }
        legend = { position = "right" }
      }
    },
    # 5XX Errors
    {
      type   = "metric"
      x      = local.widget_width
      y      = local.api_widgets_y
      width  = local.widget_width
      height = local.widget_height
      properties = {
        title   = "5XX Errors"
        region  = var.region
        view    = "timeSeries"
        stacked = false
        period  = 60
        metrics = [
          ["AWS/ApiGateway", "5XXError", "ApiName", var.rest_api_name, "Stage", var.api_stage_name, { stat = "Average", label = "${var.rest_api_name} 5XX Error" }]
        ]
        yAxis = {
          left = { showUnits = false, label = "Rate" }
        }
        legend = { position = "right" }
      }
    },
    # Latency
    {
      type   = "metric"
      x      = local.widget_width * 2
      y      = local.api_widgets_y
      width  = local.widget_width
      height = local.widget_height
      properties = {
        title   = "Latency"
        region  = var.region
        view    = "timeSeries"
        stacked = false
        period  = 60
        metrics = [
          ["AWS/ApiGateway", "Latency", "ApiName", var.rest_api_name, "Stage", var.api_stage_name, { stat = "p50", label = "P50" }],
          ["...", { stat = "p90", label = "P90" }],
          ["...", { stat = "p99", label = "P99" }]
        ]
        yAxis = {
          left = { showUnits = false, label = "Milliseconds" }
        }
        legend = { position = "right" }
      }
    },
    # TPS
    {
      type   = "metric"
      x      = local.widget_width * 3
      y      = local.api_widgets_y
      width  = local.widget_width
      height = local.widget_height
      properties = {
        title   = "TPS"
        region  = var.region
        view    = "timeSeries"
        stacked = false
        period  = 60
        metrics = [
          ["AWS/ApiGateway", "Count", "ApiName", var.rest_api_name, "Stage", var.api_stage_name, { stat = "Sum", label = "Requests" }]
        ]
        yAxis = {
          left = { showUnits = false, label = "Count" }
        }
        legend = { position = "right" }
      }
    }
  ]

  # ==================== Lambda Widgets ====================
  lambda_widgets = [
    # Header
    {
      type   = "text"
      x      = 0
      y      = local.lambda_header_y
      width  = 24
      height = 1
      properties = {
        markdown = "## Lambda"
      }
    },
    # TPS
    {
      type   = "metric"
      x      = 0
      y      = local.lambda_widgets_y
      width  = local.widget_width
      height = local.widget_height
      properties = {
        title   = "TPS"
        region  = var.region
        view    = "timeSeries"
        stacked = false
        period  = 60
        metrics = [for k, v in var.lambda_functions : ["AWS/Lambda", "Invocations", "FunctionName", v.function_name, { stat = "Sum", label = v.display_name }]]
        yAxis = {
          left = { showUnits = false, label = "Count" }
        }
        legend = { position = "right" }
      }
    },
    # Latency
    {
      type   = "metric"
      x      = local.widget_width
      y      = local.lambda_widgets_y
      width  = local.widget_width
      height = local.widget_height
      properties = {
        title   = "Latency"
        region  = var.region
        view    = "timeSeries"
        stacked = false
        period  = 60
        metrics = concat([], [for k, v in var.lambda_functions : [
          ["AWS/Lambda", "Duration", "FunctionName", v.function_name, { stat = "p50", label = "${v.display_name} P50" }],
          ["...", { stat = "p90", label = "${v.display_name} P90" }],
          ["...", { stat = "p99", label = "${v.display_name} P99" }]
        ]]...)
        yAxis = {
          left = { showUnits = false, label = "Milliseconds" }
        }
        legend = { position = "right" }
      }
    },
    # Errors
    {
      type   = "metric"
      x      = local.widget_width * 2
      y      = local.lambda_widgets_y
      width  = local.widget_width
      height = local.widget_height
      properties = {
        title   = "Errors"
        region  = var.region
        view    = "timeSeries"
        stacked = false
        period  = 60
        metrics = [for k, v in var.lambda_functions : ["AWS/Lambda", "Errors", "FunctionName", v.function_name, { stat = "Sum", label = "${v.display_name} Errors" }]]
        yAxis = {
          left = { showUnits = false, label = "Count" }
        }
        legend = { position = "right" }
      }
    },
    # Throttles
    {
      type   = "metric"
      x      = local.widget_width * 3
      y      = local.lambda_widgets_y
      width  = local.widget_width
      height = local.widget_height
      properties = {
        title   = "Throttles"
        region  = var.region
        view    = "timeSeries"
        stacked = false
        period  = 60
        metrics = [for k, v in var.lambda_functions : ["AWS/Lambda", "Throttles", "FunctionName", v.function_name, { stat = "Sum", label = "${v.display_name} Throttles" }]]
        yAxis = {
          left = { showUnits = false, label = "Count" }
        }
        legend = { position = "right" }
      }
    }
  ]

  # ==================== DynamoDB Widgets ====================

  # Build GSI metric lines for Read/Write throttle widgets
  gsi_read_throttle_metrics = flatten([
    for table_key, table in var.dynamodb_tables : [
      for gsi_name in table.gsi_names :
      ["AWS/DynamoDB", "ReadThrottleEvents", "TableName", table.table_name, "GlobalSecondaryIndexName", gsi_name, { stat = "Sum", label = gsi_name }]
    ]
  ])

  gsi_write_throttle_metrics = flatten([
    for table_key, table in var.dynamodb_tables : [
      for gsi_name in table.gsi_names :
      ["AWS/DynamoDB", "WriteThrottleEvents", "TableName", table.table_name, "GlobalSecondaryIndexName", gsi_name, { stat = "Sum", label = gsi_name }]
    ]
  ])

  dynamodb_widgets = [
    # Header
    {
      type   = "text"
      x      = 0
      y      = local.ddb_header_y
      width  = 24
      height = 1
      properties = {
        markdown = "## DynamoDB"
      }
    },
    # Latency
    {
      type   = "metric"
      x      = 0
      y      = local.ddb_widgets_y
      width  = local.widget_width
      height = local.widget_height
      properties = {
        title   = "Latency"
        region  = var.region
        view    = "timeSeries"
        stacked = false
        period  = 60
        metrics = [for k, v in var.dynamodb_tables : ["AWS/DynamoDB", "SuccessfulRequestLatency", "TableName", v.table_name, { stat = "Average", label = v.display_name }]]
        yAxis = {
          left = { showUnits = false, label = "Milliseconds" }
        }
        legend = { position = "right" }
      }
    },
    # Read Throttles (table + GSI)
    {
      type   = "metric"
      x      = local.widget_width
      y      = local.ddb_widgets_y
      width  = local.widget_width
      height = local.widget_height
      properties = {
        title   = "Read Throttles"
        region  = var.region
        view    = "timeSeries"
        stacked = false
        period  = 60
        metrics = concat(
          [for k, v in var.dynamodb_tables : ["AWS/DynamoDB", "ReadThrottleEvents", "TableName", v.table_name, { stat = "Sum", label = v.display_name }]],
          local.gsi_read_throttle_metrics
        )
        yAxis = {
          left = { showUnits = false, label = "Count" }
        }
        legend = { position = "right" }
      }
    },
    # Write Throttles (table + GSI)
    {
      type   = "metric"
      x      = local.widget_width * 2
      y      = local.ddb_widgets_y
      width  = local.widget_width
      height = local.widget_height
      properties = {
        title   = "Write Throttles"
        region  = var.region
        view    = "timeSeries"
        stacked = false
        period  = 60
        metrics = concat(
          [for k, v in var.dynamodb_tables : ["AWS/DynamoDB", "WriteThrottleEvents", "TableName", v.table_name, { stat = "Sum", label = v.display_name }]],
          local.gsi_write_throttle_metrics
        )
        yAxis = {
          left = { showUnits = false, label = "Count" }
        }
        legend = { position = "right" }
      }
    },
    # System Errors
    {
      type   = "metric"
      x      = local.widget_width * 3
      y      = local.ddb_widgets_y
      width  = local.widget_width
      height = local.widget_height
      properties = {
        title   = "System Errors"
        region  = var.region
        view    = "timeSeries"
        stacked = false
        period  = 60
        metrics = [for k, v in var.dynamodb_tables : ["AWS/DynamoDB", "SystemErrors", "TableName", v.table_name, { stat = "Sum", label = v.display_name }]]
        yAxis = {
          left = { showUnits = false, label = "Count" }
        }
        legend = { position = "right" }
      }
    }
  ]

  # ==================== Step Functions Widgets ====================
  step_functions_widgets = [
    # Header
    {
      type   = "text"
      x      = 0
      y      = local.sfn_header_y
      width  = 24
      height = 1
      properties = {
        markdown = "## Step Functions"
      }
    },
    # Failed
    {
      type   = "metric"
      x      = 0
      y      = local.sfn_widgets_y
      width  = local.widget_width
      height = local.widget_height
      properties = {
        title   = "Failed"
        region  = var.region
        view    = "timeSeries"
        stacked = false
        period  = 60
        metrics = [for k, v in var.state_machines : ["AWS/States", "ExecutionsFailed", "StateMachineArn", "arn:aws:states:${var.region}:*:stateMachine:${v.state_machine_name}", { stat = "Sum", label = "${v.display_name} Failed" }]]
        yAxis = {
          left = { showUnits = false, label = "Count" }
        }
        legend = { position = "right" }
      }
    },
    # Throttled
    {
      type   = "metric"
      x      = local.widget_width
      y      = local.sfn_widgets_y
      width  = local.widget_width
      height = local.widget_height
      properties = {
        title   = "Throttled"
        region  = var.region
        view    = "timeSeries"
        stacked = false
        period  = 60
        metrics = [for k, v in var.state_machines : ["AWS/States", "ExecutionThrottled", "StateMachineArn", "arn:aws:states:${var.region}:*:stateMachine:${v.state_machine_name}", { stat = "Sum", label = "${v.display_name} Throttled" }]]
        yAxis = {
          left = { showUnits = false, label = "Count" }
        }
        legend = { position = "right" }
      }
    },
    # Aborted
    {
      type   = "metric"
      x      = local.widget_width * 2
      y      = local.sfn_widgets_y
      width  = local.widget_width
      height = local.widget_height
      properties = {
        title   = "Aborted"
        region  = var.region
        view    = "timeSeries"
        stacked = false
        period  = 60
        metrics = [for k, v in var.state_machines : ["AWS/States", "ExecutionsAborted", "StateMachineArn", "arn:aws:states:${var.region}:*:stateMachine:${v.state_machine_name}", { stat = "Sum", label = "${v.display_name} Aborted" }]]
        yAxis = {
          left = { showUnits = false, label = "Count" }
        }
        legend = { position = "right" }
      }
    },
    # Timed Out
    {
      type   = "metric"
      x      = local.widget_width * 3
      y      = local.sfn_widgets_y
      width  = local.widget_width
      height = local.widget_height
      properties = {
        title   = "Timed Out"
        region  = var.region
        view    = "timeSeries"
        stacked = false
        period  = 60
        metrics = [for k, v in var.state_machines : ["AWS/States", "ExecutionsTimedOut", "StateMachineArn", "arn:aws:states:${var.region}:*:stateMachine:${v.state_machine_name}", { stat = "Sum", label = "${v.display_name} Timed Out" }]]
        yAxis = {
          left = { showUnits = false, label = "Count" }
        }
        legend = { position = "right" }
      }
    }
  ]

  # ==================== SQS DLQ Widgets ====================
  dlq_widgets = [
    # Header
    {
      type   = "text"
      x      = 0
      y      = local.dlq_header_y
      width  = 24
      height = 1
      properties = {
        markdown = "## SQS DLQ"
      }
    },
    # DLQ Messages
    {
      type   = "metric"
      x      = 0
      y      = local.dlq_widgets_y
      width  = local.widget_width * 2
      height = local.widget_height
      properties = {
        title   = "DLQ Messages"
        region  = var.region
        view    = "timeSeries"
        stacked = false
        period  = 60
        metrics = [for k, v in var.dlq_queues : ["AWS/SQS", "NumberOfMessagesSent", "QueueName", v.queue_name, { stat = "Sum", label = v.display_name }]]
        yAxis = {
          left = { showUnits = false, label = "Count" }
        }
        legend = { position = "right" }
      }
    },
    # Age of Oldest Message
    {
      type   = "metric"
      x      = local.widget_width * 2
      y      = local.dlq_widgets_y
      width  = local.widget_width * 2
      height = local.widget_height
      properties = {
        title   = "Age of Oldest Message"
        region  = var.region
        view    = "timeSeries"
        stacked = false
        period  = 60
        metrics = [for k, v in var.dlq_queues : ["AWS/SQS", "ApproximateAgeOfOldestMessage", "QueueName", v.queue_name, { stat = "Maximum", label = v.display_name }]]
        yAxis = {
          left = { showUnits = false, label = "Seconds" }
        }
        legend = { position = "right" }
      }
    }
  ]
}
