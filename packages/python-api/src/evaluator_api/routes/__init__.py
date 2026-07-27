"""Route modules for the Evaluator API.

This package contains route handlers organized by resource type.
"""

import uuid
from datetime import datetime
from typing import Any, Optional

from aws_lambda_powertools import Logger
from aws_lambda_powertools.event_handler import APIGatewayRestResolver, Response, content_types
from aws_lambda_powertools.event_handler.middlewares import BaseMiddlewareHandler, NextMiddleware
from aws_lambda_powertools.event_handler.openapi.exceptions import RequestValidationError
from mypy_boto3_dynamodb.service_resource import Table

from evaluator_api._aws import boto3_resource
from evaluator_api.ddb import JobDao, ReportDao, ResultDao, ResultItem
from evaluator_api.ddb.common import EVALUATOR_TABLE_NAME
from evaluator_api.routes.models import (
    ScoreOutput,
    TestResult,
)

logger = Logger()

class _RequestLogger(BaseMiddlewareHandler):  # type: ignore[type-arg]
    """Middleware that injects request context into every log line."""

    _REQUEST_KEYS = [
        "http_method", "path", "resource", "operation",
        "request_id", "apigw_request_id", "path_parameters", "caller_arn",
    ]

    def handler(self, app: APIGatewayRestResolver, next_middleware: NextMiddleware) -> Response:  # type: ignore[type-arg]
        event = app.current_event
        request_context = event.request_context

        # Capture the IAM caller identity so destructive/privileged operations
        # (report deletion, job status updates, result injection) are attributable
        # in the application logs, not just the separate API Gateway access logs.
        identity = (request_context.get("identity") if request_context else None) or {}
        caller_arn = identity.get("userArn") or identity.get("user") or "unknown"

        # Append keys so every log line in this request carries them
        logger.append_keys(
            http_method=event.http_method,
            path=event.path,
            resource=request_context.get("resourcePath") if request_context else None,
            operation=request_context.get("operationName") if request_context else None,
            request_id=request_context.get("requestId") if request_context else None,
            apigw_request_id=request_context.get("extendedRequestId") if request_context else None,
            path_parameters=event.path_parameters or {},
            caller_arn=caller_arn,
        )

        operation = request_context.get("operationName") if request_context else None

        try:
            logger.info("API %s", operation or event.path)
            response = next_middleware(app)
            logger.info("API %s → %d", operation or event.path, response.status_code)
            return response
        finally:
            logger.remove_keys(self._REQUEST_KEYS)


# API Gateway resolver instance - shared across all route modules
app: APIGatewayRestResolver = APIGatewayRestResolver(enable_validation=True)
app.use(middlewares=[_RequestLogger()])


# --- ID Generation ---


def generate_id() -> str:
    """Generate a unique ID without dashes for use as resource identifiers."""
    return str(uuid.uuid4()).replace("-", "")


# --- AWS Resources (lazily initialized) ---

_ddb: Any = None
_table: Optional[Table] = None

# DAOs - lazily initialized
_job_dao: Optional[JobDao] = None
_result_dao: Optional[ResultDao] = None
_report_dao: Optional[ReportDao] = None


def _get_table() -> Table:
    global _ddb, _table
    if _table is None:
        _ddb = _ddb or boto3_resource("dynamodb")
        _table = _ddb.Table(EVALUATOR_TABLE_NAME)
    return _table


def get_job_dao() -> JobDao:
    global _job_dao
    if _job_dao is None:
        _job_dao = JobDao(_get_table())
    return _job_dao


def get_result_dao() -> ResultDao:
    global _result_dao
    if _result_dao is None:
        _result_dao = ResultDao(_get_table())
    return _result_dao


def get_report_dao() -> ReportDao:
    global _report_dao
    if _report_dao is None:
        _report_dao = ReportDao(_get_table())
    return _report_dao


def init_aws(ddb: Any = None) -> None:
    """Initialize AWS clients (for testing)."""
    global _ddb, _table, _job_dao, _result_dao, _report_dao
    _ddb = ddb
    _table = None
    _job_dao = None
    _result_dao = None
    _report_dao = None


# --- Exceptions ---


class ResourceNotFoundException(Exception):
    def __init__(self, message: str) -> None:
        self.message = message
        super().__init__(message)


class ValidationException(Exception):
    def __init__(self, message: str) -> None:
        self.message = message
        super().__init__(message)


@app.exception_handler(ResourceNotFoundException)  # type: ignore[untyped-decorator]
def handle_not_found(ex: ResourceNotFoundException) -> Response[dict[str, str]]:
    logger.warning("Resource not found", extra={"error_message": ex.message})
    return Response(
        status_code=404,
        content_type=content_types.APPLICATION_JSON,
        body={"message": ex.message, "__type": "ResourceNotFoundException"},
    )


@app.exception_handler(ValidationException)  # type: ignore[untyped-decorator]
def handle_validation(ex: ValidationException) -> Response[dict[str, str]]:
    logger.warning("Validation error", extra={"error_message": ex.message})
    return Response(
        status_code=400,
        content_type=content_types.APPLICATION_JSON,
        body={"message": ex.message, "__type": "ValidationException"},
    )


@app.exception_handler(RequestValidationError)  # type: ignore[untyped-decorator]
def handle_request_validation(ex: RequestValidationError) -> Response[dict[str, Any]]:
    logger.warning("Request validation error", extra={"errors": str(ex)})
    return Response(
        status_code=400,
        content_type=content_types.APPLICATION_JSON,
        body={"message": str(ex), "__type": "ValidationException"},
    )


@app.exception_handler(Exception)  # type: ignore[untyped-decorator]
def handle_unhandled(ex: Exception) -> Response[dict[str, str]]:
    logger.exception("Unhandled exception")
    return Response(
        status_code=500,
        content_type=content_types.APPLICATION_JSON,
        body={"message": "Internal server error", "__type": "InternalServerException"},
    )


# --- Utility Functions ---


def item_to_test_result(item: ResultItem) -> TestResult:
    """Convert DynamoDB item to TestResult."""
    created_at = datetime.fromisoformat(item.created_at) if item.created_at else None
    updated_at = datetime.fromisoformat(item.updated_at) if item.updated_at else None

    scores: Optional[dict[str, ScoreOutput]] = None
    if item.scores:
        scores = {}
        for name, score_model in item.scores.items():
            scored_at = None
            if score_model.scoredAt:
                scored_at = datetime.fromisoformat(score_model.scoredAt)
            scores[name] = ScoreOutput(
                value=score_model.value,
                reason=score_model.reason,
                error=score_model.error,
                context=score_model.context,
                scoredAt=scored_at,
            )

    return TestResult(
        resultId=item.result_id,
        reportId=item.report_id,
        testcaseId=item.testcase_id,
        input=item.input,
        output=item.output,
        expected=item.expected,
        context=item.context,
        appMetrics=item.app_metrics,
        error=item.error,
        metadata=item.metadata,
        scores=scores,
        createdAt=created_at,
        updatedAt=updated_at,
    )


__all__ = [
    "app",
    "generate_id",
    "logger",
    "get_job_dao",
    "get_result_dao",
    "get_report_dao",
    "init_aws",
    "ResourceNotFoundException",
    "ValidationException",
    "item_to_test_result",
]

# Register all routes by importing route modules
# This must be at the end to avoid circular imports
from evaluator_api.routes import evaluator_jobs as _evaluator_jobs  # noqa: F401, E402
from evaluator_api.routes import reports as _reports  # noqa: F401, E402
from evaluator_api.routes import results as _results  # noqa: F401, E402
