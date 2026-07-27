"""ETKTestClient - calls app.resolve() directly instead of HTTP.

Provides a custom ApiClient that intercepts all requests and routes them
through the Lambda handler. ETKTestClient inherits DefaultApi unchanged —
all operations work automatically with no per-method overrides.
"""

import json
import uuid
from typing import Any, Optional
from urllib.parse import parse_qs, urlparse

from awssolutions_gen_ai_evaluation_toolkit_python_client.api import DefaultApi
from awssolutions_gen_ai_evaluation_toolkit_python_client.api_client import ApiClient
from awssolutions_gen_ai_evaluation_toolkit_python_client.rest import RESTResponse

from evaluator_api.handler import app

# Path parameter patterns for Lambda event routing.
# Order matters — more specific patterns must come first.
_PATH_PATTERNS: list[tuple[str, list[str]]] = [
    (r"/v2/jobs/([^/]+)/status", ["job_id"]),
    (r"/v2/evaluators/([^/]+)/jobs/evaluate", ["evaluator_name"]),
    (r"/v2/evaluators/([^/]+)/jobs/score", ["evaluator_name"]),
    (r"/v2/evaluators/([^/]+)/jobs/invoke", ["evaluator_name"]),
    (r"/v2/jobs", []),
    (r"/v2/jobs/([^/]+)", ["job_id"]),
    (r"/v2/reports/([^/]+)/results/delete/batch", ["report_id"]),
    (r"/v2/reports/([^/]+)/results/scores/batch", ["report_id"]),
    (r"/v2/reports/([^/]+)/results/batch", ["report_id"]),
    (r"/v2/reports/([^/]+)/results/([^/]+)", ["report_id", "result_id"]),
    (r"/v2/reports/([^/]+)/results", ["report_id"]),
    (r"/v2/reports/([^/]+)", ["report_id"]),
    (r"/v2/reports", []),
]


def _extract_path_params(path: str) -> Optional[dict[str, str]]:
    """Extract path parameters by matching against known route patterns."""
    import re

    for pattern, param_names in _PATH_PATTERNS:
        match = re.match(f"^{pattern}$", path)
        if match:
            if not param_names:
                return None
            return dict(zip(param_names, match.groups(), strict=True))
    return None


# Map param names to API Gateway-style {placeholders}
_PARAM_PLACEHOLDERS: dict[str, str] = {
    "evaluator_name": "{evaluatorName}",
    "job_id": "{jobId}",
    "report_id": "{reportId}",
    "result_id": "{resultId}",
    "name": "{name}",
}


def _to_resource_path(path: str, path_params: Optional[dict[str, str]]) -> str:
    """Convert a concrete path to an API Gateway resourcePath template."""
    if not path_params:
        return path
    resource = path
    for param_name, value in path_params.items():
        placeholder = _PARAM_PLACEHOLDERS.get(param_name, f"{{{param_name}}}")
        resource = resource.replace(value, placeholder)
    return resource


class _MockHttpResponse:
    """Minimal HTTP response adapter for RESTResponse."""

    def __init__(self, status: int, data: bytes) -> None:
        self.status = status
        self.reason = "OK" if status < 400 else "Error"
        self.data = data
        self.headers = {"content-type": "application/json"}


class LambdaApiClient(ApiClient):
    """ApiClient that routes requests through app.resolve() instead of HTTP."""

    def __init__(self, context: Optional[dict[str, Any]] = None) -> None:
        super().__init__()
        self._lambda_context = context or {}

    def call_api(
        self,
        method: str,
        url: str,
        header_params: Any = None,
        body: Any = None,
        post_params: Any = None,
        _request_timeout: Any = None,
    ) -> RESTResponse:
        # Parse the URL to extract path and query params.
        parsed = urlparse(url)
        path = parsed.path

        query_params: Optional[dict[str, str]] = None
        if parsed.query:
            query_params = {k: v[0] for k, v in parse_qs(parsed.query).items()}

        # Resolve path parameters and the resource template
        path_params = _extract_path_params(path)
        resource_path = _to_resource_path(path, path_params)

        # Build Lambda event
        event: dict[str, Any] = {
            "httpMethod": method,
            "path": path,
            "body": json.dumps(body) if body else None,
            "pathParameters": path_params,
            "queryStringParameters": query_params,
            "headers": {"Content-Type": "application/json"},
            "requestContext": {
                "httpMethod": method,
                "path": path,
                "resourcePath": resource_path,
                "requestId": uuid.uuid4().hex,
                "extendedRequestId": uuid.uuid4().hex[:12],
            },
        }

        result = app.resolve(event, self._lambda_context)

        status_code = result.get("statusCode", 200)
        response_body = result.get("body", "{}")
        if not isinstance(response_body, str):
            response_body = json.dumps(response_body)

        mock_resp = _MockHttpResponse(status_code, response_body.encode("utf-8"))
        rest_response = RESTResponse(mock_resp)
        rest_response.read()
        return rest_response


class ETKTestClient(DefaultApi):
    """Test client that calls app.resolve() directly.

    All DefaultApi methods work automatically — no per-method overrides needed.
    Add new Smithy operations and they just work.

    Usage:
        client = ETKTestClient()
        resp = client.create_report(CreateReportRequestContent(name="my-report"))
    """

    def __init__(self, context: Optional[dict[str, Any]] = None) -> None:
        super().__init__(LambdaApiClient(context))
