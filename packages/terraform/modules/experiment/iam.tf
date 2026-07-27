# Per-function IAM roles for Experiment Lambda functions

# ============================================================================
# Assume Role Policy (shared)
# ============================================================================

data "aws_iam_policy_document" "lambda_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

# ============================================================================
# Experiment Handlers Role
# ============================================================================

resource "aws_iam_role" "experiment_handlers" {
  name               = "${var.project_name}-${var.environment}-experiment-handlers-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
}

resource "aws_iam_role_policy_attachment" "experiment_handlers_basic" {
  role       = aws_iam_role.experiment_handlers.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "experiment_handlers_vpc" {
  role       = aws_iam_role.experiment_handlers.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

resource "aws_iam_role_policy_attachment" "experiment_handlers_xray" {
  role       = aws_iam_role.experiment_handlers.name
  policy_arn = "arn:aws:iam::aws:policy/AWSXRayDaemonWriteAccess"
}

resource "aws_iam_role_policy" "experiment_handlers_kms" {
  count = var.encryption_key_arn != null ? 1 : 0
  name  = "${var.project_name}-${var.environment}-experiment-handlers-kms"
  role  = aws_iam_role.experiment_handlers.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["kms:Decrypt", "kms:GenerateDataKey"]
      Resource = [var.encryption_key_arn]
    }]
  })
}

# ============================================================================
# MLflow Handlers Role
# ============================================================================

resource "aws_iam_role" "mlflow_handlers" {
  name               = "${var.project_name}-${var.environment}-experiment-mlflow-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
}

resource "aws_iam_role_policy_attachment" "mlflow_handlers_basic" {
  role       = aws_iam_role.mlflow_handlers.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "mlflow_handlers_vpc" {
  role       = aws_iam_role.mlflow_handlers.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

resource "aws_iam_role_policy_attachment" "mlflow_handlers_xray" {
  role       = aws_iam_role.mlflow_handlers.name
  policy_arn = "arn:aws:iam::aws:policy/AWSXRayDaemonWriteAccess"
}

resource "aws_iam_role_policy" "mlflow_handlers_kms" {
  count = var.encryption_key_arn != null ? 1 : 0
  name  = "${var.project_name}-${var.environment}-experiment-mlflow-kms"
  role  = aws_iam_role.mlflow_handlers.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["kms:Decrypt", "kms:GenerateDataKey"]
      Resource = [var.encryption_key_arn]
    }]
  })
}

# ============================================================================
# Outputs
# ============================================================================

output "experiment_handlers_role_arn" {
  description = "ARN of the experiment handlers Lambda execution role"
  value       = aws_iam_role.experiment_handlers.arn
}

output "mlflow_handlers_role_arn" {
  description = "ARN of the MLflow handlers Lambda execution role"
  value       = aws_iam_role.mlflow_handlers.arn
}
