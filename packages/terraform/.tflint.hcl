# TFLint Configuration for ETK Terraform
# https://github.com/terraform-linters/tflint

plugin "aws" {
  enabled = true
  version = "0.43.0"
  source  = "github.com/terraform-linters/tflint-ruleset-aws"
}

plugin "terraform" {
  enabled = true
  preset  = "recommended"
}

config {
  call_module_type = "all"
  force            = false
}

# AWS Rules
rule "aws_resource_missing_tags" {
  enabled = true
  tags = ["Project", "Environment", "ManagedBy"]
}

rule "aws_iam_policy_document_gov_friendly_arns" {
  enabled = false
}

# AWS-specific rule IDs renamed in tflint-ruleset-aws v0.30+. Rely on the
# `preset = "recommended"` default ruleset for now; re-add explicit rules if needed.

# Terraform Rules
rule "terraform_required_version" {
  enabled = true
}

rule "terraform_required_providers" {
  enabled = true
}

rule "terraform_naming_convention" {
  enabled = true
  format  = "snake_case"
}

rule "terraform_documented_variables" {
  enabled = true
}

rule "terraform_documented_outputs" {
  enabled = true
}

rule "terraform_unused_declarations" {
  enabled = true
}

rule "terraform_deprecated_interpolation" {
  enabled = true
}

rule "terraform_module_pinned_source" {
  enabled = true
}
