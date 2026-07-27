"""AgentCore scorer — evaluates agentic systems via the Bedrock AgentCore evaluation API."""

import logging
from enum import Enum
from typing import Any

from evaluator_sdk import Scorer, ScoreResult, TestResult, scorer
from pydantic import BaseModel, ValidationError

from evaluator_builtin._aws import boto3_client

logger = logging.getLogger(__name__)



class AgentCoreScorer(Scorer):
    """Scorer that evaluates agentic systems via the Bedrock AgentCore evaluation API.

    Processes OpenTelemetry trace spans from agent executions and scores them
    using AWS built-in evaluators or custom evaluators.

    Each score in the ``scores`` dict is an AgentCore evaluator ID:
    - Built-in evaluators: ``Builtin.Correctness``, ``Builtin.Faithfulness``, etc.
    - Custom evaluators: any evaluator ID with ``level`` in score_params

    Test case field locations:
    - ``output.session_spans``: list of OTEL span dicts from the agent execution
    - ``output.trace_ids``: list of trace IDs (or ``output.trace_id`` for single trace)
    - ``output.session_id``: session ID (optional)
    - ``input`` and ``expected`` are not sent to the API — evaluation is based
      solely on the OTEL spans.

    Configuration via ``params``:
    - ``region``: AWS region for bedrock-agentcore client (default: us-east-1)

    Example usage::

        evaluator = Evaluator(
            scorers=[AgentCoreScorer],
            app_invoke=my_agent_app,
        )
        response = evaluator.evaluate(
            testcases=[...],
            scorers={
                "agentcore": {
                    "params": {"region": "us-east-1"},
                    "scores": {
                        "Builtin.Correctness": None,
                        "Builtin.GoalSuccessRate": None,
                        "Builtin.ToolSelectionAccuracy": None,
                    },
                },
            },
        )
    """

    name = "agentcore"

    def __init__(self) -> None:
        self._client: Any = None
        self._current_region: str | None = None

    @scorer(dynamic=True)
    def _generic_scorer(
        self,
        score_name: str,
        score_params: dict[str, Any] | None,
        test_result: TestResult,
        params: dict[str, Any] | None = None,
    ) -> ScoreResult:
        output = test_result.output

        # Determine level
        if score_name in AGENTCORE_SCORES:
            level = AGENTCORE_SCORES[score_name]
        elif score_params:
            try:
                config = CustomEvaluatorConfig.model_validate(score_params)
                level = config.level
            except ValidationError:
                return ScoreResult(
                    error=f"Invalid score_params for '{score_name}'. "
                    f"Custom evaluators require 'level' (session, trace, or tool)."
                )
        else:
            return ScoreResult(
                error=f"Unknown evaluator '{score_name}'. "
                f"Built-in evaluators: {list(AGENTCORE_SCORES.keys())}. "
                "Custom evaluators require a 'level' in score params."
            )

        # Extract data from output
        output_data = output if isinstance(output, dict) else {}
        trace_ids = output_data.get("trace_ids") or []
        if not trace_ids:
            # Fallback to single trace_id
            trace_id = output_data.get("trace_id")
            if trace_id:
                trace_ids = [trace_id]
            else:
                return ScoreResult(error="output.trace_ids or output.trace_id is required")
        raw_spans = output_data.get("session_spans", [])

        # Check there is anything evaluable, but submit the RAW documents:
        # the Evaluate API's parser classifies spans vs log events
        # structurally and attaches event bodies (LLM messages, tool
        # arguments) to their parent spans. Reshaping events into
        # span-shaped documents client-side (the previous behavior) makes
        # the service treat them as untagged spans — tripping its
        # one-session-per-request validation — and strips the span/event
        # association it needs to find evaluable content.
        if not SpanFilter.filter_evaluable_spans(raw_spans):
            return ScoreResult(error="No evaluable spans found in output.session_spans")

        # Build API params
        p = AgentCoreParams.model_validate(params or {})
        region = p.region
        client = self._get_client(region)

        eval_params = _build_eval_params(
            evaluator_id=score_name,
            level=level,
            trace_ids=trace_ids,
            session_spans=raw_spans,
        )
        if not eval_params:
            return ScoreResult(error=f"Failed to build evaluation parameters for '{score_name}'")

        # Call the API
        try:
            response = client.evaluate(**eval_params)
        except Exception as e:
            logger.exception("AgentCore evaluate API failed for '%s'", score_name)
            return ScoreResult(error=f"AgentCore evaluation failed: {e}")

        # Parse response — API returns a single result per evaluator call
        results = response.get("evaluationResults", [])
        if len(results) != 1:
            return ScoreResult(error=f"Evaluator '{score_name}' returned {len(results)} results, expected 1")

        (result,) = results
        value = result.get("value")
        if value is None:
            error_msg = result.get("errorMessage", "No value returned")
            return ScoreResult(error=f"Evaluator '{score_name}' error: {error_msg}")

        try:
            float_value = float(value)
        except (TypeError, ValueError):
            return ScoreResult(error=f"Evaluator '{score_name}' returned non-numeric value: {value}")

        return ScoreResult(
            value=float_value,
            reason=result.get("explanation"),
        )

    def _get_client(self, region: str) -> Any:
        if self._client is not None and self._current_region == region:
            return self._client
        self._client = boto3_client("bedrock-agentcore", region_name=region)
        self._current_region = region
        return self._client



MAX_TOOL_SPANS = 10


class EvaluatorLevel(str, Enum):
    SESSION = "session"
    TRACE = "trace"
    TOOL = "tool"


AGENTCORE_SCORES: dict[str, EvaluatorLevel] = {
    "Builtin.GoalSuccessRate": EvaluatorLevel.SESSION,
    "Builtin.Coherence": EvaluatorLevel.TRACE,
    "Builtin.Conciseness": EvaluatorLevel.TRACE,
    # Builtin.ContextRelevance excluded — AWS API currently errors on it
    "Builtin.Correctness": EvaluatorLevel.TRACE,
    "Builtin.Faithfulness": EvaluatorLevel.TRACE,
    "Builtin.Harmfulness": EvaluatorLevel.TRACE,
    "Builtin.Helpfulness": EvaluatorLevel.TRACE,
    "Builtin.InstructionFollowing": EvaluatorLevel.TRACE,
    "Builtin.Refusal": EvaluatorLevel.TRACE,
    "Builtin.ResponseRelevance": EvaluatorLevel.TRACE,
    "Builtin.Stereotyping": EvaluatorLevel.TRACE,
    "Builtin.ToolParameterAccuracy": EvaluatorLevel.TOOL,
    "Builtin.ToolSelectionAccuracy": EvaluatorLevel.TOOL,
}



class AgentCoreParams(BaseModel):
    region: str = "us-east-1"


class CustomEvaluatorConfig(BaseModel):
    level: EvaluatorLevel



class SpanFilter:
    """Filters OpenTelemetry spans to identify evaluable content."""

    @staticmethod
    def is_span(item: dict[str, Any]) -> bool:
        return "name" in item and "kind" in item and "startTimeUnixNano" in item

    @staticmethod
    def is_event(item: dict[str, Any]) -> bool:
        return "body" in item and "timeUnixNano" in item and "startTimeUnixNano" not in item

    @staticmethod
    def is_model_span(name: str, attributes: dict[str, Any]) -> bool:
        return (
            "chat" in name.lower()
            or "gen_ai.operation.name" in attributes
            or "gen_ai.request.model" in attributes
            or "gen_ai.usage.input_tokens" in attributes
        )

    @staticmethod
    def is_tool_span(name: str, attributes: dict[str, Any]) -> bool:
        name_lower = name.lower()
        return (
            "execute_tool" in name_lower
            or "tool_call" in name_lower
            or "tool_use" in name_lower
            or "gen_ai.tool.name" in attributes
        )

    @staticmethod
    def is_evaluable(name: str, attributes: dict[str, Any]) -> bool:
        return (
            SpanFilter.is_model_span(name, attributes)
            or SpanFilter.is_tool_span(name, attributes)
            or "invoke_agent" in name.lower()
            or "execute_event_loop_cycle" in name.lower()
        )

    @staticmethod
    def filter_evaluable_spans(raw_spans: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Filter OTEL spans to include only evaluable spans and their events."""
        if not raw_spans:
            return []

        required_fields = {"traceId", "spanId", "name", "kind"}
        evaluable_ids: set[str] = set()

        for item in raw_spans:
            if not isinstance(item, dict) or not SpanFilter.is_span(item):
                continue
            if required_fields - item.keys():
                continue
            if SpanFilter.is_evaluable(item.get("name", ""), item.get("attributes", {})):
                evaluable_ids.add(item["spanId"])

        span_lookup: dict[str, dict[str, Any]] = {}
        for item in raw_spans:
            if isinstance(item, dict) and SpanFilter.is_span(item) and item.get("spanId") in evaluable_ids:
                span_lookup[item["spanId"]] = item

        default_scope = {"name": "default.instrumentation", "version": "1.0.0"}
        result = []
        for item in raw_spans:
            if not isinstance(item, dict):
                continue
            if SpanFilter.is_span(item) and item.get("spanId") in evaluable_ids:
                span = {**item}
                if "scope" not in span:
                    span["scope"] = default_scope
                result.append(span)
            elif SpanFilter.is_event(item) and item.get("spanId") in evaluable_ids:
                event = {**item}
                parent = span_lookup.get(item.get("spanId", ""), {})
                event.setdefault("scope", parent.get("scope", default_scope))
                event.setdefault("kind", parent.get("kind", "1"))
                ts = event.get("timeUnixNano", "")
                event.setdefault("startTimeUnixNano", ts)
                event.setdefault("endTimeUnixNano", ts)
                result.append(event)
        return result

    @staticmethod
    def extract_tool_span_ids(spans: list[dict[str, Any]]) -> list[str]:
        """Extract span IDs belonging to tool execution spans."""
        return [
            item["spanId"] for item in spans
            if isinstance(item, dict) and SpanFilter.is_span(item)
        and SpanFilter.is_tool_span(item.get("name", ""), item.get("attributes", {}))
        and "spanId" in item
    ]


def _build_eval_params(
    *,
    evaluator_id: str,
    level: EvaluatorLevel,
    trace_ids: list[str],
    session_spans: list[dict[str, Any]],
) -> dict[str, Any] | None:
    """Build bedrock-agentcore evaluate() parameters based on evaluator level."""
    if not session_spans:
        logger.error("Evaluator '%s' requires session spans but none available", evaluator_id)
        return None

    params: dict[str, Any] = {
        "evaluatorId": evaluator_id,
        "evaluationInput": {"sessionSpans": session_spans},
    }

    if level == EvaluatorLevel.SESSION:
        return params

    if level == EvaluatorLevel.TRACE:
        params["evaluationTarget"] = {"traceIds": trace_ids}
        return params

    tool_span_ids = SpanFilter.extract_tool_span_ids(session_spans)
    if tool_span_ids:
        if len(tool_span_ids) > MAX_TOOL_SPANS:
            logger.warning(
                "Limiting tool spans from %d to %d for evaluator '%s'",
                len(tool_span_ids), MAX_TOOL_SPANS, evaluator_id,
            )
        params["evaluationTarget"] = {"spanIds": tool_span_ids[:MAX_TOOL_SPANS]}
    else:
        logger.warning("No tool spans found for evaluator '%s', falling back to traceIds", evaluator_id)
        params["evaluationTarget"] = {"traceIds": trace_ids}

    return params



AgentCoreScorer.available_scores = dict.fromkeys(AGENTCORE_SCORES)
