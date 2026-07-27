"""Test fixtures for Evaluator API tests.

Supports two modes:
- onebox: Uses moto mocks, direct handler calls via ETKTestClient (default)
- e2e: Uses real AWS, HTTP calls via generated client with SigV4

Switch modes via:
- @pytest.mark.e2e marker on tests
- ETK_TEST_MODE env var (onebox/e2e)
"""

import io
import json
import logging
import os
from collections.abc import Generator
from typing import Any, Optional
from unittest.mock import MagicMock

import boto3
import pytest
from awssolutions_gen_ai_evaluation_toolkit_python_client.api import DefaultApi
from awssolutions_gen_ai_evaluation_toolkit_python_client.api_client import ApiClient
from awssolutions_gen_ai_evaluation_toolkit_python_client.models import (
    BatchCreateResultsRequestContent,
    BatchResultInput,
    CreateReportRequestContent,
    CreateReportResponseContent,
    SubmitEvaluationJobRequestContent,
    SubmitEvaluationJobResponseContent,
    TestDataSource,
)
from moto import mock_aws

from evaluator_api.eventbridge import EventBridgeDao, reset_eventbridge, set_eventbridge_dao
from evaluator_api.routes import init_aws
from evaluator_api.routes import logger as powertools_logger
from evaluator_api.sfn import reset_sfn_client, set_sfn_client
from tests.util import ETKTestClient

# --- Log Capture ---


class LogCapture:
    """Captures Powertools JSON log entries for test assertions.

    In onebox mode, attaches a handler to the Powertools logger to intercept
    JSON-formatted output. In e2e mode, could query CloudWatch (not yet implemented).

    Usage:
        logs = log_capture  # fixture
        client.submit_evaluation_job(...)
        entry = logs.find("API ")
        assert entry["http_method"] == "POST"
    """

    def __init__(self) -> None:
        self._entries: list[dict[str, Any]] = []
        self._stream = io.StringIO()
        self._handler: Optional[logging.StreamHandler[io.StringIO]] = None

    def start(self) -> None:
        """Attach a handler that captures Powertools log output."""
        self._handler = logging.StreamHandler(self._stream)
        # Use the same formatter as the Powertools logger
        if powertools_logger.registered_handler:
            self._handler.setFormatter(powertools_logger.registered_handler.formatter)
        self._handler.setLevel(logging.DEBUG)
        powertools_logger.addHandler(self._handler)

    def stop(self) -> None:
        """Remove the capture handler and parse all entries."""
        if self._handler:
            powertools_logger.removeHandler(self._handler)
        self._stream.seek(0)
        for line in self._stream.read().splitlines():
            try:
                self._entries.append(json.loads(line))
            except (json.JSONDecodeError, ValueError):
                continue

    @property
    def entries(self) -> list[dict[str, Any]]:
        """All captured log entries."""
        return self._entries

    def find(self, message: str) -> Optional[dict[str, Any]]:
        """Find the first log entry whose message contains the given string."""
        for entry in self._entries:
            if message in entry.get("message", ""):
                return entry
        return None

    def find_all(self, message: str) -> list[dict[str, Any]]:
        """Find all log entries matching the given message."""
        return [e for e in self._entries if e.get("message") == message]

# --- Test Configuration ---


def pytest_collection_modifyitems(config: pytest.Config, items: list[pytest.Item]) -> None:
    """Auto-skip onebox_only tests when running in e2e mode."""
    if os.environ.get("ETK_TEST_MODE") != "e2e":
        return
    skip_onebox = pytest.mark.skip(reason="onebox_only: uses mocks incompatible with e2e")
    for item in items:
        if item.get_closest_marker("onebox_only"):
            item.add_marker(skip_onebox)


@pytest.fixture
def test_config(request: pytest.FixtureRequest) -> str:
    """Determine test mode from markers or environment."""
    if request.node.get_closest_marker("e2e"):
        return "e2e"
    return os.environ.get("ETK_TEST_MODE", "onebox")


@pytest.fixture
def is_e2e(test_config: str) -> bool:
    """Convenience fixture: True when running against a real API."""
    return test_config == "e2e"


# --- AWS Credentials and Mock Setup ---


@pytest.fixture(autouse=True)
def aws_credentials(test_config: str) -> None:
    """Set mock AWS credentials for moto. No-op in e2e mode."""
    if test_config == "e2e":
        return
    os.environ["AWS_ACCESS_KEY_ID"] = "testing"
    os.environ["AWS_SECRET_ACCESS_KEY"] = "testing"
    os.environ["AWS_DEFAULT_REGION"] = "us-east-1"
    os.environ["EVENT_BUS_NAME"] = "test-bus"


@pytest.fixture
def setup_handler(test_config: str) -> Generator[None, None, None]:
    """Set up handler with mocked AWS. Yields immediately in e2e mode."""
    if test_config == "e2e":
        yield
        return

    with mock_aws():
        ddb = boto3.resource("dynamodb", region_name="us-east-1")

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

        mock_eb_dao = MagicMock(spec=EventBridgeDao)
        set_eventbridge_dao(mock_eb_dao)

        mock_sfn = MagicMock()

        def _mock_start_execution(**kwargs: Any) -> dict[str, str]:
            """Mock SFN. When skipToPostProcess=True, run PP inline for tests."""
            sf_input = json.loads(kwargs.get("input", "{}"))
            if sf_input.get("skipToPostProcess"):
                from evaluator_api.experiment import run_post_processing
                from evaluator_api.routes import get_job_dao, get_report_dao, get_result_dao
                job_id = sf_input["jobId"]
                run_post_processing(
                    job_dao=get_job_dao(), result_dao=get_result_dao(),
                    report_dao=get_report_dao(), job_id=job_id,
                )
                get_job_dao().update_task_status(job_id, "post_process", "COMPLETED")
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


# --- Log Capture Fixture ---


@pytest.fixture
def log_capture(test_config: str) -> Generator[LogCapture, None, None]:
    """Capture Powertools JSON log entries for assertions.

    In onebox mode, intercepts logger output directly.
    In e2e mode, returns an empty capture (extend later for CloudWatch).
    """
    capture = LogCapture()
    if test_config != "e2e":
        capture.start()
    yield capture
    if test_config != "e2e":
        capture.stop()


# --- Cleanup Fixture ---


@pytest.fixture
def cleanup(client: DefaultApi) -> Generator[list[str], None, None]:
    """Track report IDs for post-test cleanup. Deletes reports (cascading to results) in teardown."""
    report_ids: list[str] = []
    yield report_ids
    for rid in report_ids:
        try:
            client.delete_report(rid)
        except Exception:
            pass


# --- Helper Fixtures ---


@pytest.fixture
def job(client: DefaultApi, cleanup: list[str]) -> SubmitEvaluationJobResponseContent:
    """Create and return a submitted job."""
    resp = client.submit_evaluation_job(
        "my-eval",
        SubmitEvaluationJobRequestContent(
            testCases=TestDataSource.from_dict({"dataset": {"datasetId": "ds-1"}}),
        ),
    )
    cleanup.append(resp.report_id)
    return resp


@pytest.fixture
def report(client: DefaultApi, cleanup: list[str]) -> CreateReportResponseContent:
    """Create and return a report."""
    resp = client.create_report(
        CreateReportRequestContent(name="test-report", description="Test description"),
    )
    cleanup.append(resp.report.report_id)
    return resp


@pytest.fixture
def test_result(client: DefaultApi, cleanup: list[str]) -> dict[str, Any]:
    """Create and return a test result via batch endpoint."""
    report_resp = client.create_report(CreateReportRequestContent(name="test-report-for-result"))
    report_id = report_resp.report.report_id
    cleanup.append(report_id)
    batch_resp = client.batch_create_results(
        report_id,
        BatchCreateResultsRequestContent(results=[
            BatchResultInput(
                input={"question": "What is 2+2?"},
                output={"answer": "4"},
                expected={"answer": "4"},
            ),
        ]),
    )
    created = batch_resp.results[0]
    return {"reportId": report_id, "resultId": created.result_id}
