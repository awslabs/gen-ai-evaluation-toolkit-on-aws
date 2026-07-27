# Unit Tests - Telemetry Module (Dashboard, Alarms)

mock_provider "aws" {}

# =============================================================================
# BASELINE: Telemetry disabled creates no resources
# =============================================================================

run "disabled_telemetry_creates_nothing" {
  command = plan

  variables {
    enable_observability = false
    project_name         = "test-etk"
    environment          = "dev"
    region               = "us-east-1"
    rest_api_id          = "api123"
    rest_api_name        = "test-api"
    api_stage_name       = "dev"
  }

  module {
    source = "./modules/telemetry"
  }

  assert {
    condition     = length(aws_cloudwatch_dashboard.main) == 0
    error_message = "Dashboard should not be created when telemetry is disabled"
  }

  assert {
    condition     = length(aws_cloudwatch_metric_alarm.api_5xx_warning) == 0
    error_message = "API 5XX warning alarm should not be created when telemetry is disabled"
  }

  assert {
    condition     = length(aws_cloudwatch_metric_alarm.api_5xx_critical) == 0
    error_message = "API 5XX critical alarm should not be created when telemetry is disabled"
  }

  assert {
    condition     = length(aws_cloudwatch_metric_alarm.dlq_warning) == 0
    error_message = "DLQ warning alarms should not be created when telemetry is disabled"
  }
}

# =============================================================================
# BASELINE: Telemetry enabled creates dashboard
# =============================================================================

run "enabled_telemetry_creates_dashboard" {
  command = plan

  variables {
    enable_observability = true
    project_name         = "test-etk"
    environment          = "dev"
    region               = "us-east-1"
    rest_api_id          = "api123"
    rest_api_name        = "test-api"
    api_stage_name       = "dev"
  }

  module {
    source = "./modules/telemetry"
  }

  assert {
    condition     = length(aws_cloudwatch_dashboard.main) == 1
    error_message = "Dashboard should be created when telemetry is enabled"
  }

  assert {
    condition     = aws_cloudwatch_dashboard.main[0].dashboard_name == "MonitoringDashboard-us-east-1-test-etk-dev"
    error_message = "Dashboard name should follow CDK pattern: MonitoringDashboard-{region}-{project}-{env}"
  }
}

# =============================================================================
# API GATEWAY ALARMS: Always 2 alarms (warning + critical)
# =============================================================================

run "api_gateway_alarms_created" {
  command = plan

  variables {
    enable_observability = true
    project_name         = "test-etk"
    environment          = "dev"
    region               = "us-east-1"
    rest_api_id          = "api123"
    rest_api_name        = "TestApi"
    api_stage_name       = "dev"
  }

  module {
    source = "./modules/telemetry"
  }

  assert {
    condition     = length(aws_cloudwatch_metric_alarm.api_5xx_warning) == 1
    error_message = "Should create one API 5XX warning alarm"
  }

  assert {
    condition     = length(aws_cloudwatch_metric_alarm.api_5xx_critical) == 1
    error_message = "Should create one API 5XX critical alarm"
  }

  assert {
    condition     = aws_cloudwatch_metric_alarm.api_5xx_warning[0].metric_name == "5XXError"
    error_message = "API alarm should use 5XXError metric"
  }

  assert {
    condition     = aws_cloudwatch_metric_alarm.api_5xx_warning[0].namespace == "AWS/ApiGateway"
    error_message = "API alarm should use AWS/ApiGateway namespace"
  }

  assert {
    condition     = aws_cloudwatch_metric_alarm.api_5xx_warning[0].statistic == "Average"
    error_message = "API alarm should use Average statistic (rate-based, matching CDK metricFaultRate)"
  }

  assert {
    condition     = aws_cloudwatch_metric_alarm.api_5xx_warning[0].threshold == 0.01
    error_message = "API 5XX warning threshold should default to 0.01"
  }

  assert {
    condition     = aws_cloudwatch_metric_alarm.api_5xx_critical[0].threshold == 0.05
    error_message = "API 5XX critical threshold should default to 0.05"
  }

  assert {
    condition     = aws_cloudwatch_metric_alarm.api_5xx_warning[0].alarm_name == "GenAiEtkTestApi5XXErrorAlarmWarning"
    error_message = "Alarm name should follow CDK pattern: GenAiEtk{resource}{metric}Alarm{severity}"
  }
}

# =============================================================================
# LAMBDA ALARMS: 4 per function (error + throttle × warning + critical)
# =============================================================================

run "lambda_no_functions_creates_no_alarms" {
  command = plan

  variables {
    enable_observability = true
    project_name         = "test-etk"
    environment          = "dev"
    region               = "us-east-1"
    rest_api_id          = "api123"
    rest_api_name        = "test-api"
    api_stage_name       = "dev"
    lambda_functions     = {}
  }

  module {
    source = "./modules/telemetry"
  }

  assert {
    condition     = length(aws_cloudwatch_metric_alarm.lambda_error_warning) == 0
    error_message = "No Lambda alarms should be created when lambda_functions is empty"
  }

  assert {
    condition     = length(aws_cloudwatch_metric_alarm.lambda_throttle_warning) == 0
    error_message = "No Lambda throttle alarms should be created when lambda_functions is empty"
  }
}

run "lambda_one_function_creates_four_alarms" {
  command = plan

  variables {
    enable_observability = true
    project_name         = "test-etk"
    environment          = "dev"
    region               = "us-east-1"
    rest_api_id          = "api123"
    rest_api_name        = "test-api"
    api_stage_name       = "dev"
    lambda_functions = {
      handler1 = {
        function_name = "test-etk-dev-handler1"
        display_name  = "Handler1"
      }
    }
  }

  module {
    source = "./modules/telemetry"
  }

  assert {
    condition     = length(aws_cloudwatch_metric_alarm.lambda_error_warning) == 1
    error_message = "Should create 1 Lambda error warning alarm"
  }

  assert {
    condition     = length(aws_cloudwatch_metric_alarm.lambda_error_critical) == 1
    error_message = "Should create 1 Lambda error critical alarm"
  }

  assert {
    condition     = length(aws_cloudwatch_metric_alarm.lambda_throttle_warning) == 1
    error_message = "Should create 1 Lambda throttle warning alarm"
  }

  assert {
    condition     = length(aws_cloudwatch_metric_alarm.lambda_throttle_critical) == 1
    error_message = "Should create 1 Lambda throttle critical alarm"
  }

  assert {
    condition     = aws_cloudwatch_metric_alarm.lambda_error_warning["handler1"].metric_name == "Errors"
    error_message = "Lambda error alarm should use Errors metric"
  }

  assert {
    condition     = aws_cloudwatch_metric_alarm.lambda_error_warning["handler1"].namespace == "AWS/Lambda"
    error_message = "Lambda alarm should use AWS/Lambda namespace"
  }

  assert {
    condition     = aws_cloudwatch_metric_alarm.lambda_throttle_warning["handler1"].metric_name == "Throttles"
    error_message = "Lambda throttle alarm should use Throttles metric"
  }

  assert {
    condition     = aws_cloudwatch_metric_alarm.lambda_error_warning["handler1"].statistic == "Average"
    error_message = "Lambda error alarm should use Average statistic (rate-based, matching CDK metricFaultRate)"
  }

  assert {
    condition     = aws_cloudwatch_metric_alarm.lambda_error_warning["handler1"].threshold == 0.01
    error_message = "Lambda error warning threshold should default to 0.01"
  }

  assert {
    condition     = aws_cloudwatch_metric_alarm.lambda_error_critical["handler1"].threshold == 0.05
    error_message = "Lambda error critical threshold should default to 0.05"
  }
}

# =============================================================================
# DYNAMODB ALARMS: 6 per table (read/write throttle + error × warning/critical)
# =============================================================================

run "dynamodb_one_table_creates_six_alarms" {
  command = plan

  variables {
    enable_observability = true
    project_name         = "test-etk"
    environment          = "dev"
    region               = "us-east-1"
    rest_api_id          = "api123"
    rest_api_name        = "test-api"
    api_stage_name       = "dev"
    dynamodb_tables = {
      datastore = {
        table_name   = "test-etk-dev-datastore"
        display_name = "Datastore"
      }
    }
  }

  module {
    source = "./modules/telemetry"
  }

  assert {
    condition     = length(aws_cloudwatch_metric_alarm.dynamodb_read_throttle_warning) == 1
    error_message = "Should create 1 DynamoDB read throttle warning alarm"
  }

  assert {
    condition     = length(aws_cloudwatch_metric_alarm.dynamodb_write_throttle_critical) == 1
    error_message = "Should create 1 DynamoDB write throttle critical alarm"
  }

  assert {
    condition     = length(aws_cloudwatch_metric_alarm.dynamodb_error_warning) == 1
    error_message = "Should create 1 DynamoDB error warning alarm"
  }

  assert {
    condition     = length(aws_cloudwatch_metric_alarm.dynamodb_error_critical) == 1
    error_message = "Should create 1 DynamoDB error critical alarm"
  }

  assert {
    condition     = aws_cloudwatch_metric_alarm.dynamodb_read_throttle_warning["datastore"].metric_name == "ReadThrottleEvents"
    error_message = "DynamoDB read throttle alarm should use ReadThrottleEvents metric"
  }

  assert {
    condition     = aws_cloudwatch_metric_alarm.dynamodb_error_warning["datastore"].metric_name == "SystemErrors"
    error_message = "DynamoDB error alarm should use SystemErrors metric"
  }

  assert {
    condition     = aws_cloudwatch_metric_alarm.dynamodb_read_throttle_warning["datastore"].namespace == "AWS/DynamoDB"
    error_message = "DynamoDB alarm should use AWS/DynamoDB namespace"
  }

  assert {
    condition     = aws_cloudwatch_metric_alarm.dynamodb_read_throttle_warning["datastore"].statistic == "Sum"
    error_message = "DynamoDB throttle alarm should use Sum statistic"
  }
}

# =============================================================================
# GSI ALARMS: 4 per GSI (read/write throttle × warning/critical)
# =============================================================================

run "dynamodb_no_gsis_creates_no_gsi_alarms" {
  command = plan

  variables {
    enable_observability = true
    project_name         = "test-etk"
    environment          = "dev"
    region               = "us-east-1"
    rest_api_id          = "api123"
    rest_api_name        = "test-api"
    api_stage_name       = "dev"
    dynamodb_tables = {
      datastore = {
        table_name   = "test-etk-dev-datastore"
        display_name = "Datastore"
        gsi_names    = []
      }
    }
  }

  module {
    source = "./modules/telemetry"
  }

  assert {
    condition     = length(aws_cloudwatch_metric_alarm.gsi_read_throttle_warning) == 0
    error_message = "No GSI alarms should be created when gsi_names is empty"
  }

  assert {
    condition     = length(aws_cloudwatch_metric_alarm.gsi_write_throttle_warning) == 0
    error_message = "No GSI write throttle alarms should be created when gsi_names is empty"
  }
}

run "dynamodb_one_gsi_creates_four_alarms" {
  command = plan

  variables {
    enable_observability = true
    project_name         = "test-etk"
    environment          = "dev"
    region               = "us-east-1"
    rest_api_id          = "api123"
    rest_api_name        = "test-api"
    api_stage_name       = "dev"
    dynamodb_tables = {
      datastore = {
        table_name   = "test-etk-dev-datastore"
        display_name = "Datastore"
        gsi_names    = ["gsi-datasetId-index"]
      }
    }
  }

  module {
    source = "./modules/telemetry"
  }

  assert {
    condition     = length(aws_cloudwatch_metric_alarm.gsi_read_throttle_warning) == 1
    error_message = "Should create 1 GSI read throttle warning alarm for 1 GSI"
  }

  assert {
    condition     = length(aws_cloudwatch_metric_alarm.gsi_read_throttle_critical) == 1
    error_message = "Should create 1 GSI read throttle critical alarm for 1 GSI"
  }

  assert {
    condition     = length(aws_cloudwatch_metric_alarm.gsi_write_throttle_warning) == 1
    error_message = "Should create 1 GSI write throttle warning alarm for 1 GSI"
  }

  assert {
    condition     = length(aws_cloudwatch_metric_alarm.gsi_write_throttle_critical) == 1
    error_message = "Should create 1 GSI write throttle critical alarm for 1 GSI"
  }
}

run "dynamodb_multiple_gsis_scales" {
  command = plan

  variables {
    enable_observability = true
    project_name         = "test-etk"
    environment          = "dev"
    region               = "us-east-1"
    rest_api_id          = "api123"
    rest_api_name        = "test-api"
    api_stage_name       = "dev"
    dynamodb_tables = {
      datastore = {
        table_name   = "test-etk-dev-datastore"
        display_name = "Datastore"
        gsi_names    = ["gsi-datasetId-index", "gsi-status-index"]
      }
    }
  }

  module {
    source = "./modules/telemetry"
  }

  assert {
    condition     = length(aws_cloudwatch_metric_alarm.gsi_read_throttle_warning) == 2
    error_message = "Should create 2 GSI read throttle warning alarms for 2 GSIs"
  }

  assert {
    condition     = length(aws_cloudwatch_metric_alarm.gsi_write_throttle_critical) == 2
    error_message = "Should create 2 GSI write throttle critical alarms for 2 GSIs"
  }
}

# =============================================================================
# STEP FUNCTIONS ALARMS: 8 per state machine (failed/throttled/aborted/timed_out × warning/critical)
# =============================================================================

run "step_functions_all_alarm_types_created" {
  command = plan

  variables {
    enable_observability = true
    project_name         = "test-etk"
    environment          = "dev"
    region               = "us-east-1"
    rest_api_id          = "api123"
    rest_api_name        = "test-api"
    api_stage_name       = "dev"
    state_machines = {
      evaluation = {
        state_machine_name = "test-etk-dev-evaluation"
        display_name       = "Evaluation"
      }
    }
  }

  module {
    source = "./modules/telemetry"
  }

  assert {
    condition     = length(aws_cloudwatch_metric_alarm.sfn_failed_warning) == 1
    error_message = "Should create SFN failed warning alarm"
  }

  assert {
    condition     = length(aws_cloudwatch_metric_alarm.sfn_failed_critical) == 1
    error_message = "Should create SFN failed critical alarm"
  }

  assert {
    condition     = length(aws_cloudwatch_metric_alarm.sfn_throttled_warning) == 1
    error_message = "Should create SFN throttled warning alarm"
  }

  assert {
    condition     = length(aws_cloudwatch_metric_alarm.sfn_throttled_critical) == 1
    error_message = "Should create SFN throttled critical alarm"
  }

  assert {
    condition     = length(aws_cloudwatch_metric_alarm.sfn_aborted_warning) == 1
    error_message = "Should create SFN aborted warning alarm"
  }

  assert {
    condition     = length(aws_cloudwatch_metric_alarm.sfn_aborted_critical) == 1
    error_message = "Should create SFN aborted critical alarm"
  }

  assert {
    condition     = length(aws_cloudwatch_metric_alarm.sfn_timed_out_warning) == 1
    error_message = "Should create SFN timed out warning alarm"
  }

  assert {
    condition     = length(aws_cloudwatch_metric_alarm.sfn_timed_out_critical) == 1
    error_message = "Should create SFN timed out critical alarm"
  }

  assert {
    condition     = aws_cloudwatch_metric_alarm.sfn_failed_warning["evaluation"].metric_name == "ExecutionsFailed"
    error_message = "SFN failed alarm should use ExecutionsFailed metric"
  }

  assert {
    condition     = aws_cloudwatch_metric_alarm.sfn_throttled_warning["evaluation"].metric_name == "ExecutionThrottled"
    error_message = "SFN throttled alarm should use ExecutionThrottled metric"
  }

  assert {
    condition     = aws_cloudwatch_metric_alarm.sfn_aborted_warning["evaluation"].metric_name == "ExecutionsAborted"
    error_message = "SFN aborted alarm should use ExecutionsAborted metric"
  }

  assert {
    condition     = aws_cloudwatch_metric_alarm.sfn_timed_out_warning["evaluation"].metric_name == "ExecutionsTimedOut"
    error_message = "SFN timed out alarm should use ExecutionsTimedOut metric"
  }

  assert {
    condition     = aws_cloudwatch_metric_alarm.sfn_failed_warning["evaluation"].namespace == "AWS/States"
    error_message = "SFN alarm should use AWS/States namespace"
  }

  assert {
    condition     = aws_cloudwatch_metric_alarm.sfn_failed_warning["evaluation"].statistic == "Sum"
    error_message = "SFN alarm should use Sum statistic"
  }

  assert {
    condition     = aws_cloudwatch_metric_alarm.sfn_failed_warning["evaluation"].period == 300
    error_message = "SFN alarm should use 300s period"
  }
}

# =============================================================================
# SQS DLQ ALARMS: 2 per queue (warning + critical)
# =============================================================================

run "dlq_alarms_created" {
  command = plan

  variables {
    enable_observability = true
    project_name         = "test-etk"
    environment          = "dev"
    region               = "us-east-1"
    rest_api_id          = "api123"
    rest_api_name        = "test-api"
    api_stage_name       = "dev"
    dlq_queues = {
      versioning = {
        queue_name   = "test-etk-dev-versioning-dlq"
        display_name = "VersioningDLQ"
      }
    }
  }

  module {
    source = "./modules/telemetry"
  }

  assert {
    condition     = length(aws_cloudwatch_metric_alarm.dlq_warning) == 1
    error_message = "Should create 1 DLQ warning alarm"
  }

  assert {
    condition     = length(aws_cloudwatch_metric_alarm.dlq_critical) == 1
    error_message = "Should create 1 DLQ critical alarm"
  }

  assert {
    condition     = aws_cloudwatch_metric_alarm.dlq_warning["versioning"].metric_name == "NumberOfMessagesSent"
    error_message = "DLQ alarm should use NumberOfMessagesSent metric (matching CDK metricIncomingMessageCount)"
  }

  assert {
    condition     = aws_cloudwatch_metric_alarm.dlq_warning["versioning"].namespace == "AWS/SQS"
    error_message = "DLQ alarm should use AWS/SQS namespace"
  }

  assert {
    condition     = aws_cloudwatch_metric_alarm.dlq_warning["versioning"].treat_missing_data == "ignore"
    error_message = "DLQ alarm should use treat_missing_data=ignore (matching CDK TreatMissingData.IGNORE)"
  }

  assert {
    condition     = aws_cloudwatch_metric_alarm.dlq_critical["versioning"].treat_missing_data == "ignore"
    error_message = "DLQ critical alarm should use treat_missing_data=ignore"
  }
}

# =============================================================================
# CUSTOM THRESHOLDS: Override defaults
# =============================================================================

run "custom_thresholds_applied" {
  command = plan

  variables {
    enable_observability = true
    project_name         = "test-etk"
    environment          = "dev"
    region               = "us-east-1"
    rest_api_id          = "api123"
    rest_api_name        = "TestApi"
    api_stage_name       = "dev"
    alarm_thresholds = {
      api_5xx_error = {
        warning  = 0.02
        critical = 0.10
      }
      state_machine_failed = {
        warning  = 5
        critical = 20
      }
    }
    state_machines = {
      sm1 = { state_machine_name = "sm1", display_name = "SM1" }
    }
  }

  module {
    source = "./modules/telemetry"
  }

  assert {
    condition     = aws_cloudwatch_metric_alarm.api_5xx_warning[0].threshold == 0.02
    error_message = "Custom API 5XX warning threshold should be 0.02"
  }

  assert {
    condition     = aws_cloudwatch_metric_alarm.api_5xx_critical[0].threshold == 0.10
    error_message = "Custom API 5XX critical threshold should be 0.10"
  }

  assert {
    condition     = aws_cloudwatch_metric_alarm.sfn_failed_warning["sm1"].threshold == 5
    error_message = "Custom SFN failed warning threshold should be 5"
  }

  assert {
    condition     = aws_cloudwatch_metric_alarm.sfn_failed_critical["sm1"].threshold == 20
    error_message = "Custom SFN failed critical threshold should be 20"
  }
}

