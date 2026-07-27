"""Unit tests for evaluator_sdk.gateway_client."""

import json
import time
from unittest.mock import ANY, MagicMock, patch

import pytest

import evaluator_sdk.gateway_client as gc
from evaluator_sdk.gateway_client import (
    _fetch_token,
    _get_token,
    get_gateway_bedrock_client,
    get_gateway_model_id,
    is_gateway_configured,
)


class TestIsGatewayConfigured:
    def test_returns_true_when_all_vars_set(self, monkeypatch):
        monkeypatch.setenv("AI_GATEWAY_ENDPOINT", "https://gateway.example.com/bedrock")
        monkeypatch.setenv("AI_GATEWAY_TOKEN_ENDPOINT", "https://auth.example.com/oauth2/token")
        monkeypatch.setenv("AI_GATEWAY_CLIENT_ID", "test-id")
        monkeypatch.setenv("AI_GATEWAY_CLIENT_SECRET_ARN", "arn:aws:secretsmanager:us-east-1:123456789:secret:test")
        gc._cached_client_secret = "test-secret"

        assert is_gateway_configured() is True
        gc._cached_client_secret = None

    def test_returns_false_when_endpoint_missing(self, monkeypatch):
        monkeypatch.delenv("AI_GATEWAY_ENDPOINT", raising=False)
        monkeypatch.setenv("AI_GATEWAY_TOKEN_ENDPOINT", "https://auth.example.com/oauth2/token")
        monkeypatch.setenv("AI_GATEWAY_CLIENT_ID", "test-id")
        monkeypatch.setenv("AI_GATEWAY_CLIENT_SECRET_ARN", "arn:aws:secretsmanager:us-east-1:123456789:secret:test")

        assert is_gateway_configured() is False

    def test_returns_false_when_secret_arn_empty(self, monkeypatch):
        monkeypatch.setenv("AI_GATEWAY_ENDPOINT", "https://gateway.example.com/bedrock")
        monkeypatch.setenv("AI_GATEWAY_TOKEN_ENDPOINT", "https://auth.example.com/oauth2/token")
        monkeypatch.setenv("AI_GATEWAY_CLIENT_ID", "test-id")
        monkeypatch.setenv("AI_GATEWAY_CLIENT_SECRET_ARN", "")

        assert is_gateway_configured() is False

    def test_returns_false_when_no_vars_set(self, monkeypatch):
        for var in [
            "AI_GATEWAY_ENDPOINT",
            "AI_GATEWAY_TOKEN_ENDPOINT",
            "AI_GATEWAY_CLIENT_ID",
            "AI_GATEWAY_CLIENT_SECRET_ARN",
        ]:
            monkeypatch.delenv(var, raising=False)

        assert is_gateway_configured() is False


class TestGetGatewayModelId:
    def test_returns_model_id(self, monkeypatch):
        monkeypatch.setenv("AI_GATEWAY_MODEL_ID", "anthropic.claude-3-sonnet-20240229-v1:0")
        assert get_gateway_model_id() == "anthropic.claude-3-sonnet-20240229-v1:0"

    def test_raises_when_not_set(self, monkeypatch):
        monkeypatch.delenv("AI_GATEWAY_MODEL_ID", raising=False)
        with pytest.raises(ValueError, match="AI_GATEWAY_MODEL_ID"):
            get_gateway_model_id()

    def test_raises_when_empty(self, monkeypatch):
        monkeypatch.setenv("AI_GATEWAY_MODEL_ID", "")
        with pytest.raises(ValueError, match="AI_GATEWAY_MODEL_ID"):
            get_gateway_model_id()


class TestFetchToken:
    def setup_method(self):
        gc._cached_token = None

    @patch("evaluator_sdk.gateway_client.requests.post")
    def test_raises_when_access_token_missing(self, mock_post, monkeypatch):
        monkeypatch.setenv("AI_GATEWAY_TOKEN_ENDPOINT", "https://auth.example.com/oauth2/token")
        monkeypatch.setenv("AI_GATEWAY_CLIENT_ID", "test-id")
        gc._cached_client_secret = "test-secret"

        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {"token_type": "Bearer"}
        mock_post.return_value = mock_response

        with pytest.raises(ValueError, match="OAuth2 response missing access_token field"):
            _fetch_token()
        gc._cached_client_secret = None

    @patch("evaluator_sdk.gateway_client.requests.post")
    def test_returns_token_and_expiry(self, mock_post, monkeypatch):
        monkeypatch.setenv("AI_GATEWAY_TOKEN_ENDPOINT", "https://auth.example.com/oauth2/token")
        monkeypatch.setenv("AI_GATEWAY_CLIENT_ID", "test-id")
        gc._cached_client_secret = "test-secret"

        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {"access_token": "my-token", "expires_in": 3600}
        mock_post.return_value = mock_response

        token, expiry = _fetch_token()
        assert token == "my-token"
        assert expiry > 0
        gc._cached_client_secret = None

    def test_raises_on_non_https_token_endpoint(self, monkeypatch):
        monkeypatch.setenv("AI_GATEWAY_TOKEN_ENDPOINT", "http://auth.example.com/oauth2/token")
        monkeypatch.setenv("AI_GATEWAY_CLIENT_ID", "test-id")
        gc._cached_client_secret = "test-secret"

        with pytest.raises(ValueError, match="AI_GATEWAY_TOKEN_ENDPOINT must use HTTPS"):
            _fetch_token()
        gc._cached_client_secret = None

    @patch("evaluator_sdk.gateway_client.requests.post")
    def test_raises_on_malformed_json_response(self, mock_post, monkeypatch):
        monkeypatch.setenv("AI_GATEWAY_TOKEN_ENDPOINT", "https://auth.example.com/oauth2/token")
        monkeypatch.setenv("AI_GATEWAY_CLIENT_ID", "test-id")
        gc._cached_client_secret = "test-secret"

        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json.side_effect = json.JSONDecodeError("Expecting value", "", 0)
        mock_post.return_value = mock_response

        with pytest.raises(ValueError, match="OAuth2 token endpoint returned invalid JSON"):
            _fetch_token()
        gc._cached_client_secret = None

    @patch("evaluator_sdk.gateway_client.requests.post")
    def test_enforces_minimum_expires_in(self, mock_post, monkeypatch):
        monkeypatch.setenv("AI_GATEWAY_TOKEN_ENDPOINT", "https://auth.example.com/oauth2/token")
        monkeypatch.setenv("AI_GATEWAY_CLIENT_ID", "test-id")
        gc._cached_client_secret = "test-secret"

        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {"access_token": "my-token", "expires_in": -100}
        mock_post.return_value = mock_response

        token, expiry = _fetch_token()
        # With min 120s and -60s early refresh, expiry should be ~now + 60s
        assert expiry >= time.time() + 50
        gc._cached_client_secret = None


class TestGetToken:
    def setup_method(self):
        gc._cached_token = None

    @patch("evaluator_sdk.gateway_client._fetch_token")
    def test_uses_cached_token_when_refresh_fails_and_cache_still_valid(self, mock_fetch):
        # Cached token is still within its validity window; refresh failure is recoverable.
        gc._cached_token = ("old-token", time.time() + 600)
        mock_fetch.side_effect = RuntimeError("network error")

        result = _get_token()
        assert result == "old-token"

    @patch("evaluator_sdk.gateway_client._fetch_token")
    def test_raises_when_refresh_fails_and_cached_token_expired(self, mock_fetch):
        # Cached token has expired AND refresh failed — no longer safe to silently
        # reuse: caller must surface the auth failure rather than 401 at the gateway.
        gc._cached_token = ("old-token", time.time() - 10)
        mock_fetch.side_effect = RuntimeError("network error")

        with pytest.raises(RuntimeError, match="network error"):
            _get_token()

    @patch("evaluator_sdk.gateway_client._fetch_token")
    def test_raises_when_no_cached_token_and_refresh_fails(self, mock_fetch):
        gc._cached_token = None
        mock_fetch.side_effect = RuntimeError("network error")

        with pytest.raises(RuntimeError, match="network error"):
            _get_token()


class TestResolveClientSecret:
    def setup_method(self):
        gc._cached_client_secret = None

    def test_returns_empty_string_when_arn_not_set(self, monkeypatch):
        monkeypatch.delenv("AI_GATEWAY_CLIENT_SECRET_ARN", raising=False)
        from evaluator_sdk.gateway_client import _resolve_client_secret
        assert _resolve_client_secret() == ""

    @patch("evaluator_sdk.gateway_client.boto3.client")
    def test_raises_when_secrets_manager_call_fails(self, mock_boto3_client, monkeypatch):
        monkeypatch.setenv("AI_GATEWAY_CLIENT_SECRET_ARN", "arn:aws:secretsmanager:us-east-1:123:secret:test")
        from evaluator_sdk.gateway_client import _resolve_client_secret

        mock_sm = MagicMock()
        mock_sm.get_secret_value.side_effect = RuntimeError("AccessDenied")
        mock_boto3_client.return_value = mock_sm

        with pytest.raises(ValueError, match="Unable to retrieve OAuth client secret"):
            _resolve_client_secret()


class TestGetGatewayBedrockClient:
    def setup_method(self):
        gc._cached_client = None
        gc._cached_token = None

    @patch("evaluator_sdk.gateway_client.boto3.client")
    def test_creates_client_with_correct_endpoint(self, mock_boto3_client, monkeypatch):
        monkeypatch.setenv("AI_GATEWAY_ENDPOINT", "https://gateway.example.com/bedrock")
        monkeypatch.setenv("AWS_DEFAULT_REGION", "us-west-2")

        mock_client = MagicMock()
        mock_boto3_client.return_value = mock_client

        result = get_gateway_bedrock_client()

        mock_boto3_client.assert_called_once_with(
            "bedrock-runtime",
            endpoint_url="https://gateway.example.com/bedrock",
            region_name="us-west-2",
            config=ANY,
        )
        assert result == mock_client

    @patch("evaluator_sdk.gateway_client.boto3.client")
    def test_caches_client(self, mock_boto3_client, monkeypatch):
        monkeypatch.setenv("AI_GATEWAY_ENDPOINT", "https://gateway.example.com/bedrock")

        mock_client = MagicMock()
        mock_boto3_client.return_value = mock_client

        client1 = get_gateway_bedrock_client()
        client2 = get_gateway_bedrock_client()

        assert client1 is client2
        assert mock_boto3_client.call_count == 1

    def test_raises_on_non_https_endpoint(self, monkeypatch):
        monkeypatch.setenv("AI_GATEWAY_ENDPOINT", "http://gateway.example.com/bedrock")
        with pytest.raises(ValueError, match="must use HTTPS"):
            get_gateway_bedrock_client()


class TestInjectBearerToken:
    """Covers the critical auth wiring: the before-send handler must overwrite the
    SigV4 Authorization header with a Bearer token, and the gateway client must
    register that handler so the token is actually transmitted to the gateway."""

    def setup_method(self):
        gc._cached_client = None
        gc._cached_token = None

    @patch("evaluator_sdk.gateway_client._get_token")
    def test_overwrites_authorization_with_bearer_token(self, mock_get_token):
        mock_get_token.return_value = "minted-token"
        request = MagicMock()
        # Start with a SigV4 Authorization header, as botocore would have signed it.
        request.headers = {"Authorization": "AWS4-HMAC-SHA256 Credential=..."}

        gc._inject_bearer_token(request)

        assert request.headers["Authorization"] == "Bearer minted-token"

    @patch("evaluator_sdk.gateway_client.boto3.client")
    def test_registers_before_send_handler(self, mock_boto3_client, monkeypatch):
        monkeypatch.setenv("AI_GATEWAY_ENDPOINT", "https://gateway.example.com/bedrock")
        mock_client = MagicMock()
        mock_boto3_client.return_value = mock_client

        get_gateway_bedrock_client()

        mock_client.meta.events.register.assert_called_once_with("before-send", gc._inject_bearer_token)


class TestOAuth2Scope:
    def _mock_token_response(self, monkeypatch, captured):
        import evaluator_sdk.gateway_client as gc

        class FakeResponse:
            status_code = 200

            def raise_for_status(self):
                pass

            def json(self):
                return {"access_token": "tok", "expires_in": 3600}

        def fake_post(url, data=None, headers=None, timeout=None):
            captured["data"] = data
            return FakeResponse()

        monkeypatch.setattr(gc.requests, "post", fake_post)
        monkeypatch.setattr(gc, "_resolve_client_secret", lambda: "secret")
        monkeypatch.setenv("AI_GATEWAY_TOKEN_ENDPOINT", "https://auth.example.com/oauth2/token")
        monkeypatch.setenv("AI_GATEWAY_CLIENT_ID", "client-id")

    def test_scope_included_when_set(self, monkeypatch):
        import evaluator_sdk.gateway_client as gc

        captured = {}
        self._mock_token_response(monkeypatch, captured)
        monkeypatch.setenv("AI_GATEWAY_SCOPE", "my-api/read my-api/write")

        gc._fetch_token()

        assert captured["data"]["scope"] == "my-api/read my-api/write"

    def test_scope_omitted_when_unset(self, monkeypatch):
        import evaluator_sdk.gateway_client as gc

        captured = {}
        self._mock_token_response(monkeypatch, captured)
        monkeypatch.delenv("AI_GATEWAY_SCOPE", raising=False)

        gc._fetch_token()

        assert "scope" not in captured["data"]
