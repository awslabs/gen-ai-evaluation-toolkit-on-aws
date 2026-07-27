"""Pytest fixtures for evaluator-builtin e2e tests against a deployed stack.

These tests exercise the full production chain:
  Client → API Gateway → python-api → EventBridge → evaluator-builtin Lambda → Bedrock → DDB

Requires:
- AWS_REGION: AWS region (defaults to eu-west-2)
- SSM /genai-etk/restApiEndpoint must exist in the target account
- Valid AWS credentials with Bedrock + MLflow access

Run with: uv run pytest tests/e2e -m e2e -v
"""

import os
import time
import uuid
from collections.abc import Generator
from typing import Any

import boto3
import pytest
from awssolutions_gen_ai_evaluation_toolkit_python_client.api import DefaultApi  # type: ignore[attr-defined]
from awssolutions_gen_ai_evaluation_toolkit_python_client.api_client import ApiClient  # type: ignore[attr-defined]
from awssolutions_gen_ai_evaluation_toolkit_python_client.models import (  # type: ignore[attr-defined]
    CreateDatasetRequestContent,
    CreateTestCaseRequestContent,
)

pytestmark = pytest.mark.e2e

EVALUATOR_NAME = "builtin"


# --- Client ---


@pytest.fixture(scope="session")
def aws_region() -> str:
    return os.environ.get("AWS_REGION", "eu-west-2")


@pytest.fixture(scope="session")
def api_endpoint(aws_region: str) -> str:
    """Resolve the API endpoint from SSM."""
    ssm = boto3.client("ssm", region_name=aws_region)
    return ssm.get_parameter(Name="/genai-etk/restApiEndpoint")["Parameter"]["Value"]


@pytest.fixture(scope="session")
def client(api_endpoint: str, aws_region: str) -> DefaultApi:
    return DefaultApi(ApiClient(etk_api_endpoint=api_endpoint, aws_region=aws_region))


# --- Helpers ---


def poll_job(client: DefaultApi, job_id: str, timeout: int = 300) -> str:
    """Poll a job until terminal state. Returns final status."""
    for _ in range(timeout // 5):
        job = client.get_evaluator_job(job_id=job_id)
        status = job.status.value
        if status in ("SUCCESS", "PARTIAL_FAILURE", "FAILURE"):
            return status
        time.sleep(5)
    pytest.fail(f"Job {job_id} timed out at status {status} after {timeout}s")
    return status  # unreachable


def list_all_results(client: DefaultApi, report_id: str, max_results: int = 200) -> list[Any]:
    """Paginate through all results for a report."""
    all_results: list[Any] = []
    next_token = None
    while True:
        kwargs: dict[str, Any] = {"report_id": report_id, "max_results": max_results}
        if next_token:
            kwargs["next_token"] = next_token
        resp = client.list_test_results(**kwargs)
        all_results.extend(resp.test_results)
        next_token = resp.next_token
        if not next_token:
            break
    return all_results


# --- Dataset fixture ---


@pytest.fixture
def dataset_10(client: DefaultApi) -> Generator[str, None, None]:
    """Create a dataset with 10 test cases. Yields dataset_id."""
    suffix = uuid.uuid4().hex[:8]
    ds_resp = client.create_dataset(CreateDatasetRequestContent(name=f"e2e-{suffix}"))
    dataset_id = ds_resp.dataset_id

    for i in range(10):
        client.create_test_case(
            dataset_id=dataset_id,
            create_test_case_request_content=CreateTestCaseRequestContent(
                input={"question": f"What is concept {i}?"},
                expected={"answer": f"Concept {i} is a fundamental idea."},
            ),
        )

    yield dataset_id

    try:
        client.delete_dataset(dataset_id)
    except Exception:
        pass
