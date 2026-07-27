"""OTEL trace fixtures for AgentCore scorer tests.

Spans match the real Bedrock AgentCore format:
- kind: "CLIENT"/"INTERNAL"/"SERVER" (not numeric)
- status.code: "UNSET"/"OK" (not numeric)
- timestamps: nanosecond integers (not ISO strings)
- session.id: required on all entries
- scope: with name and optional version/schemaUrl
- resource: with attributes (present on real spans)
"""

TRACE_ID = "54007f7a5cbc4508a5100f18ccd33efc"
SESSION_ID = "6ce30eaf-4592-4843-a561-3565bbefe3e4"

_STRANDS_SCOPE = {"name": "strands.telemetry.tracer", "version": ""}
_BEDROCK_SCOPE = {"name": "opentelemetry.instrumentation.botocore.bedrock-runtime", "version": "0.60b1"}
_STARLETTE_SCOPE = {"name": "opentelemetry.instrumentation.starlette", "version": "0.60b1"}

# --- Spans ---

INVOKE_AGENT_SPAN = {
    "traceId": TRACE_ID,
    "spanId": "125f504df26063ac",
    "parentSpanId": "05f44b65edebdde9",
    "name": "invoke_agent Strands Agents",
    "kind": "INTERNAL",
    "startTimeUnixNano": 1773934287691415372,
    "endTimeUnixNano": 1773934288922088187,
    "scope": _STRANDS_SCOPE,
    "attributes": {
        "session.id": SESSION_ID,
        "gen_ai.operation.name": "invoke_agent",
        "gen_ai.agent.name": "Strands Agents",
        "gen_ai.request.model": "us.amazon.nova-micro-v1:0",
        "gen_ai.usage.input_tokens": 1556,
        "gen_ai.usage.output_tokens": 121,
        "PlatformType": "AWS::BedrockAgentCore",
    },
    "status": {"code": "OK"},
}

EVENT_LOOP_SPAN_1 = {
    "traceId": TRACE_ID,
    "spanId": "84487d2efa515e5a",
    "parentSpanId": "125f504df26063ac",
    "name": "execute_event_loop_cycle",
    "kind": "INTERNAL",
    "startTimeUnixNano": 1773934287691815208,
    "endTimeUnixNano": 1773934288921974322,
    "scope": _STRANDS_SCOPE,
    "attributes": {
        "session.id": SESSION_ID,
        "event_loop.cycle_id": "d62bc3b6-0f58-44c2-880e-80f9d4be429a",
        "PlatformType": "AWS::BedrockAgentCore",
    },
    "status": {"code": "UNSET"},
}

CHAT_SPAN_1 = {
    "traceId": TRACE_ID,
    "spanId": "6f59a76435039d81",
    "parentSpanId": "84487d2efa515e5a",
    "name": "chat",
    "kind": "INTERNAL",
    "startTimeUnixNano": 1773934287691912874,
    "endTimeUnixNano": 1773934288310918308,
    "scope": _STRANDS_SCOPE,
    "attributes": {
        "session.id": SESSION_ID,
        "gen_ai.operation.name": "chat",
        "gen_ai.request.model": "us.amazon.nova-micro-v1:0",
        "gen_ai.usage.input_tokens": 720,
        "gen_ai.usage.output_tokens": 65,
        "gen_ai.response.finish_reasons": ["tool_use"],
        "PlatformType": "AWS::BedrockAgentCore",
    },
    "status": {"code": "UNSET"},
}

LLM_CLIENT_SPAN_1 = {
    "traceId": TRACE_ID,
    "spanId": "34d8f2af94e1ab94",
    "parentSpanId": "6f59a76435039d81",
    "name": "chat us.amazon.nova-micro-v1:0",
    "kind": "CLIENT",
    "startTimeUnixNano": 1773934287694017943,
    "endTimeUnixNano": 1773934288310470213,
    "scope": _BEDROCK_SCOPE,
    "attributes": {
        "session.id": SESSION_ID,
        "gen_ai.operation.name": "chat",
        "gen_ai.request.model": "us.amazon.nova-micro-v1:0",
        "gen_ai.usage.input_tokens": 720,
        "gen_ai.usage.output_tokens": 65,
        "gen_ai.response.finish_reasons": ["tool_use"],
        "gen_ai.system": "aws.bedrock",
        "PlatformType": "AWS::BedrockAgentCore",
    },
    "status": {"code": "UNSET"},
}

TOOL_SPAN = {
    "traceId": TRACE_ID,
    "spanId": "4a72e77de7da9dcd",
    "parentSpanId": "84487d2efa515e5a",
    "name": "execute_tool get_product_info",
    "kind": "INTERNAL",
    "startTimeUnixNano": 1773934288311348861,
    "endTimeUnixNano": 1773934288312062801,
    "scope": _STRANDS_SCOPE,
    "attributes": {
        "session.id": SESSION_ID,
        "gen_ai.operation.name": "execute_tool",
        "gen_ai.tool.name": "get_product_info",
        "gen_ai.tool.call.id": "tooluse_n0trqtTWUQUlqi3ngSJn8h",
        "gen_ai.tool.status": "success",
        "PlatformType": "AWS::BedrockAgentCore",
    },
    "status": {"code": "OK"},
}

EVENT_LOOP_SPAN_2 = {
    "traceId": TRACE_ID,
    "spanId": "5bf8cf89cd635435",
    "parentSpanId": "125f504df26063ac",
    "name": "execute_event_loop_cycle",
    "kind": "INTERNAL",
    "startTimeUnixNano": 1773934288409999334,
    "endTimeUnixNano": 1773934288921956150,
    "scope": _STRANDS_SCOPE,
    "attributes": {
        "session.id": SESSION_ID,
        "event_loop.cycle_id": "21efa920-20ae-4601-89c8-f9928cd24279",
        "PlatformType": "AWS::BedrockAgentCore",
    },
    "status": {"code": "UNSET"},
}

CHAT_SPAN_2 = {
    "traceId": TRACE_ID,
    "spanId": "109c7733194603e6",
    "parentSpanId": "5bf8cf89cd635435",
    "name": "chat",
    "kind": "INTERNAL",
    "startTimeUnixNano": 1773934288410133365,
    "endTimeUnixNano": 1773934288921674980,
    "scope": _STRANDS_SCOPE,
    "attributes": {
        "session.id": SESSION_ID,
        "gen_ai.operation.name": "chat",
        "gen_ai.request.model": "us.amazon.nova-micro-v1:0",
        "gen_ai.usage.input_tokens": 836,
        "gen_ai.usage.output_tokens": 56,
        "gen_ai.response.finish_reasons": ["end_turn"],
        "PlatformType": "AWS::BedrockAgentCore",
    },
    "status": {"code": "UNSET"},
}

LLM_CLIENT_SPAN_2 = {
    "traceId": TRACE_ID,
    "spanId": "5938ca359ec7d74c",
    "parentSpanId": "109c7733194603e6",
    "name": "chat us.amazon.nova-micro-v1:0",
    "kind": "CLIENT",
    "startTimeUnixNano": 1773934288410636947,
    "endTimeUnixNano": 1773934288921264623,
    "scope": _BEDROCK_SCOPE,
    "attributes": {
        "session.id": SESSION_ID,
        "gen_ai.operation.name": "chat",
        "gen_ai.request.model": "us.amazon.nova-micro-v1:0",
        "gen_ai.usage.input_tokens": 836,
        "gen_ai.usage.output_tokens": 56,
        "gen_ai.response.finish_reasons": ["end_turn"],
        "gen_ai.system": "aws.bedrock",
        "PlatformType": "AWS::BedrockAgentCore",
    },
    "status": {"code": "UNSET"},
}

# Non-evaluable span (HTTP/Starlette — should be filtered out)
HTTP_SPAN = {
    "traceId": TRACE_ID,
    "spanId": "05f44b65edebdde9",
    "parentSpanId": "4323848a5f6c707c",
    "name": "POST /invocations",
    "kind": "SERVER",
    "startTimeUnixNano": 1773934287690222715,
    "endTimeUnixNano": 1773934288957310252,
    "scope": _STARLETTE_SCOPE,
    "attributes": {
        "session.id": SESSION_ID,
        "http.method": "POST",
        "http.route": "/invocations",
        "http.status_code": 200,
        "PlatformType": "AWS::BedrockAgentCore",
    },
    "status": {"code": "UNSET"},
}

# --- Events (associated with chat spans) ---

CHAT_1_INPUT_EVENT = {
    "traceId": TRACE_ID,
    "spanId": "34d8f2af94e1ab94",
    "body": {"content": [{"text": "What are the specs for tablets?"}]},
    "timeUnixNano": 0,
    "observedTimeUnixNano": 1773934287694094786,
    "scope": {"name": "opentelemetry.instrumentation.botocore.bedrock-runtime",
              "schemaUrl": "https://opentelemetry.io/schemas/1.30.0"},
    "attributes": {
        "gen_ai.system": "aws.bedrock",
        "event.name": "opentelemetry.instrumentation.botocore.bedrock-runtime",
    },
}

CHAT_1_OUTPUT_EVENT = {
    "traceId": TRACE_ID,
    "spanId": "34d8f2af94e1ab94",
    "body": {
        "message": {
            "tool_calls": [{"type": "function", "id": "tooluse_n0trqtTWUQUlqi3ngSJn8h",
                            "function": {"name": "get_product_info", "arguments": {"product_type": "tablets"}}}],
            "role": "assistant",
        },
        "finish_reason": "tool_use",
    },
    "timeUnixNano": 0,
    "observedTimeUnixNano": 1773934288310189453,
    "scope": {"name": "opentelemetry.instrumentation.botocore.bedrock-runtime",
              "schemaUrl": "https://opentelemetry.io/schemas/1.30.0"},
    "attributes": {
        "gen_ai.system": "aws.bedrock",
        "event.name": "opentelemetry.instrumentation.botocore.bedrock-runtime",
    },
}

TOOL_RESULT_EVENT = {
    "traceId": TRACE_ID,
    "spanId": "4a72e77de7da9dcd",
    "body": {
        "output": {"messages": [{"content": {"message": '[{"text": "Our tablets have 10-12 inch displays"}]'},
                                 "role": "assistant"}]},
    },
    "timeUnixNano": 1773934288312062801,
    "observedTimeUnixNano": 1773934288312689091,
    "scope": {"name": "strands.telemetry.tracer"},
    "attributes": {
        "event.name": "strands.telemetry.tracer",
        "session.id": SESSION_ID,
    },
}

CHAT_2_OUTPUT_EVENT = {
    "traceId": TRACE_ID,
    "spanId": "5938ca359ec7d74c",
    "body": {
        "message": {
            "content": [{"text": "The specifications for our tablets are as follows:\n- Display: 10-12 inches"}],
            "role": "assistant",
        },
        "finish_reason": "end_turn",
    },
    "timeUnixNano": 0,
    "observedTimeUnixNano": 1773934288921039765,
    "scope": {"name": "opentelemetry.instrumentation.botocore.bedrock-runtime",
              "schemaUrl": "https://opentelemetry.io/schemas/1.30.0"},
    "attributes": {
        "gen_ai.system": "aws.bedrock",
        "event.name": "opentelemetry.instrumentation.botocore.bedrock-runtime",
    },
}


# --- Complete session ---

PRODUCT_AGENT_SESSION_SPANS = [
    INVOKE_AGENT_SPAN,
    EVENT_LOOP_SPAN_1,
    CHAT_SPAN_1,
    LLM_CLIENT_SPAN_1,
    CHAT_1_INPUT_EVENT,
    CHAT_1_OUTPUT_EVENT,
    TOOL_SPAN,
    TOOL_RESULT_EVENT,
    EVENT_LOOP_SPAN_2,
    CHAT_SPAN_2,
    LLM_CLIENT_SPAN_2,
    CHAT_2_OUTPUT_EVENT,
    HTTP_SPAN,
]

PRODUCT_AGENT_TESTCASE = {
    "input": {"text": "What are the specs for tablets?"},
    "output": {
        "text": "The specifications for our tablets are as follows:\n- Display: 10-12 inches",
        "trace_id": TRACE_ID,
        "trace_ids": None,
        "session_id": SESSION_ID,
        "session_spans": PRODUCT_AGENT_SESSION_SPANS,
    },
    "expected": {
        "text": "10-12 inch displays, all-day battery life, stylus support",
        "tool_calls": [{"name": "get_product_info", "args": {"product_type": "tablets"}}],
    },
}


# --- Full real trace (for e2e and real API calls) ---
#
# IMPORTANT: The synthetic fixtures above (PRODUCT_AGENT_SESSION_SPANS etc.) are for
# MOCKED unit tests only. They have incomplete span+event pairs and WILL FAIL if sent
# to the real Bedrock AgentCore Evaluate API.
#
# For anything hitting the real API, use load_real_testcase() or REAL_AGENT_TESTCASE.


def load_real_testcase() -> dict:
    """Load the complete real AgentCore testcase from JSON.

    Use this for e2e tests, demos, and any code that calls the real
    Bedrock AgentCore Evaluate API. The synthetic PRODUCT_AGENT_* fixtures
    are for mocked unit tests only.
    """
    import json  # noqa: PLC0415
    from pathlib import Path  # noqa: PLC0415

    trace_path = Path(__file__).parent / "agentcore_real_trace.json"
    return json.loads(trace_path.read_text())


# Pre-loaded for convenience — use this instead of PRODUCT_AGENT_TESTCASE
# when calling the real API
REAL_AGENT_TESTCASE = load_real_testcase()
