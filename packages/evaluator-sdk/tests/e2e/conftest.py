"""Pytest fixtures for e2e tests against a real deployed stack.

Requires:
- AWS_REGION: AWS region (defaults to eu-west-2)
- SSM /genai-etk/restApiEndpoint must exist in the target account
- Valid AWS credentials (via profile, env vars, or IAM role)

All tests in this directory are marked ``@pytest.mark.e2e`` and excluded
from the default test run.  Run with: ``pytest -m e2e``
"""

import os
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

from evaluator_sdk import Evaluator

from ..helpers import exact_match_scorer, simple_app

# Mark every test in this directory as e2e
pytestmark = pytest.mark.e2e


# --- Client ---


@pytest.fixture(scope="session")
def aws_region() -> str:
    """Read the AWS region from the environment."""
    return os.environ.get("AWS_REGION", "eu-west-2")


@pytest.fixture(scope="session")
def api_endpoint(aws_region: str) -> str:
    """Resolve the API endpoint from SSM."""
    ssm = boto3.client("ssm", region_name=aws_region)
    return ssm.get_parameter(Name="/genai-etk/restApiEndpoint")["Parameter"]["Value"]


@pytest.fixture(scope="session")
def client(api_endpoint: str, aws_region: str) -> DefaultApi:
    """SigV4-authenticated DefaultApi client for the real API."""
    return DefaultApi(ApiClient(
        etk_api_endpoint=api_endpoint,
        aws_region=aws_region,
    ))


# --- Dataset ---


@pytest.fixture
def dataset(client: DefaultApi) -> Generator[dict[str, Any], None, None]:
    """Create a dataset with sample test cases; delete on teardown.

    Yields a dict with:
    - dataset_id: str
    - test_case_count: int  (number of test cases created)
    """
    suffix = uuid.uuid4().hex[:8]
    name = f"sdk-e2e-{suffix}"

    # Create dataset
    ds_resp = client.create_dataset(
        CreateDatasetRequestContent(name=name, description="evaluator-sdk e2e test dataset"),
    )
    dataset_id: str = ds_resp.dataset_id

    # Add test cases
    test_cases = [
        {"input": {"question": "What is 2+2?"}, "expected": "4"},
        {"input": {"question": "What is 3+3?"}, "expected": "6"},
        {"input": {"question": "What is 10-7?"}, "expected": "3"},
    ]

    for tc in test_cases:
        client.create_test_case(
            dataset_id,
            CreateTestCaseRequestContent(
                input=tc["input"],
                expected=tc["expected"],
            ),
        )

    yield {"dataset_id": dataset_id, "test_case_count": len(test_cases)}

    # Teardown — always delete the dataset
    try:
        client.delete_dataset(dataset_id)
    except Exception:
        pass  # best-effort cleanup


# --- Evaluator Factory ---


@pytest.fixture
def evaluator_factory(client: DefaultApi) -> Any:
    """Factory that builds an Evaluator wired to the real API."""
    def factory(
        app_invoke: Any = simple_app,
        scorers: list[Any] | None = None,
        name: str = "test-eval",
    ) -> Evaluator:
        if scorers is None:
            scorers = [exact_match_scorer]
        return Evaluator(name=name, app_invoke=app_invoke, scorers=scorers, client=client)
    return factory
