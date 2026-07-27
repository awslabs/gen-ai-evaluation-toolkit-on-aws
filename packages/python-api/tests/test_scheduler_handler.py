"""Onebox tests for scheduler_handler — triggered by EventBridge Scheduler.

Tests that the scheduler trigger handler correctly submits FULL, SCORE, and
APP_INVOKE jobs via _submit_job, with idempotent retries via deterministic IDs.
"""

from awssolutions_gen_ai_evaluation_toolkit_python_client.models import (
    CreateReportRequestContent,
    JobType,
)

from evaluator_api.scheduler_handler import _deterministic_id, handler


class TestSchedulerTriggerFull:
    """FULL job submission from scheduler trigger."""

    def test_submits_full_job(self, client):
        """Scheduler trigger with jobType=FULL creates a FULL job."""
        event = {
            "scheduleName": "sched-full-001",
            "time": "2026-05-01T08:00:00Z",
            "jobType": "FULL",
            "evaluatorName": "builtin",
            "testCases": {
                "inline": [
                    {"input": {"question": "What is 2+2?"}, "expected": {"answer": "4"}},
                ]
            },
            "scorers": {"llm_as_judge": {"scores": {"sample": None}}},
            "experimentName": "scheduled-full-test",
        }

        result = handler(event, None)

        assert result["statusCode"] == 200
        assert "jobId" in result
        assert "reportId" in result

        # Verify job was created with correct type
        job = client.get_evaluator_job(result["jobId"])
        assert job.job_type == JobType.FULL
        assert job.experiment_name == "scheduled-full-test"

    def test_submits_full_job_with_app_config(self, client):
        """Scheduler trigger passes app config through."""
        event = {
            "scheduleName": "sched-full-app-001",
            "time": "2026-05-01T08:01:00Z",
            "jobType": "FULL",
            "evaluatorName": "builtin",
            "testCases": {"inline": [{"input": {"q": "hi"}}]},
            "scorers": {"llm_as_judge": None},
            "app": {"name": "my_app", "params": {"model_id": "nova"}},
        }

        result = handler(event, None)

        assert result["statusCode"] == 200
        job = client.get_evaluator_job(result["jobId"])
        assert job.job_type == JobType.FULL


class TestSchedulerTriggerScore:
    """SCORE job submission from scheduler trigger."""

    def test_submits_score_job_with_source_report(self, client):
        """Scheduler trigger with jobType=SCORE and sourceReportId."""
        # First create a report with some results
        report_resp = client.create_report(
            CreateReportRequestContent(name="source-for-scheduler"),
        )

        event = {
            "scheduleName": "sched-score-001",
            "time": "2026-05-01T08:02:00Z",
            "jobType": "SCORE",
            "evaluatorName": "builtin",
            "sourceReportId": report_resp.report.report_id,
            "scorers": {"llm_as_judge": {"scores": {"sample": None}}},
            "experimentName": "scheduled-score-test",
        }

        result = handler(event, None)

        assert result["statusCode"] == 200
        job = client.get_evaluator_job(result["jobId"])
        assert job.job_type == JobType.SCORE


class TestSchedulerTriggerAppInvoke:
    """APP_INVOKE job submission from scheduler trigger."""

    def test_submits_app_invoke_job(self, client):
        """Scheduler trigger with jobType=APP_INVOKE."""
        event = {
            "scheduleName": "sched-invoke-001",
            "time": "2026-05-01T08:03:00Z",
            "jobType": "APP_INVOKE",
            "evaluatorName": "builtin",
            "testCases": {
                "inline": [
                    {"input": {"question": "What is 2+2?"}},
                ]
            },
            "experimentName": "scheduled-invoke-test",
        }

        result = handler(event, None)

        assert result["statusCode"] == 200
        job = client.get_evaluator_job(result["jobId"])
        assert job.job_type == JobType.APP_INVOKE


class TestSchedulerIdempotency:
    """Deterministic ID generation and idempotent retries."""

    def test_deterministic_id_is_stable(self):
        """Same inputs always produce the same ID."""
        id1 = _deterministic_id("my-schedule", "2026-05-01T08:00:00Z")
        id2 = _deterministic_id("my-schedule", "2026-05-01T08:00:00Z")
        assert id1 == id2
        assert len(id1) == 32

    def test_deterministic_id_differs_by_time(self):
        """Different invocation times produce different IDs."""
        id1 = _deterministic_id("my-schedule", "2026-05-01T08:00:00Z")
        id2 = _deterministic_id("my-schedule", "2026-05-01T08:01:00Z")
        assert id1 != id2

    def test_deterministic_id_differs_by_schedule(self):
        """Different schedule names produce different IDs."""
        id1 = _deterministic_id("schedule-a", "2026-05-01T08:00:00Z")
        id2 = _deterministic_id("schedule-b", "2026-05-01T08:00:00Z")
        assert id1 != id2

    def test_retry_produces_same_job(self, client):
        """Calling handler twice with same scheduleName+time is idempotent."""
        event = {
            "scheduleName": "sched-retry-001",
            "time": "2026-05-01T09:00:00Z",
            "jobType": "FULL",
            "evaluatorName": "builtin",
            "testCases": {"inline": [{"input": {"q": "test"}}]},
            "scorers": {"llm_as_judge": None},
        }

        result1 = handler(event, None)
        assert result1["statusCode"] == 200

        result2 = handler(event, None)
        assert result2["statusCode"] == 200
        assert result2["jobId"] == result1["jobId"]
        assert result2["reportId"] == result1["reportId"]


class TestSchedulerTriggerValidation:
    """Validation and error handling."""

    def test_missing_job_type_returns_400(self):
        """Missing jobType returns 400."""
        event = {
            "scheduleName": "sched-val-001",
            "time": "2026-05-01T08:00:00Z",
            "evaluatorName": "builtin",
            "testCases": {"inline": [{"input": {"q": "hi"}}]},
        }

        result = handler(event, None)
        assert result["statusCode"] == 400

    def test_missing_evaluator_name_returns_400(self):
        """Missing evaluatorName returns 400."""
        event = {
            "scheduleName": "sched-val-002",
            "time": "2026-05-01T08:00:00Z",
            "jobType": "FULL",
            "testCases": {"inline": [{"input": {"q": "hi"}}]},
            "scorers": {"llm_as_judge": None},
        }

        result = handler(event, None)
        assert result["statusCode"] == 400

    def test_missing_schedule_name_returns_400(self):
        """Missing scheduleName returns 400."""
        event = {
            "time": "2026-05-01T08:00:00Z",
            "jobType": "FULL",
            "evaluatorName": "builtin",
            "testCases": {"inline": [{"input": {"q": "hi"}}]},
            "scorers": {"llm_as_judge": None},
        }

        result = handler(event, None)
        assert result["statusCode"] == 400

    def test_missing_time_returns_400(self):
        """Missing time returns 400."""
        event = {
            "scheduleName": "sched-val-003",
            "jobType": "FULL",
            "evaluatorName": "builtin",
            "testCases": {"inline": [{"input": {"q": "hi"}}]},
            "scorers": {"llm_as_judge": None},
        }

        result = handler(event, None)
        assert result["statusCode"] == 400

    def test_full_job_missing_test_cases_returns_400(self):
        """FULL job without testCases returns 400."""
        event = {
            "scheduleName": "sched-val-004",
            "time": "2026-05-01T08:00:00Z",
            "jobType": "FULL",
            "evaluatorName": "builtin",
            "scorers": {"llm_as_judge": None},
        }

        result = handler(event, None)
        assert result["statusCode"] == 400
        assert "testCases" in result["error"]

    def test_full_job_missing_scorers_returns_400(self):
        """FULL job without scorers returns 400."""
        event = {
            "scheduleName": "sched-val-005",
            "time": "2026-05-01T08:00:00Z",
            "jobType": "FULL",
            "evaluatorName": "builtin",
            "testCases": {"inline": [{"input": {"q": "hi"}}]},
        }

        result = handler(event, None)
        assert result["statusCode"] == 400
        assert "scorers" in result["error"]

    def test_app_invoke_missing_test_cases_returns_400(self):
        """APP_INVOKE job without testCases returns 400."""
        event = {
            "scheduleName": "sched-val-006",
            "time": "2026-05-01T08:00:00Z",
            "jobType": "APP_INVOKE",
            "evaluatorName": "builtin",
        }

        result = handler(event, None)
        assert result["statusCode"] == 400
        assert "testCases" in result["error"]

    def test_score_job_missing_source_returns_400(self):
        """SCORE job without sourceReportId or testResults returns 400."""
        event = {
            "scheduleName": "sched-val-007",
            "time": "2026-05-01T08:00:00Z",
            "jobType": "SCORE",
            "evaluatorName": "builtin",
            "scorers": {"llm_as_judge": None},
        }

        result = handler(event, None)
        assert result["statusCode"] == 400

    def test_malformed_scorers_returns_400(self):
        """Malformed scorers dict (bad from_dict) returns 400."""
        event = {
            "scheduleName": "sched-val-008",
            "time": "2026-05-01T08:00:00Z",
            "jobType": "FULL",
            "evaluatorName": "builtin",
            "testCases": {"inline": [{"input": {"q": "hi"}}]},
            "scorers": {"bad_scorer": "not_a_dict_or_none"},
        }

        result = handler(event, None)
        assert result["statusCode"] == 400
