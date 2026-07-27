# Per-function IAM roles for Generation module Lambdas

# --- API Handlers Role ---
resource "aws_iam_role" "api_handlers" {
  name = "${var.project_name}-${var.environment}-gen-api-handlers-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "api_handlers_basic" {
  role       = aws_iam_role.api_handlers.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "api_handlers_vpc" {
  role       = aws_iam_role.api_handlers.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

resource "aws_iam_role_policy_attachment" "api_handlers_xray" {
  role       = aws_iam_role.api_handlers.name
  policy_arn = "arn:aws:iam::aws:policy/AWSXRayDaemonWriteAccess"
}

resource "aws_iam_role_policy" "api_handlers_kms" {
  count = var.encryption_key_arn != null ? 1 : 0
  name  = "${var.project_name}-${var.environment}-gen-api-handlers-kms"
  role  = aws_iam_role.api_handlers.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["kms:Decrypt", "kms:GenerateDataKey"]
      Resource = var.encryption_key_arn
    }]
  })
}

# --- Async Handler Role ---
resource "aws_iam_role" "gen_async_handler" {
  name = "${var.project_name}-${var.environment}-gen-async-handler-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "gen_async_handler_basic" {
  role       = aws_iam_role.gen_async_handler.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "gen_async_handler_vpc" {
  role       = aws_iam_role.gen_async_handler.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

resource "aws_iam_role_policy_attachment" "gen_async_handler_xray" {
  role       = aws_iam_role.gen_async_handler.name
  policy_arn = "arn:aws:iam::aws:policy/AWSXRayDaemonWriteAccess"
}

resource "aws_iam_role_policy" "gen_async_handler_kms" {
  count = var.encryption_key_arn != null ? 1 : 0
  name  = "${var.project_name}-${var.environment}-gen-async-handler-kms"
  role  = aws_iam_role.gen_async_handler.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["kms:Decrypt", "kms:GenerateDataKey"]
      Resource = var.encryption_key_arn
    }]
  })
}

# --- Await Handler Role ---
resource "aws_iam_role" "gen_await_handler" {
  name = "${var.project_name}-${var.environment}-gen-await-handler-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "gen_await_handler_basic" {
  role       = aws_iam_role.gen_await_handler.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "gen_await_handler_vpc" {
  role       = aws_iam_role.gen_await_handler.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

resource "aws_iam_role_policy_attachment" "gen_await_handler_xray" {
  role       = aws_iam_role.gen_await_handler.name
  policy_arn = "arn:aws:iam::aws:policy/AWSXRayDaemonWriteAccess"
}

resource "aws_iam_role_policy" "gen_await_handler_kms" {
  count = var.encryption_key_arn != null ? 1 : 0
  name  = "${var.project_name}-${var.environment}-gen-await-handler-kms"
  role  = aws_iam_role.gen_await_handler.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["kms:Decrypt", "kms:GenerateDataKey"]
      Resource = var.encryption_key_arn
    }]
  })
}

# --- Outputs ---
output "api_handlers_role_arn" {
  value = aws_iam_role.api_handlers.arn
}

output "gen_async_handler_role_arn" {
  value = aws_iam_role.gen_async_handler.arn
}

output "gen_await_handler_role_arn" {
  value = aws_iam_role.gen_await_handler.arn
}
