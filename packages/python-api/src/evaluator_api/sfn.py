"""Step Functions client injection for the Evaluator API.

Follows the same lazy-singleton pattern as eventbridge.py.
In production, creates a boto3 stepfunctions client.
In tests, replaced with MockStepFunctions via set_sfn_client().
"""

import os
from typing import Any, Optional

from evaluator_api._aws import boto3_client

_client: Optional[Any] = None


def STATE_MACHINE_ARN() -> str:
    """Return the state machine ARN from the environment (read lazily so tests can set it after import)."""
    return os.environ.get("STATE_MACHINE_ARN", "")


def get_sfn_client() -> Any:
    """Get the Step Functions client (boto3 or mock)."""
    global _client
    if _client is None:
        _client = boto3_client("stepfunctions")
    return _client


def set_sfn_client(client: Any) -> None:
    """Replace the SFN client (for testing with MockStepFunctions)."""
    global _client
    _client = client


def reset_sfn_client() -> None:
    """Reset the cached SFN client."""
    global _client
    _client = None
