"""Unit tests for _compute_job_stage in evaluator_jobs."""

from evaluator_api.ddb import JobItem, TaskEntry
from evaluator_api.routes.evaluator_jobs import _compute_job_stage


def _job(tasks: dict[str, TaskEntry] | None = None, stage: str | None = None) -> JobItem:
    kwargs: dict = {
        "evaluator_name": "test",
        "job_id": "j-1",
        "job_type": "FULL",
        "report_id": "r-1",
        "status": "PENDING",
        "created_at": "2026-01-01T00:00:00Z",
        "tasks": tasks,
    }
    if stage is not None:
        kwargs["stage"] = stage
    return JobItem(**kwargs)


class TestComputeJobStage:
    def test_no_tasks_uses_stored_stage(self):
        assert _compute_job_stage(_job(tasks=None, stage="SCORING")) == "SCORING"

    def test_no_tasks_no_stage_defaults_pending(self):
        assert _compute_job_stage(_job(tasks=None, stage=None)) == "PENDING"

    def test_all_pending_returns_pending(self):
        tasks = {
            "full": TaskEntry(status="PENDING"),
            "score:accuracy": TaskEntry(status="PENDING"),
            "post_process": TaskEntry(status="PENDING"),
        }
        assert _compute_job_stage(_job(tasks=tasks)) == "PENDING"

    def test_primary_running_returns_invoking(self):
        tasks = {
            "full": TaskEntry(status="RUNNING"),
            "score:accuracy": TaskEntry(status="PENDING"),
            "post_process": TaskEntry(status="PENDING"),
        }
        assert _compute_job_stage(_job(tasks=tasks)) == "INVOKING"

    def test_app_invoke_running_returns_invoking(self):
        tasks = {
            "app_invoke": TaskEntry(status="RUNNING"),
            "score:accuracy": TaskEntry(status="PENDING"),
            "post_process": TaskEntry(status="PENDING"),
        }
        assert _compute_job_stage(_job(tasks=tasks)) == "INVOKING"

    def test_scorer_running_returns_scoring(self):
        tasks = {
            "app_invoke": TaskEntry(status="COMPLETED"),
            "score:accuracy": TaskEntry(status="RUNNING"),
            "post_process": TaskEntry(status="PENDING"),
        }
        assert _compute_job_stage(_job(tasks=tasks)) == "SCORING"

    def test_scorer_completed_primary_completed_pp_pending_returns_scoring(self):
        tasks = {
            "app_invoke": TaskEntry(status="COMPLETED"),
            "score:accuracy": TaskEntry(status="COMPLETED"),
            "post_process": TaskEntry(status="PENDING"),
        }
        # post_process not terminal, so not COMPLETE; scorer is COMPLETED → SCORING
        assert _compute_job_stage(_job(tasks=tasks)) == "SCORING"

    def test_all_terminal_returns_complete(self):
        tasks = {
            "full": TaskEntry(status="COMPLETED"),
            "score:accuracy": TaskEntry(status="COMPLETED"),
            "post_process": TaskEntry(status="COMPLETED"),
        }
        assert _compute_job_stage(_job(tasks=tasks)) == "COMPLETE"

    def test_all_terminal_with_failures_returns_complete(self):
        tasks = {
            "full": TaskEntry(status="COMPLETED"),
            "score:accuracy": TaskEntry(status="FAILED"),
            "post_process": TaskEntry(status="COMPLETED"),
        }
        assert _compute_job_stage(_job(tasks=tasks)) == "COMPLETE"
