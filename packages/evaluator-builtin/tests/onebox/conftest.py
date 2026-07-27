"""Onebox fixtures for evaluator-builtin integration tests.

Uses moto to mock DDB + the real python-api handler in-process via ETKTestClient.
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
from evaluator_api.eventbridge import init_eventbridge
from evaluator_api.routes import init_aws
from moto import mock_aws

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


@pytest.fixture(autouse=True)
def aws_credentials() -> None:
    os.environ["AWS_ACCESS_KEY_ID"] = "testing"
    os.environ["AWS_SECRET_ACCESS_KEY"] = "testing"
    os.environ["AWS_DEFAULT_REGION"] = "us-east-1"
    os.environ["EVENT_BUS_NAME"] = "testing"
    os.environ["STATE_MACHINE_ARN"] = "arn:aws:states:us-east-1:123456789012:stateMachine:test"


@pytest.fixture
def setup_handler() -> Generator[None, None, None]:
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

        events_client = boto3.client("events", region_name="us-east-1")
        events_client.create_event_bus(Name="test-bus")
        init_eventbridge(client=events_client, event_bus_name="test-bus")

        # SFN client for post-processing execution (moto mocks SFN calls)
        from evaluator_api.sfn import reset_sfn_client, set_sfn_client
        sfn_client = boto3.client("stepfunctions", region_name="us-east-1")
        sfn_client.create_state_machine(
            name="test",
            definition='{"StartAt":"Pass","States":{"Pass":{"Type":"Pass","End":true}}}',
            roleArn="arn:aws:iam::123456789012:role/test",
        )
        set_sfn_client(sfn_client)

        init_aws(ddb=ddb)
        yield
        init_aws(ddb=None)
        reset_sfn_client()


@pytest.fixture
def client(setup_handler: None) -> DefaultApi:
    return ETKTestClient()


def passthrough_app(input_data: dict[str, Any]) -> dict[str, Any]:
    """App that returns the input as output — used to carry pre-built output through evaluate()."""
    return input_data.get("_output", input_data)
