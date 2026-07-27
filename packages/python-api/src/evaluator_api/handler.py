"""Evaluator API Lambda handler.

This module provides the Lambda entry point. Route handlers are organized
in the routes package by resource type:
  - routes/evaluator_jobs.py - Evaluator job submission and management
  - routes/results.py - Test result operations (get, list, batch create/update)
  - routes/reports.py - Report management
"""

from typing import Any

from aws_lambda_powertools.utilities.typing import LambdaContext

from evaluator_api.routes import app, logger


@logger.inject_lambda_context
def handler(event: dict[str, Any], context: LambdaContext) -> dict[str, Any]:
    """Lambda handler."""
    logger.debug("Request body", extra={"body": event.get("body")})
    return app.resolve(event, context)
