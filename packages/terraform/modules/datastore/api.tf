# API Gateway Integration for Datastore
# Converted from CDK DataStoreApiGatewayIntegration.
#
# Every route is registered on BOTH the private and public API (when present),
# mirroring CDK (datastoreApiGatewayIntegration.ts): the same Lambda handlers are
# reused; internal callers hit the private API via the VPC endpoint, external
# callers hit the public (EDGE/REGIONAL) API. We achieve this by iterating every
# resource / method / integration / permission over var.api_targets, the map
# exposed by the common module (keys: "private" and optionally "public").

locals {
  # Convenience alias — the set of API targets (private + optional public).
  api_targets = var.api_targets
}

# ============================================================================
# Resource tree (one per API target)
# ============================================================================

# Datasets Resource
resource "aws_api_gateway_resource" "datasets" {
  for_each    = local.api_targets
  rest_api_id = each.value.rest_api_id
  parent_id   = each.value.root_resource
  path_part   = "datasets"
}

# Datasets/{datasetId} Resource
resource "aws_api_gateway_resource" "dataset_id" {
  for_each    = local.api_targets
  rest_api_id = each.value.rest_api_id
  parent_id   = aws_api_gateway_resource.datasets[each.key].id
  path_part   = "{datasetId}"
}

# Datasets/{datasetId}/versions Resource
resource "aws_api_gateway_resource" "dataset_versions" {
  for_each    = local.api_targets
  rest_api_id = each.value.rest_api_id
  parent_id   = aws_api_gateway_resource.dataset_id[each.key].id
  path_part   = "versions"
}

# Datasets/{datasetId}/versions/list Resource (for ListDatasetVersions operation)
resource "aws_api_gateway_resource" "dataset_versions_list" {
  for_each    = local.api_targets
  rest_api_id = each.value.rest_api_id
  parent_id   = aws_api_gateway_resource.dataset_versions[each.key].id
  path_part   = "list"
}

# Datasets/{datasetId}/versions/{versionId} Resource
resource "aws_api_gateway_resource" "dataset_version_id" {
  for_each    = local.api_targets
  rest_api_id = each.value.rest_api_id
  parent_id   = aws_api_gateway_resource.dataset_versions[each.key].id
  path_part   = "{versionId}"
}

# Datasets/{datasetId}/versions/{versionId}/annotations Resource
resource "aws_api_gateway_resource" "dataset_version_annotations" {
  for_each    = local.api_targets
  rest_api_id = each.value.rest_api_id
  parent_id   = aws_api_gateway_resource.dataset_version_id[each.key].id
  path_part   = "annotations"
}

# Datasets/{datasetId}/versions/{versionId}/annotations/{annotationSchemaId} Resource
resource "aws_api_gateway_resource" "dataset_version_annotation_id" {
  for_each    = local.api_targets
  rest_api_id = each.value.rest_api_id
  parent_id   = aws_api_gateway_resource.dataset_version_annotations[each.key].id
  path_part   = "{annotationSchemaId}"
}

# Test Cases Resource (under datasets/{datasetId})
resource "aws_api_gateway_resource" "dataset_testcases" {
  for_each    = local.api_targets
  rest_api_id = each.value.rest_api_id
  parent_id   = aws_api_gateway_resource.dataset_id[each.key].id
  path_part   = "testcases"
}

# Test Cases/{testcaseId} Resource (under datasets/{datasetId}/testcases)
resource "aws_api_gateway_resource" "dataset_testcase_id" {
  for_each    = local.api_targets
  rest_api_id = each.value.rest_api_id
  parent_id   = aws_api_gateway_resource.dataset_testcases[each.key].id
  path_part   = "{testcaseId}"
}

# Test Cases Resource (under datasets/{datasetId}/versions/{versionId})
resource "aws_api_gateway_resource" "dataset_version_testcases" {
  for_each    = local.api_targets
  rest_api_id = each.value.rest_api_id
  parent_id   = aws_api_gateway_resource.dataset_version_id[each.key].id
  path_part   = "testcases"
}

# Test Cases/list Resource (for ListTestCases operation)
resource "aws_api_gateway_resource" "dataset_version_testcases_list" {
  for_each    = local.api_targets
  rest_api_id = each.value.rest_api_id
  parent_id   = aws_api_gateway_resource.dataset_version_testcases[each.key].id
  path_part   = "list"
}

# Test Cases/{testcaseId} Resource (under datasets/{datasetId}/versions/{versionId}/testcases)
resource "aws_api_gateway_resource" "dataset_version_testcase_id" {
  for_each    = local.api_targets
  rest_api_id = each.value.rest_api_id
  parent_id   = aws_api_gateway_resource.dataset_version_testcases[each.key].id
  path_part   = "{testcaseId}"
}

# Test Cases/{testcaseId}/annotations Resource (under datasets/{datasetId}/testcases)
resource "aws_api_gateway_resource" "dataset_testcase_annotations" {
  for_each    = local.api_targets
  rest_api_id = each.value.rest_api_id
  parent_id   = aws_api_gateway_resource.dataset_testcase_id[each.key].id
  path_part   = "annotations"
}

# Test Cases/{testcaseId}/annotations/{annotationName} Resource
resource "aws_api_gateway_resource" "dataset_testcase_annotation_id" {
  for_each    = local.api_targets
  rest_api_id = each.value.rest_api_id
  parent_id   = aws_api_gateway_resource.dataset_testcase_annotations[each.key].id
  path_part   = "{annotationName}"
}

# Annotations Resource
resource "aws_api_gateway_resource" "annotations" {
  for_each    = local.api_targets
  rest_api_id = each.value.rest_api_id
  parent_id   = each.value.root_resource
  path_part   = "annotations"
}

# Annotations/schemas Resource
resource "aws_api_gateway_resource" "annotation_schemas" {
  for_each    = local.api_targets
  rest_api_id = each.value.rest_api_id
  parent_id   = aws_api_gateway_resource.annotations[each.key].id
  path_part   = "schemas"
}

# Annotations/schemas/{annotationName} Resource
resource "aws_api_gateway_resource" "annotation_schema_id" {
  for_each    = local.api_targets
  rest_api_id = each.value.rest_api_id
  parent_id   = aws_api_gateway_resource.annotation_schemas[each.key].id
  path_part   = "{annotationName}"
}

# Annotations/schemas/{annotationName}/archive Resource
resource "aws_api_gateway_resource" "annotation_schema_archive" {
  for_each    = local.api_targets
  rest_api_id = each.value.rest_api_id
  parent_id   = aws_api_gateway_resource.annotation_schema_id[each.key].id
  path_part   = "archive"
}

# Datasets/{datasetId}/restore Resource
resource "aws_api_gateway_resource" "dataset_restore" {
  for_each    = local.api_targets
  rest_api_id = each.value.rest_api_id
  parent_id   = aws_api_gateway_resource.dataset_id[each.key].id
  path_part   = "restore"
}

# ============================================================================
# Methods + Lambda integrations (one set per API target)
#
# Each logical route is described once in local.routes, then materialized across
# every API target. resource_key selects the resource-tree node above; handler
# is the api_handlers Lambda key.
# ============================================================================

locals {
  # Logical datastore routes. resource_key -> aws_api_gateway_resource.<key>,
  # handler -> aws_lambda_function.api_handlers[<key>].
  datastore_routes = {
    create_dataset                    = { resource_key = "datasets", http_method = "POST", handler = "createDataset" }
    list_datasets                     = { resource_key = "datasets", http_method = "GET", handler = "listDatasets" }
    get_dataset                       = { resource_key = "dataset_id", http_method = "GET", handler = "getDataset" }
    delete_dataset                    = { resource_key = "dataset_id", http_method = "DELETE", handler = "deleteDataset" }
    create_dataset_version            = { resource_key = "dataset_versions", http_method = "POST", handler = "createDatasetVersion" }
    list_dataset_versions             = { resource_key = "dataset_versions_list", http_method = "POST", handler = "listDatasetVersions" }
    get_dataset_version               = { resource_key = "dataset_version_id", http_method = "GET", handler = "getDatasetVersion" }
    create_testcase                   = { resource_key = "dataset_testcases", http_method = "POST", handler = "createTestCase" }
    list_testcases                    = { resource_key = "dataset_version_testcases_list", http_method = "POST", handler = "listTestCases" }
    get_testcase                      = { resource_key = "dataset_version_testcase_id", http_method = "GET", handler = "getTestCase" }
    delete_testcase                   = { resource_key = "dataset_testcase_id", http_method = "DELETE", handler = "deleteTestCase" }
    create_annotation_schema          = { resource_key = "annotation_schemas", http_method = "POST", handler = "createAnnotationSchema" }
    list_annotation_schemas           = { resource_key = "annotation_schemas", http_method = "GET", handler = "listAnnotationSchemas" }
    get_annotation_schema             = { resource_key = "annotation_schema_id", http_method = "GET", handler = "getAnnotationSchema" }
    archive_annotation_schema         = { resource_key = "annotation_schema_archive", http_method = "PUT", handler = "archiveAnnotationSchema" }
    put_dataset_version_annotation    = { resource_key = "dataset_version_annotations", http_method = "PUT", handler = "putDatasetVersionAnnotation" }
    delete_dataset_version_annotation = { resource_key = "dataset_version_annotation_id", http_method = "DELETE", handler = "deleteDatasetVersionAnnotation" }
    put_testcase_annotation           = { resource_key = "dataset_testcase_annotations", http_method = "PUT", handler = "putTestCaseAnnotation" }
    delete_testcase_annotation        = { resource_key = "dataset_testcase_annotation_id", http_method = "DELETE", handler = "deleteTestCaseAnnotation" }
    restore_dataset                   = { resource_key = "dataset_restore", http_method = "POST", handler = "restoreDataset" }
  }

  # Cartesian product of routes × API targets, keyed "<route>__<target>".
  datastore_route_targets = {
    for pair in setproduct(keys(local.datastore_routes), keys(local.api_targets)) :
    "${pair[0]}__${pair[1]}" => {
      route_key   = pair[0]
      target_key  = pair[1]
      route       = local.datastore_routes[pair[0]]
      http_method = local.datastore_routes[pair[0]].http_method
    }
  }

  # Resource-tree node id per (route, target). Built by indexing the right
  # aws_api_gateway_resource map by route.resource_key and target_key.
  datastore_resource_ids = {
    datasets                       = { for k, v in aws_api_gateway_resource.datasets : k => v.id }
    dataset_id                     = { for k, v in aws_api_gateway_resource.dataset_id : k => v.id }
    dataset_versions               = { for k, v in aws_api_gateway_resource.dataset_versions : k => v.id }
    dataset_versions_list          = { for k, v in aws_api_gateway_resource.dataset_versions_list : k => v.id }
    dataset_version_id             = { for k, v in aws_api_gateway_resource.dataset_version_id : k => v.id }
    dataset_version_annotations    = { for k, v in aws_api_gateway_resource.dataset_version_annotations : k => v.id }
    dataset_version_annotation_id  = { for k, v in aws_api_gateway_resource.dataset_version_annotation_id : k => v.id }
    dataset_testcases              = { for k, v in aws_api_gateway_resource.dataset_testcases : k => v.id }
    dataset_testcase_id            = { for k, v in aws_api_gateway_resource.dataset_testcase_id : k => v.id }
    dataset_version_testcases      = { for k, v in aws_api_gateway_resource.dataset_version_testcases : k => v.id }
    dataset_version_testcases_list = { for k, v in aws_api_gateway_resource.dataset_version_testcases_list : k => v.id }
    dataset_version_testcase_id    = { for k, v in aws_api_gateway_resource.dataset_version_testcase_id : k => v.id }
    dataset_testcase_annotations   = { for k, v in aws_api_gateway_resource.dataset_testcase_annotations : k => v.id }
    dataset_testcase_annotation_id = { for k, v in aws_api_gateway_resource.dataset_testcase_annotation_id : k => v.id }
    annotation_schemas             = { for k, v in aws_api_gateway_resource.annotation_schemas : k => v.id }
    annotation_schema_id           = { for k, v in aws_api_gateway_resource.annotation_schema_id : k => v.id }
    annotation_schema_archive      = { for k, v in aws_api_gateway_resource.annotation_schema_archive : k => v.id }
    dataset_restore                = { for k, v in aws_api_gateway_resource.dataset_restore : k => v.id }
  }
}

resource "aws_api_gateway_method" "route" {
  for_each = local.datastore_route_targets

  rest_api_id   = local.api_targets[each.value.target_key].rest_api_id
  resource_id   = local.datastore_resource_ids[each.value.route.resource_key][each.value.target_key]
  http_method   = each.value.http_method
  authorization = "AWS_IAM"
}

resource "aws_api_gateway_integration" "route" {
  for_each = local.datastore_route_targets

  rest_api_id             = local.api_targets[each.value.target_key].rest_api_id
  resource_id             = local.datastore_resource_ids[each.value.route.resource_key][each.value.target_key]
  http_method             = aws_api_gateway_method.route[each.key].http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.api_handlers[each.value.route.handler].invoke_arn
}

# One API-scoped Lambda permission per (handler, API target). Using an
# API-scoped source_arn (/*/*) rather than per-method matches CDK's
# scopePermissionToMethod:false and stays well under the Lambda policy size limit.
locals {
  datastore_handler_targets = {
    for pair in setproduct(distinct([for r in local.datastore_routes : r.handler]), keys(local.api_targets)) :
    "${pair[0]}__${pair[1]}" => { handler = pair[0], target_key = pair[1] }
  }
}

resource "aws_lambda_permission" "route" {
  for_each = local.datastore_handler_targets

  statement_id  = "AllowAPIGatewayInvoke-${each.value.target_key}"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api_handlers[each.value.handler].function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${local.api_targets[each.value.target_key].execution_arn}/*/*"
}

# ============================================================================
# API Gateway Deployment Trigger
# ============================================================================
# Deployment is handled by the root module AFTER all modules create their
# integrations. This output changes whenever any datastore method changes, on
# either API target, so the root deployment redeploys.
output "api_gateway_deployment_trigger" {
  description = "Trigger value for API Gateway deployment - changes when methods change"
  value       = sha1(jsonencode([for k, m in aws_api_gateway_method.route : m.id]))
}
