"""Runtime network-isolation assertions for the agent-as-judge plugin.

The plugin runs in isolated subnets — no NAT or IGW route — so the public
internet should be unreachable. This module proves that at every cold start,
*before* any test-case processing or the opencode subprocess is invoked.

Why bother when the network controls already enforce it? Defence in depth.
If a future change accidentally moves the plugin back to NAT-egress subnets,
or someone widens the route table, the network controls fail open silently
(the plugin keeps working — just with internet access). The runtime guard
catches that drift loudly and refuses to run.

The guard runs three probes:

    1. **Negative** — TCP connect to public IPs/hostnames that should NOT be
       reachable (1.1.1.1, 8.8.8.8, example.com on :443). All three are
       probed concurrently so total latency is bounded by a single ~2s
       timeout. Any successful connect is a hard failure.

    2. **Positive** — TCP connect to an AWS service endpoint we expect to
       reach via VPC endpoint. Distinguishes "no internet, AWS works"
       (good) from "everything broken" (env misconfiguration).

    3. **Bedrock-specific** — TCP connect to `bedrock-runtime.<region>` to
       prove the Bedrock VPC endpoint is wired and DNS-resolves privately.
       This is the actual service the plugin needs.

The assertion runs unconditionally on every `main()` invocation — there is
no opt-out. If you're running this plugin's code outside the deployed
runtime (e.g. local dev) and the assertion gets in the way, monkey-patch
or skip the call site rather than introducing a runtime toggle that could
be left on by accident in production.
"""

from __future__ import annotations

import logging
import os
import socket
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from dataclasses import dataclass
from typing import List

logger = logging.getLogger(__name__)

# Probe timeouts. Kept very short — the negative tests are expected to time
# out, and we don't want to add noticeable latency to every cold start. The
# positive test should succeed in well under a second when wiring is correct.
_NEGATIVE_PROBE_TIMEOUT_SECONDS = 2.0
_POSITIVE_PROBE_TIMEOUT_SECONDS = 5.0


class NetworkGuardError(RuntimeError):
    """Raised when the runtime network state doesn't match expectations."""


class InternetEgressDetectedError(NetworkGuardError):
    """The negative probe reached a public destination — internet is reachable."""


class AwsEndpointUnreachableError(NetworkGuardError):
    """The positive probe failed — AWS endpoints aren't reachable, env is broken."""


@dataclass(frozen=True)
class _Probe:
    host: str
    port: int
    label: str


# Public destinations that should NOT be reachable. Mix of well-known anycast
# IPs (skips DNS) and a hostname (exercises the DNS+connect path that real
# exfiltration would use).
_NEGATIVE_PROBES: List[_Probe] = [
    _Probe("1.1.1.1", 443, "Cloudflare 1.1.1.1:443"),
    _Probe("8.8.8.8", 443, "Google 8.8.8.8:443"),
    _Probe("example.com", 443, "example.com:443 (DNS+connect)"),
]


def assert_no_internet_egress() -> None:
    """Run all probes and raise if the runtime network state is wrong.

    Raises:
        InternetEgressDetectedError: A negative probe succeeded (internet is
            reachable when it shouldn't be).
        AwsEndpointUnreachableError: The positive probe failed (AWS endpoints
            aren't reachable, environment is misconfigured).
    """
    logger.info("network_guard: enforcing no-internet airgap")

    # Negative tests first — these are the actual guarantee we care about.
    # Run all three probes in parallel so the worst-case latency is the
    # single-probe timeout (~2s) instead of the sum (~6s).
    reachable = _run_negative_probes_in_parallel()
    if reachable:
        labels = ", ".join(reachable)
        raise InternetEgressDetectedError(
            f"network_guard: public destination(s) [{labels}] reachable — "
            f"the runtime is NOT airgapped. Refusing to invoke opencode."
        )

    # Positive control: confirm AWS endpoints actually work. If this fails
    # we'd silently produce useless output, so fail loudly here too.
    aws_probe = _aws_positive_probe()
    if not _can_connect(aws_probe.host, aws_probe.port, _POSITIVE_PROBE_TIMEOUT_SECONDS):
        raise AwsEndpointUnreachableError(
            f"network_guard: AWS endpoint {aws_probe.label} is unreachable. "
            f"VPC endpoints likely misconfigured — refusing to run."
        )
    logger.info("network_guard: AWS endpoint %s reachable", aws_probe.label)
    logger.info("network_guard: airgap verified — proceeding with evaluation")


def _run_negative_probes_in_parallel() -> List[str]:
    """Probe all negative destinations concurrently; return the labels of any
    that were reachable.

    Uses a thread pool because `socket.create_connection` is blocking I/O.
    The pool is owned by a context manager, so threads are joined and the
    executor is shut down cleanly even if an unexpected exception escapes
    a worker. Per-probe `OSError`s are absorbed inside `_can_connect`;
    anything else propagates as a non-`NetworkGuardError` and surfaces an
    obviously-broken environment loud and early.
    """
    with ThreadPoolExecutor(max_workers=len(_NEGATIVE_PROBES), thread_name_prefix="netguard") as executor:
        # Submit then collect — waiting for ALL probes (rather than
        # short-circuiting on first success) lets us name every reachable
        # destination in the error message, which is more useful for
        # diagnosing what broke. Worst case is still bounded by the
        # negative-probe timeout.
        future_to_probe = {
            executor.submit(_can_connect, probe.host, probe.port, _NEGATIVE_PROBE_TIMEOUT_SECONDS): probe
            for probe in _NEGATIVE_PROBES
        }
        reachable: List[str] = []
        for future, probe in future_to_probe.items():
            # `future.result()` re-raises anything `_can_connect` itself
            # didn't catch (i.e. truly unexpected — let it propagate).
            if future.result():
                reachable.append(probe.label)
            else:
                logger.debug("network_guard: %s correctly unreachable", probe.label)
    return reachable


def _aws_positive_probe() -> _Probe:
    """Pick a reasonable AWS-endpoint probe target based on the runtime region.

    Falls back to STS in us-east-1 when AWS_REGION isn't set (e.g. local dev,
    or deploys we somehow forgot to configure).
    """
    region = os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION") or "us-east-1"
    # `bedrock-runtime` is the actual service the plugin uses. Probing it
    # confirms both that VPC endpoints work in general AND that the
    # Bedrock-specific endpoint is wired with privateDnsEnabled.
    host = f"bedrock-runtime.{region}.amazonaws.com"
    return _Probe(host, 443, host + ":443")


def _can_connect(host: str, port: int, timeout: float) -> bool:
    """Attempt a TCP connect; return True iff a socket was successfully opened.

    A `True` from a hostname-based probe also implies DNS resolution worked
    (which by itself is fine — the VPC resolver inside an isolated VPC happily
    resolves public names; it's the connect that should fail).
    """
    try:
        with closing(socket.create_connection((host, port), timeout=timeout)):
            return True
    except OSError:
        # socket.timeout, ConnectionRefused, gaierror (DNS), ENETUNREACH, etc.
        # — all expected for the negative probes; all also valid evidence of
        # "couldn't reach it" for the positive probe.
        return False
