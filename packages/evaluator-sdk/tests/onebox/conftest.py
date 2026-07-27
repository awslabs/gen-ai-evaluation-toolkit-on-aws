"""Pytest fixtures for integration tests.

Supports two modes:
- onebox: Uses moto mocks, direct handler calls via ETKTestClient (default)
- e2e: Uses real AWS, HTTP calls via generated client with SigV4

Switch modes via:
- @pytest.mark.e2e marker on tests
- ETK_TEST_MODE env var (onebox/e2e)
"""

import importlib.util
import os
import sys
from collections.abc import Generator
from pathlib import Path
from typing import Any

import boto3
import pytest
from awssolutions_gen_ai_evaluation_toolkit_python_client.api import DefaultApi  # type: ignore[attr-defined]
from awssolutions_gen_ai_evaluation_toolkit_python_client.api_client import ApiClient  # type: ignore[attr-defined]
from awssolutions_gen_ai_evaluation_toolkit_python_client.models import (  # type: ignore[attr-defined]
    InlineTestCase,
)
from evaluator_api.eventbridge import init_eventbridge, reset_eventbridge
from evaluator_api.routes import init_aws
from evaluator_api.sfn import reset_sfn_client, set_sfn_client
from moto import mock_aws

from ..helpers import exact_match_scorer, make_sample_testcases, simple_app

# Import ETKTestClient from python-api tests (cross-package import via importlib)

_etk_client_path = str(
    Path(__file__).resolve().parent.parent.parent.parent / "python-api" / "tests" / "util" / "etk_test_client.py"
)
_spec = importlib.util.spec_from_file_location("etk_test_client", _etk_client_path)
assert _spec is not None and _spec.loader is not None
_etk_module = importlib.util.module_from_spec(_spec)
sys.modules["etk_test_client"] = _etk_module
_spec.loader.exec_module(_etk_module)
ETKTestClient = _etk_module.ETKTestClient  # type: ignore[attr-defined]


# --- Test Configuration ---


@pytest.fixture
def test_config(request: pytest.FixtureRequest) -> str:
    """Determine test mode from markers or environment."""
    if request.node.get_closest_marker("e2e"):
        return "e2e"
    return os.environ.get("ETK_TEST_MODE", "onebox")


# --- AWS / Moto Fixtures ---


@pytest.fixture(autouse=True)
def aws_credentials(test_config: str) -> None:
    """Set mock AWS credentials for moto. No-op in e2e mode."""
    if test_config == "e2e":
        return
    os.environ["AWS_ACCESS_KEY_ID"] = "testing"
    os.environ["AWS_SECRET_ACCESS_KEY"] = "testing"
    os.environ["AWS_DEFAULT_REGION"] = "us-east-1"
    os.environ["EVENT_BUS_NAME"] = "test-bus"


def create_moto_tables(ddb: Any) -> None:
    """Create the moto DDB table used by onebox tests (single-table design)."""
    ddb.create_table(
        TableName="evaluatortable",
        KeySchema=[
            {"AttributeName": "pk", "KeyType": "HASH"},
            {"AttributeName": "sk", "KeyType": "RANGE"},
        ],
        AttributeDefinitions=[
            {"AttributeName": "pk", "AttributeType": "S"},
            {"AttributeName": "sk", "AttributeType": "S"},
        ],
        BillingMode="PAY_PER_REQUEST",
    )


@pytest.fixture
def setup_handler(test_config: str) -> Generator[None, None, None]:
    """Set up handler with mocked AWS. Yields immediately in e2e mode."""
    if test_config == "e2e":
        yield
        return

    with mock_aws():
        ddb = boto3.resource("dynamodb", region_name="us-east-1")
        create_moto_tables(ddb)

        events_client = boto3.client("events", region_name="us-east-1")
        events_client.create_event_bus(Name="test-bus")
        init_eventbridge(client=events_client, event_bus_name="test-bus")

        from unittest.mock import MagicMock
        mock_sfn = MagicMock()

        def _mock_start_execution(**kwargs: Any) -> dict[str, str]:
            """Mock SFN start_execution. When skipToPostProcess=True, run PP inline."""
            import json as _json
            sf_input = _json.loads(kwargs.get("input", "{}"))
            if sf_input.get("skipToPostProcess"):
                simulate_post_processing({
                    "jobId": sf_input["jobId"],
                    "reportId": sf_input["reportId"],
                })
            return {"executionArn": "arn:aws:states:mock:123:execution:mock:test"}

        mock_sfn.start_execution.side_effect = _mock_start_execution
        set_sfn_client(mock_sfn)

        init_aws(ddb=ddb)
        yield
        init_aws(ddb=None)
        reset_eventbridge()
        reset_sfn_client()


# --- Test Client ---


@pytest.fixture
def client(test_config: str, setup_handler: None) -> DefaultApi:
    """Create API client: ETKTestClient for onebox, SigV4 client for e2e."""
    if test_config == "e2e":
        region = os.environ.get("AWS_REGION", "eu-west-2")
        ssm = boto3.client("ssm", region_name=region)
        endpoint = ssm.get_parameter(Name="/genai-etk/restApiEndpoint")["Parameter"]["Value"]
        return DefaultApi(ApiClient(
            etk_api_endpoint=endpoint,
            aws_region=region,
        ))
    return ETKTestClient()


# --- Evaluator Factory ---


@pytest.fixture
def evaluator_factory(client: DefaultApi) -> Any:
    """Factory that builds an Evaluator wired to the integration client."""
    from evaluator_sdk import Evaluator

    def factory(
        app_invoke: Any = simple_app,
        scorers: list[Any] | None = None,
        name: str = "test-eval",
    ) -> Evaluator:
        if scorers is None:
            scorers = [exact_match_scorer]
        return Evaluator(name=name, app_invoke=app_invoke, scorers=scorers, client=client)

    return factory


# --- Helper Fixtures ---


@pytest.fixture
def sample_testcases() -> list[InlineTestCase]:
    """Sample testcases for evaluation."""
    return make_sample_testcases()


def simulate_post_processing(event_detail: dict[str, Any]) -> None:
    """Run post-processing using the EventBridge event detail payload.

    Mirrors what the post-processing Lambda does: run_post_processing +
    mark the post_process task as COMPLETED via the DAO.
    """
    from evaluator_api.experiment import run_post_processing
    from evaluator_api.routes import get_job_dao, get_report_dao, get_result_dao

    job_id = event_detail["jobId"]
    run_post_processing(
        job_dao=get_job_dao(),
        result_dao=get_result_dao(),
        report_dao=get_report_dao(),
        job_id=job_id,
    )
    # Mark post_process task as COMPLETED (mirrors complete_task in the real handler)
    try:
        get_job_dao().update_task_status(job_id, "post_process", "COMPLETED")
    except Exception:
        pass  # task may not exist for legacy jobs
