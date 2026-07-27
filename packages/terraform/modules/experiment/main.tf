# Main Configuration for Experiment Module
# This module provides experiment management infrastructure including:
# - Experiment management API (Create, Get, Update, List, Delete)
# - MLflow integration for experiment tracking
# - EventBridge integration for evaluation run reporting
#
# Note: Configuration management API (Create, Get, Update, List) is handled
# by the evaluation module and is shared across both evaluation and experiment
# operations.

# The module composes:
# - lambda.tf: Lambda functions for experiment and MLflow handlers
# - api.tf: API Gateway resources and integrations for experiments
# - variables.tf: Input variables
# - outputs.tf: Output values

# Note: This module requires the following to be created by the parent module:
# - REST API (from datastore module)
# - S3 buckets for experiment artifacts and MLflow
# - MLflow tracking server (from experiment module in root)
# - EventBridge event bus
# - Lambda execution role with appropriate permissions
# - VPC and security groups
