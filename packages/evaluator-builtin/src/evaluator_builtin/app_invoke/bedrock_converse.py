"""Bedrock Converse app_invoke implementation.

When AI Gateway env vars are configured, routes the Converse call through
the gateway. Otherwise calls Bedrock directly via boto3.
"""

import json
import os
from typing import Any

from evaluator_sdk.gateway_client import (
    get_gateway_bedrock_client,
    get_gateway_model_id,
    is_gateway_configured,
)

from evaluator_builtin._aws import boto3_client

_AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")
_DEFAULT_MODEL_ID = os.environ.get("BEDROCK_MODEL_ID", "global.anthropic.claude-sonnet-4-6")

_direct_bedrock_client = boto3_client("bedrock-runtime", region_name=_AWS_REGION)

_SYSTEM_PROMPT = (
    "You are a helpful assistant. Answer the question directly and concisely "
    "in 1-3 sentences. Do not use markdown formatting, bullet points, or tables."
)


def _resolve_client_and_model() -> tuple[Any, str]:
    """Return (client, model_id) — gateway-routed if configured, direct otherwise."""
    if is_gateway_configured():
        return get_gateway_bedrock_client(), get_gateway_model_id()
    return _direct_bedrock_client, _DEFAULT_MODEL_ID


def bedrock_converse_app_invoke(input_data: dict[str, Any]) -> dict[str, Any]:
    """Invoke Bedrock Converse to generate a response from the input data.

    Extracts a prompt from the input using common field names (user_input,
    question, text, prompt), falling back to JSON serialization.

    When AI Gateway is configured, routes the call through the gateway.
    """
    prompt = (
        input_data.get("user_input")
        or input_data.get("question")
        or input_data.get("text")
        or input_data.get("prompt")
        or json.dumps(input_data)
    )

    client, model_id = _resolve_client_and_model()

    response = client.converse(
        modelId=model_id,
        system=[{"text": _SYSTEM_PROMPT}],
        messages=[{"role": "user", "content": [{"text": prompt}]}],
        inferenceConfig={"maxTokens": 256},
    )

    output_text = response["output"]["message"]["content"][0]["text"]
    return {"response": output_text}
