# Unit Tests - Evaluation Module Validation (SDKV2)
# Tests Lambda runtimes, DynamoDB naming, Step Functions naming,
# EventBridge patterns, CMK encryption, log retention, and variable validation.

mock_provider "aws" {
  override_data {
    target = data.aws_iam_policy_document.lambda_assume_role
    values = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Principal\":{\"Service\":\"lambda.amazonaws.com\"},\"Action\":\"sts:AssumeRole\"}]}"
    }
  }
}

variables {
  project_name                 = "test-etk"
  environment                  = "dev"
  region                       = "us-east-1"
  aws_account_id               = "123456789012"
  access_logs_bucket_id        = "test-access-logs-bucket"
  vpc_id                       = "vpc-12345678"
  subnet_ids                   = ["subnet-1", "subnet-2"]
  lambda_security_group_id     = "sg-lambda123"
  scheduler_execution_role_arn = "arn:aws:iam::123456789012:role/scheduler-role"
  scheduler_group_name         = "GenAiEtkEvaluationJobSchedulerGroup"
  event_bus_arn                = "arn:aws:events:us-east-1:123456789012:event-bus/test"
  mlflow_artifact_bucket_arn   = "arn:aws:s3:::test-mlflow"
  mlflow_server_arn            = "arn:aws:sagemaker:us-east-1:123456789012:mlflow-tracking-server/test"
  datastore_bucket_arn         = "arn:aws:s3:::test-datastore"
  datastore_table_name         = "test-table"
  # agent-as-judge is always deployed; provide its image so unrelated tests
  # don't trip the "image required" precondition. AAJ-specific tests override.
  evaluator_agent_as_judge_image_uri = "123456789012.dkr.ecr.us-east-1.amazonaws.com/genai-etk-evaluator-agent-as-judge:latest"
  lambda_code_bucket                 = "test-lambda-code-bucket"
  python_api_s3_key                  = "lambda/python-api.zip"
  config_bucket_name                 = "test-config-bucket"
  api_targets = {
    private = {
      rest_api_id   = "abc123"
      root_resource = "root123"
      execution_arn = "arn:aws:execute-api:us-east-1:123456789012:abc123"
      is_public     = false
    }
  }
  log_retention_days = 545
}

# =============================================================================
# Variable Validation Tests
# =============================================================================

# Test: Log level rejects invalid value
run "evaluation_log_level_rejects_invalid" {
  command = plan

  variables {
    log_level = "TRACE"
  }

  module {
    source = "./modules/evaluation"
  }

  expect_failures = [
    var.log_level,
  ]
}

# Test: Log level accepts valid values
run "evaluation_log_level_accepts_debug" {
  command = plan

  variables {
    log_level = "DEBUG"
  }

  module {
    source = "./modules/evaluation"
  }
}

# =============================================================================
# Python Lambda Runtime Tests (python3.12)
# =============================================================================

# Test: SDKV2 Python Lambda functions use python3.12 runtime
run "evaluation_python_lambda_runtime" {
  command = plan

  module {
    source = "./modules/evaluation"
  }

  assert {
    condition     = aws_lambda_function.evaluator_api.runtime == "python3.12"
    error_message = "evaluator_api Lambda should use python3.12 runtime"
  }

  assert {
    condition     = aws_lambda_function.evaluator_post_processing.runtime == "python3.12"
    error_message = "evaluator_post_processing Lambda should use python3.12 runtime"
  }

  assert {
    condition     = aws_lambda_function.evaluator_internal_handler.runtime == "python3.12"
    error_message = "evaluator_internal_handler Lambda should use python3.12 runtime"
  }

  assert {
    condition     = aws_lambda_function.evaluator_scheduler_trigger.runtime == "python3.12"
    error_message = "evaluator_scheduler_trigger Lambda should use python3.12 runtime"
  }
}

# Test: Python Lambda handler and resource configuration
run "evaluation_python_lambda_config" {
  command = plan

  module {
    source = "./modules/evaluation"
  }

  # evaluator_api: 28s timeout, 512MB
  assert {
    condition     = aws_lambda_function.evaluator_api.handler == "evaluator_api.handler.handler"
    error_message = "evaluator_api Lambda handler must be evaluator_api.handler.handler"
  }

  assert {
    condition     = aws_lambda_function.evaluator_api.timeout == 28
    error_message = "evaluator_api Lambda timeout must be 28 seconds"
  }

  assert {
    condition     = aws_lambda_function.evaluator_api.memory_size == 512
    error_message = "evaluator_api Lambda memory must be 512MB"
  }

  # evaluator_post_processing: 900s timeout, 1024MB
  assert {
    condition     = aws_lambda_function.evaluator_post_processing.timeout == 900
    error_message = "evaluator_post_processing Lambda timeout must be 900 seconds"
  }

  assert {
    condition     = aws_lambda_function.evaluator_post_processing.memory_size == 1024
    error_message = "evaluator_post_processing Lambda memory must be 1024MB"
  }

  # evaluator_internal_handler: 900s timeout, 512MB
  assert {
    condition     = aws_lambda_function.evaluator_internal_handler.timeout == 900
    error_message = "evaluator_internal_handler Lambda timeout must be 900 seconds"
  }

  assert {
    condition     = aws_lambda_function.evaluator_internal_handler.memory_size == 512
    error_message = "evaluator_internal_handler Lambda memory must be 512MB"
  }

  # evaluator_scheduler_trigger: 60s timeout, 256MB
  assert {
    condition     = aws_lambda_function.evaluator_scheduler_trigger.timeout == 60
    error_message = "evaluator_scheduler_trigger Lambda timeout must be 60 seconds"
  }

  assert {
    condition     = aws_lambda_function.evaluator_scheduler_trigger.memory_size == 256
    error_message = "evaluator_scheduler_trigger Lambda memory must be 256MB"
  }
}

# =============================================================================
# TypeScript (Scheduler) Lambda Runtime Tests (nodejs22.x)
# =============================================================================

# Test: Scheduler CRUD TypeScript Lambdas use nodejs22.x runtime
run "evaluation_typescript_lambda_runtime_nodejs22" {
  command = plan

  module {
    source = "./modules/evaluation"
  }

  assert {
    condition     = aws_lambda_function.scheduler_handlers["createJobScheduler"].runtime == "nodejs22.x"
    error_message = "createJobScheduler Lambda should use nodejs22.x runtime"
  }

  assert {
    condition     = aws_lambda_function.scheduler_handlers["listJobSchedulers"].runtime == "nodejs22.x"
    error_message = "listJobSchedulers Lambda should use nodejs22.x runtime"
  }

  assert {
    condition     = aws_lambda_function.scheduler_handlers["getJobScheduler"].runtime == "nodejs22.x"
    error_message = "getJobScheduler Lambda should use nodejs22.x runtime"
  }

  assert {
    condition     = aws_lambda_function.scheduler_handlers["updateJobScheduler"].runtime == "nodejs22.x"
    error_message = "updateJobScheduler Lambda should use nodejs22.x runtime"
  }

  assert {
    condition     = aws_lambda_function.scheduler_handlers["deleteJobScheduler"].runtime == "nodejs22.x"
    error_message = "deleteJobScheduler Lambda should use nodejs22.x runtime"
  }
}

# =============================================================================
# DynamoDB Table Tests
# =============================================================================

# Test: DynamoDB table naming convention
run "evaluation_dynamodb_table_naming" {
  command = plan

  module {
    source = "./modules/evaluation"
  }

  assert {
    condition     = aws_dynamodb_table.evaluator.name == "evaluatortable"
    error_message = "Evaluator DynamoDB table should use bare name 'evaluatortable' (CDK parity — Python code hardcodes it)"
  }
}

# Test: DynamoDB table billing mode is PAY_PER_REQUEST
run "evaluation_dynamodb_billing_mode" {
  command = plan

  module {
    source = "./modules/evaluation"
  }

  assert {
    condition     = aws_dynamodb_table.evaluator.billing_mode == "PAY_PER_REQUEST"
    error_message = "Evaluator DynamoDB table must use PAY_PER_REQUEST billing mode"
  }
}

# Test: DynamoDB table key schema (pk/sk)
run "evaluation_dynamodb_key_schema" {
  command = plan

  module {
    source = "./modules/evaluation"
  }

  assert {
    condition     = aws_dynamodb_table.evaluator.hash_key == "pk"
    error_message = "Evaluator DynamoDB table hash key must be 'pk'"
  }

  assert {
    condition     = aws_dynamodb_table.evaluator.range_key == "sk"
    error_message = "Evaluator DynamoDB table range key must be 'sk'"
  }
}

# =============================================================================
# Step Functions Tests
# =============================================================================

# Test: Orchestration Step Functions naming
run "evaluation_sfn_naming" {
  command = plan

  module {
    source = "./modules/evaluation"
  }

  assert {
    condition     = aws_sfn_state_machine.orchestration.name == "test-etk-dev-evaluator-orchestration"
    error_message = "Orchestration state machine should follow naming convention: {project}-{env}-evaluator-orchestration"
  }
}

# =============================================================================
# EventBridge Event Source & Type Tests (CDK parity regression guard)
# =============================================================================

# Test: EventBridge rules use correct CDK ServiceName source
run "evaluation_eventbridge_source_matches_cdk" {
  command = plan

  module {
    source = "./modules/evaluation"
  }

  assert {
    condition     = jsondecode(aws_cloudwatch_event_rule.task_to_post_process.event_pattern).source[0] == "GenAiEvaluationToolkit"
    error_message = "task_to_post_process rule must use CDK ServiceName 'GenAiEvaluationToolkit' as source"
  }

  assert {
    condition     = jsondecode(aws_cloudwatch_event_rule.task_to_copy_results.event_pattern).source[0] == "GenAiEvaluationToolkit"
    error_message = "task_to_copy_results rule must use CDK ServiceName 'GenAiEvaluationToolkit' as source"
  }

  assert {
    condition     = jsondecode(aws_cloudwatch_event_rule.task_timeout.event_pattern).source[0] == "GenAiEvaluationToolkit"
    error_message = "task_timeout rule must use CDK ServiceName 'GenAiEvaluationToolkit' as source"
  }

  assert {
    condition     = jsondecode(aws_cloudwatch_event_rule.lambda_failure.event_pattern).source[0] == "lambda"
    error_message = "lambda_failure rule must use 'lambda' as source"
  }
}

# Test: EventBridge rules use correct CDK detail-type constants
run "evaluation_eventbridge_detail_types_match_cdk" {
  command = plan

  module {
    source = "./modules/evaluation"
  }

  assert {
    condition     = jsondecode(aws_cloudwatch_event_rule.task_to_post_process.event_pattern)["detail-type"][0] == "EvaluatorTaskDispatched"
    error_message = "task_to_post_process rule must use detail-type 'EvaluatorTaskDispatched'"
  }

  assert {
    condition     = jsondecode(aws_cloudwatch_event_rule.task_to_copy_results.event_pattern)["detail-type"][0] == "EvaluatorTaskDispatched"
    error_message = "task_to_copy_results rule must use detail-type 'EvaluatorTaskDispatched'"
  }

  assert {
    condition     = jsondecode(aws_cloudwatch_event_rule.task_timeout.event_pattern)["detail-type"][0] == "EvaluatorTaskTimedOut"
    error_message = "task_timeout rule must use detail-type 'EvaluatorTaskTimedOut'"
  }

  assert {
    condition     = jsondecode(aws_cloudwatch_event_rule.lambda_failure.event_pattern)["detail-type"][0] == "Lambda Function Invocation Result - Failure"
    error_message = "lambda_failure rule must use detail-type 'Lambda Function Invocation Result - Failure'"
  }
}

# =============================================================================
# CMK Encryption Tests
# =============================================================================

# Test: Log groups and DynamoDB use CMK when encryption_key_arn is provided
run "evaluation_cmk_encryption" {
  command = plan

  variables {
    encryption_key_arn = "arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012"
  }

  module {
    source = "./modules/evaluation"
  }

  assert {
    condition     = aws_cloudwatch_log_group.orchestration_sfn.kms_key_id == "arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012"
    error_message = "Orchestration SFN log group should use CMK when provided"
  }

  assert {
    condition     = aws_cloudwatch_log_group.evaluator_api.kms_key_id == "arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012"
    error_message = "Evaluator API log group should use CMK when provided"
  }

  assert {
    condition     = aws_cloudwatch_log_group.evaluator_post_processing.kms_key_id == "arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012"
    error_message = "Evaluator post-processing log group should use CMK when provided"
  }

  assert {
    condition     = aws_cloudwatch_log_group.evaluator_internal_handler.kms_key_id == "arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012"
    error_message = "Evaluator internal handler log group should use CMK when provided"
  }

  assert {
    condition     = aws_cloudwatch_log_group.evaluator_scheduler_trigger.kms_key_id == "arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012"
    error_message = "Evaluator scheduler trigger log group should use CMK when provided"
  }

  assert {
    condition     = aws_dynamodb_table.evaluator.server_side_encryption[0].kms_key_arn == "arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012"
    error_message = "Evaluator DynamoDB table should use CMK when encryption_key_arn is provided"
  }
}

# Test: No CMK when encryption_key_arn is null
run "evaluation_no_cmk_default" {
  command = plan

  variables {
    encryption_key_arn = null
  }

  module {
    source = "./modules/evaluation"
  }

  assert {
    condition     = aws_cloudwatch_log_group.orchestration_sfn.kms_key_id == null
    error_message = "Orchestration SFN log group should not use CMK when encryption_key_arn is null"
  }

  assert {
    condition     = aws_cloudwatch_log_group.evaluator_api.kms_key_id == null
    error_message = "Evaluator API log group should not use CMK when encryption_key_arn is null"
  }

  # DynamoDB is always SSE-encrypted; with no CMK it uses the AWS-managed key
  # (CDK SecuredTable AWS_MANAGED parity), not the AWS-owned default. The block
  # must be present and enabled — [0] indexing fails if it is ever removed.
  # kms_key_arn resolves to the AWS-managed key ARN (known only after apply), so
  # it cannot be asserted under command = plan.
  assert {
    condition     = aws_dynamodb_table.evaluator.server_side_encryption[0].enabled == true
    error_message = "Evaluator DynamoDB table must have server-side encryption enabled (AWS-managed key) when encryption_key_arn is null"
  }
}

# =============================================================================
# Log Retention Tests
# =============================================================================

# Test: Log-group retention lands on the required 545 days (matches CDK
# RetentionDays.EIGHTEEN_MONTHS — the pentest-mandated retention).
run "evaluation_log_retention_18_months" {
  command = plan

  module {
    source = "./modules/evaluation"
  }

  assert {
    condition     = aws_cloudwatch_log_group.evaluator_api.retention_in_days == 545
    error_message = "evaluator_api log group must use 545-day retention (CDK RetentionDays.EIGHTEEN_MONTHS parity)"
  }

  assert {
    condition     = aws_cloudwatch_log_group.evaluator_post_processing.retention_in_days == 545
    error_message = "evaluator_post_processing log group must use 545-day retention"
  }

  assert {
    condition     = aws_cloudwatch_log_group.evaluator_internal_handler.retention_in_days == 545
    error_message = "evaluator_internal_handler log group must use 545-day retention"
  }

  assert {
    condition     = aws_cloudwatch_log_group.evaluator_scheduler_trigger.retention_in_days == 545
    error_message = "evaluator_scheduler_trigger log group must use 545-day retention"
  }

  assert {
    condition     = aws_cloudwatch_log_group.orchestration_sfn.retention_in_days == 545
    error_message = "orchestration_sfn log group must use 545-day retention"
  }
}

# =============================================================================
# Agent-as-Judge Evaluator Tests (CDK external-plugins.ts parity)
# =============================================================================

# Test: agent-as-judge is always deployed — a null image URI fails the plan
run "agent_as_judge_requires_image" {
  command = plan

  variables {
    evaluator_agent_as_judge_image_uri = null
  }

  module {
    source = "./modules/evaluation"
  }

  expect_failures = [
    aws_lambda_function.evaluator_agent_as_judge,
  ]
}

# Test: agent-as-judge Lambda config + isolated-subnet placement
run "agent_as_judge_lambda_config" {
  command = plan

  variables {
    evaluator_agent_as_judge_image_uri = "123456789012.dkr.ecr.us-east-1.amazonaws.com/genai-etk-evaluator-agent-as-judge:latest"
    isolated_subnet_ids                = ["subnet-iso-1", "subnet-iso-2"]
  }

  module {
    source = "./modules/evaluation"
  }

  assert {
    condition     = aws_lambda_function.evaluator_agent_as_judge[0].package_type == "Image"
    error_message = "agent-as-judge Lambda must be an image (Docker) function"
  }

  assert {
    condition     = aws_lambda_function.evaluator_agent_as_judge[0].memory_size == 2048
    error_message = "agent-as-judge Lambda memory must be 2048MB"
  }

  assert {
    condition     = aws_lambda_function.evaluator_agent_as_judge[0].timeout == 900
    error_message = "agent-as-judge Lambda timeout must be 900s"
  }

  assert {
    condition     = aws_lambda_function.evaluator_agent_as_judge[0].environment[0].variables["EVALUATOR_NAME"] == "agent-as-judge"
    error_message = "agent-as-judge Lambda EVALUATOR_NAME must be 'agent-as-judge'"
  }

  assert {
    condition     = aws_lambda_function.evaluator_agent_as_judge[0].environment[0].variables["SUBPROCESS_TIMEOUT_MINUTES"] == "10"
    error_message = "agent-as-judge Lambda SUBPROCESS_TIMEOUT_MINUTES must be '10'"
  }

  # Pinned to the isolated subnets, not the private subnets.
  assert {
    condition     = contains(aws_lambda_function.evaluator_agent_as_judge[0].vpc_config[0].subnet_ids, "subnet-iso-1")
    error_message = "agent-as-judge Lambda must run in the isolated subnets when provided"
  }

  assert {
    condition     = !contains(aws_lambda_function.evaluator_agent_as_judge[0].vpc_config[0].subnet_ids, "subnet-1")
    error_message = "agent-as-judge Lambda must NOT run in the private subnets when isolated subnets are provided"
  }
}

# Test: agent-as-judge falls back to private subnets when no isolated subnets exist
run "agent_as_judge_falls_back_to_private_subnets" {
  command = plan

  variables {
    evaluator_agent_as_judge_image_uri = "123456789012.dkr.ecr.us-east-1.amazonaws.com/genai-etk-evaluator-agent-as-judge:latest"
    isolated_subnet_ids                = []
  }

  module {
    source = "./modules/evaluation"
  }

  assert {
    condition     = contains(aws_lambda_function.evaluator_agent_as_judge[0].vpc_config[0].subnet_ids, "subnet-1")
    error_message = "agent-as-judge Lambda must fall back to private subnets when no isolated subnets are provided"
  }
}

# Test: agent-as-judge EventBridge rule routes on evaluatorName=agent-as-judge
run "agent_as_judge_eventbridge_routing" {
  command = plan

  variables {
    evaluator_agent_as_judge_image_uri = "123456789012.dkr.ecr.us-east-1.amazonaws.com/genai-etk-evaluator-agent-as-judge:latest"
  }

  module {
    source = "./modules/evaluation"
  }

  assert {
    condition     = jsondecode(aws_cloudwatch_event_rule.agent_as_judge_evaluator_task[0].event_pattern).source[0] == "GenAiEvaluationToolkit"
    error_message = "agent-as-judge rule must use source 'GenAiEvaluationToolkit'"
  }

  assert {
    condition     = jsondecode(aws_cloudwatch_event_rule.agent_as_judge_evaluator_task[0].event_pattern)["detail-type"][0] == "EvaluatorTaskDispatched"
    error_message = "agent-as-judge rule must use detail-type 'EvaluatorTaskDispatched'"
  }

  assert {
    condition     = jsondecode(aws_cloudwatch_event_rule.agent_as_judge_evaluator_task[0].event_pattern).detail.evaluatorName[0] == "agent-as-judge"
    error_message = "agent-as-judge rule must filter on evaluatorName 'agent-as-judge'"
  }

  assert {
    condition     = aws_lambda_function_event_invoke_config.agent_as_judge_evaluator[0].maximum_retry_attempts == 1
    error_message = "agent-as-judge on-failure invoke config must set maximum_retry_attempts = 1"
  }
}

# =============================================================================
# Builtin Evaluator AI Gateway Tests
# =============================================================================

# Test: AI_GATEWAY_* env vars are injected onto the builtin evaluator when gateway_config is set
run "builtin_gateway_env_injected" {
  command = plan

  variables {
    evaluator_builtin_image_uri = "123456789012.dkr.ecr.us-east-1.amazonaws.com/genai-etk-evaluator-builtin:latest"
    gateway_config = {
      gateway_endpoint  = "https://gateway.example.com"
      token_endpoint    = "https://gateway.example.com/token"
      client_id         = "client-abc"
      client_secret_arn = "arn:aws:secretsmanager:us-east-1:123456789012:secret:ai-gateway-client-xyz"
      model_id          = "global.anthropic.claude-sonnet-4-6"
    }
  }

  module {
    source = "./modules/evaluation"
  }

  assert {
    condition     = aws_lambda_function.evaluator_builtin[0].environment[0].variables["AI_GATEWAY_ENDPOINT"] == "https://gateway.example.com"
    error_message = "builtin evaluator must receive AI_GATEWAY_ENDPOINT when gateway_config is set"
  }

  assert {
    condition     = aws_lambda_function.evaluator_builtin[0].environment[0].variables["AI_GATEWAY_MODEL_ID"] == "global.anthropic.claude-sonnet-4-6"
    error_message = "builtin evaluator must receive AI_GATEWAY_MODEL_ID when gateway_config is set"
  }

  assert {
    condition     = length(aws_iam_role_policy.evaluator_builtin_gateway_secret) == 1
    error_message = "builtin evaluator must get a Secrets Manager read policy when gateway_config is set"
  }
}

# Test: no AI Gateway env / secret policy when gateway_config is null
run "builtin_no_gateway_by_default" {
  command = plan

  variables {
    evaluator_builtin_image_uri = "123456789012.dkr.ecr.us-east-1.amazonaws.com/genai-etk-evaluator-builtin:latest"
  }

  module {
    source = "./modules/evaluation"
  }

  assert {
    condition     = !can(aws_lambda_function.evaluator_builtin[0].environment[0].variables["AI_GATEWAY_ENDPOINT"])
    error_message = "builtin evaluator must not have AI Gateway env vars when gateway_config is null"
  }

  assert {
    condition     = length(aws_iam_role_policy.evaluator_builtin_gateway_secret) == 0
    error_message = "builtin evaluator must not get a gateway secret policy when gateway_config is null"
  }
}

# =============================================================================
# Agent-as-Judge callback wiring (CDK dual-API parity)
#
# CDK serves all in-VPC evaluators (incl. agent-as-judge) from the SINGLE shared
# PRIVATE API reached via the execute-api VPC endpoint — there is no bespoke
# per-evaluator private API. These tests assert the AAJ Lambda is wired to the
# shared private API (passed in via var.api_targets["private"]).
# =============================================================================

# Test: AAJ Lambda's ETK_API_ENDPOINT points at the shared private API host,
# and its execute-api invoke policy targets the private API execution ARN.
run "agent_as_judge_uses_shared_private_api" {
  command = plan

  variables {
    evaluator_agent_as_judge_image_uri = "123456789012.dkr.ecr.us-east-1.amazonaws.com/genai-etk-evaluator-agent-as-judge:latest"
    isolated_subnet_ids                = ["subnet-iso-1", "subnet-iso-2"]
  }

  module {
    source = "./modules/evaluation"
  }

  # ETK_API_ENDPOINT resolves to the shared private API id (abc123) — the
  # standard private hostname that resolves in-VPC via execute-api private DNS.
  assert {
    condition     = aws_lambda_function.evaluator_agent_as_judge[0].environment[0].variables["ETK_API_ENDPOINT"] == "https://abc123.execute-api.us-east-1.amazonaws.com/dev"
    error_message = "AAJ ETK_API_ENDPOINT must point at the shared private API host"
  }

  # Least-privilege execute-api routes (mirrors CDK external-plugins.ts
  # executeApiRoutes for AAJ): explicit method+path grants, not broad /v2/*.
  assert {
    condition = contains(
      jsondecode(aws_iam_role_policy.evaluator_agent_as_judge[0].policy).Statement[0].Resource,
      "arn:aws:execute-api:us-east-1:123456789012:abc123/*/PUT/v2/jobs/*/status"
    )
    error_message = "AAJ invoke policy must grant the least-privilege PUT /v2/jobs/*/status route"
  }

  assert {
    condition = !contains(
      jsondecode(aws_iam_role_policy.evaluator_agent_as_judge[0].policy).Statement[0].Resource,
      "arn:aws:execute-api:us-east-1:123456789012:abc123/*/*/v2/*"
    )
    error_message = "AAJ invoke policy must NOT use the broad /*/*/v2/* wildcard (least-privilege)"
  }
}

