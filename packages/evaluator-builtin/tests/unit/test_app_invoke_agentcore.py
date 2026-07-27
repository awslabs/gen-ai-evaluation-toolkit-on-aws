"""Unit tests for the AgentCore app_invoke."""

from __future__ import annotations

import io
import json
from typing import Any
from unittest.mock import MagicMock

import pytest
from botocore.exceptions import BotoCoreError, ClientError

from evaluator_builtin.app_invoke.agentcore import (
    _extract_agent_id,
    _extract_tool_calls,
    _parse_agent_response,
    agentcore_app_invoke,
)

AGENT_ARN = (
    "arn:aws:bedrock-agentcore:us-east-1:123456789012:runtime/agent-demo123"
)
SESSION_ID = "11111111-2222-3333-4444-555555555555"


def _make_streaming_body(text: str) -> Any:
    line = json.dumps({"result": {"content": [{"text": text}]}})
    return io.BytesIO(line.encode())


def _mock_agent_response(text: str, session_id: str = SESSION_ID) -> dict[str, Any]:
    return {
        "response": _make_streaming_body(text),
        "runtimeSessionId": session_id,
    }


class TestHelpers:
    def test_extract_agent_id_runtime_arn(self) -> None:
        assert _extract_agent_id(AGENT_ARN) == "agent-demo123"

    def test_extract_agent_id_custom_agent_name(self) -> None:
        """Custom agent names without 'agent-' prefix should be extracted."""
        arn = "arn:aws:bedrock-agentcore:us-east-1:123456789012:runtime/agent_demo_otel-Ty5YO4GAuE"
        assert _extract_agent_id(arn) == "agent_demo_otel-Ty5YO4GAuE"

    def test_extract_agent_id_agent_path(self) -> None:
        """Agent path format should also work."""
        arn = "arn:aws:bedrock-agentcore:us-east-1:123456789012:agent/my-agent"
        assert _extract_agent_id(arn) == "my-agent"

    def test_extract_agent_id_invalid(self) -> None:
        with pytest.raises(ValueError):
            _extract_agent_id("arn:aws:bedrock:not-a-runtime")

    def test_parse_agent_response_empty_body(self) -> None:
        resp = {"response": io.BytesIO(b"")}
        assert _parse_agent_response(resp) == ""

    def test_parse_agent_response_missing_response_key(self) -> None:
        assert _parse_agent_response({}) == ""
        assert _parse_agent_response({"runtimeSessionId": "x"}) == ""

    def test_parse_agent_response_skips_invalid_json(self) -> None:
        body = b"not-json\n" + json.dumps({"result": {"content": [{"text": "hi"}]}}).encode()
        assert _parse_agent_response({"response": io.BytesIO(body)}) == "hi"

    def test_parse_agent_response_tolerates_invalid_utf8(self) -> None:
        """Malformed bytes must not crash parsing; fall back to replacement decoding."""
        good = json.dumps({"result": {"content": [{"text": "final"}]}}).encode()
        body = b"\xff\xfe garbled bytes \xc3\x28\n" + good
        # Should not raise; should recover the valid JSON line
        assert _parse_agent_response({"response": io.BytesIO(body)}) == "final"

    def test_extract_tool_calls_from_span_events(self) -> None:
        spans = [
            {
                "body": {
                    "message": {
                        "tool_calls": [
                            {
                                "type": "function",
                                "function": {"name": "get_product_info", "arguments": {"p": "tablets"}},
                            },
                        ],
                    },
                },
            },
            {"body": {"message": {"tool_calls": []}}},
            {"name": "span-not-event"},
        ]
        calls = _extract_tool_calls(spans)
        assert calls == [{"name": "get_product_info", "args": {"p": "tablets"}}]


class TestSingleTurnInvoke:
    def test_passes_prompt_and_trace_parent(self) -> None:
        agentcore_client = MagicMock()
        agentcore_client.invoke_agent_runtime.return_value = _mock_agent_response("Our tablets...")
        app = agentcore_app_invoke(
            AGENT_ARN, region="us-east-1",
            fetch_spans=False, agentcore_client=agentcore_client,
        )

        output = app({"text": "What are the specs for tablets?"})

        agentcore_client.invoke_agent_runtime.assert_called_once()
        kwargs = agentcore_client.invoke_agent_runtime.call_args.kwargs
        assert kwargs["agentRuntimeArn"] == AGENT_ARN
        assert json.loads(kwargs["payload"].decode()) == {"prompt": "What are the specs for tablets?"}
        assert kwargs["traceParent"].startswith("00-")
        assert "runtimeSessionId" not in kwargs  # no session on first turn

        assert output["text"] == "Our tablets..."
        # 'response' mirrors 'text' for the canonical scorer schema (DeepEval/RAGAS).
        assert output["response"] == "Our tablets..."
        assert output["session_id"] == SESSION_ID
        assert output["trace_id"] is not None
        assert output["trace_ids"] is None  # single-turn leaves this null
        assert output["session_spans"] == []
        assert output["span_ids"] is None
        assert output["turns"] == [
            {"type": "human", "content": "What are the specs for tablets?"},
            {"type": "ai", "content": "Our tablets..."},
        ]
        # 'messages' is a RAGAS-compatible alias of 'turns'
        assert output["messages"] == output["turns"]

    def test_accepts_string_input(self) -> None:
        """String input should be normalized to {"text": ...}."""
        agentcore_client = MagicMock()
        agentcore_client.invoke_agent_runtime.return_value = _mock_agent_response("response")
        app = agentcore_app_invoke(
            AGENT_ARN, region="us-east-1",
            fetch_spans=False, agentcore_client=agentcore_client,
        )

        output = app("What are the specs?")

        kwargs = agentcore_client.invoke_agent_runtime.call_args.kwargs
        assert json.loads(kwargs["payload"].decode()) == {"prompt": "What are the specs?"}
        assert output["text"] == "response"

    def test_accepts_list_input(self) -> None:
        """List input should be normalized to {"turns": ...}."""
        agentcore_client = MagicMock()
        agentcore_client.invoke_agent_runtime.side_effect = [
            _mock_agent_response("turn 1"),
            _mock_agent_response("turn 2"),
        ]
        app = agentcore_app_invoke(
            AGENT_ARN, region="us-east-1",
            fetch_spans=False, agentcore_client=agentcore_client,
        )

        output = app(["Hello", "How are you?"])

        assert agentcore_client.invoke_agent_runtime.call_count == 2
        assert output["text"] == "turn 2"
        assert len(output["trace_ids"]) == 2

    def test_rejects_missing_input(self) -> None:
        agentcore_client = MagicMock()
        app = agentcore_app_invoke(
            AGENT_ARN, region="us-east-1",
            fetch_spans=False, agentcore_client=agentcore_client,
        )
        with pytest.raises(ValueError, match="text.*turns"):
            app({})

    def test_client_error_surfaces_aws_error_code_and_context(self) -> None:
        agentcore_client = MagicMock()
        agentcore_client.invoke_agent_runtime.side_effect = ClientError(
            {"Error": {"Code": "ThrottlingException", "Message": "Rate exceeded"}},
            "InvokeAgentRuntime",
        )
        app = agentcore_app_invoke(
            AGENT_ARN, region="us-east-1",
            fetch_spans=False, agentcore_client=agentcore_client,
        )

        with pytest.raises(RuntimeError) as exc_info:
            app({"text": "hello"})

        msg = str(exc_info.value)
        assert "ThrottlingException" in msg
        assert AGENT_ARN in msg
        assert "hello" in msg

    def test_botocore_error_reports_network_context(self) -> None:
        class _FakeBotoCoreError(BotoCoreError):
            fmt = "boom"

        agentcore_client = MagicMock()
        agentcore_client.invoke_agent_runtime.side_effect = _FakeBotoCoreError()
        app = agentcore_app_invoke(
            AGENT_ARN, region="us-east-1",
            fetch_spans=False, agentcore_client=agentcore_client,
        )

        with pytest.raises(RuntimeError, match="network/config error"):
            app({"text": "hi"})


class TestMultiTurnInvoke:
    def test_reuses_session_id_across_turns(self) -> None:
        agentcore_client = MagicMock()
        agentcore_client.invoke_agent_runtime.side_effect = [
            _mock_agent_response("Hello there"),
            _mock_agent_response("Returns within 30 days"),
        ]
        app = agentcore_app_invoke(
            AGENT_ARN, region="us-east-1",
            fetch_spans=False, agentcore_client=agentcore_client,
        )

        output = app({"turns": ["Hello", "What is the return policy?"]})

        assert agentcore_client.invoke_agent_runtime.call_count == 2
        first = agentcore_client.invoke_agent_runtime.call_args_list[0].kwargs
        second = agentcore_client.invoke_agent_runtime.call_args_list[1].kwargs
        assert "runtimeSessionId" not in first
        assert second["runtimeSessionId"] == SESSION_ID

        assert output["text"] == "Returns within 30 days"
        assert output["session_id"] == SESSION_ID
        assert len(output["trace_ids"]) == 2
        assert output["trace_ids"][0] != output["trace_ids"][1]
        assert [m["content"] for m in output["turns"] if m["type"] == "human"] == [
            "Hello", "What is the return policy?",
        ]

    def test_empty_turns_rejected(self) -> None:
        app = agentcore_app_invoke(
            AGENT_ARN, region="us-east-1",
            fetch_spans=False, agentcore_client=MagicMock(),
        )
        with pytest.raises(ValueError, match="non-empty list"):
            app({"turns": []})

    def test_mid_turn_failure_reports_which_turn_failed(self) -> None:
        agentcore_client = MagicMock()
        agentcore_client.invoke_agent_runtime.side_effect = [
            _mock_agent_response("turn 1 ok"),
            RuntimeError("boto3 exploded"),
            _mock_agent_response("turn 3 unreached"),
        ]
        app = agentcore_app_invoke(
            AGENT_ARN, region="us-east-1",
            fetch_spans=False, agentcore_client=agentcore_client,
        )

        with pytest.raises(RuntimeError) as exc_info:
            app({"turns": ["a", "b", "c"]})

        msg = str(exc_info.value)
        assert "turn 2/3" in msg
        assert "1 turn(s) completed" in msg
        assert SESSION_ID in msg  # session_id is recorded so it's traceable
        # Third turn must not be attempted after the second fails
        assert agentcore_client.invoke_agent_runtime.call_count == 2


class TestSpanFetch:
    def test_spans_and_events_merged_into_output(self) -> None:
        agentcore_client = MagicMock()
        agentcore_client.invoke_agent_runtime.return_value = _mock_agent_response("done")

        span = {
            "traceId": "will-be-overwritten",
            "spanId": "span-1",
            "name": "invoke_agent",
            "kind": "INTERNAL",
            "startTimeUnixNano": 1,
            "endTimeUnixNano": 2,
        }
        event = {
            "traceId": "will-be-overwritten",
            "spanId": "span-1",
            "body": {"message": {"tool_calls": [
                {"type": "function", "function": {"name": "t", "arguments": {"x": 1}}},
            ]}},
            "timeUnixNano": 1,
            "scope": {"name": "tel"},
        }

        logs_client = MagicMock()
        logs_client.exceptions.ResourceNotFoundException = type(
            "RNFE", (Exception,), {},
        )

        # The app_invoke filters log events by the generated trace_id, so we have
        # to replay the spans/events using whatever trace id the app generated.
        # Capture it from the invoke_agent_runtime call.
        def _filter(**kwargs: Any) -> dict[str, Any]:
            # Extract the trace id filter pattern ("<trace_id>")
            pattern = kwargs["filterPattern"].strip('"')
            log_group = kwargs["logGroupName"]
            # Verify the log group path format (no extra "agent-" prefix)
            if log_group != "aws/spans":
                assert log_group == "/aws/bedrock-agentcore/runtimes/agent-demo123-DEFAULT", (
                    f"Expected log group without extra 'agent-' prefix, got: {log_group}"
                )
            # If fetching from aws/spans return the span, otherwise the event
            if log_group == "aws/spans":
                data = {**span, "traceId": pattern}
                return {"events": [{"message": json.dumps(data)}]}
            data = {**event, "traceId": pattern}
            return {"events": [{"message": json.dumps(data)}]}

        logs_client.filter_log_events.side_effect = _filter

        app = agentcore_app_invoke(
            AGENT_ARN, region="us-east-1",
            fetch_spans=True,
            cloudwatch_wait_seconds=0,
            cloudwatch_retries=1,
            cloudwatch_retry_delay=0,
            agentcore_client=agentcore_client,
            logs_client=logs_client,
        )

        output = app({"text": "hi"})

        # The merged session_spans should contain span + event, in that order
        session_spans = output["session_spans"]
        assert len(session_spans) == 2
        assert session_spans[0]["spanId"] == "span-1"
        assert session_spans[0]["name"] == "invoke_agent"
        assert session_spans[1]["spanId"] == "span-1"
        assert "body" in session_spans[1]
        assert session_spans[1]["attributes"]["event.name"] == "tel"
        assert output["span_ids"] == ["span-1"]
        assert output["tool_calls"] == [{"name": "t", "args": {"x": 1}}]

    def test_fetcher_skipped_when_fetch_spans_false(self) -> None:
        agentcore_client = MagicMock()
        agentcore_client.invoke_agent_runtime.return_value = _mock_agent_response("done")
        logs_client = MagicMock()

        app = agentcore_app_invoke(
            AGENT_ARN, region="us-east-1",
            fetch_spans=False,
            agentcore_client=agentcore_client,
            logs_client=logs_client,
        )
        app({"text": "hi"})
        logs_client.filter_log_events.assert_not_called()

    def test_resource_not_found_returns_empty_spans(self) -> None:
        agentcore_client = MagicMock()
        agentcore_client.invoke_agent_runtime.return_value = _mock_agent_response("done")

        logs_client = MagicMock()
        rnfe_cls = type("RNFE", (Exception,), {})
        logs_client.exceptions.ResourceNotFoundException = rnfe_cls
        logs_client.filter_log_events.side_effect = rnfe_cls()

        app = agentcore_app_invoke(
            AGENT_ARN, region="us-east-1",
            fetch_spans=True,
            cloudwatch_wait_seconds=0,
            cloudwatch_retries=3,
            cloudwatch_retry_delay=0,
            agentcore_client=agentcore_client,
            logs_client=logs_client,
        )
        out = app({"text": "hi"})

        assert out["session_spans"] == []
        # Early-return after first RNFE — no retries
        assert logs_client.filter_log_events.call_count == 1

    def test_client_error_retries_then_succeeds(self) -> None:
        agentcore_client = MagicMock()
        agentcore_client.invoke_agent_runtime.return_value = _mock_agent_response("done")

        logs_client = MagicMock()
        logs_client.exceptions.ResourceNotFoundException = type("RNFE", (Exception,), {})

        throttle = ClientError(
            {"Error": {"Code": "ThrottlingException", "Message": "slow down"}},
            "FilterLogEvents",
        )
        # First call throttles, second/third succeed with empty
        logs_client.filter_log_events.side_effect = [throttle, {"events": []}, {"events": []}]

        app = agentcore_app_invoke(
            AGENT_ARN, region="us-east-1",
            fetch_spans=True,
            cloudwatch_wait_seconds=0,
            cloudwatch_retries=3,
            cloudwatch_retry_delay=0,
            agentcore_client=agentcore_client,
            logs_client=logs_client,
        )
        out = app({"text": "hi"})

        # Retried past the throttle; invocation does not fail
        assert out["session_spans"] == []
        assert logs_client.filter_log_events.call_count >= 2

    def test_client_error_log_identifies_failing_log_group(
        self, caplog: pytest.LogCaptureFixture,
    ) -> None:
        """Operators must be able to tell which CloudWatch log group failed."""
        import logging as _logging

        agentcore_client = MagicMock()
        agentcore_client.invoke_agent_runtime.return_value = _mock_agent_response("done")

        logs_client = MagicMock()
        logs_client.exceptions.ResourceNotFoundException = type("RNFE", (Exception,), {})
        logs_client.filter_log_events.side_effect = ClientError(
            {"Error": {"Code": "AccessDeniedException", "Message": "nope"}},
            "FilterLogEvents",
        )

        app = agentcore_app_invoke(
            AGENT_ARN, region="us-east-1",
            fetch_spans=True,
            cloudwatch_wait_seconds=0, cloudwatch_retries=1, cloudwatch_retry_delay=0,
            agentcore_client=agentcore_client,
            logs_client=logs_client,
        )
        with caplog.at_level(_logging.WARNING, logger="evaluator_builtin.app_invoke.agentcore"):
            app({"text": "hi"})

        messages = "\n".join(r.getMessage() for r in caplog.records)
        assert "AccessDeniedException" in messages
        assert "log_group=aws/spans" in messages
        assert "demo123" in messages  # agent id

    def test_generic_exception_does_not_fail_invocation(self) -> None:
        """CloudWatch failures are logged and swallowed; invocation returns without spans."""
        agentcore_client = MagicMock()
        agentcore_client.invoke_agent_runtime.return_value = _mock_agent_response("done")

        logs_client = MagicMock()
        logs_client.exceptions.ResourceNotFoundException = type("RNFE", (Exception,), {})
        logs_client.filter_log_events.side_effect = RuntimeError("unexpected")

        app = agentcore_app_invoke(
            AGENT_ARN, region="us-east-1",
            fetch_spans=True,
            cloudwatch_wait_seconds=0,
            cloudwatch_retries=2,
            cloudwatch_retry_delay=0,
            agentcore_client=agentcore_client,
            logs_client=logs_client,
        )
        out = app({"text": "hi"})

        assert out["text"] == "done"
        assert out["session_spans"] == []
