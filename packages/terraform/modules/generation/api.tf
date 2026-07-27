# API Gateway Integration for Generation Module
# Converted from CDK generation API Gateway integration
#
# Every route is registered on BOTH the private and public API (when present),
# mirroring CDK: the same Lambda handlers are reused; internal callers hit the
# private API via the VPC endpoint, external callers hit the public
# (EDGE/REGIONAL) API. We achieve this by iterating every resource / method /
# integration / permission over var.api_targets, the map exposed by the common
# module (keys: "private" and optionally "public").

locals {
  # Convenience alias — the set of API targets (private + optional public).
  api_targets = var.api_targets
}

# ============================================================================
# Resource tree (one per API target)
# ============================================================================

# Generation-jobs Resource (direct child of root)
resource "aws_api_gateway_resource" "generation_jobs" {
  for_each    = local.api_targets
  rest_api_id = each.value.rest_api_id
  parent_id   = each.value.root_resource
  path_part   = "generation-jobs"
}

# Generation-jobs/{id} Resource
resource "aws_api_gateway_resource" "generation_job_id" {
  for_each    = local.api_targets
  rest_api_id = each.value.rest_api_id
  parent_id   = aws_api_gateway_resource.generation_jobs[each.key].id
  path_part   = "{id}"
}

# Generation-jobs/{id}/stop Resource
resource "aws_api_gateway_resource" "generation_job_stop" {
  for_each    = local.api_targets
  rest_api_id = each.value.rest_api_id
  parent_id   = aws_api_gateway_resource.generation_job_id[each.key].id
  path_part   = "stop"
}

# ============================================================================
# Methods + Lambda integrations (one set per API target)
#
# Each logical route is described once in local.generation_routes, then
# materialized across every API target. resource_key selects the resource-tree
# node above; handler is the api_handlers Lambda key.
# ============================================================================

locals {
  # Logical generation routes. resource_key -> aws_api_gateway_resource.<key>,
  # handler -> aws_lambda_function.api_handlers[<key>].
  generation_routes = {
    start_generation = { resource_key = "generation_jobs", http_method = "POST", handler = "startGeneration" }
    list_generations = { resource_key = "generation_jobs", http_method = "GET", handler = "listGenerations" }
    get_generation   = { resource_key = "generation_job_id", http_method = "GET", handler = "getGeneration" }
    stop_generation  = { resource_key = "generation_job_stop", http_method = "POST", handler = "stopGeneration" }
  }

  # Cartesian product of routes × API targets, keyed "<route>__<target>".
  generation_route_targets = {
    for pair in setproduct(keys(local.generation_routes), keys(local.api_targets)) :
    "${pair[0]}__${pair[1]}" => {
      route_key   = pair[0]
      target_key  = pair[1]
      route       = local.generation_routes[pair[0]]
      http_method = local.generation_routes[pair[0]].http_method
    }
  }

  # Resource-tree node id per (route, target). Built by indexing the right
  # aws_api_gateway_resource map by route.resource_key and target_key.
  generation_resource_ids = {
    generation_jobs     = { for k, v in aws_api_gateway_resource.generation_jobs : k => v.id }
    generation_job_id   = { for k, v in aws_api_gateway_resource.generation_job_id : k => v.id }
    generation_job_stop = { for k, v in aws_api_gateway_resource.generation_job_stop : k => v.id }
  }
}

resource "aws_api_gateway_method" "route" {
  for_each = local.generation_route_targets

  rest_api_id   = local.api_targets[each.value.target_key].rest_api_id
  resource_id   = local.generation_resource_ids[each.value.route.resource_key][each.value.target_key]
  http_method   = each.value.http_method
  authorization = "AWS_IAM"
}

resource "aws_api_gateway_integration" "route" {
  for_each = local.generation_route_targets

  rest_api_id             = local.api_targets[each.value.target_key].rest_api_id
  resource_id             = local.generation_resource_ids[each.value.route.resource_key][each.value.target_key]
  http_method             = aws_api_gateway_method.route[each.key].http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.api_handlers[each.value.route.handler].invoke_arn
}

# ============================================================================
# Lambda Permissions for API Gateway
# ============================================================================
# One API-scoped Lambda permission per (handler, API target). Using an
# API-scoped source_arn (/*/*) rather than per-method matches CDK's
# scopePermissionToMethod:false and stays well under the Lambda policy size limit.
locals {
  generation_handler_targets = {
    for pair in setproduct(keys(local.api_handlers), keys(local.api_targets)) :
    "${pair[0]}__${pair[1]}" => { handler = pair[0], target_key = pair[1] }
  }
}

resource "aws_lambda_permission" "route" {
  for_each = local.generation_handler_targets

  statement_id  = "AllowAPIGatewayInvoke-${each.value.target_key}"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api_handlers[each.value.handler].function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${local.api_targets[each.value.target_key].execution_arn}/*/*"
}

# ============================================================================
# API Gateway Deployment Trigger
# ============================================================================
# Note: Deployment is handled by the root module AFTER all modules create their
# integrations. This output changes whenever any generation method changes, on
# either API target, so the root deployment redeploys.
output "api_gateway_deployment_trigger" {
  description = "Trigger value for API Gateway deployment - changes when methods change"
  value       = sha1(jsonencode([for k, m in aws_api_gateway_method.route : m.id]))
}
