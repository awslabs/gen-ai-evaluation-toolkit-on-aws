# API Gateway Integration for Experiment Module
# Converted from CDK experiment API Gateway integration
# Provides REST API endpoints for:
# - Experiment management (Create, Get, Update, List, Delete)
# - MLflow integration via EventBridge
#
# Note: Configuration management endpoints (Create, Get, Update, List) are
# already implemented in the evaluation module and are shared across both
# evaluation and experiment operations.

# Every route is registered on BOTH the private and public API (when present).
# The same Lambda handlers (aws_lambda_function.experiment_handlers) are reused;
# internal callers hit the private API, external callers hit the public API.
# We achieve this by iterating every resource / method / integration / permission
# over var.api_targets, the map exposed by the common module (keys: "private" and
# optionally "public").

locals {
  # Convenience alias — the set of API targets (private + optional public).
  api_targets = var.api_targets
}

# ============================================================================
# API Gateway Resources for Experiments (one per API target)
# ============================================================================

# Experiments Resource (direct child of root)
resource "aws_api_gateway_resource" "experiments" {
  for_each    = local.api_targets
  rest_api_id = each.value.rest_api_id
  parent_id   = each.value.root_resource
  path_part   = "experiments"
}

# Experiments/list Resource
resource "aws_api_gateway_resource" "experiments_list" {
  for_each    = local.api_targets
  rest_api_id = each.value.rest_api_id
  parent_id   = aws_api_gateway_resource.experiments[each.key].id
  path_part   = "list"
}

# Experiments/{name} Resource
resource "aws_api_gateway_resource" "experiment_name" {
  for_each    = local.api_targets
  rest_api_id = each.value.rest_api_id
  parent_id   = aws_api_gateway_resource.experiments[each.key].id
  path_part   = "{name}"
}

# Experiments/{name}/outputs Resource
resource "aws_api_gateway_resource" "experiment_outputs" {
  for_each    = local.api_targets
  rest_api_id = each.value.rest_api_id
  parent_id   = aws_api_gateway_resource.experiment_name[each.key].id
  path_part   = "outputs"
}

# ============================================================================
# API Methods and Lambda Integrations for Experiments
#
# Each logical route is described once in local.experiment_routes, then
# materialized across every API target. resource_key selects the resource-tree
# node above; handler is the experiment_handlers Lambda key.
# ============================================================================

locals {
  # Logical experiment routes. resource_key -> aws_api_gateway_resource.<key>,
  # handler -> aws_lambda_function.experiment_handlers[<key>].
  experiment_routes = {
    create_experiment       = { resource_key = "experiments", http_method = "POST", handler = "CreateExperiment" }
    list_experiments        = { resource_key = "experiments_list", http_method = "POST", handler = "ListExperiments" }
    get_experiment          = { resource_key = "experiment_name", http_method = "GET", handler = "GetExperiment" }
    update_experiment       = { resource_key = "experiment_name", http_method = "PATCH", handler = "UpdateExperiment" }
    delete_experiment       = { resource_key = "experiment_name", http_method = "DELETE", handler = "DeleteExperiment" }
    list_experiment_outputs = { resource_key = "experiment_outputs", http_method = "POST", handler = "ListExperimentOutputs" }
  }

  # Cartesian product of routes × API targets, keyed "<route>__<target>".
  experiment_route_targets = {
    for pair in setproduct(keys(local.experiment_routes), keys(local.api_targets)) :
    "${pair[0]}__${pair[1]}" => {
      route_key   = pair[0]
      target_key  = pair[1]
      route       = local.experiment_routes[pair[0]]
      http_method = local.experiment_routes[pair[0]].http_method
    }
  }

  # Resource-tree node id per (route, target). Built by indexing the right
  # aws_api_gateway_resource map by route.resource_key and target_key.
  experiment_resource_ids = {
    experiments        = { for k, v in aws_api_gateway_resource.experiments : k => v.id }
    experiments_list   = { for k, v in aws_api_gateway_resource.experiments_list : k => v.id }
    experiment_name    = { for k, v in aws_api_gateway_resource.experiment_name : k => v.id }
    experiment_outputs = { for k, v in aws_api_gateway_resource.experiment_outputs : k => v.id }
  }
}

resource "aws_api_gateway_method" "route" {
  for_each = local.experiment_route_targets

  rest_api_id   = local.api_targets[each.value.target_key].rest_api_id
  resource_id   = local.experiment_resource_ids[each.value.route.resource_key][each.value.target_key]
  http_method   = each.value.http_method
  authorization = "AWS_IAM"
}

resource "aws_api_gateway_integration" "route" {
  for_each = local.experiment_route_targets

  rest_api_id             = local.api_targets[each.value.target_key].rest_api_id
  resource_id             = local.experiment_resource_ids[each.value.route.resource_key][each.value.target_key]
  http_method             = aws_api_gateway_method.route[each.key].http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.experiment_handlers[each.value.route.handler].invoke_arn
}

# One API-scoped Lambda permission per (handler, API target). Using an
# API-scoped source_arn (/*/*) keeps us well under the Lambda policy size limit.
locals {
  experiment_handler_targets = {
    for pair in setproduct(distinct([for r in local.experiment_routes : r.handler]), keys(local.api_targets)) :
    "${pair[0]}__${pair[1]}" => { handler = pair[0], target_key = pair[1] }
  }
}

resource "aws_lambda_permission" "route" {
  for_each = local.experiment_handler_targets

  statement_id  = "AllowAPIGatewayInvoke-${each.value.target_key}"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.experiment_handlers[each.value.handler].function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${local.api_targets[each.value.target_key].execution_arn}/*/*"
}

# ============================================================================
# EventBridge Rules for MLflow Integration
# ============================================================================

locals {
  event_bus_name = element(split("/", var.event_bus_arn), 1)
}

# EventBridge Rule for Evaluation Run Start Events
resource "aws_cloudwatch_event_rule" "evaluation_run_start" {
  name           = "${var.project_name}-${var.environment}-evaluation-run-start"
  event_bus_name = local.event_bus_name
  description    = "Rule to invoke EvaluationRunParamReporting Lambda"

  event_pattern = jsonencode({
    detail-type = ["EvaluationRunStartEventType"]
  })

  tags = {
    Name = "${var.project_name}-${var.environment}-evaluation-run-start"
  }
}

# EventBridge Target for Evaluation Run Start
resource "aws_cloudwatch_event_target" "evaluation_run_start" {
  rule           = aws_cloudwatch_event_rule.evaluation_run_start.name
  target_id      = "EvaluationRunParamReportingLambda"
  arn            = aws_lambda_function.mlflow_handlers["EvaluationRunParamReporting"].arn
  event_bus_name = local.event_bus_name
}

# EventBridge Rule for Evaluation Run Finished Events
resource "aws_cloudwatch_event_rule" "evaluation_run_finished" {
  name           = "${var.project_name}-${var.environment}-evaluation-run-finished"
  event_bus_name = local.event_bus_name
  description    = "Rule to invoke EvaluationRunMetricReporting Lambda"

  event_pattern = jsonencode({
    detail-type = ["EvaluationRunFinishedEventType"]
  })

  tags = {
    Name = "${var.project_name}-${var.environment}-evaluation-run-finished"
  }
}

# EventBridge Target for Evaluation Run Finished
resource "aws_cloudwatch_event_target" "evaluation_run_finished" {
  rule           = aws_cloudwatch_event_rule.evaluation_run_finished.name
  target_id      = "EvaluationRunMetricReportingLambda"
  arn            = aws_lambda_function.mlflow_handlers["EvaluationRunMetricReporting"].arn
  event_bus_name = local.event_bus_name
}

# EventBridge Rule for Evaluation Run Failed Events
resource "aws_cloudwatch_event_rule" "evaluation_run_failed" {
  name           = "${var.project_name}-${var.environment}-evaluation-run-failed"
  event_bus_name = local.event_bus_name
  description    = "Rule to invoke EvaluationRunTermination Lambda"

  event_pattern = jsonencode({
    detail-type = ["EvaluationRunFailedEventType"]
  })

  tags = {
    Name = "${var.project_name}-${var.environment}-evaluation-run-failed"
  }
}

# EventBridge Target for Evaluation Run Failed
resource "aws_cloudwatch_event_target" "evaluation_run_failed" {
  rule           = aws_cloudwatch_event_rule.evaluation_run_failed.name
  target_id      = "EvaluationRunTerminationLambda"
  arn            = aws_lambda_function.mlflow_handlers["EvaluationRunTermination"].arn
  event_bus_name = local.event_bus_name
}

# ============================================================================
# API Gateway Deployment Trigger
# ============================================================================
# Note: Deployment is handled by the root module AFTER all modules create their integrations
# This output provides a trigger value that changes when any method is modified
output "api_gateway_deployment_trigger" {
  description = "Trigger value for API Gateway deployment - changes when methods change"
  value       = sha1(jsonencode([for k, m in aws_api_gateway_method.route : m.id]))
}
