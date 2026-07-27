"""Pytest fixtures for evaluator-agent-as-judge e2e tests against a deployed stack.

These tests exercise the full production chain:
  Client → API Gateway → python-api → EventBridge → evaluator-agent-as-judge Lambda → Bedrock → DDB

Requires:
- ETK_API_ENDPOINT: the API Gateway endpoint URL
- ETK_AWS_REGION: AWS region (defaults to eu-west-2)
- Valid AWS credentials with Bedrock access

Run with: uv run pytest tests/e2e -m e2e -v --timeout=600
"""

import os
import time
from typing import Any, List

import boto3
import pytest
from awssolutions_gen_ai_evaluation_toolkit_python_client import (
    ApiClient,  # type: ignore[attr-defined]
    DefaultApi,  # type: ignore[attr-defined]
    InlineTestResult,
)

from evaluator_agent_as_judge.models import EvaluationContext

pytestmark = pytest.mark.e2e

EVALUATOR_NAME = "agent-as-judge"


# --- Client ---


@pytest.fixture(scope="session")
def api_endpoint() -> str:
    """Resolve the API endpoint from SSM."""
    return read_ssm_param("/genai-etk/restApiEndpoint")


@pytest.fixture(scope="session")
def client(api_endpoint: str) -> DefaultApi:
    return DefaultApi(ApiClient(etk_api_endpoint=api_endpoint, aws_region=get_aws_region()))


# --- Test Cases Setup ---


@pytest.fixture(scope="session")
def test_cases() -> List[InlineTestResult]:
    bucket_name = get_customer_bucket_name()
    s3 = boto3.client("s3", region_name=get_aws_region())

    listing = s3.list_objects_v2(
        Bucket=bucket_name,
        Prefix="evaluation/agent-as-judge/test-cases/",
    )

    test_case_keys = [obj["Key"] for obj in listing.get("Contents", []) if "Key" in obj]
    assert len(test_case_keys) > 0

    test_cases: List[InlineTestResult] = []
    for key in test_case_keys:
        response = s3.get_object(Bucket=bucket_name, Key=key)
        content = response["Body"].read().decode("utf-8")

        test_case = InlineTestResult.model_validate_json(content)
        assert test_case.context is not None

        context = EvaluationContext.model_validate(test_case.context)
        assert context.artifacts is not None
        assert len(context.artifacts) == 1

        if context.artifacts[0].bucket_name != bucket_name:
            test_case.context["artifacts"][0]["bucketName"] = bucket_name
            s3.put_object(Bucket=bucket_name, Key=key, Body=test_case.to_json())

        test_cases.append(test_case)

    return test_cases


# --- Helpers ---


def get_customer_bucket_name():
    return read_ssm_param("/genai-etk/customerProvidedBucketName")


def get_aws_region() -> str:
    return os.environ.get("AWS_REGION", "eu-west-2")


def read_ssm_param(name: str) -> str:
    ssm = boto3.client("ssm", region_name=get_aws_region())
    param: Any = ssm.get_parameter(Name=name)
    assert param is not None, f"SSM parameter {name} not found"

    value: str | None = param["Parameter"]["Value"]
    assert isinstance(value, str), "Expected param value to be string"
    return value


def poll_job(client: DefaultApi, job_id: str, timeout: int = 600) -> str:
    """Poll a job until terminal state. Returns final status."""
    status = "PENDING"
    for _ in range(timeout // 5):
        job = client.get_evaluator_job(job_id=job_id)
        status = job.status.value
        if status in ("SUCCESS", "PARTIAL_FAILURE", "FAILURE", "COMPLETED", "FAILED"):
            return status
        time.sleep(5)
    pytest.fail(f"Job {job_id} timed out at status {status} after {timeout}s")


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
