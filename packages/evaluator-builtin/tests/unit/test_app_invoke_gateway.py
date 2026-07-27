"""Unit tests for gateway routing in evaluator_builtin.app_invoke.bedrock_converse."""

from unittest.mock import MagicMock, patch

import evaluator_sdk.gateway_client as gc


@patch("evaluator_builtin.app_invoke.bedrock_converse._direct_bedrock_client")
def test_uses_direct_client_when_gateway_not_configured(mock_direct, monkeypatch):
    """When no AI Gateway env vars are set, calls go through the direct boto3 client."""
    # Reset gateway caches
    gc._cached_client = None
    gc._cached_client_secret = None
    for var in [
        "AI_GATEWAY_ENDPOINT",
        "AI_GATEWAY_TOKEN_ENDPOINT",
        "AI_GATEWAY_CLIENT_ID",
        "AI_GATEWAY_CLIENT_SECRET_ARN",
        "AI_GATEWAY_MODEL_ID",
    ]:
        monkeypatch.delenv(var, raising=False)

    mock_direct.converse.return_value = {
        "output": {"message": {"content": [{"text": "hi"}]}}
    }

    from evaluator_builtin.app_invoke.bedrock_converse import bedrock_converse_app_invoke

    result = bedrock_converse_app_invoke({"user_input": "hello"})

    assert result == {"response": "hi"}
    mock_direct.converse.assert_called_once()


@patch("evaluator_sdk.gateway_client.boto3.client")
def test_uses_gateway_client_when_configured(mock_boto3_client, monkeypatch):
    """When all AI Gateway env vars are set, calls route through the gateway client."""
    monkeypatch.setenv("AI_GATEWAY_ENDPOINT", "https://gateway.example.com/bedrock")
    monkeypatch.setenv("AI_GATEWAY_TOKEN_ENDPOINT", "https://auth.example.com/oauth2/token")
    monkeypatch.setenv("AI_GATEWAY_CLIENT_ID", "test-id")
    monkeypatch.setenv("AI_GATEWAY_CLIENT_SECRET_ARN", "arn:aws:secretsmanager:us-east-1:123:secret:t")
    monkeypatch.setenv("AI_GATEWAY_MODEL_ID", "gateway-model")
    gc._cached_client = None
    gc._cached_token = None
    gc._cached_client_secret = "test-secret"

    mock_gateway_client = MagicMock()
    mock_gateway_client.converse.return_value = {
        "output": {"message": {"content": [{"text": "via gateway"}]}}
    }
    mock_boto3_client.return_value = mock_gateway_client

    from evaluator_builtin.app_invoke.bedrock_converse import bedrock_converse_app_invoke

    result = bedrock_converse_app_invoke({"user_input": "hello"})

    assert result == {"response": "via gateway"}
    # Gateway client used; modelId was the AI Gateway model
    mock_gateway_client.converse.assert_called_once()
    kwargs = mock_gateway_client.converse.call_args.kwargs
    assert kwargs["modelId"] == "gateway-model"
    gc._cached_client_secret = None
    gc._cached_client = None
