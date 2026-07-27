"""Unit tests for the AgentCore scorer."""

from unittest.mock import MagicMock, patch

from evaluator_sdk import Evaluator

from evaluator_builtin.scorers.agentcore import (
    AgentCoreScorer,
    SpanFilter,
)
from tests.fixtures.agentcore_traces import (
    HTTP_SPAN,
    INVOKE_AGENT_SPAN,
    PRODUCT_AGENT_SESSION_SPANS,
    PRODUCT_AGENT_TESTCASE,
    TRACE_ID,
)

# --- Span filtering tests (using realistic trace data) ---


class TestFilterSpans:
    def test_filters_evaluable_spans_from_agent_trace(self) -> None:
        result = SpanFilter.filter_evaluable_spans(PRODUCT_AGENT_SESSION_SPANS)
        span_ids = {s["spanId"] for s in result if "kind" in s}
        # Evaluable: agent, event loops, chat spans, tool span, LLM client spans
        assert "125f504df26063ac" in span_ids  # invoke_agent
        assert "84487d2efa515e5a" in span_ids  # event_loop_cycle 1
        assert "6f59a76435039d81" in span_ids  # chat 1
        assert "34d8f2af94e1ab94" in span_ids  # LLM client 1
        assert "4a72e77de7da9dcd" in span_ids  # execute_tool
        assert "5bf8cf89cd635435" in span_ids  # event_loop_cycle 2
        assert "109c7733194603e6" in span_ids  # chat 2
        # Filtered out: HTTP/Starlette span
        assert "05f44b65edebdde9" not in span_ids

    def test_includes_events_for_evaluable_spans(self) -> None:
        result = SpanFilter.filter_evaluable_spans(PRODUCT_AGENT_SESSION_SPANS)
        events = [s for s in result if "body" in s]
        event_span_ids = {e["spanId"] for e in events}
        # Events for LLM client span, tool span, chat span 2
        assert "34d8f2af94e1ab94" in event_span_ids  # LLM client 1 events
        assert "4a72e77de7da9dcd" in event_span_ids  # tool result event
        assert "5938ca359ec7d74c" in event_span_ids  # chat 2 output event

    def test_empty_input(self) -> None:
        assert SpanFilter.filter_evaluable_spans([]) == []

    def test_skips_spans_missing_required_fields(self) -> None:
        bad_span = {"name": "chat", "kind": 2}  # missing traceId, spanId
        result = SpanFilter.filter_evaluable_spans([bad_span])
        assert result == []

    def test_adds_default_scope_when_missing(self) -> None:
        span = {
            "traceId": "t1", "spanId": "s1", "name": "ChatCompletion",
            "kind": "INTERNAL", "startTimeUnixNano": 1000,
            "attributes": {"gen_ai.operation.name": "chat"},
        }
        result = SpanFilter.filter_evaluable_spans([span])
        assert result[0]["scope"] == {"name": "default.instrumentation", "version": "1.0.0"}


class TestExtractToolSpanIds:
    def test_extracts_from_agent_trace(self) -> None:
        filtered = SpanFilter.filter_evaluable_spans(PRODUCT_AGENT_SESSION_SPANS)
        tool_ids = SpanFilter.extract_tool_span_ids(filtered)
        assert "4a72e77de7da9dcd" in tool_ids  # execute_tool span
        assert "6f59a76435039d81" not in tool_ids  # chat span (not a tool)

    def test_empty_list(self) -> None:
        assert SpanFilter.extract_tool_span_ids([]) == []


# --- Scorer tests (using realistic trace data) ---


def _make_evaluator() -> Evaluator:
    return Evaluator(
        name="test-agentcore",
        scorers=[AgentCoreScorer],
        local_only=True,
    )


class TestAgentCoreScorer:
    @patch("evaluator_builtin.scorers.agentcore.boto3_client")
    def test_multiple_evaluators(self, mock_boto3_client: MagicMock) -> None:
        mock_client = MagicMock()
        mock_client.evaluate.side_effect = [
            {"evaluationResults": [{"value": 0.9}]},
            {"evaluationResults": [{"value": 0.85}]},
            {"evaluationResults": [{"value": 1.0}]},
        ]
        mock_boto3_client.return_value = mock_client

        evaluator = _make_evaluator()
        resp = evaluator.score(
            testcases=[PRODUCT_AGENT_TESTCASE],
            scorers={
                "agentcore": {
                    "scores": {
                        "Builtin.Correctness": None,
                        "Builtin.Helpfulness": None,
                        "Builtin.GoalSuccessRate": None,
                    },
                },
            },
        )

        scores = resp.results[0].scores
        assert scores["agentcore.Builtin.Correctness"].value == 0.9
        assert scores["agentcore.Builtin.Helpfulness"].value == 0.85
        assert scores["agentcore.Builtin.GoalSuccessRate"].value == 1.0

    @patch("evaluator_builtin.scorers.agentcore.boto3_client")
    def test_http_spans_filtered_from_api_call(self, mock_boto3_client: MagicMock) -> None:
        """Verify non-evaluable spans (HTTP) are filtered before sending to API."""
        mock_client = MagicMock()
        mock_client.evaluate.return_value = {"evaluationResults": [{"value": 0.8}]}
        mock_boto3_client.return_value = mock_client

        evaluator = _make_evaluator()
        evaluator.score(
            testcases=[PRODUCT_AGENT_TESTCASE],
            scorers={"agentcore": {"scores": {"Builtin.Correctness": None}}},
        )

        call_kwargs = mock_client.evaluate.call_args[1]
        sent_spans = call_kwargs["evaluationInput"]["sessionSpans"]
        sent_span_names = {s.get("name") for s in sent_spans if "name" in s}
        assert "HTTP POST" not in sent_span_names

    @patch("evaluator_builtin.scorers.agentcore.boto3_client")
    def test_custom_evaluator_with_level(self, mock_boto3_client: MagicMock) -> None:
        mock_client = MagicMock()
        mock_client.evaluate.return_value = {"evaluationResults": [{"value": 0.7}]}
        mock_boto3_client.return_value = mock_client

        evaluator = _make_evaluator()
        resp = evaluator.score(
            testcases=[PRODUCT_AGENT_TESTCASE],
            scorers={"agentcore": {"scores": {"MyCustomEval": {"level": "trace"}}}},
        )

        sr = resp.results[0].scores["agentcore.MyCustomEval"]
        assert sr.value == 0.7

    def test_invalid_level(self) -> None:
        evaluator = _make_evaluator()
        resp = evaluator.score(
            testcases=[PRODUCT_AGENT_TESTCASE],
            scorers={"agentcore": {"scores": {"MyCustomEval": {"level": "invalid"}}}},
        )

        sr = resp.results[0].scores["agentcore.MyCustomEval"]
        assert sr.error is not None
        assert "Invalid score_params" in sr.error

    def test_missing_trace_ids(self) -> None:
        evaluator = _make_evaluator()
        resp = evaluator.score(
            testcases=[{
                "input": {"prompt": "test"},
                "output": {"response": "test", "session_spans": PRODUCT_AGENT_SESSION_SPANS},
            }],
            scorers={"agentcore": {"scores": {"Builtin.Correctness": None}}},
        )

        sr = resp.results[0].scores["agentcore.Builtin.Correctness"]
        assert sr.error is not None
        assert "trace_ids" in sr.error

    def test_no_evaluable_spans(self) -> None:
        evaluator = _make_evaluator()
        resp = evaluator.score(
            testcases=[{
                "input": {"prompt": "test"},
                "output": {"trace_ids": [TRACE_ID], "session_spans": [HTTP_SPAN]},
            }],
            scorers={"agentcore": {"scores": {"Builtin.Correctness": None}}},
        )

        sr = resp.results[0].scores["agentcore.Builtin.Correctness"]
        assert sr.error is not None
        assert "No evaluable spans" in sr.error

    @patch("evaluator_builtin.scorers.agentcore.boto3_client")
    def test_api_error(self, mock_boto3_client: MagicMock) -> None:
        mock_client = MagicMock()
        mock_client.evaluate.side_effect = Exception("API throttled")
        mock_boto3_client.return_value = mock_client

        evaluator = _make_evaluator()
        resp = evaluator.score(
            testcases=[PRODUCT_AGENT_TESTCASE],
            scorers={"agentcore": {"scores": {"Builtin.Correctness": None}}},
        )

        sr = resp.results[0].scores["agentcore.Builtin.Correctness"]
        assert sr.error is not None
        assert "AgentCore evaluation failed" in sr.error

    @patch("evaluator_builtin.scorers.agentcore.boto3_client")
    def test_evaluator_returns_error_message(self, mock_boto3_client: MagicMock) -> None:
        mock_client = MagicMock()
        mock_client.evaluate.return_value = {
            "evaluationResults": [{"value": None, "errorMessage": "Insufficient trace data"}]
        }
        mock_boto3_client.return_value = mock_client

        evaluator = _make_evaluator()
        resp = evaluator.score(
            testcases=[PRODUCT_AGENT_TESTCASE],
            scorers={"agentcore": {"scores": {"Builtin.Correctness": None}}},
        )

        sr = resp.results[0].scores["agentcore.Builtin.Correctness"]
        assert sr.error is not None
        assert "Insufficient trace data" in sr.error

    @patch("evaluator_builtin.scorers.agentcore.boto3_client")
    def test_tool_level_no_tool_spans_falls_back_to_trace_ids(self, mock_boto3_client: MagicMock) -> None:
        """TOOL level with no tool spans should fall back to traceIds."""
        mock_client = MagicMock()
        mock_client.evaluate.return_value = {"evaluationResults": [{"value": 0.5}]}
        mock_boto3_client.return_value = mock_client

        # Testcase with only model spans, no tool spans
        no_tool_testcase = {
            "input": {"prompt": "just chat"},
            "output": {
                "trace_ids": ["trace-no-tools"],
                "session_spans": [
                    {
                        "traceId": "trace-no-tools", "spanId": "s1", "name": "invoke_agent",
                        "kind": "INTERNAL", "startTimeUnixNano": 1000,
                        "scope": {"name": "test", "version": "1.0.0"},
                    },
                    {
                        "traceId": "trace-no-tools", "spanId": "s2", "name": "ChatCompletion",
                        "kind": "INTERNAL", "startTimeUnixNano": 2000,
                        "attributes": {"gen_ai.operation.name": "chat"},
                        "scope": {"name": "test", "version": "1.0.0"},
                    },
                ],
            },
        }

        evaluator = _make_evaluator()
        evaluator.score(
            testcases=[no_tool_testcase],
            scorers={"agentcore": {"scores": {"Builtin.ToolSelectionAccuracy": None}}},
        )

        # Should fall back to traceIds since no tool spans
        call_kwargs = mock_client.evaluate.call_args[1]
        assert call_kwargs["evaluationTarget"]["traceIds"] == ["trace-no-tools"]
        assert "spanIds" not in call_kwargs["evaluationTarget"]

    @patch("evaluator_builtin.scorers.agentcore.boto3_client")
    def test_multiple_testcases(self, mock_boto3_client: MagicMock) -> None:
        """Each testcase is scored independently."""
        mock_client = MagicMock()
        mock_client.evaluate.side_effect = [
            {"evaluationResults": [{"value": 0.9}]},
            {"evaluationResults": [{"value": 0.3}]},
        ]
        mock_boto3_client.return_value = mock_client

        evaluator = _make_evaluator()
        resp = evaluator.score(
            testcases=[PRODUCT_AGENT_TESTCASE, PRODUCT_AGENT_TESTCASE],
            scorers={"agentcore": {"scores": {"Builtin.Correctness": None}}},
        )

        assert resp.total_results == 2
        assert resp.results[0].scores["agentcore.Builtin.Correctness"].value == 0.9
        assert resp.results[1].scores["agentcore.Builtin.Correctness"].value == 0.3

    @patch("evaluator_builtin.scorers.agentcore.boto3_client")
    def test_client_cached_across_calls(self, mock_boto3_client: MagicMock) -> None:
        mock_client = MagicMock()
        mock_client.evaluate.return_value = {"evaluationResults": [{"value": 0.5}]}
        mock_boto3_client.return_value = mock_client

        evaluator = _make_evaluator()
        evaluator.score(
            testcases=[PRODUCT_AGENT_TESTCASE, PRODUCT_AGENT_TESTCASE],
            scorers={"agentcore": {"scores": {"Builtin.Correctness": None}}},
        )

        # boto3.client should only be called once (cached)
        assert mock_boto3_client.call_count == 1

    @patch("evaluator_builtin.scorers.agentcore.boto3_client")
    def test_tool_span_truncation(self, mock_boto3_client: MagicMock) -> None:
        """Verify that only 10 tool span IDs are sent when there are more than 10."""
        mock_client = MagicMock()
        mock_client.evaluate.return_value = {"evaluationResults": [{"value": 0.8}]}
        mock_boto3_client.return_value = mock_client

        # Build a testcase with 15 tool spans
        tool_spans = []
        for i in range(15):
            tool_spans.append({
                "traceId": TRACE_ID,
                "spanId": f"span-tool-{i:03d}",
                "parentSpanId": "span-agent-001",
                "name": "execute_tool",
                "kind": 2,
                "startTimeUnixNano": str(1700000001600000000 + i * 100000),
                "attributes": {"gen_ai.tool.name": f"tool_{i}"},
                "scope": {"name": "strands.telemetry.tracer", "version": "1.0.0"},
            })

        testcase = {
            "input": {"prompt": "test"},
            "output": {
                "trace_ids": [TRACE_ID],
                "session_spans": [INVOKE_AGENT_SPAN] + tool_spans,
            },
        }

        evaluator = _make_evaluator()
        evaluator.score(
            testcases=[testcase],
            scorers={"agentcore": {"scores": {"Builtin.ToolSelectionAccuracy": None}}},
        )

        call_kwargs = mock_client.evaluate.call_args[1]
        sent_span_ids = call_kwargs["evaluationTarget"]["spanIds"]
        assert len(sent_span_ids) == 10

    @patch("evaluator_builtin.scorers.agentcore.boto3_client")
    def test_empty_evaluation_results(self, mock_boto3_client: MagicMock) -> None:
        """Verify error when API returns empty evaluationResults."""
        mock_client = MagicMock()
        mock_client.evaluate.return_value = {"evaluationResults": []}
        mock_boto3_client.return_value = mock_client

        evaluator = _make_evaluator()
        resp = evaluator.score(
            testcases=[PRODUCT_AGENT_TESTCASE],
            scorers={"agentcore": {"scores": {"Builtin.Correctness": None}}},
        )

        sr = resp.results[0].scores["agentcore.Builtin.Correctness"]
        assert sr.error is not None
        assert "returned 0 results, expected 1" in sr.error

    @patch("evaluator_builtin.scorers.agentcore.boto3_client")
    def test_non_numeric_value(self, mock_boto3_client: MagicMock) -> None:
        """Verify error when API returns a non-numeric value."""
        mock_client = MagicMock()
        mock_client.evaluate.return_value = {"evaluationResults": [{"value": "N/A"}]}
        mock_boto3_client.return_value = mock_client

        evaluator = _make_evaluator()
        resp = evaluator.score(
            testcases=[PRODUCT_AGENT_TESTCASE],
            scorers={"agentcore": {"scores": {"Builtin.Correctness": None}}},
        )

        sr = resp.results[0].scores["agentcore.Builtin.Correctness"]
        assert sr.error is not None
        assert "non-numeric value" in sr.error

    def test_filter_does_not_mutate_input(self) -> None:
        """SpanFilter.filter_evaluable_spans should not mutate the original spans list."""
        span_without_scope = {
            "traceId": "t1", "spanId": "s1", "name": "ChatCompletion",
            "kind": "INTERNAL", "startTimeUnixNano": 1000,
            "attributes": {"gen_ai.operation.name": "chat"},
        }
        original_keys = set(span_without_scope.keys())
        SpanFilter.filter_evaluable_spans([span_without_scope])
        # Original span should not have scope added
        assert set(span_without_scope.keys()) == original_keys
