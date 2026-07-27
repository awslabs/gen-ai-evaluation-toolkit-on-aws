# API Gateway Integration for Evaluation Module (SDKV2)
#
# Routes (registered on BOTH the private and optional public API via for_each
# over var.api_targets — mirrors CDK, same Lambda handlers reused on each API):
# - /v2/* (15 routes) → single EvaluatorApiLambda (Python, internal routing)
# - /evaluation-schedulers/* (5 routes) → per-operation TypeScript Lambdas
# - /configurations/* (5 routes) → per-operation TypeScript Lambdas

locals {
  api_targets = var.api_targets

  # In-VPC callers (builtin + agent-as-judge evaluator Lambdas, and the IAM
  # invoke grants) address the PRIVATE API, reached via the execute-api VPC
  # endpoint with private DNS on. This mirrors CDK, where all in-VPC traffic
  # hits the single private API.
  private_rest_api_id            = var.api_targets["private"].rest_api_id
  private_rest_api_execution_arn = var.api_targets["private"].execution_arn
}

# =============================================================================
# Lambda permissions for API Gateway → handlers.
# One API-scoped permission per (handler, API target). API-scoped source_arn
# (/*/*) matches CDK scopePermissionToMethod:false and stays under the policy
# size limit.
# =============================================================================

resource "aws_lambda_permission" "evaluator_api_gateway" {
  for_each = local.api_targets

  statement_id  = "AllowAPIGatewayInvoke-${each.key}"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.evaluator_api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${each.value.execution_arn}/*/*"
}

locals {
  # (scheduler/configuration handler) × (API target)
  scheduler_handler_targets = {
    for pair in setproduct(keys(local.scheduler_handlers), keys(local.api_targets)) :
    "${pair[0]}__${pair[1]}" => { handler = pair[0], target_key = pair[1] }
  }
}

resource "aws_lambda_permission" "scheduler_handlers" {
  for_each = local.scheduler_handler_targets

  statement_id  = "AllowAPIGatewayInvoke-${each.value.target_key}"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.scheduler_handlers[each.value.handler].function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${local.api_targets[each.value.target_key].execution_arn}/*/*"
}

# =============================================================================
# Resource tree (one per API target)
# =============================================================================

# --- /v2 ---
resource "aws_api_gateway_resource" "v2" {
  for_each    = local.api_targets
  rest_api_id = each.value.rest_api_id
  parent_id   = each.value.root_resource
  path_part   = "v2"
}

# --- /v2/evaluators/{evaluatorName}/jobs/* ---
resource "aws_api_gateway_resource" "v2_evaluators" {
  for_each    = local.api_targets
  rest_api_id = each.value.rest_api_id
  parent_id   = aws_api_gateway_resource.v2[each.key].id
  path_part   = "evaluators"
}

resource "aws_api_gateway_resource" "v2_evaluator_name" {
  for_each    = local.api_targets
  rest_api_id = each.value.rest_api_id
  parent_id   = aws_api_gateway_resource.v2_evaluators[each.key].id
  path_part   = "{evaluatorName}"
}

resource "aws_api_gateway_resource" "v2_evaluator_jobs" {
  for_each    = local.api_targets
  rest_api_id = each.value.rest_api_id
  parent_id   = aws_api_gateway_resource.v2_evaluator_name[each.key].id
  path_part   = "jobs"
}

resource "aws_api_gateway_resource" "v2_evaluator_jobs_evaluate" {
  for_each    = local.api_targets
  rest_api_id = each.value.rest_api_id
  parent_id   = aws_api_gateway_resource.v2_evaluator_jobs[each.key].id
  path_part   = "evaluate"
}

resource "aws_api_gateway_resource" "v2_evaluator_jobs_score" {
  for_each    = local.api_targets
  rest_api_id = each.value.rest_api_id
  parent_id   = aws_api_gateway_resource.v2_evaluator_jobs[each.key].id
  path_part   = "score"
}

resource "aws_api_gateway_resource" "v2_evaluator_jobs_invoke" {
  for_each    = local.api_targets
  rest_api_id = each.value.rest_api_id
  parent_id   = aws_api_gateway_resource.v2_evaluator_jobs[each.key].id
  path_part   = "invoke"
}

# --- /v2/jobs/* ---
resource "aws_api_gateway_resource" "v2_jobs" {
  for_each    = local.api_targets
  rest_api_id = each.value.rest_api_id
  parent_id   = aws_api_gateway_resource.v2[each.key].id
  path_part   = "jobs"
}

resource "aws_api_gateway_resource" "v2_job_id" {
  for_each    = local.api_targets
  rest_api_id = each.value.rest_api_id
  parent_id   = aws_api_gateway_resource.v2_jobs[each.key].id
  path_part   = "{jobId}"
}

resource "aws_api_gateway_resource" "v2_job_status" {
  for_each    = local.api_targets
  rest_api_id = each.value.rest_api_id
  parent_id   = aws_api_gateway_resource.v2_job_id[each.key].id
  path_part   = "status"
}

# --- /v2/reports/* ---
resource "aws_api_gateway_resource" "v2_reports" {
  for_each    = local.api_targets
  rest_api_id = each.value.rest_api_id
  parent_id   = aws_api_gateway_resource.v2[each.key].id
  path_part   = "reports"
}

resource "aws_api_gateway_resource" "v2_report_id" {
  for_each    = local.api_targets
  rest_api_id = each.value.rest_api_id
  parent_id   = aws_api_gateway_resource.v2_reports[each.key].id
  path_part   = "{reportId}"
}

resource "aws_api_gateway_resource" "v2_report_results" {
  for_each    = local.api_targets
  rest_api_id = each.value.rest_api_id
  parent_id   = aws_api_gateway_resource.v2_report_id[each.key].id
  path_part   = "results"
}

resource "aws_api_gateway_resource" "v2_report_result_id" {
  for_each    = local.api_targets
  rest_api_id = each.value.rest_api_id
  parent_id   = aws_api_gateway_resource.v2_report_results[each.key].id
  path_part   = "{resultId}"
}

resource "aws_api_gateway_resource" "v2_report_results_batch" {
  for_each    = local.api_targets
  rest_api_id = each.value.rest_api_id
  parent_id   = aws_api_gateway_resource.v2_report_results[each.key].id
  path_part   = "batch"
}

resource "aws_api_gateway_resource" "v2_report_results_scores" {
  for_each    = local.api_targets
  rest_api_id = each.value.rest_api_id
  parent_id   = aws_api_gateway_resource.v2_report_results[each.key].id
  path_part   = "scores"
}

resource "aws_api_gateway_resource" "v2_report_results_scores_batch" {
  for_each    = local.api_targets
  rest_api_id = each.value.rest_api_id
  parent_id   = aws_api_gateway_resource.v2_report_results_scores[each.key].id
  path_part   = "batch"
}

resource "aws_api_gateway_resource" "v2_report_results_delete" {
  for_each    = local.api_targets
  rest_api_id = each.value.rest_api_id
  parent_id   = aws_api_gateway_resource.v2_report_results[each.key].id
  path_part   = "delete"
}

resource "aws_api_gateway_resource" "v2_report_results_delete_batch" {
  for_each    = local.api_targets
  rest_api_id = each.value.rest_api_id
  parent_id   = aws_api_gateway_resource.v2_report_results_delete[each.key].id
  path_part   = "batch"
}

# --- /evaluation-schedulers/* ---
resource "aws_api_gateway_resource" "evaluation_schedulers" {
  for_each    = local.api_targets
  rest_api_id = each.value.rest_api_id
  parent_id   = each.value.root_resource
  path_part   = "evaluation-schedulers"
}

resource "aws_api_gateway_resource" "evaluation_scheduler_name" {
  for_each    = local.api_targets
  rest_api_id = each.value.rest_api_id
  parent_id   = aws_api_gateway_resource.evaluation_schedulers[each.key].id
  path_part   = "{name}"
}

# --- /configurations/* ---
resource "aws_api_gateway_resource" "configurations" {
  for_each    = local.api_targets
  rest_api_id = each.value.rest_api_id
  parent_id   = each.value.root_resource
  path_part   = "configurations"
}

resource "aws_api_gateway_resource" "configurations_list" {
  for_each    = local.api_targets
  rest_api_id = each.value.rest_api_id
  parent_id   = aws_api_gateway_resource.configurations[each.key].id
  path_part   = "list"
}

resource "aws_api_gateway_resource" "configuration_name" {
  for_each    = local.api_targets
  rest_api_id = each.value.rest_api_id
  parent_id   = aws_api_gateway_resource.configurations[each.key].id
  path_part   = "{name}"
}

# =============================================================================
# Routes → methods + integrations (one set per API target)
#
# Two integration kinds:
#   - lambda_key = "evaluator_api"  -> aws_lambda_function.evaluator_api
#   - scheduler_handler = "<key>"   -> aws_lambda_function.scheduler_handlers[key]
# =============================================================================

locals {
  # resource_key -> aws_api_gateway_resource.<resource_key>; integration target is
  # either the single evaluator_api lambda or a named scheduler_handlers lambda.
  evaluation_routes = {
    # /v2/* — all to evaluator_api
    submit_evaluation_job       = { resource_key = "v2_evaluator_jobs_evaluate", http_method = "POST", lambda = "evaluator_api" }
    submit_scoring_job          = { resource_key = "v2_evaluator_jobs_score", http_method = "POST", lambda = "evaluator_api" }
    submit_app_invocation_job   = { resource_key = "v2_evaluator_jobs_invoke", http_method = "POST", lambda = "evaluator_api" }
    get_evaluator_job           = { resource_key = "v2_job_id", http_method = "GET", lambda = "evaluator_api" }
    list_jobs                   = { resource_key = "v2_jobs", http_method = "GET", lambda = "evaluator_api" }
    update_evaluator_job_status = { resource_key = "v2_job_status", http_method = "PUT", lambda = "evaluator_api" }
    create_report               = { resource_key = "v2_reports", http_method = "POST", lambda = "evaluator_api" }
    get_report                  = { resource_key = "v2_report_id", http_method = "GET", lambda = "evaluator_api" }
    list_reports                = { resource_key = "v2_reports", http_method = "GET", lambda = "evaluator_api" }
    delete_report               = { resource_key = "v2_report_id", http_method = "DELETE", lambda = "evaluator_api" }
    get_test_result             = { resource_key = "v2_report_result_id", http_method = "GET", lambda = "evaluator_api" }
    list_test_results           = { resource_key = "v2_report_results", http_method = "GET", lambda = "evaluator_api" }
    batch_create_results        = { resource_key = "v2_report_results_batch", http_method = "POST", lambda = "evaluator_api" }
    batch_update_scores         = { resource_key = "v2_report_results_scores_batch", http_method = "POST", lambda = "evaluator_api" }
    batch_delete_results        = { resource_key = "v2_report_results_delete_batch", http_method = "POST", lambda = "evaluator_api" }

    # /evaluation-schedulers/* — per-operation scheduler_handlers
    create_job_scheduler = { resource_key = "evaluation_schedulers", http_method = "POST", scheduler_handler = "createJobScheduler" }
    list_job_schedulers  = { resource_key = "evaluation_schedulers", http_method = "GET", scheduler_handler = "listJobSchedulers" }
    get_job_scheduler    = { resource_key = "evaluation_scheduler_name", http_method = "GET", scheduler_handler = "getJobScheduler" }
    update_job_scheduler = { resource_key = "evaluation_scheduler_name", http_method = "PATCH", scheduler_handler = "updateJobScheduler" }
    delete_job_scheduler = { resource_key = "evaluation_scheduler_name", http_method = "DELETE", scheduler_handler = "deleteJobScheduler" }

    # /configurations/* — per-operation scheduler_handlers
    create_configuration = { resource_key = "configurations", http_method = "POST", scheduler_handler = "createConfiguration" }
    update_configuration = { resource_key = "configurations", http_method = "PUT", scheduler_handler = "updateConfiguration" }
    list_configurations  = { resource_key = "configurations_list", http_method = "POST", scheduler_handler = "listConfigurations" }
    get_configuration    = { resource_key = "configuration_name", http_method = "GET", scheduler_handler = "getConfiguration" }
  }

  evaluation_route_targets = {
    for pair in setproduct(keys(local.evaluation_routes), keys(local.api_targets)) :
    "${pair[0]}__${pair[1]}" => {
      route_key   = pair[0]
      target_key  = pair[1]
      route       = local.evaluation_routes[pair[0]]
      http_method = local.evaluation_routes[pair[0]].http_method
    }
  }

  evaluation_resource_ids = {
    v2_evaluator_jobs_evaluate     = { for k, v in aws_api_gateway_resource.v2_evaluator_jobs_evaluate : k => v.id }
    v2_evaluator_jobs_score        = { for k, v in aws_api_gateway_resource.v2_evaluator_jobs_score : k => v.id }
    v2_evaluator_jobs_invoke       = { for k, v in aws_api_gateway_resource.v2_evaluator_jobs_invoke : k => v.id }
    v2_jobs                        = { for k, v in aws_api_gateway_resource.v2_jobs : k => v.id }
    v2_job_id                      = { for k, v in aws_api_gateway_resource.v2_job_id : k => v.id }
    v2_job_status                  = { for k, v in aws_api_gateway_resource.v2_job_status : k => v.id }
    v2_reports                     = { for k, v in aws_api_gateway_resource.v2_reports : k => v.id }
    v2_report_id                   = { for k, v in aws_api_gateway_resource.v2_report_id : k => v.id }
    v2_report_results              = { for k, v in aws_api_gateway_resource.v2_report_results : k => v.id }
    v2_report_result_id            = { for k, v in aws_api_gateway_resource.v2_report_result_id : k => v.id }
    v2_report_results_batch        = { for k, v in aws_api_gateway_resource.v2_report_results_batch : k => v.id }
    v2_report_results_scores_batch = { for k, v in aws_api_gateway_resource.v2_report_results_scores_batch : k => v.id }
    v2_report_results_delete_batch = { for k, v in aws_api_gateway_resource.v2_report_results_delete_batch : k => v.id }
    evaluation_schedulers          = { for k, v in aws_api_gateway_resource.evaluation_schedulers : k => v.id }
    evaluation_scheduler_name      = { for k, v in aws_api_gateway_resource.evaluation_scheduler_name : k => v.id }
    configurations                 = { for k, v in aws_api_gateway_resource.configurations : k => v.id }
    configurations_list            = { for k, v in aws_api_gateway_resource.configurations_list : k => v.id }
    configuration_name             = { for k, v in aws_api_gateway_resource.configuration_name : k => v.id }
  }
}

resource "aws_api_gateway_method" "route" {
  for_each = local.evaluation_route_targets

  rest_api_id   = local.api_targets[each.value.target_key].rest_api_id
  resource_id   = local.evaluation_resource_ids[each.value.route.resource_key][each.value.target_key]
  http_method   = each.value.http_method
  authorization = "AWS_IAM"
}

resource "aws_api_gateway_integration" "route" {
  for_each = local.evaluation_route_targets

  rest_api_id             = local.api_targets[each.value.target_key].rest_api_id
  resource_id             = local.evaluation_resource_ids[each.value.route.resource_key][each.value.target_key]
  http_method             = aws_api_gateway_method.route[each.key].http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri = try(each.value.route.lambda, null) == "evaluator_api" ? (
    aws_lambda_function.evaluator_api.invoke_arn
    ) : (
    aws_lambda_function.scheduler_handlers[each.value.route.scheduler_handler].invoke_arn
  )
}

# =============================================================================
# API Gateway Deployment Trigger
# =============================================================================
output "api_gateway_deployment_trigger" {
  description = "Trigger value for API Gateway deployment - changes when methods change"
  value       = sha1(jsonencode([for k, m in aws_api_gateway_method.route : m.id]))
}
