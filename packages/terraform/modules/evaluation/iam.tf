# Per-function IAM roles for Evaluation Lambda functions (SDKV2)

data "aws_iam_policy_document" "lambda_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

# Helper: managed policy attachments common to all Lambda roles
locals {
  lambda_managed_policies = [
    "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
    "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole",
    "arn:aws:iam::aws:policy/AWSXRayDaemonWriteAccess",
  ]
}

# =============================================================================
# Evaluator API Lambda Role
# =============================================================================

resource "aws_iam_role" "evaluator_api" {
  name               = "${var.project_name}-${var.environment}-evaluator-api-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
  tags               = var.tags
}

resource "aws_iam_role_policy_attachment" "evaluator_api" {
  count      = length(local.lambda_managed_policies)
  role       = aws_iam_role.evaluator_api.name
  policy_arn = local.lambda_managed_policies[count.index]
}

resource "aws_iam_role_policy" "evaluator_api" {
  name = "${var.project_name}-${var.environment}-evaluator-api-policy"
  role = aws_iam_role.evaluator_api.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "DynamoDBReadWrite"
        Effect   = "Allow"
        Action   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:DeleteItem", "dynamodb:Query", "dynamodb:Scan", "dynamodb:BatchWriteItem", "dynamodb:BatchGetItem"]
        Resource = [aws_dynamodb_table.evaluator.arn, "${aws_dynamodb_table.evaluator.arn}/index/*"]
      },
      {
        Sid      = "EventBridgePutEvents"
        Effect   = "Allow"
        Action   = ["events:PutEvents"]
        Resource = [var.event_bus_arn]
      },
      {
        Sid      = "StepFunctionsExecution"
        Effect   = "Allow"
        Action   = ["states:StartExecution", "states:SendTaskSuccess", "states:SendTaskFailure", "states:SendTaskHeartbeat"]
        Resource = [aws_sfn_state_machine.orchestration.arn]
      },
      {
        Sid      = "MLflowTracking"
        Effect   = "Allow"
        Action   = ["sagemaker:CreateMlflowTrackingServer", "sagemaker:GetMlflowTrackingServer", "sagemaker-mlflow:CreateExperiment", "sagemaker-mlflow:GetExperiment", "sagemaker-mlflow:GetExperimentByName", "sagemaker-mlflow:CreateRun", "sagemaker-mlflow:GetRun", "sagemaker-mlflow:UpdateRun", "sagemaker-mlflow:LogParam", "sagemaker-mlflow:LogMetric", "sagemaker-mlflow:LogBatch", "sagemaker-mlflow:SearchRuns"]
        Resource = [var.mlflow_server_arn]
      },
    ]
  })
}

resource "aws_iam_role_policy" "evaluator_api_kms" {
  count = var.encryption_key_arn != null ? 1 : 0
  name  = "${var.project_name}-${var.environment}-evaluator-api-kms"
  role  = aws_iam_role.evaluator_api.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["kms:Decrypt", "kms:GenerateDataKey"]
      Resource = var.encryption_key_arn
    }]
  })
}

# =============================================================================
# Post-Processing Lambda Role
# =============================================================================

resource "aws_iam_role" "evaluator_post_processing" {
  name               = "${var.project_name}-${var.environment}-evaluator-post-proc-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
  tags               = var.tags
}

resource "aws_iam_role_policy_attachment" "evaluator_post_processing" {
  count      = length(local.lambda_managed_policies)
  role       = aws_iam_role.evaluator_post_processing.name
  policy_arn = local.lambda_managed_policies[count.index]
}

resource "aws_iam_role_policy" "evaluator_post_processing" {
  name = "${var.project_name}-${var.environment}-evaluator-post-proc-policy"
  role = aws_iam_role.evaluator_post_processing.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "DynamoDBReadWrite"
        Effect   = "Allow"
        Action   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:DeleteItem", "dynamodb:Query", "dynamodb:Scan", "dynamodb:BatchWriteItem", "dynamodb:BatchGetItem"]
        Resource = [aws_dynamodb_table.evaluator.arn, "${aws_dynamodb_table.evaluator.arn}/index/*"]
      },
      {
        Sid      = "StepFunctionsSendTask"
        Effect   = "Allow"
        Action   = ["states:SendTaskSuccess", "states:SendTaskFailure", "states:SendTaskHeartbeat"]
        Resource = [aws_sfn_state_machine.orchestration.arn]
      },
      {
        Sid      = "MLflowTracking"
        Effect   = "Allow"
        Action   = ["sagemaker-mlflow:GetExperiment", "sagemaker-mlflow:GetExperimentByName", "sagemaker-mlflow:GetRun", "sagemaker-mlflow:UpdateRun", "sagemaker-mlflow:LogMetric", "sagemaker-mlflow:LogBatch", "sagemaker-mlflow:SearchRuns"]
        Resource = [var.mlflow_server_arn]
      },
      {
        Sid      = "MLflowArtifactBucket"
        Effect   = "Allow"
        Action   = ["s3:PutObject", "s3:GetObject"]
        Resource = ["${var.mlflow_artifact_bucket_arn}/*"]
      },
      {
        Sid      = "EventBridgePutEvents"
        Effect   = "Allow"
        Action   = ["events:PutEvents"]
        Resource = [var.event_bus_arn]
      },
    ]
  })
}

resource "aws_iam_role_policy" "evaluator_post_processing_kms" {
  count = var.encryption_key_arn != null ? 1 : 0
  name  = "${var.project_name}-${var.environment}-evaluator-post-proc-kms"
  role  = aws_iam_role.evaluator_post_processing.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["kms:Decrypt", "kms:GenerateDataKey"]
      Resource = var.encryption_key_arn
    }]
  })
}

# =============================================================================
# Internal Handler Lambda Role
# =============================================================================

resource "aws_iam_role" "evaluator_internal_handler" {
  name               = "${var.project_name}-${var.environment}-evaluator-internal-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
  tags               = var.tags
}

resource "aws_iam_role_policy_attachment" "evaluator_internal_handler" {
  count      = length(local.lambda_managed_policies)
  role       = aws_iam_role.evaluator_internal_handler.name
  policy_arn = local.lambda_managed_policies[count.index]
}

resource "aws_iam_role_policy" "evaluator_internal_handler" {
  name = "${var.project_name}-${var.environment}-evaluator-internal-policy"
  role = aws_iam_role.evaluator_internal_handler.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "DynamoDBReadWrite"
        Effect   = "Allow"
        Action   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:DeleteItem", "dynamodb:Query", "dynamodb:Scan", "dynamodb:BatchWriteItem", "dynamodb:BatchGetItem"]
        Resource = [aws_dynamodb_table.evaluator.arn, "${aws_dynamodb_table.evaluator.arn}/index/*"]
      },
      {
        Sid      = "StepFunctionsSendTask"
        Effect   = "Allow"
        Action   = ["states:SendTaskSuccess", "states:SendTaskFailure", "states:SendTaskHeartbeat"]
        Resource = [aws_sfn_state_machine.orchestration.arn]
      },
      {
        Sid      = "EventBridgePutEvents"
        Effect   = "Allow"
        Action   = ["events:PutEvents"]
        Resource = [var.event_bus_arn]
      },
    ]
  })
}

resource "aws_iam_role_policy" "evaluator_internal_handler_kms" {
  count = var.encryption_key_arn != null ? 1 : 0
  name  = "${var.project_name}-${var.environment}-evaluator-internal-kms"
  role  = aws_iam_role.evaluator_internal_handler.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["kms:Decrypt", "kms:GenerateDataKey"]
      Resource = var.encryption_key_arn
    }]
  })
}

# =============================================================================
# Scheduler Trigger Lambda Role
# =============================================================================

resource "aws_iam_role" "evaluator_scheduler_trigger" {
  name               = "${var.project_name}-${var.environment}-evaluator-scheduler-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
  tags               = var.tags
}

resource "aws_iam_role_policy_attachment" "evaluator_scheduler_trigger" {
  count      = length(local.lambda_managed_policies)
  role       = aws_iam_role.evaluator_scheduler_trigger.name
  policy_arn = local.lambda_managed_policies[count.index]
}

resource "aws_iam_role_policy" "evaluator_scheduler_trigger" {
  name = "${var.project_name}-${var.environment}-evaluator-scheduler-policy"
  role = aws_iam_role.evaluator_scheduler_trigger.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "DynamoDBReadWrite"
        Effect   = "Allow"
        Action   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:Query", "dynamodb:Scan"]
        Resource = [aws_dynamodb_table.evaluator.arn, "${aws_dynamodb_table.evaluator.arn}/index/*"]
      },
      {
        Sid      = "StepFunctionsStartExecution"
        Effect   = "Allow"
        Action   = ["states:StartExecution"]
        Resource = [aws_sfn_state_machine.orchestration.arn]
      },
      {
        Sid      = "EventBridgePutEvents"
        Effect   = "Allow"
        Action   = ["events:PutEvents"]
        Resource = [var.event_bus_arn]
      },
    ]
  })
}

resource "aws_iam_role_policy" "evaluator_scheduler_trigger_kms" {
  count = var.encryption_key_arn != null ? 1 : 0
  name  = "${var.project_name}-${var.environment}-evaluator-scheduler-kms"
  role  = aws_iam_role.evaluator_scheduler_trigger.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["kms:Decrypt", "kms:GenerateDataKey"]
      Resource = var.encryption_key_arn
    }]
  })
}

# =============================================================================
# Scheduler CRUD Handlers Role (TypeScript, shared across all 5 operations)
# =============================================================================

resource "aws_iam_role" "scheduler_handlers" {
  name               = "${var.project_name}-${var.environment}-eval-scheduler-crud-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
  tags               = var.tags
}

resource "aws_iam_role_policy_attachment" "scheduler_handlers" {
  count      = length(local.lambda_managed_policies)
  role       = aws_iam_role.scheduler_handlers.name
  policy_arn = local.lambda_managed_policies[count.index]
}

resource "aws_iam_role_policy" "scheduler_handlers" {
  name = "${var.project_name}-${var.environment}-eval-scheduler-crud-policy"
  role = aws_iam_role.scheduler_handlers.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "SchedulerManagement"
        Effect   = "Allow"
        Action   = ["scheduler:CreateSchedule", "scheduler:DeleteSchedule", "scheduler:GetSchedule", "scheduler:UpdateSchedule"]
        Resource = "arn:aws:scheduler:${var.region}:${var.aws_account_id}:schedule/${var.scheduler_group_name}/*"
      },
      {
        Sid      = "SchedulerListSchedules"
        Effect   = "Allow"
        Action   = ["scheduler:ListSchedules"]
        Resource = "*"
      },
      {
        Sid       = "PassRoleToScheduler"
        Effect    = "Allow"
        Action    = ["iam:PassRole"]
        Resource  = var.scheduler_execution_role_arn
        Condition = { StringLike = { "iam:PassedToService" = "scheduler.amazonaws.com" } }
      },
      {
        Sid    = "ConfigBucketAccess"
        Effect = "Allow"
        Action = ["s3:GetObject", "s3:PutObject", "s3:ListBucket", "s3:DeleteObject"]
        Resource = [
          "arn:aws:s3:::${var.config_bucket_name}",
          "arn:aws:s3:::${var.config_bucket_name}/*"
        ]
      },
    ]
  })
}

resource "aws_iam_role_policy" "scheduler_handlers_kms" {
  count = var.encryption_key_arn != null ? 1 : 0
  name  = "${var.project_name}-${var.environment}-eval-scheduler-crud-kms"
  role  = aws_iam_role.scheduler_handlers.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["kms:Decrypt", "kms:GenerateDataKey"]
      Resource = var.encryption_key_arn
    }]
  })
}

# =============================================================================
# Builtin Evaluator Lambda Role
# =============================================================================

resource "aws_iam_role" "evaluator_builtin" {
  count = var.evaluator_builtin_image_uri != null ? 1 : 0

  name               = "${var.project_name}-${var.environment}-evaluator-builtin-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
  tags               = var.tags
}

resource "aws_iam_role_policy_attachment" "evaluator_builtin" {
  count      = var.evaluator_builtin_image_uri != null ? length(local.lambda_managed_policies) : 0
  role       = aws_iam_role.evaluator_builtin[0].name
  policy_arn = local.lambda_managed_policies[count.index]
}

resource "aws_iam_role_policy" "evaluator_builtin" {
  count = var.evaluator_builtin_image_uri != null ? 1 : 0
  name  = "${var.project_name}-${var.environment}-evaluator-builtin-policy"
  role  = aws_iam_role.evaluator_builtin[0].name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "ApiGatewayInvoke"
        Effect   = "Allow"
        Action   = ["execute-api:Invoke"]
        Resource = ["${local.private_rest_api_execution_arn}/*/*/v2/*", "${local.private_rest_api_execution_arn}/*/*/datasets/*"]
      },
      {
        Sid      = "BedrockInvoke"
        Effect   = "Allow"
        Action   = ["bedrock:InvokeModel", "bedrock:Converse"]
        Resource = ["arn:aws:bedrock:*:${var.aws_account_id}:inference-profile/*", "arn:aws:bedrock:*::foundation-model/*"]
      },
      {
        Sid      = "BedrockAgentCoreEvaluate"
        Effect   = "Allow"
        Action   = ["bedrock-agentcore:Evaluate"]
        Resource = ["arn:aws:bedrock-agentcore:*:${var.aws_account_id}:evaluator/*"]
      },
      {
        Sid      = "EventBridgePutEvents"
        Effect   = "Allow"
        Action   = ["events:PutEvents"]
        Resource = [var.event_bus_arn]
      },
    ]
  })
}

resource "aws_iam_role_policy" "evaluator_builtin_kms" {
  count = var.evaluator_builtin_image_uri != null && var.encryption_key_arn != null ? 1 : 0
  name  = "${var.project_name}-${var.environment}-evaluator-builtin-kms"
  role  = aws_iam_role.evaluator_builtin[0].name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["kms:Decrypt", "kms:GenerateDataKey"]
      Resource = var.encryption_key_arn
    }]
  })
}

# AI Gateway client-secret read access — mirrors the CDK
# addGatewayEnvironment() grantRead on the OAuth2 client secret. Only created
# when a gateway is configured.
resource "aws_iam_role_policy" "evaluator_builtin_gateway_secret" {
  count = var.evaluator_builtin_image_uri != null && var.gateway_config != null ? 1 : 0
  name  = "${var.project_name}-${var.environment}-evaluator-builtin-gateway-secret"
  role  = aws_iam_role.evaluator_builtin[0].name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"]
      Resource = [var.gateway_config.client_secret_arn]
    }]
  })
}
