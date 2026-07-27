"""Live smoke test for agentcore_app_invoke against a real AgentCore runtime.

Usage:
    cd packages/evaluator-builtin
    export AGENTCORE_AGENT_ARN="arn:aws:bedrock-agentcore:<region>:<account>:runtime/agent-<id>"
    export AWS_REGION="<region>"   # optional, defaults to the ARN's region
    uv run python examples/agentcore_live_test.py
"""

from __future__ import annotations

import json
import logging
import os
import sys

from evaluator_builtin.app_invoke import agentcore_app_invoke

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")


def main() -> None:
    agent_arn = os.environ.get("AGENTCORE_AGENT_ARN")
    if not agent_arn:
        print(
            "ERROR: set AGENTCORE_AGENT_ARN to your deployed agent ARN, e.g.\n"
            '  export AGENTCORE_AGENT_ARN="arn:aws:bedrock-agentcore:us-east-1:'
            '123456789012:runtime/agent-xxxxxxxx"',
            file=sys.stderr,
        )
        sys.exit(1)

    parts = agent_arn.split(":")
    if len(parts) < 6:
        print(f"ERROR: malformed ARN {agent_arn!r}", file=sys.stderr)
        sys.exit(1)
    region = os.environ.get("AWS_REGION") or parts[3]

    app = agentcore_app_invoke(
        agent_arn,
        region=region,
        # Agent is in us-east-2 which is not one of the preview regions; spans
        # may or may not appear. Leave fetch_spans on so we can see what comes back.
        fetch_spans=True,
        cloudwatch_wait_seconds=10,
        cloudwatch_retries=2,
    )

    print("\n=== Single-turn with a tool-forcing prompt ===")
    out = app({"text": "What are the specs for tablets?"})
    _print_output(out)
    _dump_spans(out, limit=None)


def _print_output(out: dict) -> None:
    print(f"  text          : {out.get('text')!r}")
    print(f"  session_id    : {out.get('session_id')}")
    print(f"  trace_id      : {out.get('trace_id')}")
    print(f"  trace_ids     : {out.get('trace_ids')}")
    print(f"  #session_spans: {len(out.get('session_spans') or [])}")
    print(f"  span_ids      : {out.get('span_ids')}")
    print(f"  tool_calls    : {json.dumps(out.get('tool_calls'), default=str)}")


def _dump_spans(out: dict, limit: int | None = 3) -> None:
    spans = out.get("session_spans") or []
    print(f"\n  --- session_spans (showing {limit if limit is not None else 'all'} of {len(spans)}) ---")
    for i, s in enumerate(spans if limit is None else spans[:limit]):
        print(f"\n  [{i}] name={s.get('name')!r} kind={s.get('kind')!r} spanId={s.get('spanId')}")
        attrs = s.get("attributes") or {}
        if attrs:
            print(f"      attributes keys: {sorted(attrs.keys())}")
        body = s.get("body")
        if body is not None:
            print(f"      body: {json.dumps(body, default=str)[:500]}")


if __name__ == "__main__":
    main()
