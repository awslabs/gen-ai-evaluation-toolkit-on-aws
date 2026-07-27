"""
AI Gateway client utility.

Provides a boto3 Bedrock Runtime client configured to route through the
AI Gateway instead of calling Bedrock directly.

The gateway speaks the Bedrock Converse API, so existing code using
ChatBedrockConverse (Langchain) or boto3 bedrock-runtime just needs
a different client instance — no API changes required.

Required environment variables (when using gateway):
    AI_GATEWAY_ENDPOINT: Gateway base URL (e.g. https://gateway.stage.myapp.example.com/bedrock)
    AI_GATEWAY_TOKEN_ENDPOINT: OAuth2 token URL
    AI_GATEWAY_CLIENT_ID: OAuth2 client ID for the registered application
    AI_GATEWAY_CLIENT_SECRET_ARN: Secrets Manager ARN containing the OAuth2 client secret
    AI_GATEWAY_MODEL_ID: Model name as registered in the gateway
    AI_GATEWAY_SCOPE: OAuth2 scope(s) for the token request (optional;
        space-separated). Omitted from the token request when unset.
"""

import json
import logging
import os
import threading
import time
from typing import Any, Optional, Tuple

import boto3
import requests
from botocore.config import Config

logger = logging.getLogger(__name__)

_cached_token: Optional[Tuple[str, float]] = None  # (token, expiry_timestamp)
_token_lock = threading.Lock()
_cached_client_secret: Optional[str] = None


def _resolve_client_secret() -> str:
    """Resolve the client secret from Secrets Manager.

    Raises:
        ValueError: When the secret cannot be retrieved (missing ARN, denied access,
        non-existent secret). Failing loudly here surfaces auth-config errors at the
        nearest call site rather than at the OAuth endpoint with an opaque 401.
    """
    global _cached_client_secret
    if _cached_client_secret:
        return _cached_client_secret
    secret_arn = os.environ.get("AI_GATEWAY_CLIENT_SECRET_ARN", "")
    if not secret_arn:
        return ""
    try:
        sm = boto3.client("secretsmanager")
        resp = sm.get_secret_value(SecretId=secret_arn)
        _cached_client_secret = resp["SecretString"]
        return _cached_client_secret
    except Exception as e:
        logger.error("Failed to resolve client secret from Secrets Manager: %s", e)
        raise ValueError(f"Unable to retrieve OAuth client secret from {secret_arn}") from e


def is_gateway_configured() -> bool:
    """Check if gateway environment variables are set.

    Returns True when all four required env vars are present, indicating the
    caller has *opted in* to gateway routing. The secret itself is resolved lazily
    at first request — if Secrets Manager access is denied or the secret is
    missing, the failure raises at that point with a clear error rather than
    silently falling back to direct Bedrock (which would defeat the gateway's
    budget-tracking purpose).
    """
    return all(
        os.environ.get(var)
        for var in [
            "AI_GATEWAY_ENDPOINT",
            "AI_GATEWAY_TOKEN_ENDPOINT",
            "AI_GATEWAY_CLIENT_ID",
            "AI_GATEWAY_CLIENT_SECRET_ARN",
        ]
    )


def get_gateway_model_id() -> str:
    """Get the model ID configured for the gateway."""
    model_id = os.environ.get("AI_GATEWAY_MODEL_ID", "")
    if not model_id:
        raise ValueError("AI_GATEWAY_MODEL_ID environment variable is required when using the gateway")
    return model_id


def _fetch_token() -> Tuple[str, float]:
    """Fetch an OAuth2 token using client credentials flow.

    Returns:
        Tuple of (access_token, expiry_timestamp)
    """
    token_endpoint = os.environ["AI_GATEWAY_TOKEN_ENDPOINT"]
    if not token_endpoint.startswith("https://"):
        raise ValueError(f"AI_GATEWAY_TOKEN_ENDPOINT must use HTTPS, got: {token_endpoint}")

    client_id = os.environ["AI_GATEWAY_CLIENT_ID"]
    client_secret = _resolve_client_secret()

    response = requests.post(
        token_endpoint,
        data={
            "grant_type": "client_credentials",
            "client_id": client_id,
            "client_secret": client_secret,
            # Scope is optional (RFC 6749 §4.4.2): included only when the
            # gateway's IdP requires one. Omitted entirely when unset —
            # some IdPs reject an empty scope string.
            **({"scope": scope} if (scope := os.environ.get("AI_GATEWAY_SCOPE")) else {}),
        },
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=10,
    )
    response.raise_for_status()

    try:
        data = response.json()
    except json.JSONDecodeError as e:
        raise ValueError(f"OAuth2 token endpoint returned invalid JSON: {e}") from e

    if "access_token" not in data:
        raise ValueError("OAuth2 response missing access_token field")
    token = data["access_token"]
    # expires_in is typically 3600s; refresh 60s early. Enforce minimum 120s.
    expires_in = max(data.get("expires_in", 3600), 120)
    expiry = time.time() + expires_in - 60

    logger.info("Successfully obtained gateway OAuth token")
    return token, expiry


def _get_token() -> str:
    """Get a valid OAuth token, refreshing if expired. Thread-safe.

    On refresh failure, falls back to the cached token only if it is still
    within its validity window. If both the refresh failed and no valid cached
    token exists, raises so the caller surfaces a real auth failure rather than
    silently using an expired token (which would 401 at the gateway anyway).
    """
    global _cached_token

    with _token_lock:
        if _cached_token is None or time.time() >= _cached_token[1]:
            try:
                _cached_token = _fetch_token()
            except Exception as e:
                if _cached_token is not None and time.time() < _cached_token[1]:
                    logger.warning("Token refresh failed, using cached token: %s", e)
                    return _cached_token[0]
                logger.error("Token refresh failed and no valid cached token available: %s", e)
                raise
        return _cached_token[0]


def _inject_bearer_token(request: Any, **kwargs: Any) -> None:
    """Botocore event handler that replaces the Authorization header with a Bearer token."""
    token = _get_token()
    request.headers["Authorization"] = f"Bearer {token}"


_cached_client: Optional[Any] = None


def get_gateway_bedrock_client() -> Any:
    """Create a boto3 bedrock-runtime client configured for the AI Gateway.

    Uses the 'before-send' botocore event to overwrite the Authorization header
    with a Bearer token after SigV4 signing. The gateway validates the Bearer
    token and ignores the SigV4 signature.

    Returns:
        boto3 bedrock-runtime client configured for gateway access
    """
    global _cached_client
    if _cached_client is not None:
        return _cached_client

    endpoint = os.environ["AI_GATEWAY_ENDPOINT"]
    if not endpoint.startswith("https://"):
        raise ValueError(f"AI_GATEWAY_ENDPOINT must use HTTPS, got: {endpoint}")

    client = boto3.client(
        "bedrock-runtime",
        endpoint_url=endpoint,
        region_name=os.environ.get("AWS_DEFAULT_REGION", "us-east-1"),
        config=Config(retries={"max_attempts": 3}),
    )

    # 'before-send' fires after signing, giving us the prepared AWSRequest.
    # We overwrite the Authorization header with our Bearer token.
    client.meta.events.register("before-send", _inject_bearer_token)

    _cached_client = client
    return client
