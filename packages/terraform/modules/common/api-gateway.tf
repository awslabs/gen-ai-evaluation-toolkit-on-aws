# API Gateway REST APIs
# Mirrors CDK packages/cdk/src/common/constructs/apiGateway.ts:
#   - A PRIVATE REST API ("main"), always created. EndpointType.PRIVATE, bound to
#     the execute-api interface VPC endpoint, IAM auth, and a VPC-restricted
#     resource policy (deny unless the request originates from our VPC).
#     Reachable only from within the VPC via the execute-api endpoint.
#   - An OPTIONAL PUBLIC REST API ("public"), created unless
#     public_endpoint_type == "DISABLED". EDGE (default) or REGIONAL. IAM auth.
#     Used by external callers (CLI, customer tooling); its invoke URL is the one
#     published to SSM /genai-etk/restApiEndpoint.
# Every route is registered on BOTH APIs (same Lambda handlers) by the route
# modules, which iterate over the api-target map exposed in outputs.tf.

# --- Private API (always created) ---
resource "aws_api_gateway_rest_api" "main" {
  name        = "${var.project_name}-${var.environment}-api-private"
  description = "ETK private API Gateway for ${var.environment} environment"

  endpoint_configuration {
    types            = ["PRIVATE"]
    vpc_endpoint_ids = [local.apigw_vpc_endpoint_id]
    # The AWS provider requires dualstack IP address type for PRIVATE REST APIs.
    ip_address_type = "dualstack"
  }

  # VPC-restricted resource policy — exact mirror of CDK buildVpcRestrictedPolicy.
  # DENY-only (no broad Allow): only the DENY statement is present so same-account
  # IAM identity policies are enforced (resource policy "neither Allow nor Deny"
  # => IAM decides). A blanket Allow * would bypass IAM path-level restrictions
  # for same-account callers, making per-route execute-api:Invoke grants on
  # Lambda roles (e.g. agent-as-judge least-privilege) ineffective.
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Deny"
        Principal = "*"
        Action    = "execute-api:Invoke"
        Resource  = "execute-api:/*"
        # aws:SourceVpc (whole VPC) rather than aws:sourceVpce (a specific
        # endpoint ID) — mirrors CDK buildVpcRestrictedPolicy. This is a
        # deliberately broader trust boundary: any ENI in the VPC clears the
        # resource policy. Least-privilege is still enforced per caller by
        # IAM path-level grants — each Lambda role gets execute-api:Invoke
        # scoped to specific routes (e.g. agent-as-judge's 6 routes), so the
        # resource policy only gates "is this traffic from our VPC?" while IAM
        # decides "which routes may this principal call?".
        Condition = {
          StringNotEquals = {
            "aws:SourceVpc" = local.vpc_id
          }
        }
      }
    ]
  })

  tags = merge(
    var.tags,
    {
      Name = "${var.project_name}-${var.environment}-api-private"
    }
  )
}

# --- Public API (optional) ---
# Created unless public_endpoint_type == "DISABLED". EDGE (default) or REGIONAL.
resource "aws_api_gateway_rest_api" "public" {
  count = var.public_endpoint_type == "DISABLED" ? 0 : 1

  name        = "${var.project_name}-${var.environment}-api-public"
  description = "ETK public API Gateway for ${var.environment} environment"

  endpoint_configuration {
    types = [var.public_endpoint_type == "REGIONAL" ? "REGIONAL" : "EDGE"]
  }

  tags = merge(
    var.tags,
    {
      Name = "${var.project_name}-${var.environment}-api-public"
    }
  )
}

# API Gateway CloudWatch Logs (operational log group, shared)
resource "aws_cloudwatch_log_group" "api_gateway" {
  name              = "/aws/apigateway/${var.project_name}-${var.environment}"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.encryption_key_arn

  tags = var.tags
}

# Private API access logs
resource "aws_cloudwatch_log_group" "apigw_access" {
  name              = "/aws/apigateway/${var.project_name}-${var.environment}-access"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.encryption_key_arn

  tags = var.tags
}

# Public API access logs (only when the public API exists)
resource "aws_cloudwatch_log_group" "apigw_access_public" {
  count = var.public_endpoint_type == "DISABLED" ? 0 : 1

  name              = "/aws/apigateway/${var.project_name}-${var.environment}-access-public"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.encryption_key_arn

  tags = var.tags
}

# API Gateway Account Settings (for CloudWatch logging — one per account/region,
# shared by both APIs)
resource "aws_api_gateway_account" "main" {
  cloudwatch_role_arn = aws_iam_role.api_gateway_cloudwatch.arn
}

# Note: API Gateway deployments and stages are created in the root module after
# all modules define their methods and integrations. This avoids the error:
# "The REST API doesn't contain any methods".
