# Agent-as-Judge evaluator — standalone isolated evaluator that runs an OpenCode
# agent as the judge. Mirrors packages/deployment/lib/stacks/external-plugins.ts
# `setupAgentAsJudgeEvaluator()` + the shared LambdaEvaluator construct
# (packages/cdk/src/plugins/lambdaEvaluator.ts).
#
# The evaluator is always deployed (CDK parity — setupAgentAsJudgeEvaluator()
# runs unconditionally). Its image must be present in the manifest; a null
# evaluator_agent_as_judge_image_uri fails the plan via the precondition below.
#
# Networking: the Lambda is pinned to ISOLATED (no-internet) subnets when
# available — matching the CDK, whose in-Lambda network_guard fails loudly if it
# detects egress. When no isolated subnets exist (e.g. BYO-VPC without them) it
# falls back to the private subnets; the network guard will fail at runtime —
# use only for testing.

locals {
  # Agent-as-judge is always deployed (CDK parity — setupAgentAsJudgeEvaluator()
  # runs unconditionally). Its image must be present in the manifest; a null URI
  # is a hard error, enforced by the precondition on the Lambda below.
  agent_as_judge_enabled = true

  # Prefer isolated subnets; fall back to private subnets (testing only).
  agent_as_judge_subnet_ids = length(var.isolated_subnet_ids) > 0 ? var.isolated_subnet_ids : var.subnet_ids
}

# =============================================================================
# Lambda
# =============================================================================

resource "aws_cloudwatch_log_group" "evaluator_agent_as_judge" {
  count = local.agent_as_judge_enabled ? 1 : 0

  name              = "/aws/lambda/${var.project_name}-${var.environment}-evaluator-agent-as-judge"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.encryption_key_arn

  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-evaluator-agent-as-judge-logs"
  })

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_lambda_function" "evaluator_agent_as_judge" {
  count = local.agent_as_judge_enabled ? 1 : 0

  function_name = "${var.project_name}-${var.environment}-evaluator-agent-as-judge"
  role          = aws_iam_role.evaluator_agent_as_judge[0].arn
  package_type  = "Image"
  image_uri     = var.evaluator_agent_as_judge_image_uri
  timeout       = 900
  memory_size   = 2048

  vpc_config {
    subnet_ids         = local.agent_as_judge_subnet_ids
    security_group_ids = [var.lambda_security_group_id]
  }

  tracing_config {
    mode = var.enable_xray ? "Active" : "PassThrough"
  }

  kms_key_arn = var.encryption_key_arn

  environment {
    variables = {
      EVALUATOR_NAME = "agent-as-judge"
      # Airgapped callback: the shared API is PRIVATE (EndpointType.PRIVATE) and
      # reached via the execute-api VPC endpoint with private DNS on, so the
      # standard private-API hostname resolves in-VPC with no internet path —
      # exactly as in CDK (one private API serves all in-VPC evaluators).
      ETK_API_ENDPOINT        = "https://${local.private_rest_api_id}.execute-api.${var.region}.amazonaws.com/${var.environment}"
      POWERTOOLS_SERVICE_NAME = "evaluator-agent-as-judge"
      LOG_LEVEL               = var.log_level
      # Leave headroom under the 15-min Lambda limit for test-case I/O overhead.
      SUBPROCESS_TIMEOUT_MINUTES = "10"
    }
  }

  depends_on = [aws_cloudwatch_log_group.evaluator_agent_as_judge]

  lifecycle {
    precondition {
      condition     = var.evaluator_agent_as_judge_image_uri != null
      error_message = "evaluator_agent_as_judge_image_uri must be set — the agent-as-judge evaluator is always deployed. Ensure the evaluator-agent-as-judge image is published in deployed_image_uris (CI builds it from plugins.yaml; for infra-only runs use seed-placeholder-images)."
    }
  }

  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-evaluator-agent-as-judge"
  })
}

# =============================================================================
# IAM
# =============================================================================

resource "aws_iam_role" "evaluator_agent_as_judge" {
  count = local.agent_as_judge_enabled ? 1 : 0

  name               = "${var.project_name}-${var.environment}-evaluator-agent-as-judge-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
  tags               = var.tags
}

resource "aws_iam_role_policy_attachment" "evaluator_agent_as_judge" {
  count      = local.agent_as_judge_enabled ? length(local.lambda_managed_policies) : 0
  role       = aws_iam_role.evaluator_agent_as_judge[0].name
  policy_arn = local.lambda_managed_policies[count.index]
}

resource "aws_iam_role_policy" "evaluator_agent_as_judge" {
  count = local.agent_as_judge_enabled ? 1 : 0
  name  = "${var.project_name}-${var.environment}-evaluator-agent-as-judge-policy"
  role  = aws_iam_role.evaluator_agent_as_judge[0].name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ApiGatewayInvoke"
        Effect = "Allow"
        Action = ["execute-api:Invoke"]
        # Least-privilege: restrict to the exact routes AAJ calls, with explicit
        # HTTP verbs — mirrors CDK external-plugins.ts executeApiRoutes for AAJ.
        # Enforced because the private API resource policy is DENY-only (no broad
        # Allow), so these IAM path grants actually gate access. ARN form is
        # {exec_arn}/{stage}/{method}/{resource-path}.
        Resource = [
          "${local.private_rest_api_execution_arn}/*/GET/v2/jobs/*",                          # dedup check
          "${local.private_rest_api_execution_arn}/*/PUT/v2/jobs/*/status",                   # status updates
          "${local.private_rest_api_execution_arn}/*/GET/v2/reports/*/results",               # list existing results
          "${local.private_rest_api_execution_arn}/*/POST/v2/reports/*/results/scores/batch", # write scores
          "${local.private_rest_api_execution_arn}/*/GET/datasets/*/testcases",               # dataset-sourced jobs
          "${local.private_rest_api_execution_arn}/*/GET/datasets/*/testcases/*",             # single test case
        ]
      },
      {
        Sid      = "BedrockInvoke"
        Effect   = "Allow"
        Action   = ["bedrock:InvokeModel", "bedrock:Converse", "bedrock:InvokeModelWithResponseStream"]
        Resource = ["arn:aws:bedrock:*:${var.aws_account_id}:inference-profile/*", "arn:aws:bedrock:*::foundation-model/*"]
      },
      {
        Sid      = "S3ReadRequirementDocs"
        Effect   = "Allow"
        Action   = ["s3:GetObject"]
        Resource = ["${var.datastore_bucket_arn}/evaluation/agent-as-judge/*"]
      },
      {
        Sid      = "S3ListRequirementDocs"
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = [var.datastore_bucket_arn]
        Condition = {
          StringLike = { "s3:prefix" = ["evaluation/agent-as-judge/*"] }
        }
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

resource "aws_iam_role_policy" "evaluator_agent_as_judge_kms" {
  count = local.agent_as_judge_enabled && var.encryption_key_arn != null ? 1 : 0
  name  = "${var.project_name}-${var.environment}-evaluator-agent-as-judge-kms"
  role  = aws_iam_role.evaluator_agent_as_judge[0].name

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
# EventBridge — route EvaluatorTaskDispatched events for the agent-as-judge
# evaluator + on-failure destination (matches LambdaEvaluator construct).
# =============================================================================

resource "aws_cloudwatch_event_rule" "agent_as_judge_evaluator_task" {
  count = local.agent_as_judge_enabled ? 1 : 0

  name           = "${var.project_name}-${var.environment}-agent-as-judge-evaluator-task"
  description    = "Routes evaluation tasks for the agent-as-judge evaluator"
  event_bus_name = local.event_bus_name

  event_pattern = jsonencode({
    source      = ["GenAiEvaluationToolkit"]
    detail-type = ["EvaluatorTaskDispatched"]
    detail      = { evaluatorName = ["agent-as-judge"] }
  })

  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-agent-as-judge-evaluator-task"
  })
}

resource "aws_cloudwatch_event_target" "agent_as_judge_evaluator_task" {
  count = local.agent_as_judge_enabled ? 1 : 0

  rule           = aws_cloudwatch_event_rule.agent_as_judge_evaluator_task[0].name
  target_id      = "AgentAsJudgeEvaluatorLambda"
  arn            = aws_lambda_function.evaluator_agent_as_judge[0].arn
  event_bus_name = local.event_bus_name
}

resource "aws_lambda_permission" "agent_as_judge_evaluator_from_eventbridge" {
  count = local.agent_as_judge_enabled ? 1 : 0

  statement_id  = "AllowEventBridgeInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.evaluator_agent_as_judge[0].function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.agent_as_judge_evaluator_task[0].arn
}

resource "aws_lambda_function_event_invoke_config" "agent_as_judge_evaluator" {
  count = local.agent_as_judge_enabled ? 1 : 0

  function_name          = aws_lambda_function.evaluator_agent_as_judge[0].function_name
  maximum_retry_attempts = 1

  destination_config {
    on_failure {
      destination = var.event_bus_arn
    }
  }
}
