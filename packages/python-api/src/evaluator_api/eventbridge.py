"""EventBridge DAO for the Evaluator API.

Provides a DAO abstraction over EventBridge PutEvents, following the same
dependency-injection pattern used by the DynamoDB DAOs.
"""

import json
import os
from logging import getLogger
from typing import Any, Optional

from evaluator_api._aws import boto3_client

logger = getLogger(__name__)

SERVICE_NAME = "GenAiEvaluationToolkit"


class EventBridgeDao:
    """DAO for emitting events to EventBridge."""

    def __init__(self, client: Any, event_bus_name: str) -> None:
        self._client = client
        self._event_bus_name = event_bus_name

    def put_event(self, detail_type: str, detail: dict[str, Any]) -> None:
        """Emit a single event to the configured EventBridge bus."""
        logger.info("Emitting EventBridge event: %s", detail_type)
        response = self._client.put_events(
            Entries=[
                {
                    "Source": SERVICE_NAME,
                    "DetailType": detail_type,
                    "Detail": json.dumps(detail),
                    "EventBusName": self._event_bus_name,
                }
            ]
        )
        failed = response.get("FailedEntryCount", 0)
        if failed > 0:
            entries = response.get("Entries", [])
            raise RuntimeError(f"Failed to emit EventBridge event: {entries}")
        logger.info("EventBridge event emitted: %s", detail_type)


# Lazy singleton
_dao: Optional[EventBridgeDao] = None


def get_eventbridge_dao() -> EventBridgeDao:
    """Get the lazily-initialized EventBridge DAO."""
    global _dao
    if _dao is None:
        event_bus_name = os.environ.get("EVENT_BUS_NAME", "")
        if not event_bus_name:
            raise RuntimeError("EVENT_BUS_NAME environment variable is not set")
        client = boto3_client("events")
        _dao = EventBridgeDao(client=client, event_bus_name=event_bus_name)
    return _dao


def init_eventbridge(client: Any = None, event_bus_name: str = "test-bus") -> EventBridgeDao:
    """Initialize the EventBridge DAO (for testing). Returns the DAO."""
    global _dao
    _dao = EventBridgeDao(client=client, event_bus_name=event_bus_name)
    return _dao


def set_eventbridge_dao(dao: Any) -> None:
    """Replace the cached DAO (for testing with mocks)."""
    global _dao
    _dao = dao


def reset_eventbridge() -> None:
    """Reset the cached DAO (for testing)."""
    global _dao
    _dao = None
