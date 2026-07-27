locals {
  event_bus_name = element(split("/", var.event_bus_arn), 1)
}

# Step Functions State Machine for Generation Workflow
# Matches CDK GenerationStateMachine construct exactly
# This state machine orchestrates the generation process:
# 1. Emit metric for generation started
# 2. Start experiment run
# 3. Iterate over plugins and invoke them
# 4. End experiment run
# 5. Emit metric for generation completed
# 6. Publish completion event to EventBridge

# IAM Role for Step Functions Execution
resource "aws_iam_role" "generation_sfn" {
  name = "${var.project_name}-${var.environment}-generation-sfn-role"

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
    Name = "${var.project_name}-${var.environment}-generation-sfn-role"
  }
}

# Step Functions CloudWatch Logs Policy
resource "aws_iam_role_policy" "generation_sfn_cloudwatch" {
  name = "${var.project_name}-${var.environment}-generation-sfn-cloudwatch"
  role = aws_iam_role.generation_sfn.id

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
resource "aws_iam_role_policy_attachment" "generation_sfn_xray" {
  role       = aws_iam_role.generation_sfn.name
  policy_arn = "arn:aws:iam::aws:policy/AWSXRayDaemonWriteAccess"
}

# Step Functions EventBridge Policy
resource "aws_iam_role_policy" "generation_sfn_eventbridge" {
  name = "${var.project_name}-${var.environment}-generation-sfn-eventbridge"
  role = aws_iam_role.generation_sfn.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "events:PutEvents"
        ]
        Resource = var.event_bus_arn
      }
    ]
  })
}

# Step Functions Lambda Invoke Policy (for asyncHandler)
resource "aws_iam_role_policy" "generation_sfn_lambda" {
  name = "${var.project_name}-${var.environment}-generation-sfn-lambda"
  role = aws_iam_role.generation_sfn.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "lambda:InvokeFunction"
        ]
        Resource = [
          aws_lambda_function.gen_async_handler.arn,
          "${aws_lambda_function.gen_async_handler.arn}:*"
        ]
      }
    ]
  })
}

# Step Functions CloudWatch Metrics Policy
resource "aws_iam_role_policy" "generation_sfn_cloudwatch_metrics" {
  name = "${var.project_name}-${var.environment}-generation-sfn-cloudwatch-metrics"
  role = aws_iam_role.generation_sfn.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "cloudwatch:PutMetricData"
        ]
        Resource = "*"
      }
    ]
  })
}

# Step Functions S3 Policy
resource "aws_iam_role_policy" "generation_sfn_s3" {
  name = "${var.project_name}-${var.environment}-generation-sfn-s3"
  role = aws_iam_role.generation_sfn.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:CopyObject"
        ]
        Resource = "${aws_s3_bucket.generation.arn}/*"
      },
      {
        Effect = "Allow"
        Action = [
          "s3:ListBucket",
          "s3:ListObjectsV2"
        ]
        Resource = aws_s3_bucket.generation.arn
      }
    ]
  })
}

# Step Functions KMS Policy (if encryption enabled)
resource "aws_iam_role_policy" "generation_sfn_kms" {
  count = var.encryption_key_arn != null ? 1 : 0

  name = "${var.project_name}-${var.environment}-generation-sfn-kms"
  role = aws_iam_role.generation_sfn.id

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

# CloudWatch Log Group for Step Functions
resource "aws_cloudwatch_log_group" "generation_sfn" {
  name              = "/aws/stepfunctions/${var.project_name}-${var.environment}-generation"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.encryption_key_arn

  tags = {
    Name = "${var.project_name}-${var.environment}-generation-sfn-logs"
  }
}

# Generation Workflow State Machine - Matches CDK exactly
# Updated: Fixed ItemSelector to use $.Map.Item.Value instead of States.JsonMerge
resource "aws_sfn_state_machine" "generation" {
  name     = "${var.project_name}-${var.environment}-generation"
  role_arn = aws_iam_role.generation_sfn.arn

  definition = jsonencode({
    Comment = "Generation Workflow for ETK"
    StartAt = "ShouldEmitMetricStarted"
    States = {
      ShouldEmitMetricStarted = {
        Type    = "Choice"
        Comment = "Check if observability layer is configured for metric emission"
        Choices = [
          {
            And = [
              {
                Variable  = "$.observabilityLayer.metricNamespace"
                IsPresent = true
              },
              {
                Not = {
                  Variable     = "$.observabilityLayer.metricNamespace"
                  StringEquals = ""
                }
              },
              {
                Variable = "$.observabilityLayer.metricNamespace"
                IsNull   = false
              }
            ]
            Next = "EmitStarted"
          }
        ]
        Default = "SkipEmitMetricsStarted"
      }

      EmitStarted = {
        Type     = "Task"
        Resource = "arn:aws:states:::aws-sdk:cloudwatch:putMetricData"
        Comment  = "Emit GENERATION_STARTED metric to CloudWatch"
        Parameters = {
          MetricData = [
            {
              MetricName = "GENERATION_STARTED"
              Value      = 1
            }
          ]
          "Namespace.$" = "$.observabilityLayer.metricNamespace"
        }
        ResultPath = "$.observability-GENERATION_STARTED-result"
        Next       = "IteratePlugins"
      }

      SkipEmitMetricsStarted = {
        Type    = "Pass"
        Comment = "Skip metric emission - observability not configured"
        Next    = "IteratePlugins"
      }

      IteratePlugins = {
        Type      = "Map"
        Comment   = "Iterate over plugins"
        ItemsPath = "$.steps"
        ItemSelector = {
          "detail.$" = "States.JsonMerge($, $$.Map.Item.Value, false)"
          "id.$"     = "$$.Execution.Name"
          "index.$"  = "$$.Map.Item.Index"
        }
        ResultPath     = "$.pluginResults"
        MaxConcurrency = 1
        ItemProcessor = {
          ProcessorConfig = {
            Mode = "INLINE"
          }
          StartAt = "PluginPayload"
          States = {
            PluginPayload = {
              Type    = "Pass"
              Comment = "Prepare plugin payload"
              Parameters = {
                "id.$"     = "$.id"
                "plugin.$" = "$.detail.plugin"
                input = {
                  bucket     = aws_s3_bucket.generation.id
                  "prefix.$" = "States.Format('{}/{}', $.id, $.index)"
                }
                output = {
                  bucket     = aws_s3_bucket.generation.id
                  "prefix.$" = "States.Format('{}/{}', $.id, States.MathAdd($.index, 1))"
                }
                "configuration.$" = "$.detail.configuration"
              }
              ResultPath = "$.detail"
              Next       = "InvokePluginWithContext"
            }

            InvokePluginWithContext = {
              Type    = "Parallel"
              Comment = "Invoke plugin with context preservation (async/await pattern)"
              Branches = [
                {
                  StartAt = "PreservePluginContext"
                  States = {
                    PreservePluginContext = {
                      Type = "Pass"
                      End  = true
                    }
                  }
                },
                {
                  StartAt = "InvokeAsyncHandler"
                  States = {
                    InvokeAsyncHandler = {
                      Type     = "Task"
                      Resource = "arn:aws:states:::lambda:invoke.waitForTaskToken"
                      Comment  = "Invoke asyncHandler to send EventBridge event with task token"
                      Parameters = {
                        FunctionName = aws_lambda_function.gen_async_handler.arn
                        Payload = {
                          "detail.$"    = "$.detail"
                          "taskToken.$" = "$$.Task.Token"
                        }
                      }
                      HeartbeatSeconds = 600
                      End              = true
                    }
                  }
                }
              ]
              ResultPath = "$.parallelResult"
              Next       = "MergePluginContext"
            }

            MergePluginContext = {
              Type    = "Pass"
              Comment = "Merge context after plugin invocation"
              Parameters = {
                "detail.$" = "States.JsonMerge($.parallelResult[0].detail, $.parallelResult[1], false)"
                "id.$"     = "$.id"
                "index.$"  = "$.index"
              }
              End = true
            }
          }
        }
        Catch = [
          {
            ErrorEquals = ["States.Timeout"]
            Next        = "EnrichTimeoutError"
            ResultPath  = "$.error"
          },
          {
            ErrorEquals = ["States.ALL"]
            Next        = "ShouldEmitMetricFailed"
            ResultPath  = "$.error"
          }
        ]
        Next = "ShouldEmitMetricEnded"
      }

      EnrichTimeoutError = {
        Type    = "Pass"
        Comment = "Enrich timeout error with details"
        Parameters = {
          error = {
            Error     = "States.Timeout"
            "Cause.$" = "States.Format('Plugin execution timed out after 10 minutes. Plugin(s): {}. This can occur if the plugin failed to start, crashed during execution, or stopped sending progress updates. Verify the plugin name is correct and the plugin is properly configured.', States.JsonToString($.steps[*].plugin))"
          }
          "steps.$" = "$.steps"
        }
        Next = "ShouldEmitMetricFailed"
      }

      FailState = {
        Type      = "Fail"
        Comment   = "Fail the workflow"
        ErrorPath = "$.error.Error"
        CausePath = "$.error.Cause"
      }

      ShouldEmitMetricEnded = {
        Type    = "Choice"
        Comment = "Check if observability layer is configured for metric emission"
        Choices = [
          {
            And = [
              {
                Variable  = "$.observabilityLayer.metricNamespace"
                IsPresent = true
              },
              {
                Not = {
                  Variable     = "$.observabilityLayer.metricNamespace"
                  StringEquals = ""
                }
              },
              {
                Variable = "$.observabilityLayer.metricNamespace"
                IsNull   = false
              }
            ]
            Next = "EmitEnded"
          }
        ]
        Default = "SkipEmitMetricsEnded"
      }

      EmitEnded = {
        Type     = "Task"
        Resource = "arn:aws:states:::aws-sdk:cloudwatch:putMetricData"
        Comment  = "Emit GENERATION_COMPLETED metric to CloudWatch"
        Parameters = {
          MetricData = [
            {
              MetricName = "GENERATION_COMPLETED"
              Value      = 1
            }
          ]
          "Namespace.$" = "$.observabilityLayer.metricNamespace"
        }
        ResultPath = "$.observability-GENERATION_COMPLETED-result"
        Next       = "EmitEvent"
      }

      SkipEmitMetricsEnded = {
        Type    = "Pass"
        Comment = "Skip metric emission - observability not configured"
        Next    = "EmitEvent"
      }

      ShouldEmitMetricFailed = {
        Type    = "Choice"
        Comment = "Check if observability layer is configured for metric emission"
        Choices = [
          {
            And = [
              {
                Variable  = "$.observabilityLayer.metricNamespace"
                IsPresent = true
              },
              {
                Not = {
                  Variable     = "$.observabilityLayer.metricNamespace"
                  StringEquals = ""
                }
              },
              {
                Variable = "$.observabilityLayer.metricNamespace"
                IsNull   = false
              }
            ]
            Next = "EmitFailed"
          }
        ]
        Default = "SkipEmitMetricsFailed"
      }

      EmitFailed = {
        Type     = "Task"
        Resource = "arn:aws:states:::aws-sdk:cloudwatch:putMetricData"
        Comment  = "Emit GENERATION_FAILED metric to CloudWatch"
        Parameters = {
          MetricData = [
            {
              MetricName = "GENERATION_FAILED"
              Value      = 1
            }
          ]
          "Namespace.$" = "$.observabilityLayer.metricNamespace"
        }
        ResultPath = "$.observability-GENERATION_FAILED-result"
        Next       = "FailState"
      }

      SkipEmitMetricsFailed = {
        Type    = "Pass"
        Comment = "Skip metric emission - observability not configured"
        Next    = "FailState"
      }

      EmitEvent = {
        Type     = "Task"
        Resource = "arn:aws:states:::events:putEvents"
        Comment  = "Publish to EventBridge"
        Parameters = {
          Entries = [
            {
              Detail = {
                status = "Done"
              }
              DetailType   = "genAiEtkGenerationDoneEvent"
              Source       = "GenAiEvaluationToolkit"
              EventBusName = local.event_bus_name
            }
          ]
        }
        ResultPath = "$.eventBridgeResult"
        End        = true
      }
    }
  })

  logging_configuration {
    log_destination        = "${aws_cloudwatch_log_group.generation_sfn.arn}:*"
    include_execution_data = true
    level                  = "ALL"
  }

  tracing_configuration {
    enabled = var.enable_xray
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-generation"
  }

  depends_on = [
    aws_iam_role_policy.generation_sfn_cloudwatch,
    aws_iam_role_policy.generation_sfn_eventbridge,
    aws_iam_role_policy.generation_sfn_cloudwatch_metrics,
    aws_iam_role_policy.generation_sfn_s3
  ]
}
