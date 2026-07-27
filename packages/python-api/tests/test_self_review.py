"""Regression tests for edge cases found during self-review."""


import pytest
from botocore.exceptions import ClientError

from evaluator_api.ddb.models import JobItem, JobStatus, TaskEntry
from evaluator_api.experiment import WelfordAccumulator
from evaluator_api.task_lifecycle import checkpoint_task, complete_task


class TestWelfordCheckpointRoundTrip:
    """Welford to_dict() must include internal state (m2, min_val, max_val)
    so that checkpoint/resume preserves variance and range.
    """

    def test_round_trip_preserves_m2(self) -> None:
        acc = WelfordAccumulator()
        for v in [2.0, 4.0, 4.0, 4.0, 5.0, 5.0, 7.0, 9.0]:
            acc.update(v)

        serialized = acc.to_dict()

        restored = WelfordAccumulator()
        restored.count = int(serialized.get("count", 0))
        restored.mean = float(serialized.get("mean", 0))
        restored.m2 = float(serialized.get("m2", 0))
        restored.min_val = (
            float(serialized["min_val"]) if serialized.get("min_val") is not None else float("inf")
        )
        restored.max_val = (
            float(serialized["max_val"]) if serialized.get("max_val") is not None else float("-inf")
        )

        assert restored.m2 == pytest.approx(acc.m2)
        assert restored.min_val == acc.min_val
        assert restored.max_val == acc.max_val

    def test_to_dict_contains_checkpoint_keys(self) -> None:
        acc = WelfordAccumulator()
        acc.update(3.0)
        acc.update(7.0)
        d = acc.to_dict()
        assert "m2" in d
        assert "min_val" in d
        assert "max_val" in d


class TestSfCallbackIdempotency:
    """SFN callbacks must be idempotent — token-already-consumed errors are swallowed,
    but real errors (network, permissions) propagate so the client can retry.
    """

    def test_complete_task_swallows_token_already_consumed(self, setup_handler: None) -> None:
        from evaluator_api.routes import get_job_dao
        from evaluator_api.sfn import get_sfn_client

        job_dao = get_job_dao()
        job_dao.put(JobItem(
            evaluator_name="test-eval", job_id="sf-idem-1", job_type="FULL",
            report_id="r1", status=JobStatus.PENDING, created_at="2024-01-01T00:00:00Z",
            tasks={"full": TaskEntry(status="RUNNING")},
        ))

        mock_sfn = get_sfn_client()
        mock_sfn.send_task_success.side_effect = ClientError(
            {"Error": {"Code": "TaskDoesNotExist", "Message": "token consumed"}},
            "SendTaskSuccess",
        )

        # Should NOT raise — token already consumed means first call succeeded
        complete_task("sf-idem-1", "full", "COMPLETED", task_token="tok-1")

        # DDB still updated
        job = job_dao.get("sf-idem-1")
        assert job is not None
        assert job.tasks["full"].status == "COMPLETED"

    def test_complete_task_propagates_real_sf_errors(self, setup_handler: None) -> None:
        from evaluator_api.routes import get_job_dao
        from evaluator_api.sfn import get_sfn_client

        job_dao = get_job_dao()
        job_dao.put(JobItem(
            evaluator_name="test-eval", job_id="sf-idem-2", job_type="FULL",
            report_id="r1", status=JobStatus.PENDING, created_at="2024-01-01T00:00:00Z",
            tasks={"full": TaskEntry(status="RUNNING")},
        ))

        mock_sfn = get_sfn_client()
        mock_sfn.send_task_success.side_effect = ClientError(
            {"Error": {"Code": "AccessDeniedException", "Message": "no perms"}},
            "SendTaskSuccess",
        )

        # SHOULD raise — real error, client needs to retry
        with pytest.raises(ClientError):
            complete_task("sf-idem-2", "full", "COMPLETED", task_token="tok-1")

    def test_checkpoint_task_swallows_token_already_consumed(self, setup_handler: None) -> None:
        from evaluator_api.routes import get_job_dao
        from evaluator_api.sfn import get_sfn_client

        job_dao = get_job_dao()
        job_dao.put(JobItem(
            evaluator_name="test-eval", job_id="sf-idem-3", job_type="FULL",
            report_id="r1", status=JobStatus.PENDING, created_at="2024-01-01T00:00:00Z",
            tasks={"full": TaskEntry(status="RUNNING")},
        ))

        mock_sfn = get_sfn_client()
        mock_sfn.send_task_success.side_effect = ClientError(
            {"Error": {"Code": "InvalidToken", "Message": "expired"}},
            "SendTaskSuccess",
        )

        # Should NOT raise
        checkpoint_task("sf-idem-3", "full", {"inline_testcase_index": 5}, task_token="tok-1")


class TestPhantomTaskCreation:
    """Updating a non-existent task key must not silently create a phantom task."""

    def test_bogus_task_key_rejected(self, setup_handler: None) -> None:
        from evaluator_api.routes import get_job_dao

        job_dao = get_job_dao()
        job_dao.put(JobItem(
            evaluator_name="test-eval",
            job_id="phantom-job",
            job_type="FULL",
            report_id="phantom-report",
            status=JobStatus.PENDING,
            created_at="2024-01-01T00:00:00Z",
            tasks={"full": TaskEntry(status="PENDING")},
        ))

        try:
            job_dao.update_task_status("phantom-job", "bogus_key", "RUNNING")
        except Exception:
            pass  # desired — condition expression rejects it

        job = job_dao.get("phantom-job")
        assert job is not None
        assert "bogus_key" not in (job.tasks or {})
