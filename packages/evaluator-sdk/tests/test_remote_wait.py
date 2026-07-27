"""Unit tests for the remote-path internals: _wait_for_job (progress-based
timeout) and _run_remote (failure signalling). Uses a mocked client — no
monorepo/onebox dependencies.
"""

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from awssolutions_gen_ai_evaluation_toolkit_python_client.models import JobStatus  # type: ignore[attr-defined]

from evaluator_sdk import Evaluator, EvaluatorError


def _job(status: str, updated_at: object = None, error: object = None) -> SimpleNamespace:
    """Minimal stand-in for a get_evaluator_job response.

    Uses the real JobStatus enum so status comparisons match production.
    """
    return SimpleNamespace(
        status=JobStatus(status),
        updated_at=updated_at,
        error=error,
    )


def _evaluator() -> Evaluator:
    return Evaluator(name="driver", scorers=[], client=MagicMock())


class TestWaitForJob:
    def test_returns_immediately_on_terminal(self) -> None:
        ev = _evaluator()
        ev.client.get_evaluator_job.return_value = _job("SUCCESS")
        resp = ev._wait_for_job("job-1", heartbeat_seconds=1)
        assert resp.status.value == "SUCCESS"
        assert ev.client.get_evaluator_job.call_count == 1

    def test_polls_until_terminal(self) -> None:
        ev = _evaluator()
        ev.client.get_evaluator_job.side_effect = [
            _job("PENDING", updated_at="t0"),
            _job("RUNNING", updated_at="t1"),
            _job("SUCCESS"),
        ]
        with patch("evaluator_sdk.evaluator.time.sleep"):
            resp = ev._wait_for_job("job-1", heartbeat_seconds=1)
        assert resp.status.value == "SUCCESS"
        assert ev.client.get_evaluator_job.call_count == 3

    def test_times_out_when_no_progress(self) -> None:
        ev = _evaluator()
        # Never terminal, updatedAt never advances -> stall.
        ev.client.get_evaluator_job.return_value = _job("RUNNING", updated_at="frozen")
        # Fake a clock that jumps past the stall window on the second reading.
        clock = iter([0.0, 0.0, 10_000.0, 10_000.0, 10_000.0])
        with patch("evaluator_sdk.evaluator.time.monotonic", lambda: next(clock)), \
             patch("evaluator_sdk.evaluator.time.sleep"):
            with pytest.raises(EvaluatorError, match="made no progress"):
                ev._wait_for_job("job-1", heartbeat_seconds=1)

    def test_progress_resets_stall_window(self) -> None:
        ev = _evaluator()
        # updatedAt advances each poll, so even a long run never times out.
        ev.client.get_evaluator_job.side_effect = [
            _job("RUNNING", updated_at="t0"),
            _job("RUNNING", updated_at="t1"),
            _job("RUNNING", updated_at="t2"),
            _job("SUCCESS"),
        ]
        # Clock advances well past a single stall window between polls.
        clock = iter([0.0, 0.0, 5000.0, 10000.0, 15000.0, 20000.0])
        with patch("evaluator_sdk.evaluator.time.monotonic", lambda: next(clock)), \
             patch("evaluator_sdk.evaluator.time.sleep"):
            resp = ev._wait_for_job("job-1", heartbeat_seconds=1)
        assert resp.status.value == "SUCCESS"


class TestRunRemoteFailureSignalling:
    def test_failure_raises(self) -> None:
        ev = _evaluator()
        ev.client.get_evaluator_job.return_value = _job(
            "FAILURE", error=SimpleNamespace(message="boom"),
        )
        submit = MagicMock(return_value=SimpleNamespace(report_id="r1", job_id="j1"))
        with pytest.raises(EvaluatorError, match="failed: boom"):
            ev._run_remote(submit, heartbeat_seconds=1, return_results=True)

    def test_failure_raises_even_without_results(self) -> None:
        """Failure signalling must not depend on return_results."""
        ev = _evaluator()
        ev.client.get_evaluator_job.return_value = _job("FAILURE")
        submit = MagicMock(return_value=SimpleNamespace(report_id="r1", job_id="j1"))
        with pytest.raises(EvaluatorError):
            ev._run_remote(submit, heartbeat_seconds=1, return_results=False)

    def test_partial_failure_warns_and_returns(self) -> None:
        ev = _evaluator()
        ev.client.get_evaluator_job.return_value = _job(
            "PARTIAL_FAILURE", error=SimpleNamespace(message="1 of 3 failed"),
        )
        submit = MagicMock(return_value=SimpleNamespace(report_id="r1", job_id="j1"))
        with patch.object(ev, "_results_from_report", return_value=[]) as rfr, \
             patch("evaluator_sdk.evaluator.logger.warning") as warn:
            resp = ev._run_remote(submit, heartbeat_seconds=1, return_results=True)
        assert resp.report_id == "r1" and resp.job_id == "j1"
        rfr.assert_called_once_with("r1")
        assert warn.called

    def test_success_returns_results(self) -> None:
        ev = _evaluator()
        ev.client.get_evaluator_job.return_value = _job("SUCCESS")
        submit = MagicMock(return_value=SimpleNamespace(report_id="r1", job_id="j1"))
        with patch.object(ev, "_results_from_report", return_value=[]):
            resp = ev._run_remote(submit, heartbeat_seconds=1, return_results=True)
        assert resp.report_id == "r1" and resp.job_id == "j1"
