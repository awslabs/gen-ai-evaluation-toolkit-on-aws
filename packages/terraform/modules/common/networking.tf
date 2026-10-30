# VPC and Networking Resources for ETK
# Supports both creating new VPC or using existing VPC (BYOVPC)

# Data source to get available AZs in the region
data "aws_availability_zones" "available" {
  # checkov:skip=CKV_AWS_394: No cdk-nag AwsSolutions equivalent — this rule is Checkov-only, so suppressing it keeps parity with the CDK path, which also lets AWS choose AZs (packages/deployment/lib/constructs/vpc.ts `new Vpc(...)` with no maxAzs/availabilityZones). The result is consumed only as slice(names, 0, 3) with the module validated to <= 3 AZs (CDK maxAzs: 3 parity), so the returned AZ count cannot silently expand. A literal zone-name/zone-id allowlist would hardcode region-specific identity and break the module's multi-region + BYO-VPC portability.
  state = "available"
}

# Data source for existing VPC (when BYOVPC is enabled)
data "aws_vpc" "existing" {
  count = var.use_existing_vpc ? 1 : 0
  id    = var.existing_vpc_id
}

# Data source for existing subnets (when BYOVPC is enabled)
data "aws_subnet" "existing_private" {
  count = var.use_existing_vpc ? length(var.existing_private_subnet_ids) : 0
  id    = var.existing_private_subnet_ids[count.index]
}

data "aws_subnet" "existing_public" {
  count = var.use_existing_vpc ? length(var.existing_public_subnet_ids) : 0
  id    = var.existing_public_subnet_ids[count.index]
}

# =============================================================================
# Local Variables for VPC Abstraction
# =============================================================================
locals {
  # Determine if we should create VPC resources
  create_vpc = !var.use_existing_vpc

  # Availability zones - use existing subnet AZs or auto-detect
  # Falls back to auto-detected AZs if existing_private_subnet_ids is empty (defensive)
  # CDK provisions 3 AZs (maxAzs: 3 in vpc.ts); match that here.
  availability_zones = var.use_existing_vpc ? (
    length(var.existing_private_subnet_ids) > 0 ? [for s in data.aws_subnet.existing_private : s.availability_zone] : slice(data.aws_availability_zones.available.names, 0, 3)
    ) : (
    length(var.availability_zones) > 0 ? var.availability_zones : slice(data.aws_availability_zones.available.names, 0, 3)
  )

  # VPC ID - use existing or created
  vpc_id = var.use_existing_vpc ? var.existing_vpc_id : aws_vpc.main[0].id

  # VPC CIDR - use existing or configured
  vpc_cidr = var.use_existing_vpc ? data.aws_vpc.existing[0].cidr_block : var.vpc_cidr

  # Subnet IDs - use existing or created
  private_subnet_ids = var.use_existing_vpc ? var.existing_private_subnet_ids : aws_subnet.private[*].id
  public_subnet_ids  = var.use_existing_vpc ? var.existing_public_subnet_ids : aws_subnet.public[*].id

  # execute-api interface VPC endpoint ID — used to bind the PRIVATE REST API.
  # On the BYO-VPC path the caller supplies it via existing_api_gw_vpc_endpoint_id.
  apigw_vpc_endpoint_id = local.create_vpc ? aws_vpc_endpoint.interface["execute_api"].id : var.existing_api_gw_vpc_endpoint_id
}

# VPC (only created when not using existing VPC)
resource "aws_vpc" "main" {
  count = local.create_vpc ? 1 : 0

  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name = "${var.project_name}-${var.environment}-vpc"
  }
}

# Internet Gateway (only created when not using existing VPC)
resource "aws_internet_gateway" "main" {
  count = local.create_vpc ? 1 : 0

  vpc_id = aws_vpc.main[0].id

  tags = {
    Name = "${var.project_name}-${var.environment}-igw"
  }
}

# Public Subnets (only created when not using existing VPC)
resource "aws_subnet" "public" {
  count = local.create_vpc ? length(local.availability_zones) : 0

  vpc_id = aws_vpc.main[0].id
  # /19 public subnets carved from the /16 VPC CIDR (cidrsubnet(/16, 3, n)).
  # public[0] uses offset 6 (10.0.192.0/19); public[1]/public[2] use offsets
  # 1/2 => public = 10.0.192.0/19, 10.0.32.0/19, 10.0.64.0/19. Private subnets
  # take offsets 3/4/5. Offset 0 (10.0.0.0/19) is deliberately left unused so a
  # /24-per-AZ block (10.0.0.0/24–10.0.3.0/24) and this /19-per-AZ layout stay
  # non-overlapping within the same /16, making subnet resizing an in-place
  # migration. This 8×/19 scheme only fits up to 3 AZs (offsets 0–7, with 0
  # reserved) — availability_zones is validated to <= 3 to keep it collision-free.
  cidr_block              = cidrsubnet(var.vpc_cidr, 3, count.index == 0 ? 6 : count.index)
  availability_zone       = local.availability_zones[count.index]
  map_public_ip_on_launch = true

  tags = {
    Name = "${var.project_name}-${var.environment}-public-${local.availability_zones[count.index]}"
    Tier = "Public"
  }
}

# Private Subnets (only created when not using existing VPC)
resource "aws_subnet" "private" {
  count = local.create_vpc ? length(local.availability_zones) : 0

  vpc_id = aws_vpc.main[0].id
  # /19 private subnets, continuing after the public /19s. cidrsubnet(/16, 3, n+azCount)
  # => 10.0.96.0/19, 10.0.128.0/19, 10.0.160.0/19 — matches CDK synthesized allocation.
  cidr_block        = cidrsubnet(var.vpc_cidr, 3, count.index + length(local.availability_zones))
  availability_zone = local.availability_zones[count.index]

  tags = {
    Name = "${var.project_name}-${var.environment}-private-${local.availability_zones[count.index]}"
    Tier = "Private"
  }
}

# Elastic IPs for NAT Gateways (only created when not using existing VPC)
resource "aws_eip" "nat" {
  count = local.create_vpc && var.enable_nat_gateway ? length(local.availability_zones) : 0

  domain = "vpc"

  tags = {
    Name = "${var.project_name}-${var.environment}-nat-eip-${local.availability_zones[count.index]}"
  }

  depends_on = [aws_internet_gateway.main]
}

# NAT Gateways (only created when not using existing VPC)
resource "aws_nat_gateway" "main" {
  count = local.create_vpc && var.enable_nat_gateway ? length(local.availability_zones) : 0

  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.public[count.index].id

  tags = {
    Name = "${var.project_name}-${var.environment}-nat-${local.availability_zones[count.index]}"
  }

  depends_on = [aws_internet_gateway.main]
}

# Public Route Table (only created when not using existing VPC)
resource "aws_route_table" "public" {
  count = local.create_vpc ? 1 : 0

  vpc_id = aws_vpc.main[0].id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main[0].id
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-public-rt"
  }
}

# Public Route Table Associations (only created when not using existing VPC)
resource "aws_route_table_association" "public" {
  count = local.create_vpc ? length(local.availability_zones) : 0

  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public[0].id
}

# Private Route Tables (only created when not using existing VPC)
resource "aws_route_table" "private" {
  count = local.create_vpc ? length(local.availability_zones) : 0

  vpc_id = aws_vpc.main[0].id

  dynamic "route" {
    for_each = var.enable_nat_gateway ? [1] : []
    content {
      cidr_block     = "0.0.0.0/0"
      nat_gateway_id = aws_nat_gateway.main[count.index].id
    }
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-private-rt-${local.availability_zones[count.index]}"
  }
}

# Private Route Table Associations (only created when not using existing VPC)
resource "aws_route_table_association" "private" {
  count = local.create_vpc ? length(local.availability_zones) : 0

  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private[count.index].id
}

# VPC Endpoints for AWS Services (optional, for cost optimization)
# Note: When using BYOVPC, endpoints are NOT created - the existing VPC must have
# either NAT gateway access or pre-configured VPC endpoints for S3 and DynamoDB
resource "aws_vpc_endpoint" "s3" {
  count = local.create_vpc && var.enable_vpc_endpoints ? 1 : 0

  vpc_id       = local.vpc_id
  service_name = "com.amazonaws.${var.region}.s3"

  tags = {
    Name = "${var.project_name}-${var.environment}-s3-endpoint"
  }
}

resource "aws_vpc_endpoint_route_table_association" "s3_private" {
  count = local.create_vpc && var.enable_vpc_endpoints ? length(local.availability_zones) : 0

  route_table_id  = aws_route_table.private[count.index].id
  vpc_endpoint_id = aws_vpc_endpoint.s3[0].id
}

resource "aws_vpc_endpoint" "dynamodb" {
  count = local.create_vpc && var.enable_vpc_endpoints ? 1 : 0

  vpc_id       = local.vpc_id
  service_name = "com.amazonaws.${var.region}.dynamodb"

  tags = {
    Name = "${var.project_name}-${var.environment}-dynamodb-endpoint"
  }
}

resource "aws_vpc_endpoint_route_table_association" "dynamodb_private" {
  count = local.create_vpc && var.enable_vpc_endpoints ? length(local.availability_zones) : 0

  route_table_id  = aws_route_table.private[count.index].id
  vpc_endpoint_id = aws_vpc_endpoint.dynamodb[0].id
}
