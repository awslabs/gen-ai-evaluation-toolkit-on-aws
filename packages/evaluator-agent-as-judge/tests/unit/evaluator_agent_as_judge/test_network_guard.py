"""Unit tests for the runtime no-internet assertion module."""

from __future__ import annotations

import socket
from unittest.mock import patch

import pytest

from evaluator_agent_as_judge import network_guard
from evaluator_agent_as_judge.network_guard import (
    AwsEndpointUnreachableError,
    InternetEgressDetectedError,
    assert_no_internet_egress,
)

# ---------------------------------------------------------------------------
# Negative probe failures
# ---------------------------------------------------------------------------


def test_raises_when_first_negative_probe_succeeds(monkeypatch):
    """If 1.1.1.1 connects, the runtime is NOT airgapped — raise loudly."""
    monkeypatch.setenv("AWS_REGION", "eu-west-2")

    def fake_connect(addr, timeout):
        # Allow ALL connects → the first negative probe succeeds.
        return _DummySocket()

    with patch.object(network_guard.socket, "create_connection", side_effect=fake_connect):
        with pytest.raises(InternetEgressDetectedError):
            assert_no_internet_egress()


def test_raises_when_dns_based_negative_probe_succeeds(monkeypatch):
    """example.com:443 succeeding is also a hard failure."""
    monkeypatch.setenv("AWS_REGION", "eu-west-2")

    def fake_connect(addr, timeout):
        host, _ = addr
        if host == "example.com":
            return _DummySocket()
        raise socket.timeout()

    with patch.object(network_guard.socket, "create_connection", side_effect=fake_connect):
        with pytest.raises(InternetEgressDetectedError) as exc_info:
            assert_no_internet_egress()
    assert "example.com" in str(exc_info.value)


def test_error_lists_all_reachable_negative_destinations(monkeypatch):
    """When several negative probes are reachable, the error names all of them
    so operators can see exactly which destinations leaked through."""
    monkeypatch.setenv("AWS_REGION", "eu-west-2")

    def fake_connect(addr, timeout):
        host, _ = addr
        # Two of the three negative probes succeed; bedrock-runtime is
        # irrelevant because the negative-probe stage raises first.
        if host in {"1.1.1.1", "example.com"}:
            return _DummySocket()
        raise socket.timeout()

    with patch.object(network_guard.socket, "create_connection", side_effect=fake_connect):
        with pytest.raises(InternetEgressDetectedError) as exc_info:
            assert_no_internet_egress()
    message = str(exc_info.value)
    assert "1.1.1.1" in message
    assert "example.com" in message


# ---------------------------------------------------------------------------
# Positive probe failures
# ---------------------------------------------------------------------------


def test_raises_when_aws_endpoint_unreachable(monkeypatch):
    """All negatives time out (good) but AWS also unreachable (env broken)."""
    monkeypatch.setenv("AWS_REGION", "eu-west-2")

    with patch.object(network_guard.socket, "create_connection", side_effect=socket.timeout()):
        with pytest.raises(AwsEndpointUnreachableError) as exc_info:
            assert_no_internet_egress()
    assert "bedrock-runtime.eu-west-2" in str(exc_info.value)


def test_falls_back_to_us_east_1_when_no_region_env(monkeypatch):
    """When AWS_REGION / AWS_DEFAULT_REGION are absent, probe us-east-1."""
    monkeypatch.delenv("AWS_REGION", raising=False)
    monkeypatch.delenv("AWS_DEFAULT_REGION", raising=False)

    with patch.object(network_guard.socket, "create_connection", side_effect=socket.timeout()):
        with pytest.raises(AwsEndpointUnreachableError) as exc_info:
            assert_no_internet_egress()
    assert "bedrock-runtime.us-east-1" in str(exc_info.value)


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------


def test_passes_when_negatives_blocked_and_aws_reachable(monkeypatch):
    monkeypatch.setenv("AWS_REGION", "eu-west-2")
    with patch.object(
        network_guard.socket,
        "create_connection",
        side_effect=_unreachable_then_aws_reachable,
    ):
        assert_no_internet_egress()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


class _DummySocket:
    """Minimal stand-in for a real socket that supports the `with` pattern."""

    def close(self) -> None:  # pragma: no cover — trivial
        pass

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        self.close()
        return False


def _unreachable_then_aws_reachable(addr, timeout):
    """Negative-probe destinations time out; the AWS positive probe succeeds.

    Used by the happy-path tests. Recognises the AWS host by the
    `bedrock-runtime.` prefix (the only AWS probe target).
    """
    host, _port = addr
    if host.startswith("bedrock-runtime."):
        return _DummySocket()
    raise socket.timeout()
