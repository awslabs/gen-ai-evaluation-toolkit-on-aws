"""AgentCore app_invoke implementation.

Invokes an agent deployed on Amazon Bedrock AgentCore Runtime and captures
the OpenTelemetry spans that the ``AgentCoreScorer`` needs for evaluation.

The returned output dict matches the JSONPath defaults documented on the
AgentCore evaluation plugin (``$.output.text``, ``$.output.trace_id``,
``$.output.session_spans``, ...), so it plugs into
``evaluator_builtin.scorers.agentcore.AgentCoreScorer`` without any
``dataConfig`` overrides.

Single-turn input::

    {"text": "What are the specs for tablets?"}

Multi-turn input (session_id is preserved across turns)::

    {"turns": ["Hello", "I need help with my order"]}
"""

from __future__ import annotations

import json
import logging
import os
import re
import time
import uuid
from typing import Any

import boto3
from botocore.exceptions import BotoCoreError, ClientError
from evaluator_sdk.models import AppInvokeFn

from evaluator_builtin._aws import boto3_client

logger = logging.getLogger(__name__)


_DEFAULT_CLOUDWATCH_WAIT_SECONDS = 15
_DEFAULT_CLOUDWATCH_RETRIES = 5
_DEFAULT_CLOUDWATCH_RETRY_DELAY = 5
_DEFAULT_LOG_LOOKBACK_MINUTES = 5
_SPANS_LOG_GROUP = "aws/spans"
_OTEL_LOG_STREAM = "otel-rt-logs"
_AGENT_ID_RE = re.compile(r"(?:runtime/|agent/)([^/]+)$")


def _extract_agent_id(agent_arn: str) -> str:
    """Extract the agent id from an AgentCore runtime ARN."""
    match = _AGENT_ID_RE.search(agent_arn)
    if not match:
        raise ValueError(f"Could not extract agent id from ARN: {agent_arn}")
    return match.group(1)


def _gen_trace_parent() -> tuple[str, str]:
    """Generate a W3C traceparent header.  Returns (trace_id, traceparent)."""
    trace_id = uuid.uuid4().hex
    parent_span_id = uuid.uuid4().hex[:16]
    return trace_id, f"00-{trace_id}-{parent_span_id}-01"


def _truncate(text: str, limit: int = 120) -> str:
    """Truncate long strings for error-message embedding."""
    return text if len(text) <= limit else text[:limit] + "..."


def _parse_agent_response(response: dict[str, Any]) -> str:
    """Extract the final text response from an AgentCore streaming body."""
    stream = response.get("response")
    if stream is None:
        logger.warning("AgentCore response has no 'response' body")
        return ""
    raw = stream.read()
    try:
        body = raw.decode("utf-8").strip()
    except UnicodeDecodeError as e:
        # Fall back to replacement so one bad byte doesn't cost the whole response.
        logger.warning(
            "AgentCore response body contains invalid UTF-8 (%s); "
            "decoding with errors='replace'", e,
        )
        body = raw.decode("utf-8", errors="replace").strip()
    if not body:
        return ""
    final = ""
    for line in body.split("\n"):
        if not line:
            continue
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            logger.warning("Skipping non-JSON line in agent response body")
            continue
        result = event.get("result")
        if isinstance(result, dict):
            for item in result.get("content", []) or []:
                if isinstance(item, dict) and "text" in item:
                    final = item["text"]
        elif isinstance(result, str):
            final = result
    return final


class _CloudWatchSpanFetcher:
    """Fetch OTEL spans + events from CloudWatch Logs for an AgentCore invocation."""

    def __init__(
        self,
        *,
        region: str,
        wait_seconds: int,
        retries: int,
        retry_delay: int,
        lookback_minutes: int,
        logs_client: Any | None = None,
    ) -> None:
        self._region = region
        self._wait_seconds = wait_seconds
        self._retries = retries
        self._retry_delay = retry_delay
        self._lookback_minutes = lookback_minutes
        self._logs_client = logs_client

    @property
    def logs_client(self) -> Any:
        if self._logs_client is None:
            self._logs_client = boto3_client("logs", region_name=self._region)
        return self._logs_client

    def fetch(self, *, trace_id: str, agent_id: str) -> list[dict[str, Any]]:
        if self._wait_seconds:
            logger.debug("Waiting %ds for CloudWatch indexing", self._wait_seconds)
            time.sleep(self._wait_seconds)
        for attempt in range(1, self._retries + 1):
            try:
                spans = self._fetch_spans(trace_id, agent_id)
                events = self._fetch_events(trace_id, agent_id)
                items = self._merge(spans, events)
                if items:
                    return items
                logger.debug(
                    "No spans found for trace=%s (attempt %d/%d)",
                    trace_id, attempt, self._retries,
                )
            except self.logs_client.exceptions.ResourceNotFoundException:
                logger.warning(
                    "CloudWatch log group/stream not found for agent=%s trace=%s",
                    agent_id, trace_id,
                )
                return []
            except (ClientError, BotoCoreError):
                # _filter_log_events already logged with AWS error code + log_group;
                # just drive the retry here.
                logger.debug(
                    "CloudWatch fetch retrying trace=%s (attempt %d/%d)",
                    trace_id, attempt, self._retries,
                )
            except Exception:
                logger.exception(
                    "CloudWatch fetch failed trace=%s agent=%s (attempt %d/%d)",
                    trace_id, agent_id, attempt, self._retries,
                )
            if attempt < self._retries:
                time.sleep(self._retry_delay)
        logger.warning("No spans retrieved after %d attempts", self._retries)
        return []

    def _time_range(self) -> tuple[int, int]:
        end = int(time.time() * 1000)
        start = end - self._lookback_minutes * 60 * 1000
        return start, end

    def _filter_log_events(
        self,
        *,
        log_group: str,
        trace_id: str,
        agent_id: str,
        log_stream_names: list[str] | None = None,
    ) -> dict[str, Any]:
        """Call filter_log_events with per-log-group error context.

        Re-raises so the outer fetch() retry loop drives retries; logs the
        log-group name and AWS error code on the way out so operators can
        distinguish shared-spans failures from per-agent IAM issues.
        """
        start, end = self._time_range()
        kwargs: dict[str, Any] = {
            "logGroupName": log_group,
            "startTime": start,
            "endTime": end,
            "filterPattern": f'"{trace_id}"',
        }
        if log_stream_names:
            kwargs["logStreamNames"] = log_stream_names
        try:
            resp: dict[str, Any] = self.logs_client.filter_log_events(**kwargs)
            return resp
        except self.logs_client.exceptions.ResourceNotFoundException:
            # Re-raise — fetch() short-circuits on this case
            raise
        except ClientError as e:
            code = e.response.get("Error", {}).get("Code", "Unknown")
            logger.warning(
                "filter_log_events failed [%s] log_group=%s trace=%s agent=%s: %s",
                code, log_group, trace_id, agent_id, e,
            )
            raise
        except BotoCoreError as e:
            logger.warning(
                "filter_log_events network/config error log_group=%s trace=%s agent=%s: %s",
                log_group, trace_id, agent_id, e,
            )
            raise

    def _fetch_spans(self, trace_id: str, agent_id: str) -> list[dict[str, Any]]:
        resp = self._filter_log_events(
            log_group=_SPANS_LOG_GROUP, trace_id=trace_id, agent_id=agent_id,
        )
        spans: list[dict[str, Any]] = []
        for event in resp.get("events", []):
            try:
                data = json.loads(event.get("message", ""))
            except json.JSONDecodeError:
                continue
            if (
                "name" in data
                and "kind" in data
                and "startTimeUnixNano" in data
                and data.get("traceId") == trace_id
            ):
                spans.append(data)
        return spans

    def _fetch_events(self, trace_id: str, agent_id: str) -> dict[str, list[dict[str, Any]]]:
        log_group = f"/aws/bedrock-agentcore/runtimes/{agent_id}-DEFAULT"
        resp = self._filter_log_events(
            log_group=log_group,
            trace_id=trace_id,
            agent_id=agent_id,
            log_stream_names=[_OTEL_LOG_STREAM],
        )
        by_span: dict[str, list[dict[str, Any]]] = {}
        for event in resp.get("events", []):
            try:
                data = json.loads(event.get("message", ""))
            except json.JSONDecodeError:
                continue
            if (
                "body" in data
                and "timeUnixNano" in data
                and data.get("traceId") == trace_id
                and data.get("spanId")
            ):
                by_span.setdefault(data["spanId"], []).append(data)
        return by_span

    @staticmethod
    def _merge(
        spans: list[dict[str, Any]],
        events_by_span: dict[str, list[dict[str, Any]]],
    ) -> list[dict[str, Any]]:
        """Flatten spans and their events into the session_spans shape required by AgentCore.

        Per AWS docs, sessionSpans must contain spans AND events as separate
        top-level items, not events nested inside spans.
        """
        items: list[dict[str, Any]] = []
        for span in spans:
            items.append(span)
            span_id = span.get("spanId")
            if not span_id:
                continue
            for event in events_by_span.get(span_id, []):
                enriched = {**event}
                attrs = dict(enriched.get("attributes") or {})
                if "event.name" not in attrs:
                    attrs["event.name"] = (enriched.get("scope") or {}).get("name", "log_event")
                enriched["attributes"] = attrs
                items.append(enriched)
        return items


def _extract_tool_calls(spans: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Extract tool-call records from OTEL span event bodies."""
    tool_calls: list[dict[str, Any]] = []
    for span in spans:
        body = span.get("body")
        if not isinstance(body, dict):
            continue
        message = body.get("message")
        if not isinstance(message, dict):
            continue
        for tc in message.get("tool_calls") or []:
            if tc.get("type") != "function":
                continue
            func = tc.get("function", {})
            tool_calls.append({"name": func.get("name"), "args": func.get("arguments", {})})
    return tool_calls


def agentcore_app_invoke(
    agent_arn: str,
    *,
    region: str | None = None,
    fetch_spans: bool = True,
    cloudwatch_wait_seconds: int = _DEFAULT_CLOUDWATCH_WAIT_SECONDS,
    cloudwatch_retries: int = _DEFAULT_CLOUDWATCH_RETRIES,
    cloudwatch_retry_delay: int = _DEFAULT_CLOUDWATCH_RETRY_DELAY,
    agentcore_client: Any | None = None,
    logs_client: Any | None = None,
) -> AppInvokeFn:
    """Build an app_invoke that runs testcases against an AgentCore Runtime agent.

    Args:
        agent_arn: ARN of the deployed AgentCore agent.
        region: AWS region for the bedrock-agentcore and logs clients. Falls back
            to ``AWS_REGION`` env var, then the default session region.
        fetch_spans: If True (default), fetch OTEL spans from CloudWatch after
            invocation so the output carries ``session_spans`` for the
            AgentCoreScorer. Disable for unit tests or when spans are captured
            out-of-band.
        cloudwatch_wait_seconds: Seconds to wait before querying CloudWatch
            Logs. Indexing can be delayed, so a short wait is usually required.
        cloudwatch_retries: How many times to poll CloudWatch Logs before
            giving up.
        cloudwatch_retry_delay: Seconds between CloudWatch retries.
        agentcore_client: Optional pre-built boto3 ``bedrock-agentcore`` client.
            Useful for tests.
        logs_client: Optional pre-built boto3 ``logs`` client. Useful for tests.

    The returned callable accepts an input dict with either:

    - ``{"text": str}``: single-turn invocation.
    - ``{"turns": list[str]}``: multi-turn; the first turn's ``runtimeSessionId``
      is reused for subsequent turns to preserve conversation state.

    The returned output carries:

    - ``text``: final agent response (last turn for multi-turn).
    - ``turns`` / ``messages``: full conversation messages. ``messages`` is an
      alias of ``turns`` so the output plugs into RAGAS multi-turn scorers
      (which read ``output.messages``) without an adapter.
    - ``trace_id`` / ``trace_ids``: W3C trace IDs propagated via ``traceparent``.
    - ``session_id``: AgentCore runtime session id.
    - ``session_spans`` / ``span_ids``: raw OTEL spans (when ``fetch_spans``).
    - ``tool_calls``: tool calls extracted from span events.
    """
    resolved_region = region or os.environ.get("AWS_REGION") or boto3.Session().region_name
    agent_id = _extract_agent_id(agent_arn)

    fetcher: _CloudWatchSpanFetcher | None = None
    if fetch_spans:
        fetcher = _CloudWatchSpanFetcher(
            region=resolved_region or "us-east-1",
            wait_seconds=cloudwatch_wait_seconds,
            retries=cloudwatch_retries,
            retry_delay=cloudwatch_retry_delay,
            lookback_minutes=_DEFAULT_LOG_LOOKBACK_MINUTES,
            logs_client=logs_client,
        )

    _client: Any = agentcore_client

    def _get_client() -> Any:
        nonlocal _client
        if _client is None:
            _client = boto3_client("bedrock-agentcore", region_name=resolved_region)
        return _client

    def _invoke_turn(
        prompt: str, session_id: str | None,
    ) -> tuple[str, str | None, str, list[dict[str, Any]]]:
        """Invoke one turn. Returns (response_text, session_id, trace_id, spans)."""
        trace_id, trace_parent = _gen_trace_parent()
        params: dict[str, Any] = {
            "agentRuntimeArn": agent_arn,
            "payload": json.dumps({"prompt": prompt}).encode(),
            "traceParent": trace_parent,
        }
        if session_id:
            params["runtimeSessionId"] = session_id
        try:
            response = _get_client().invoke_agent_runtime(**params)
        except ClientError as e:
            code = e.response.get("Error", {}).get("Code", "Unknown")
            raise RuntimeError(
                f"AgentCore invoke_agent_runtime failed [{code}]: "
                f"agent_arn={agent_arn} session_id={session_id!r} trace_id={trace_id} "
                f"prompt={_truncate(prompt)!r}: {e}"
            ) from e
        except BotoCoreError as e:
            raise RuntimeError(
                f"AgentCore invoke_agent_runtime network/config error: "
                f"agent_arn={agent_arn} session_id={session_id!r} trace_id={trace_id} "
                f"prompt={_truncate(prompt)!r}: {e}"
            ) from e

        response_text = _parse_agent_response(response)
        runtime_session_id = response.get("runtimeSessionId") or session_id

        spans: list[dict[str, Any]] = []
        if fetcher is not None:
            spans = fetcher.fetch(trace_id=trace_id, agent_id=agent_id)

        return response_text, runtime_session_id, trace_id, spans

    def app_invoke(input_data: dict[str, Any] | list[str] | str) -> dict[str, Any]:
        if isinstance(input_data, str):
            input_data = {"text": input_data}
        elif isinstance(input_data, list):
            input_data = {"turns": input_data}

        turns_input = input_data.get("turns")
        if turns_input is not None:
            if not isinstance(turns_input, list) or not turns_input:
                raise ValueError("input.turns must be a non-empty list")
            prompts: list[str] = [str(p) for p in turns_input]
        else:
            text = input_data.get("text") or input_data.get("prompt")
            if not text:
                raise ValueError("input must contain either 'text' or 'turns'")
            prompts = [str(text)]

        session_id: str | None = None
        trace_ids: list[str] = []
        all_spans: list[dict[str, Any]] = []
        messages: list[dict[str, Any]] = []
        final_text = ""

        for turn_idx, prompt in enumerate(prompts, start=1):
            try:
                final_text, session_id, trace_id, spans = _invoke_turn(prompt, session_id)
            except Exception as e:
                logger.exception(
                    "AgentCore invocation failed on turn %d/%d", turn_idx, len(prompts),
                )
                raise RuntimeError(
                    f"AgentCore invocation failed on turn {turn_idx}/{len(prompts)} "
                    f"(session_id={session_id!r}, {len(trace_ids)} turn(s) completed): {e}"
                ) from e
            trace_ids.append(trace_id)
            all_spans.extend(spans)
            tool_calls = _extract_tool_calls(spans)
            messages.append({"type": "human", "content": prompt})
            if tool_calls:
                messages.append(
                    {"type": "ai", "content": "", "tool_calls": tool_calls},
                )
            if final_text:
                messages.append({"type": "ai", "content": final_text})

        span_ids: list[str] = []
        seen_ids: set[str] = set()
        for s in all_spans:
            sid = s.get("spanId") if isinstance(s, dict) else None
            if sid and sid not in seen_ids:
                span_ids.append(sid)
                seen_ids.add(sid)
        is_multi_turn = len(prompts) > 1

        output: dict[str, Any] = {
            "text": final_text,
            # `response` mirrors `text` so the output matches the canonical scorer
            # schema (DeepEval and RAGAS read output.response).
            "response": final_text,
            "turns": messages,
            "messages": messages,
            "trace_id": trace_ids[0] if trace_ids else None,
            "trace_ids": trace_ids if is_multi_turn else None,
            "session_id": session_id,
            "session_spans": all_spans,
            "span_ids": span_ids or None,
            "tool_calls": _extract_tool_calls(all_spans),
        }
        return output

    return app_invoke


__all__ = ["agentcore_app_invoke"]
