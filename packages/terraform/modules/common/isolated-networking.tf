# Isolated (airgapped) networking for evaluators that must be sealed off from
# the public internet (e.g. agent-as-judge). Mirrors the CDK construct
# packages/deployment/lib/constructs/vpc.ts.
#
# Design (kept byte-for-byte equivalent in intent to the CDK):
#   - A SECONDARY CIDR (10.1.0.0/16) is attached to the VPC so the primary
#     CIDR subnets/route-tables/NAT are untouched — fully additive.
#   - One isolated subnet per AZ, carved /20 from the secondary CIDR.
#   - A single isolated route table whose ONLY route is the implicit VPC-local
#     route — no IGW, no NAT. Workloads here reach the rest of the VPC
#     (interface endpoints, VPC DNS) but never the internet.
#   - Interface VPC endpoints (Bedrock-Runtime, EventBridge, CloudWatch,
#     execute-api) live on the PRIVATE-subnet ENIs; isolated subnets reach them
#     via local routing + zonal private DNS.
#   - The S3 GATEWAY endpoint route table is associated with the isolated route
#     table so isolated workloads can still read/write S3.
#
# All resources are gated on local.create_vpc — on the BYO-VPC path the caller
# supplies pre-built isolated subnets via var.existing_isolated_subnet_ids and
# is responsible for the equivalent endpoint/routing connectivity.

locals {
  # Isolated subnet IDs resolved across new-VPC and BYO-VPC modes.
  isolated_subnet_ids = var.use_existing_vpc ? var.existing_isolated_subnet_ids : aws_subnet.isolated[*].id

  # Interface VPC endpoints required by isolated-subnet workloads.
  # Bedrock-Runtime + EventBridge are specifically needed by agent-as-judge;
  # CloudWatch (+logs) carry metrics/log egress, execute-api reaches the
  # private API. The agent-as-judge evaluator is Lambda-based and pulls no
  # container images, so no ECR endpoints are provisioned here.
  interface_endpoint_services = {
    cloudwatch      = "com.amazonaws.${var.region}.monitoring"
    cloudwatch_logs = "com.amazonaws.${var.region}.logs"
    bedrock_runtime = "com.amazonaws.${var.region}.bedrock-runtime"
    events          = "com.amazonaws.${var.region}.events"
    execute_api     = "com.amazonaws.${var.region}.execute-api"
  }
}

# =============================================================================
# Secondary CIDR + isolated subnets
# =============================================================================

resource "aws_vpc_ipv4_cidr_block_association" "secondary" {
  count = local.create_vpc ? 1 : 0

  vpc_id     = aws_vpc.main[0].id
  cidr_block = var.isolated_subnets_secondary_cidr
}

# One /20 isolated subnet per AZ, carved from the secondary CIDR.
# cidrsubnet(10.1.0.0/16, 4, n) => 10.1.(n*16).0/20 — matches the CDK allocation.
resource "aws_subnet" "isolated" {
  count = local.create_vpc ? length(local.availability_zones) : 0

  vpc_id                  = aws_vpc.main[0].id
  cidr_block              = cidrsubnet(var.isolated_subnets_secondary_cidr, 4, count.index)
  availability_zone       = local.availability_zones[count.index]
  map_public_ip_on_launch = false

  # Subnet creation must wait for the secondary CIDR to be attached.
  depends_on = [aws_vpc_ipv4_cidr_block_association.secondary]

  tags = {
    Name = "${var.project_name}-${var.environment}-isolated-${local.availability_zones[count.index]}"
    Tier = "Isolated"
  }
}

# Isolated route table — no internet route (neither IGW nor NAT). The implicit
# VPC-local route (covering primary + secondary CIDRs) is the only path out.
resource "aws_route_table" "isolated" {
  count = local.create_vpc ? 1 : 0

  vpc_id = aws_vpc.main[0].id

  tags = {
    Name = "${var.project_name}-${var.environment}-isolated-rt"
  }
}

resource "aws_route_table_association" "isolated" {
  count = local.create_vpc ? length(local.availability_zones) : 0

  subnet_id      = aws_subnet.isolated[count.index].id
  route_table_id = aws_route_table.isolated[0].id
}

# =============================================================================
# Interface VPC endpoints + endpoint security group
# =============================================================================

# Endpoint SG: allow HTTPS (443) from both the primary VPC CIDR (private/public
# subnets) and the secondary CIDR (isolated subnets). The secondary-CIDR rule is
# essential — without it the endpoint ENIs silently drop isolated-subnet packets.
resource "aws_security_group" "vpc_endpoints" {
  # checkov:skip=CKV_AWS_382: All-egress required so the interface VPC endpoints can reach AWS service endpoints. Parity with the other ETK SGs (lambda, ecs, api_gateway_vpc_endpoint, ecs_plugin) which also carry the same all-egress + checkov:skip pattern. Ingress is locked down to HTTPS from the primary + isolated VPC CIDRs.
  count = local.create_vpc ? 1 : 0

  name        = "${var.project_name}-${var.environment}-vpce-sg"
  description = "Allow HTTPS to interface VPC endpoints from VPC (primary + isolated secondary CIDR)"
  vpc_id      = local.vpc_id

  ingress {
    description = "HTTPS from VPC primary and isolated secondary CIDRs"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [local.vpc_cidr, var.isolated_subnets_secondary_cidr]
  }

  egress {
    description = "Allow all outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-vpce-sg"
  }
}

# Interface endpoints live on the private-subnet ENIs (one per AZ). Isolated
# subnets reach them via local routing + zonal private DNS — interface endpoints
# accept at most one subnet per AZ, and each AZ already has a private ENI.
#
# private_dns_enabled is ON for ALL endpoints, matching CDK
# (packages/deployment/lib/constructs/vpc.ts: privateDnsEnabled: true on every
# interface endpoint, including execute-api and events). This is correct because
# ETK's primary REST API is now PRIVATE (EndpointType.PRIVATE), served through
# the execute-api interface endpoint — so VPC-wide private DNS resolves the API
# hostname to the endpoint ENIs for in-VPC callers, with no internet path needed.
resource "aws_vpc_endpoint" "interface" {
  for_each = local.create_vpc ? local.interface_endpoint_services : {}

  vpc_id              = local.vpc_id
  service_name        = each.value
  vpc_endpoint_type   = "Interface"
  private_dns_enabled = true
  subnet_ids          = aws_subnet.private[*].id
  security_group_ids  = [aws_security_group.vpc_endpoints[0].id]

  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-vpce-${each.key}"
  })
}

# =============================================================================
# S3 gateway endpoint — associate public + isolated route tables (private is
# already associated in networking.tf). Mirrors the CDK gateway endpoint, which
# routes S3 for private + public + isolated subnets.
# =============================================================================

resource "aws_vpc_endpoint_route_table_association" "s3_public" {
  count = local.create_vpc && var.enable_vpc_endpoints ? 1 : 0

  route_table_id  = aws_route_table.public[0].id
  vpc_endpoint_id = aws_vpc_endpoint.s3[0].id
}

resource "aws_vpc_endpoint_route_table_association" "s3_isolated" {
  count = local.create_vpc && var.enable_vpc_endpoints ? 1 : 0

  route_table_id  = aws_route_table.isolated[0].id
  vpc_endpoint_id = aws_vpc_endpoint.s3[0].id
}
