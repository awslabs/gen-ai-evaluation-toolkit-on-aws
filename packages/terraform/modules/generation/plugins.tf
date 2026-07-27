# Generation Plugins
# Supports ECS-based generation plugins (rag, llmAsJudge) and
# Step Function-based plugins (DatastoreExport)
# Mirrors evaluation/plugins.tf pattern for image resolution

# =============================================================================
# Local Values for Plugin Configuration
# =============================================================================

locals {
  lambda_package_path = "${path.module}/../../assets/lambda/nodejs-handlers.zip"

  # No Lambda layers — runtime SDKs (powertools, xray) are bundled into the
  # Lambda deploy zip (see packages/cdk/assets/lambda-handlers/), matching CDK.
  plugin_layers = []

  generation_bucket_arn = aws_s3_bucket.generation.arn

  plugin_tags = merge(var.tags, {
    PluginCategory = "generation"
  })

  _gen_resolve_image = {
    for k, v in {
      "rag"              = { cfg_key = "rag", deploy_key = "plugin-gen-rag" }
      "llmAsJudge"       = { cfg_key = "llmAsJudge", deploy_key = "plugin-gen-llm-as-judge" }
      "agenticTestCases" = { cfg_key = "agenticTestCases", deploy_key = "plugin-gen-agentic" }
    } : k => try(var.generation_plugins[v.cfg_key].image_uri, null) != null ? var.generation_plugins[v.cfg_key].image_uri : lookup(var.deployed_image_uris, v.deploy_key, null)
  }

  gen_rag_enabled    = try(var.generation_plugins["rag"].enabled, false)
  gen_rag_image_uri  = local._gen_resolve_image["rag"]
  gen_rag_cpu        = try(var.generation_plugins["rag"].cpu, 2048)
  gen_rag_memory_ecs = try(var.generation_plugins["rag"].memory_ecs, 8192)

  gen_llm_as_judge_enabled    = try(var.generation_plugins["llmAsJudge"].enabled, false)
  gen_llm_as_judge_image_uri  = local._gen_resolve_image["llmAsJudge"]
  gen_llm_as_judge_cpu        = try(var.generation_plugins["llmAsJudge"].cpu, 2048)
  gen_llm_as_judge_memory_ecs = try(var.generation_plugins["llmAsJudge"].memory_ecs, 8192)

  gen_agentic_enabled    = try(var.generation_plugins["agenticTestCases"].enabled, false)
  gen_agentic_image_uri  = local._gen_resolve_image["agenticTestCases"]
  gen_agentic_cpu        = try(var.generation_plugins["agenticTestCases"].cpu, 2048)
  gen_agentic_memory_ecs = try(var.generation_plugins["agenticTestCases"].memory_ecs, 8192)

  datastore_export_enabled = try(var.generation_plugins["DatastoreExport"].enabled, false)
}

# =============================================================================
# GenerationNoopPlugin (always enabled for testing)
# A simple no-op plugin that returns success without performing any generation
# =============================================================================

module "gen_noop_iam" {
  source = "../plugins/iam"

  project_name       = var.project_name
  environment        = var.environment
  region             = var.region
  account_id         = var.aws_account_id
  plugin_name        = "generationNoopPlugin"
  plugin_type        = "lambda"
  event_bus_arn      = var.event_bus_arn
  bucket_arn         = local.generation_bucket_arn
  vpc_enabled        = true
  encryption_key_arn = var.encryption_key_arn

  tags = local.plugin_tags
}

module "gen_noop_plugin" {
  source = "../plugins/lambda"

  project_name  = var.project_name
  environment   = var.environment
  region        = var.region
  plugin_name   = "generationNoopPlugin"
  role_arn      = module.gen_noop_iam.lambda_role_arn
  filename      = local.lambda_package_path
  handler       = "index.noopPluginHandlerLambda.lambdaHandler"
  event_bus_arn = var.event_bus_arn

  subnet_ids         = var.subnet_ids
  security_group_ids = [var.lambda_security_group_id]

  trigger_event_type = "genAiEtkGenerationPluginTriggerEvent"

  timeout            = var.default_lambda_timeout
  memory_size        = var.default_lambda_memory_size
  log_level          = var.log_level
  log_retention_days = var.log_retention_days
  enable_xray        = var.enable_xray
  encryption_key_arn = var.encryption_key_arn
  layers             = local.plugin_layers

  additional_environment_variables = {
    PLUGIN_NOOP_DELAY_IN_SECONDS = "0"
  }

  tags = local.plugin_tags

  depends_on = [module.gen_noop_iam]
}

# =============================================================================
# ECS Cluster for Generation Plugins
# =============================================================================

resource "aws_ecs_cluster" "generation" {
  count = (local.gen_rag_enabled || local.gen_llm_as_judge_enabled) ? 1 : 0

  name = "${var.project_name}-${var.environment}-generation"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-generation-cluster"
  }
}

resource "aws_ecs_cluster_capacity_providers" "generation" {
  count = (local.gen_rag_enabled || local.gen_llm_as_judge_enabled) ? 1 : 0

  cluster_name = aws_ecs_cluster.generation[0].name

  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    base              = 1
    weight            = 100
    capacity_provider = "FARGATE"
  }
}

# =============================================================================
# ECS-BASED GENERATION PLUGINS
# =============================================================================

# Grant generation plugin task roles read access to the datastore bucket
# (for reading source documents under the generation/ prefix).
# Gate purely on the plugin being enabled. The previous
# `&& var.datastore_bucket_arn != ""` half-check failed `terraform plan`
# on fresh state because `var.datastore_bucket_arn` is wired from
# module.datastore.datastore_bucket_arn (computed) — TF can't tell at
# plan-time whether the value will be empty. The monorepo root always
# passes a non-empty ARN; if a downstream caller ever passes "", the
# policy will fail apply with a clear "invalid resource ARN" error
# rather than silently no-opping.
resource "aws_iam_role_policy" "gen_rag_datastore_read" {
  count = local.gen_rag_enabled ? 1 : 0

  name = "${var.project_name}-${var.environment}-generateTestCases-datastore-read"
  role = module.gen_rag_iam[0].ecs_task_role_name

  # Mirrors CDK grantRead: object reads are prefix-scoped (generation/* for
  # test-case generation inputs, traces/* for OTEL trace extraction); ListBucket
  # is granted bucket-wide (grantRead does NOT prefix-condition the List* action).
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "GetObjects"
        Effect = "Allow"
        Action = ["s3:GetObject"]
        Resource = [
          "${var.datastore_bucket_arn}/generation/*",
          "${var.datastore_bucket_arn}/traces/*"
        ]
      },
      {
        Sid      = "ListBucket"
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = [var.datastore_bucket_arn]
      }
    ]
  })
}

resource "aws_iam_role_policy" "gen_llm_as_judge_datastore_read" {
  # Gate purely on the plugin being enabled. The previous
  # `&& var.datastore_bucket_arn != ""` half-check failed `terraform plan`
  # on fresh state because `var.datastore_bucket_arn` is wired from
  # module.datastore.datastore_bucket_arn (computed) — TF can't tell at
  # plan-time whether the value will be empty. The monorepo root always
  # passes a non-empty ARN; if a downstream caller ever passes "", the
  # policy will fail apply with a clear "invalid resource ARN" error
  # rather than silently no-opping.
  count = local.gen_llm_as_judge_enabled ? 1 : 0

  name = "${var.project_name}-${var.environment}-llmAsAJudge-datastore-read"
  role = module.gen_llm_as_judge_iam[0].ecs_task_role_name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = ["s3:GetObject", "s3:ListBucket"]
        Resource = [
          var.datastore_bucket_arn,
          "${var.datastore_bucket_arn}/generation/*"
        ]
      }
    ]
  })
}

# -----------------------------------------------------------------------------
# RAG Generation Plugin
# -----------------------------------------------------------------------------

module "gen_rag_iam" {
  source = "../plugins/iam"
  count  = local.gen_rag_enabled ? 1 : 0

  project_name        = var.project_name
  environment         = var.environment
  region              = var.region
  account_id          = var.aws_account_id
  plugin_name         = "generateTestCases"
  plugin_type         = "ecs"
  event_bus_arn       = var.event_bus_arn
  bucket_arn          = local.generation_bucket_arn
  bedrock_mode        = "batch"
  internal_bucket_arn = aws_s3_bucket.generation_internal["generateTestCases"].arn
  encryption_key_arn  = var.encryption_key_arn

  tags = local.plugin_tags
}

module "gen_rag_plugin" {
  source = "../plugins/ecs"
  count  = local.gen_rag_enabled && local.gen_rag_image_uri != null ? 1 : 0

  project_name       = var.project_name
  environment        = var.environment
  enable_xray        = var.enable_xray
  region             = var.region
  account_id         = var.aws_account_id
  plugin_name        = "generateTestCases"
  trigger_event_type = "genAiEtkGenerationPluginTriggerEvent"
  image_uri          = local.gen_rag_image_uri
  cluster_arn        = aws_ecs_cluster.generation[0].arn
  task_role_arn      = module.gen_rag_iam[0].ecs_task_role_arn
  execution_role_arn = module.gen_rag_iam[0].ecs_execution_role_arn
  subnet_ids         = var.subnet_ids
  vpc_id             = var.vpc_id
  event_bus_arn      = var.event_bus_arn

  trigger_lambda_filename   = local.lambda_package_path
  trigger_lambda_vpc_config = true
  lambda_security_group_id  = var.lambda_security_group_id
  lambda_layers             = local.plugin_layers

  cpu    = local.gen_rag_cpu
  memory = local.gen_rag_memory_ecs

  log_level          = var.log_level
  log_retention_days = var.log_retention_days
  encryption_key_arn = var.encryption_key_arn

  additional_task_environment = merge(
    {
      INTERNAL_S3_BUCKET = aws_s3_bucket.generation_internal["generateTestCases"].id
    },
    module.gen_rag_iam[0].bedrock_batch_role_arn != null ? {
      BEDROCK_ROLE_ARN = module.gen_rag_iam[0].bedrock_batch_role_arn
    } : {}
  )

  tags = local.plugin_tags

  depends_on = [module.gen_rag_iam]
}

# -----------------------------------------------------------------------------
# LLM-as-Judge Generation Plugin
# -----------------------------------------------------------------------------

module "gen_llm_as_judge_iam" {
  source = "../plugins/iam"
  count  = local.gen_llm_as_judge_enabled ? 1 : 0

  project_name        = var.project_name
  environment         = var.environment
  region              = var.region
  account_id          = var.aws_account_id
  plugin_name         = "llmAsAJudge"
  plugin_type         = "ecs"
  event_bus_arn       = var.event_bus_arn
  bucket_arn          = local.generation_bucket_arn
  bedrock_mode        = "batch"
  internal_bucket_arn = aws_s3_bucket.generation_internal["llmAsAJudge"].arn
  encryption_key_arn  = var.encryption_key_arn

  tags = local.plugin_tags
}

module "gen_llm_as_judge_plugin" {
  source = "../plugins/ecs"
  count  = local.gen_llm_as_judge_enabled && local.gen_llm_as_judge_image_uri != null ? 1 : 0

  project_name       = var.project_name
  environment        = var.environment
  enable_xray        = var.enable_xray
  region             = var.region
  account_id         = var.aws_account_id
  plugin_name        = "llmAsAJudge"
  trigger_event_type = "genAiEtkGenerationPluginTriggerEvent"
  image_uri          = local.gen_llm_as_judge_image_uri
  cluster_arn        = aws_ecs_cluster.generation[0].arn
  task_role_arn      = module.gen_llm_as_judge_iam[0].ecs_task_role_arn
  execution_role_arn = module.gen_llm_as_judge_iam[0].ecs_execution_role_arn
  subnet_ids         = var.subnet_ids
  vpc_id             = var.vpc_id
  event_bus_arn      = var.event_bus_arn

  trigger_lambda_filename   = local.lambda_package_path
  trigger_lambda_vpc_config = true
  lambda_security_group_id  = var.lambda_security_group_id
  lambda_layers             = local.plugin_layers

  cpu    = local.gen_llm_as_judge_cpu
  memory = local.gen_llm_as_judge_memory_ecs

  log_level          = var.log_level
  log_retention_days = var.log_retention_days
  encryption_key_arn = var.encryption_key_arn

  additional_task_environment = merge(
    {
      INTERNAL_S3_BUCKET = aws_s3_bucket.generation_internal["llmAsAJudge"].id
    },
    module.gen_llm_as_judge_iam[0].bedrock_batch_role_arn != null ? {
      BEDROCK_ROLE_ARN = module.gen_llm_as_judge_iam[0].bedrock_batch_role_arn
    } : {}
  )

  tags = local.plugin_tags

  depends_on = [module.gen_llm_as_judge_iam]
}


# -----------------------------------------------------------------------------
# Agentic Ground Truth Generation Plugin
# 5-stage pipeline: Taxonomy -> Planner -> Generator -> Augmentor -> Review
# -----------------------------------------------------------------------------

resource "aws_iam_role_policy" "gen_agentic_datastore_read" {
  count = local.gen_agentic_enabled ? 1 : 0

  name = "${var.project_name}-${var.environment}-agenticTestCases-datastore-read"
  role = module.gen_agentic_iam[0].ecs_task_role_name

  # Mirrors CDK: the agentic plugin reads ONLY the `traces/*` prefix (OTEL trace
  # extraction). It does NOT read `generation/*` — earlier TF granted the wrong
  # prefix. ListBucket is bucket-wide (CDK grantRead does not prefix-condition List*).
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "GetObjects"
        Effect   = "Allow"
        Action   = ["s3:GetObject"]
        Resource = ["${var.datastore_bucket_arn}/traces/*"]
      },
      {
        Sid      = "ListBucket"
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = [var.datastore_bucket_arn]
      }
    ]
  })
}

module "gen_agentic_iam" {
  source = "../plugins/iam"
  count  = local.gen_agentic_enabled ? 1 : 0

  project_name        = var.project_name
  environment         = var.environment
  region              = var.region
  account_id          = var.aws_account_id
  plugin_name         = "agenticTestCases"
  plugin_type         = "ecs"
  event_bus_arn       = var.event_bus_arn
  bucket_arn          = local.generation_bucket_arn
  bedrock_mode        = "converse"
  internal_bucket_arn = aws_s3_bucket.generation_internal["agenticTestCases"].arn
  encryption_key_arn  = var.encryption_key_arn

  tags = local.plugin_tags
}

module "gen_agentic_plugin" {
  source = "../plugins/ecs"
  count  = local.gen_agentic_enabled && local.gen_agentic_image_uri != null ? 1 : 0

  project_name       = var.project_name
  environment        = var.environment
  enable_xray        = var.enable_xray
  region             = var.region
  account_id         = var.aws_account_id
  plugin_name        = "agenticTestCases"
  trigger_event_type = "genAiEtkGenerationPluginTriggerEvent"
  image_uri          = local.gen_agentic_image_uri
  cluster_arn        = aws_ecs_cluster.generation[0].arn
  task_role_arn      = module.gen_agentic_iam[0].ecs_task_role_arn
  execution_role_arn = module.gen_agentic_iam[0].ecs_execution_role_arn
  subnet_ids         = var.subnet_ids
  vpc_id             = var.vpc_id
  event_bus_arn      = var.event_bus_arn

  trigger_lambda_filename   = local.lambda_package_path
  trigger_lambda_vpc_config = true
  lambda_security_group_id  = var.lambda_security_group_id
  lambda_layers             = local.plugin_layers

  cpu    = local.gen_agentic_cpu
  memory = local.gen_agentic_memory_ecs

  log_level          = var.log_level
  log_retention_days = var.log_retention_days
  encryption_key_arn = var.encryption_key_arn

  additional_task_environment = merge(
    {
      INTERNAL_S3_BUCKET = aws_s3_bucket.generation_internal["agenticTestCases"].id
    },
    module.gen_agentic_iam[0].bedrock_batch_role_arn != null ? {
      BEDROCK_ROLE_ARN = module.gen_agentic_iam[0].bedrock_batch_role_arn
    } : {}
  )

  tags = local.plugin_tags

  depends_on = [module.gen_agentic_iam]
}

# =============================================================================
# DATASTORE EXPORT PLUGIN (Step Function-based)
# Listens on genAiEtkGenerationPluginTriggerEvent for plugin name "DatastoreExport"
# =============================================================================

resource "aws_cloudwatch_log_group" "datastore_export_sfn" {
  count = local.datastore_export_enabled ? 1 : 0

  name              = "/aws/stepfunctions/${var.project_name}-${var.environment}-datastoreExport"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.encryption_key_arn

  tags = {
    Name = "${var.project_name}-${var.environment}-datastoreExport-logs"
  }
}

# IAM Role for Datastore Export Step Function
resource "aws_iam_role" "datastore_export_sfn" {
  count = local.datastore_export_enabled ? 1 : 0

  name = "${var.project_name}-${var.environment}-datastoreExport-sfn-role"

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
    Name = "${var.project_name}-${var.environment}-datastoreExport-sfn-role"
  }
}

# X-Ray write access — required because the datastore_export state machine has
# `tracing_configuration { enabled = true }` (CDK parity with SecuredStateMachine).
resource "aws_iam_role_policy_attachment" "datastore_export_sfn_xray" {
  count = local.datastore_export_enabled ? 1 : 0

  role       = aws_iam_role.datastore_export_sfn[0].name
  policy_arn = "arn:aws:iam::aws:policy/AWSXRayDaemonWriteAccess"
}

resource "aws_iam_role_policy" "datastore_export_sfn_lambda" {
  count = local.datastore_export_enabled ? 1 : 0

  name = "${var.project_name}-${var.environment}-datastoreExport-sfn-lambda"
  role = aws_iam_role.datastore_export_sfn[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "lambda:InvokeFunction"
        ]
        Resource = [
          aws_lambda_function.batch_create_test_cases[0].arn,
          aws_lambda_function.mint_version[0].arn,
          "${aws_lambda_function.batch_create_test_cases[0].arn}:*",
          "${aws_lambda_function.mint_version[0].arn}:*"
        ]
      }
    ]
  })
}

resource "aws_iam_role_policy" "datastore_export_sfn_eventbridge" {
  count = local.datastore_export_enabled ? 1 : 0

  name = "${var.project_name}-${var.environment}-datastoreExport-sfn-eventbridge"
  role = aws_iam_role.datastore_export_sfn[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["events:PutEvents"]
        Resource = var.event_bus_arn
      }
    ]
  })
}

resource "aws_iam_role_policy" "datastore_export_sfn_s3" {
  count = local.datastore_export_enabled ? 1 : 0

  name = "${var.project_name}-${var.environment}-datastoreExport-sfn-s3"
  role = aws_iam_role.datastore_export_sfn[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:ListBucket"
        ]
        Resource = [
          aws_s3_bucket.generation.arn,
          "${aws_s3_bucket.generation.arn}/*"
        ]
      }
    ]
  })
}

resource "aws_iam_role_policy" "datastore_export_sfn_logs" {
  count = local.datastore_export_enabled ? 1 : 0

  name = "${var.project_name}-${var.environment}-datastoreExport-sfn-logs"
  role = aws_iam_role.datastore_export_sfn[0].id

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

resource "aws_iam_role_policy" "datastore_export_sfn_kms" {
  count = local.datastore_export_enabled && var.encryption_key_arn != null ? 1 : 0

  name = "${var.project_name}-${var.environment}-datastoreExport-sfn-kms"
  role = aws_iam_role.datastore_export_sfn[0].id

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

# Datastore Export Lambdas
resource "aws_iam_role" "datastore_export_lambda" {
  count = local.datastore_export_enabled ? 1 : 0

  name = "${var.project_name}-${var.environment}-datastoreExport-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name = "${var.project_name}-${var.environment}-datastoreExport-lambda-role"
  }
}

resource "aws_iam_role_policy_attachment" "datastore_export_lambda_basic" {
  count = local.datastore_export_enabled ? 1 : 0

  role       = aws_iam_role.datastore_export_lambda[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

# X-Ray write access — required because the mint_version + batch_create_test_cases
# Lambdas have `tracing_config { mode = "Active" }` (CDK parity).
resource "aws_iam_role_policy_attachment" "datastore_export_lambda_xray" {
  count = local.datastore_export_enabled ? 1 : 0

  role       = aws_iam_role.datastore_export_lambda[0].name
  policy_arn = "arn:aws:iam::aws:policy/AWSXRayDaemonWriteAccess"
}

resource "aws_iam_role_policy" "datastore_export_lambda_s3" {
  count = local.datastore_export_enabled ? 1 : 0

  name = "${var.project_name}-${var.environment}-datastoreExport-lambda-s3"
  role = aws_iam_role.datastore_export_lambda[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:ListBucket"
        ]
        Resource = [
          aws_s3_bucket.generation.arn,
          "${aws_s3_bucket.generation.arn}/*"
        ]
      }
    ]
  })
}

resource "aws_iam_role_policy" "datastore_export_lambda_api" {
  count = local.datastore_export_enabled ? 1 : 0

  name = "${var.project_name}-${var.environment}-datastoreExport-lambda-api"
  role = aws_iam_role.datastore_export_lambda[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["execute-api:Invoke"]
        Resource = "${local.api_targets["private"].execution_arn}/*"
      }
    ]
  })
}

resource "aws_iam_role_policy" "datastore_export_lambda_kms" {
  count = local.datastore_export_enabled && var.encryption_key_arn != null ? 1 : 0

  name = "${var.project_name}-${var.environment}-datastoreExport-lambda-kms"
  role = aws_iam_role.datastore_export_lambda[0].id

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

# BatchCreateTestCases Lambda
resource "aws_lambda_function" "batch_create_test_cases" {
  count = local.datastore_export_enabled ? 1 : 0

  function_name = "${var.project_name}-${var.environment}-datastoreExport-batchCreateTestCases"
  role          = aws_iam_role.datastore_export_lambda[0].arn
  handler       = "index.batchCreateTestCaseLambda.lambdaHandler"
  runtime       = "nodejs22.x"
  timeout       = 900
  memory_size   = 512
  filename      = local.lambda_package_path

  source_code_hash = filebase64sha256(local.lambda_package_path)

  vpc_config {
    subnet_ids         = var.subnet_ids
    security_group_ids = [var.lambda_security_group_id]
  }

  kms_key_arn = var.encryption_key_arn

  # Active X-Ray tracing — parity with CDK's SecuredNodejsFunction
  # (packages/cdk/src/common/constructs/secured/securedNodeJsFunction.ts:80,
  # `tracing: lambda.Tracing.ACTIVE`). Required IAM permissions are attached via
  # aws_iam_role_policy_attachment.datastore_export_lambda_xray.
  tracing_config {
    mode = "Active"
  }

  environment {
    variables = {
      LOG_LEVEL     = var.log_level
      GENAI_ETK_URL = var.rest_api_invoke_url
    }
  }

  layers = local.plugin_layers

  tags = local.plugin_tags
}

# MintVersion Lambda
resource "aws_lambda_function" "mint_version" {
  count = local.datastore_export_enabled ? 1 : 0

  function_name = "${var.project_name}-${var.environment}-datastoreExport-mintVersion"
  role          = aws_iam_role.datastore_export_lambda[0].arn
  handler       = "index.mintVersionLambda.lambdaHandler"
  runtime       = "nodejs22.x"
  # CreateDatasetVersion can copy large datasets synchronously.
  timeout     = 900
  memory_size = 512
  filename    = local.lambda_package_path

  source_code_hash = filebase64sha256(local.lambda_package_path)

  vpc_config {
    subnet_ids         = var.subnet_ids
    security_group_ids = [var.lambda_security_group_id]
  }

  kms_key_arn = var.encryption_key_arn

  # Active X-Ray tracing — parity with CDK's SecuredNodejsFunction
  # (packages/cdk/src/common/constructs/secured/securedNodeJsFunction.ts:80,
  # `tracing: lambda.Tracing.ACTIVE`). Required IAM permissions are attached via
  # aws_iam_role_policy_attachment.datastore_export_lambda_xray.
  tracing_config {
    mode = "Active"
  }

  environment {
    variables = {
      LOG_LEVEL     = var.log_level
      GENAI_ETK_URL = var.rest_api_invoke_url
    }
  }

  layers = local.plugin_layers

  tags = local.plugin_tags
}

# Datastore Export State Machine
resource "aws_sfn_state_machine" "datastore_export" {
  count = local.datastore_export_enabled ? 1 : 0

  name     = "${var.project_name}-${var.environment}-datastoreExport"
  role_arn = aws_iam_role.datastore_export_sfn[0].arn

  definition = jsonencode({
    Comment = "Datastore Export Plugin - exports generation results to datasets"
    StartAt = "PreserveTaskToken"
    States = {
      PreserveTaskToken = {
        Type = "Pass"
        Parameters = {
          "taskToken.$"     = "$.taskToken"
          "pluginName.$"    = "$.plugin"
          "input.$"         = "$.input"
          "configuration.$" = "$.configuration"
          continuationToken = null
        }
        Next = "ListFiles"
      }

      ListFiles = {
        Type     = "Task"
        Resource = "arn:aws:states:::aws-sdk:s3:listObjectsV2"
        Parameters = {
          "Bucket.$" = "$.input.bucket"
          "Prefix.$" = "$.input.prefix"
        }
        ResultPath = "$.listResult"
        Next       = "BatchCreateTestCases"
      }

      ListFilesWithToken = {
        Type     = "Task"
        Resource = "arn:aws:states:::aws-sdk:s3:listObjectsV2"
        Parameters = {
          "Bucket.$"            = "$.input.bucket"
          "Prefix.$"            = "$.input.prefix"
          "ContinuationToken.$" = "$.continuationToken"
        }
        ResultPath = "$.listResult"
        Next       = "BatchCreateTestCases"
      }

      BatchCreateTestCases = {
        Type     = "Task"
        Resource = "arn:aws:states:::lambda:invoke"
        Parameters = {
          FunctionName = aws_lambda_function.batch_create_test_cases[0].arn
          Payload = {
            "bucket.$"     = "$.input.bucket"
            "objectKeys.$" = "$.listResult.Contents[*].Key"
            "datasetId.$"  = "$.configuration.datasetConfiguration.datasetId"
          }
        }
        ResultSelector = {
          "result.$" = "$.Payload"
        }
        ResultPath = "$.batchResult"
        Next       = "NotifyInProgress"
        Catch = [
          {
            ErrorEquals = ["States.ALL"]
            Next        = "NotifyError"
            ResultPath  = "$.error"
          }
        ]
      }

      NotifyInProgress = {
        Type     = "Task"
        Resource = "arn:aws:states:::events:putEvents"
        Parameters = {
          Entries = [
            {
              Detail = {
                status        = "inProgress"
                "taskToken.$" = "$.taskToken"
              }
              DetailType   = "genAiEtkGenerationPluginDoneEvent"
              Source       = "DatastoreExport"
              EventBusName = local.event_bus_name
            }
          ]
        }
        ResultPath = "$.notifyResult"
        Next       = "CheckMorePages"
      }

      CheckMorePages = {
        Type = "Choice"
        Choices = [
          {
            Variable  = "$.listResult.NextContinuationToken"
            IsPresent = true
            Next      = "SaveContinuationToken"
          }
        ]
        Default = "ShouldMintVersion"
      }

      SaveContinuationToken = {
        Type = "Pass"
        Parameters = {
          "taskToken.$"         = "$.taskToken"
          "pluginName.$"        = "$.pluginName"
          "input.$"             = "$.input"
          "configuration.$"     = "$.configuration"
          "continuationToken.$" = "$.listResult.NextContinuationToken"
        }
        Next = "ListFilesWithToken"
      }

      ShouldMintVersion = {
        Type = "Choice"
        Choices = [
          {
            Variable      = "$.configuration.datasetConfiguration.mintVersion"
            BooleanEquals = true
            Next          = "MintDatasetVersion"
          }
        ]
        Default = "NotifyDone"
      }

      MintDatasetVersion = {
        Type     = "Task"
        Resource = "arn:aws:states:::lambda:invoke"
        Parameters = {
          FunctionName = aws_lambda_function.mint_version[0].arn
          Payload = {
            "datasetId.$" = "$.configuration.datasetConfiguration.datasetId"
          }
        }
        ResultSelector = {
          "result.$" = "$.Payload"
        }
        ResultPath = "$.mintResult"
        Next       = "NotifyDone"
        Catch = [
          {
            ErrorEquals = ["States.ALL"]
            Next        = "NotifyError"
            ResultPath  = "$.error"
          }
        ]
      }

      NotifyDone = {
        Type     = "Task"
        Resource = "arn:aws:states:::events:putEvents"
        Parameters = {
          Entries = [
            {
              Detail = {
                status        = "success"
                "taskToken.$" = "$.taskToken"
              }
              DetailType   = "genAiEtkGenerationPluginDoneEvent"
              Source       = "DatastoreExport"
              EventBusName = local.event_bus_name
            }
          ]
        }
        End = true
      }

      NotifyError = {
        Type     = "Task"
        Resource = "arn:aws:states:::events:putEvents"
        Parameters = {
          Entries = [
            {
              Detail = {
                status        = "error"
                "taskToken.$" = "$.taskToken"
                "error.$"     = "States.Format('{} plugin failed: {}', $.pluginName, $.error.Error)"
                "cause.$"     = "$.error.Cause"
              }
              DetailType   = "genAiEtkGenerationPluginDoneEvent"
              Source       = "DatastoreExport"
              EventBusName = local.event_bus_name
            }
          ]
        }
        End = true
      }
    }
  })

  logging_configuration {
    log_destination        = "${aws_cloudwatch_log_group.datastore_export_sfn[0].arn}:*"
    include_execution_data = true
    level                  = "ALL"
  }

  # Active X-Ray tracing — parity with CDK's SecuredStateMachine
  # (packages/cdk/src/common/constructs/secured/securedStateMachine.ts:35,
  # `tracingEnabled: true`). Required IAM permissions are attached via
  # aws_iam_role_policy_attachment.datastore_export_sfn_xray.
  tracing_configuration {
    enabled = true
  }

  tags = merge(local.plugin_tags, {
    Name = "${var.project_name}-${var.environment}-datastoreExport"
  })

  depends_on = [
    aws_iam_role_policy.datastore_export_sfn_lambda,
    aws_iam_role_policy.datastore_export_sfn_eventbridge,
    aws_iam_role_policy.datastore_export_sfn_s3,
    aws_iam_role_policy.datastore_export_sfn_logs
  ]
}

# EventBridge Rule to trigger Datastore Export
resource "aws_cloudwatch_event_rule" "datastore_export_trigger" {
  count = local.datastore_export_enabled ? 1 : 0

  name           = "${var.project_name}-${var.environment}-datastoreExport-trigger"
  event_bus_name = local.event_bus_name

  event_pattern = jsonencode({
    source      = ["GenAiEvaluationToolkit"]
    detail-type = ["genAiEtkGenerationPluginTriggerEvent"]
    detail = {
      plugin = ["DatastoreExport"]
    }
  })

  tags = local.plugin_tags
}

resource "aws_cloudwatch_event_target" "datastore_export_trigger" {
  count = local.datastore_export_enabled ? 1 : 0

  rule           = aws_cloudwatch_event_rule.datastore_export_trigger[0].name
  event_bus_name = local.event_bus_name
  arn            = aws_sfn_state_machine.datastore_export[0].arn
  role_arn       = aws_iam_role.datastore_export_eventbridge[0].arn

  input_path = "$.detail"
}

# IAM Role for EventBridge to start Step Function
resource "aws_iam_role" "datastore_export_eventbridge" {
  count = local.datastore_export_enabled ? 1 : 0

  name = "${var.project_name}-${var.environment}-datastoreExport-eb-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "events.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy" "datastore_export_eventbridge_sfn" {
  count = local.datastore_export_enabled ? 1 : 0

  name = "${var.project_name}-${var.environment}-datastoreExport-eb-sfn"
  role = aws_iam_role.datastore_export_eventbridge[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["states:StartExecution"]
        Resource = aws_sfn_state_machine.datastore_export[0].arn
      }
    ]
  })
}
