# ECS Plugin IAM Roles and Policies
# Matches CDK patterns from baseEcs.ts and eventDrivenEcs.ts

# =============================================================================
# ECS Task Execution Role
# Used by ECS agent to pull images and write logs
# =============================================================================

resource "aws_iam_role" "ecs_execution" {
  count = local.create_ecs_roles ? 1 : 0

  # Use shorter name to avoid 64 character limit
  name = "${local.short_name_prefix}-ecs-execution-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })

  tags = merge(
    local.common_tags,
    {
      Name = "${local.short_name_prefix}-ecs-execution-role"
    }
  )
}

# ECR Pull Permissions for Execution Role
resource "aws_iam_role_policy" "ecs_execution_ecr" {
  # checkov:skip=CKV_AWS_287: ecr:GetAuthorizationToken, ecr-public:GetAuthorizationToken and sts:GetServiceBearerToken do not support resource-level permissions in IAM and require Resource:"*". The privileged image-pull actions (BatchCheckLayerAvailability/GetDownloadUrlForLayer/BatchGetImage) are scoped to the account/region's ECR repos. Parity with CDK's BaseEcs ECR-pull policy.
  count = local.create_ecs_roles ? 1 : 0

  name = "${local.name_prefix}-ecr-pull"
  role = aws_iam_role.ecs_execution[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ecr:GetAuthorizationToken"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "ecr-public:GetAuthorizationToken",
          "sts:GetServiceBearerToken"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage"
        ]
        Resource = "arn:${data.aws_partition.current.partition}:ecr:${var.region}:${var.account_id}:repository/*"
      }
    ]
  })
}

# CloudWatch Logs Permissions for Execution Role
resource "aws_iam_role_policy" "ecs_execution_logs" {
  count = local.create_ecs_roles ? 1 : 0

  name = "${local.name_prefix}-logs"
  role = aws_iam_role.ecs_execution[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = [
          # Plugin log group - /aws/ecs/${project_name}-${environment}-plugin-${plugin_name}
          "arn:${data.aws_partition.current.partition}:logs:${var.region}:${var.account_id}:log-group:/aws/ecs/${local.name_prefix}*:*",
          # OpenTelemetry collector log group
          "arn:${data.aws_partition.current.partition}:logs:${var.region}:${var.account_id}:log-group:/aws/ecs/ecs-aws-otel-collector*:*",
          # Legacy task log groups
          "arn:${data.aws_partition.current.partition}:logs:${var.region}:${var.account_id}:log-group:/aws/ecs/*-task*:*"
        ]
      }
    ]
  })
}

# KMS Permissions for Execution Role (Conditional)
resource "aws_iam_role_policy" "ecs_execution_kms" {
  count = local.create_ecs_roles && var.encryption_key_arn != null ? 1 : 0

  name = "${local.name_prefix}-execution-kms"
  role = aws_iam_role.ecs_execution[0].id

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

# =============================================================================
# ECS Task Role
# Used by the application running in the container
# =============================================================================

resource "aws_iam_role" "ecs_task" {
  count = local.create_ecs_roles ? 1 : 0

  # Use shorter name to avoid 64 character limit
  name = "${local.short_name_prefix}-ecs-task-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })

  tags = merge(
    local.common_tags,
    {
      Name = "${local.short_name_prefix}-ecs-task-role"
    }
  )
}

# =============================================================================
# EventBridge PutEvents Policy for Task Role
# =============================================================================

resource "aws_iam_role_policy" "ecs_task_eventbridge" {
  count = local.create_ecs_roles ? 1 : 0

  name = "${local.name_prefix}-eventbridge"
  role = aws_iam_role.ecs_task[0].id

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

# =============================================================================
# S3 Access Policy for Task Role
# =============================================================================

resource "aws_iam_role_policy" "ecs_task_s3" {
  count = local.create_ecs_roles ? 1 : 0

  name = "${local.name_prefix}-s3"
  role = aws_iam_role.ecs_task[0].id

  # RW on the shared plugin bucket, plus the plugin's own internal bucket when
  # one is provided (CDK: plugin.internalBucket.grantReadWrite(this.taskRole)).
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = concat([
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject"
        ]
        Resource = "${var.bucket_arn}/*"
      },
      {
        Effect = "Allow"
        Action = [
          "s3:ListBucket",
          "s3:GetBucketLocation"
        ]
        Resource = var.bucket_arn
      }
      ], var.internal_bucket_arn == null ? [] : [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject"
        ]
        Resource = "${var.internal_bucket_arn}/*"
      },
      {
        Effect = "Allow"
        Action = [
          "s3:ListBucket",
          "s3:GetBucketLocation"
        ]
        Resource = var.internal_bucket_arn
      }
    ])
  })
}

# =============================================================================
# X-Ray Policy for Task Role
# Matches CDK addObservabilityPermissions from baseEcs.ts
# =============================================================================

resource "aws_iam_role_policy" "ecs_task_xray" {
  count = local.create_ecs_roles ? 1 : 0

  name = "${local.name_prefix}-xray"
  role = aws_iam_role.ecs_task[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "xray:PutTraceSegments",
          "xray:PutTelemetryRecords",
          "xray:GetSamplingRules",
          "xray:GetSamplingTargets",
          "xray:GetSamplingStatisticSummaries"
        ]
        Resource = "*"
      }
    ]
  })
}

# =============================================================================
# CloudWatch Policy for Task Role
# Matches CDK addObservabilityPermissions from baseEcs.ts
# =============================================================================

resource "aws_iam_role_policy" "ecs_task_cloudwatch" {
  count = local.create_ecs_roles ? 1 : 0

  name = "${local.name_prefix}-cloudwatch"
  role = aws_iam_role.ecs_task[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "cloudwatch:PutMetricData"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:DescribeLogStreams"
        ]
        Resource = [
          "arn:${data.aws_partition.current.partition}:logs:${var.region}:${var.account_id}:log-group:/aws/ecs/ecs-aws-otel-collector*",
          "arn:${data.aws_partition.current.partition}:logs:${var.region}:${var.account_id}:log-group:/aws/ecs/ecs-aws-otel-collector*:log-stream:*",
          "arn:${data.aws_partition.current.partition}:logs:${var.region}:${var.account_id}:log-group:/aws/ecs/*-task*",
          "arn:${data.aws_partition.current.partition}:logs:${var.region}:${var.account_id}:log-group:/aws/ecs/*-task*:log-stream:*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "ssm:GetParameters"
        ]
        Resource = "arn:${data.aws_partition.current.partition}:ssm:${var.region}:${var.account_id}:parameter/AmazonCloudWatch-*"
      }
    ]
  })
}

# =============================================================================
# Bedrock Access — BASE task-role permissions (all gen ECS plugins, batch OR
# converse). Mirrors CDK base eventDrivenEcs.addBedrockPermissions(), which
# unconditionally grants every event-driven ECS task role
# CreateModelInvocationJob + GetModelInvocationJob + InvokeModel on
# model-invocation-job/* + inference-profile/* + foundation-model/*.
# The plugin itself launches/polls the Bedrock batch job from the task role
# (plugin-gen-rag/src/helpers/bedrock.ts), so these actions are required even in
# batch mode; the separate batch role (below) is what Bedrock assumes to run the
# job and touch S3.
# =============================================================================

resource "aws_iam_role_policy" "ecs_task_bedrock" {
  count = local.bedrock_batch_mode || local.bedrock_converse_mode ? 1 : 0

  name = "${local.name_prefix}-bedrock"
  role = aws_iam_role.ecs_task[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "bedrock:CreateModelInvocationJob",
          "bedrock:GetModelInvocationJob",
          "bedrock:InvokeModel"
        ]
        Resource = [
          "arn:${data.aws_partition.current.partition}:bedrock:*:${var.account_id}:model-invocation-job/*",
          "arn:${data.aws_partition.current.partition}:bedrock:*:${var.account_id}:inference-profile/*",
          "arn:${data.aws_partition.current.partition}:bedrock:*::foundation-model/*"
        ]
      }
    ]
  })
}

# =============================================================================
# Bedrock Access — CONVERSE mode addition (agenticTestCases)
# On top of the base permissions, the task role gets InvokeModelWithResponseStream
# for real-time/streaming inference. Matches CDK grantBedrockConverseAccess
# (external-plugins.ts) layered over the base eventDrivenEcs grant.
# =============================================================================

resource "aws_iam_role_policy" "ecs_task_bedrock_converse" {
  count = local.bedrock_converse_mode ? 1 : 0

  name = "${local.name_prefix}-bedrock-converse"
  role = aws_iam_role.ecs_task[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "bedrock:InvokeModel",
          "bedrock:InvokeModelWithResponseStream"
        ]
        Resource = [
          "arn:${data.aws_partition.current.partition}:bedrock:*:${var.account_id}:inference-profile/*",
          "arn:${data.aws_partition.current.partition}:bedrock:*::foundation-model/*"
        ]
      }
    ]
  })
}

# =============================================================================
# Bedrock Access — BATCH mode (generateTestCases / rag, llmAsAJudge)
# A separate role assumed by bedrock.amazonaws.com runs batch inference jobs:
# it reads input from / writes output to the plugin's OWN internal bucket and
# invokes the model. The task role (base policy above) launches the job and
# passes this role to Bedrock. Matches CDK grantBatchBedrockAccess.
# =============================================================================

resource "aws_iam_role" "bedrock_batch_job" {
  count = local.bedrock_batch_mode ? 1 : 0

  name = "${local.short_name_prefix}-bedrock-batch-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "bedrock.amazonaws.com"
        }
      }
    ]
  })

  tags = merge(
    local.common_tags,
    {
      Name = "${local.short_name_prefix}-bedrock-batch-role"
    }
  )
}

# Batch role RW on the plugin's own internal bucket (CDK:
# plugin.internalBucket.grantReadWrite(bedrockRole)).
resource "aws_iam_role_policy" "bedrock_batch_s3" {
  count = local.bedrock_batch_mode ? 1 : 0

  name = "${local.name_prefix}-bedrock-batch-s3"
  role = aws_iam_role.bedrock_batch_job[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject"
        ]
        Resource = "${local.batch_internal_bucket_arn}/*"
      },
      {
        Effect = "Allow"
        Action = [
          "s3:ListBucket",
          "s3:GetBucketLocation"
        ]
        Resource = local.batch_internal_bucket_arn
      }
    ]
  })
}

resource "aws_iam_role_policy" "bedrock_batch_kms" {
  count = local.bedrock_batch_mode && var.encryption_key_arn != null ? 1 : 0

  name = "${local.name_prefix}-bedrock-batch-kms"
  role = aws_iam_role.bedrock_batch_job[0].id

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

# Bedrock assumes this role to execute the batch job and needs InvokeModel
# on the target inference profile (and the underlying foundation model the
# profile routes to). Without this policy, jobs fail with
# "Customer doesn't have permissions to invokeModel" after the InProgress
# phase, which surfaces in the plugin container as
# "AssertionError: Bedrock job status: Failed".
resource "aws_iam_role_policy" "bedrock_batch_invoke" {
  count = local.bedrock_batch_mode ? 1 : 0

  name = "${local.name_prefix}-bedrock-batch-invoke"
  role = aws_iam_role.bedrock_batch_job[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = ["bedrock:InvokeModel"]
        Resource = [
          "arn:${data.aws_partition.current.partition}:bedrock:*:${var.account_id}:inference-profile/*",
          "arn:${data.aws_partition.current.partition}:bedrock:*::foundation-model/*"
        ]
      }
    ]
  })
}

# Grant the ECS task role permission to pass the Bedrock batch role.
resource "aws_iam_role_policy" "ecs_task_pass_bedrock_role" {
  count = local.bedrock_batch_mode ? 1 : 0

  name = "${local.name_prefix}-pass-bedrock-role"
  role = aws_iam_role.ecs_task[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "iam:PassRole"
        Resource = aws_iam_role.bedrock_batch_job[0].arn
        Condition = {
          StringEquals = {
            "iam:PassedToService" = "bedrock.amazonaws.com"
          }
        }
      }
    ]
  })
}

# =============================================================================
# KMS Access Policy for Task Role (Conditional)
# =============================================================================

resource "aws_iam_role_policy" "ecs_task_kms" {
  count = local.create_ecs_roles && var.encryption_key_arn != null ? 1 : 0

  name = "${local.name_prefix}-task-kms"
  role = aws_iam_role.ecs_task[0].id

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
