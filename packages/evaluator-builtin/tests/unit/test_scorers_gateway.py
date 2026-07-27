"""Unit tests for gateway routing in evaluator_builtin scorers.

Uses sys.modules patching to avoid heavy langchain dependencies — the scorer
modules import langchain_aws + langchain_core at top level, but for these
tests we only care about the gateway-routing branch logic, so we stub them.
"""

import sys
from unittest.mock import MagicMock, patch

import pytest

# ---- Stub heavy langchain deps before importing scorer modules ---------------

@pytest.fixture(autouse=True)
def _stub_langchain(monkeypatch):
    """Install fake langchain modules in sys.modules for the duration of a test."""
    stubs = {}
    for name in [
        "langchain_aws",
        "langchain_aws.chat_models",
        "langchain_aws.chat_models.bedrock_converse",
    ]:
        stubs[name] = MagicMock()
    # Ensure key attributes exist for `from x import Y` imports
    stubs["langchain_aws"].ChatBedrock = MagicMock()
    stubs["langchain_aws"].BedrockEmbeddings = MagicMock()
    stubs["langchain_aws.chat_models.bedrock_converse"].ChatBedrockConverse = MagicMock()

    for name, mod in stubs.items():
        monkeypatch.setitem(sys.modules, name, mod)
    yield


def _set_gateway_env(monkeypatch):
    monkeypatch.setenv("AI_GATEWAY_ENDPOINT", "https://gateway.example.com/bedrock")
    monkeypatch.setenv("AI_GATEWAY_TOKEN_ENDPOINT", "https://auth.example.com/oauth2/token")
    monkeypatch.setenv("AI_GATEWAY_CLIENT_ID", "test-id")
    monkeypatch.setenv("AI_GATEWAY_CLIENT_SECRET_ARN", "arn:aws:secretsmanager:us-east-1:123:secret:t")
    monkeypatch.setenv("AI_GATEWAY_MODEL_ID", "gateway-model")
    import evaluator_sdk.gateway_client as gc
    gc._cached_client = None
    gc._cached_token = None
    gc._cached_client_secret = "test-secret"


def _clear_gateway_env(monkeypatch):
    for var in [
        "AI_GATEWAY_ENDPOINT",
        "AI_GATEWAY_TOKEN_ENDPOINT",
        "AI_GATEWAY_CLIENT_ID",
        "AI_GATEWAY_CLIENT_SECRET_ARN",
        "AI_GATEWAY_MODEL_ID",
    ]:
        monkeypatch.delenv(var, raising=False)
    import evaluator_sdk.gateway_client as gc
    gc._cached_client = None
    gc._cached_client_secret = None


# ---- LlmAsJudgeScorer --------------------------------------------------------

def test_llm_as_judge_uses_direct_when_gateway_not_configured(monkeypatch):
    _clear_gateway_env(monkeypatch)
    from evaluator_builtin.scorers import llm_as_judge as mod
    fake_chat = MagicMock()
    monkeypatch.setattr(mod, "ChatBedrockConverse", fake_chat)

    scorer = mod.LlmAsJudgeScorer()
    fake_chat.return_value.with_structured_output = MagicMock()

    scorer._get_structured_llm("amazon.nova-lite-v1:0", None)
    kwargs = fake_chat.call_args.kwargs
    assert kwargs["model"] == "amazon.nova-lite-v1:0"
    assert "client" not in kwargs


@patch("evaluator_sdk.gateway_client.boto3.client")
def test_llm_as_judge_uses_gateway_when_configured(mock_boto3_client, monkeypatch):
    _set_gateway_env(monkeypatch)
    mock_boto3_client.return_value = MagicMock()
    from evaluator_builtin.scorers import llm_as_judge as mod
    fake_chat = MagicMock()
    monkeypatch.setattr(mod, "ChatBedrockConverse", fake_chat)

    scorer = mod.LlmAsJudgeScorer()
    fake_chat.return_value.with_structured_output = MagicMock()

    scorer._get_structured_llm("ignored-by-gateway", None)
    kwargs = fake_chat.call_args.kwargs
    assert kwargs["model"] == "gateway-model"
    assert kwargs["client"] is mock_boto3_client.return_value
    _clear_gateway_env(monkeypatch)


# ---- RagasScorer -------------------------------------------------------------

# Ragas drags langchain_community + langchain_aws + ChatVertexAI etc. for full import.
# In this isolated test environment those aren't installed; skip these tests when
# `evaluator_builtin.scorers.ragas` cannot be imported. The same branch logic is
# exercised by the LlmAsJudge tests above; the full workspace test run (mise run test)
# validates the ragas-specific branches with the real stack.

def _try_import_ragas():
    try:
        from evaluator_builtin.scorers import ragas as mod  # noqa: F401
        return mod
    except Exception as e:  # ImportError, but ragas may raise other errors during init
        pytest.skip(f"ragas/langchain not available in this isolated env: {e}")


def test_ragas_uses_direct_when_gateway_not_configured(monkeypatch):
    _clear_gateway_env(monkeypatch)
    mod = _try_import_ragas()
    fake_chat = MagicMock()
    fake_embed = MagicMock()
    monkeypatch.setattr(mod, "ChatBedrock", fake_chat)
    monkeypatch.setattr(mod, "BedrockEmbeddings", fake_embed)

    scorer = mod.RagasScorer()
    scorer._get_clients("amazon.nova-micro-v1:0", "amazon.titan-embed-text-v2:0", None)
    kwargs = fake_chat.call_args.kwargs
    assert kwargs["model"] == "amazon.nova-micro-v1:0"
    assert "client" not in kwargs


@patch("evaluator_sdk.gateway_client.boto3.client")
def test_ragas_uses_gateway_when_configured(mock_boto3_client, monkeypatch):
    _set_gateway_env(monkeypatch)
    mock_boto3_client.return_value = MagicMock()
    mod = _try_import_ragas()
    fake_chat = MagicMock()
    fake_embed = MagicMock()
    monkeypatch.setattr(mod, "ChatBedrock", fake_chat)
    monkeypatch.setattr(mod, "BedrockEmbeddings", fake_embed)

    scorer = mod.RagasScorer()
    scorer._get_clients("ignored-by-gateway", "amazon.titan-embed-text-v2:0", None)
    kwargs = fake_chat.call_args.kwargs
    assert kwargs["model"] == "gateway-model"
    assert kwargs["client"] is mock_boto3_client.return_value
    embed_kwargs = fake_embed.call_args.kwargs
    assert "client" not in embed_kwargs
    _clear_gateway_env(monkeypatch)
