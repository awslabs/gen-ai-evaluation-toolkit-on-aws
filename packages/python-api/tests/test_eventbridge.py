"""Tests for the EventBridge DAO."""

from unittest.mock import MagicMock

import pytest

from evaluator_api.eventbridge import EventBridgeDao, init_eventbridge, reset_eventbridge


class TestEventBridgeDao:
    def test_put_event_success(self) -> None:
        mock_client = MagicMock()
        mock_client.put_events.return_value = {"FailedEntryCount": 0, "Entries": [{"EventId": "123"}]}
        dao = EventBridgeDao(client=mock_client, event_bus_name="my-bus")

        dao.put_event(detail_type="TestEvent", detail={"key": "value"})

        mock_client.put_events.assert_called_once()
        call_args = mock_client.put_events.call_args
        entry = call_args[1]["Entries"][0]
        assert entry["Source"] == "GenAiEvaluationToolkit"
        assert entry["DetailType"] == "TestEvent"
        assert entry["EventBusName"] == "my-bus"
        assert '"key": "value"' in entry["Detail"]

    def test_put_event_failure_raises(self) -> None:
        mock_client = MagicMock()
        mock_client.put_events.return_value = {
            "FailedEntryCount": 1,
            "Entries": [{"ErrorCode": "InternalError", "ErrorMessage": "boom"}],
        }
        dao = EventBridgeDao(client=mock_client, event_bus_name="my-bus")

        with pytest.raises(RuntimeError, match="Failed to emit EventBridge event"):
            dao.put_event(detail_type="TestEvent", detail={"key": "value"})


class TestEventBridgeSingleton:
    def test_init_and_reset(self) -> None:
        mock_client = MagicMock()
        dao = init_eventbridge(client=mock_client, event_bus_name="test-bus")
        assert isinstance(dao, EventBridgeDao)
        reset_eventbridge()
