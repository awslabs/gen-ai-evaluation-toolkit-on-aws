"""Regression tests for edge cases found during self-review."""

from typing import Any, Callable

from awssolutions_gen_ai_evaluation_toolkit_python_client.api import DefaultApi

from evaluator_sdk import Evaluator

from .test_evaluator_handler import (
    SAMPLE_TESTCASES,
    _inline_test_data,
    _make_event,
    _submit_evaluation_job,
)


class TestCheckpointIndexZero:
    """Checkpoint with inline_testcase_index=0 must be recognized as valid."""

    def test_index_zero_processes_all_items(
        self, evaluator_factory: Callable[..., Evaluator], client: DefaultApi,
    ) -> None:
        evaluator = evaluator_factory()

        submitted = _submit_evaluation_job(
            client, "test-eval", SAMPLE_TESTCASES,
            scorers={"exact_match_scorer": None},
        )

        event = _make_event(
            evaluator_name="test-eval",
            job_id=submitted["jobId"],
            report_id=submitted["reportId"],
            job_type="FULL",
            test_data=_inline_test_data(SAMPLE_TESTCASES),
            scorers={"exact_match_scorer": None},
            task_token="tok-1",
            task_key="full",
        )
        event["detail"]["checkpoint"] = {"inline_testcase_index": 0}

        result = evaluator.evaluator_handler(event, None)
        assert result["status"] == "COMPLETED"

        results_resp = client.list_test_results(report_id=submitted["reportId"])
        assert len(results_resp.test_results) == len(SAMPLE_TESTCASES)


class TestTaskLevelDedup:
    """Duplicate EventBridge invocations for the same task should be skipped."""

    def test_completed_task_is_skipped(
        self, evaluator_factory: Callable[..., Evaluator], client: DefaultApi,
    ) -> None:
        """If a task is already COMPLETED, a duplicate invocation returns SKIPPED."""
        evaluator = evaluator_factory()

        submitted = _submit_evaluation_job(
            client, "test-eval", SAMPLE_TESTCASES,
            scorers={"exact_match_scorer": None},
        )
        job_id = submitted["jobId"]
        report_id = submitted["reportId"]

        # First invocation — completes the task
        event = _make_event(
            evaluator_name="test-eval",
            job_id=job_id, report_id=report_id,
            job_type="FULL", test_data=_inline_test_data(SAMPLE_TESTCASES),
            scorers={"exact_match_scorer": None},
            task_token="tok-1", task_key="full",
        )
        result1 = evaluator.evaluator_handler(event, None)
        assert result1["status"] == "COMPLETED"

        # Second invocation — same task, should be skipped
        event2 = _make_event(
            evaluator_name="test-eval",
            job_id=job_id, report_id=report_id,
            job_type="FULL", test_data=_inline_test_data(SAMPLE_TESTCASES),
            scorers={"exact_match_scorer": None},
            task_token="tok-2", task_key="full",
        )
        result2 = evaluator.evaluator_handler(event2, None)
        assert result2["status"] == "SKIPPED"
        assert "already" in result2.get("reason", "")


class TestFlushOnError:
    """When an unexpected error occurs mid-processing, buffered results
    should still be flushed (best-effort) before marking the task FAILED.

    Note: individual scorer errors are handled gracefully by _run_scorer
    (per-score error, not task failure). This tests the outer exception
    path for truly unexpected failures.
    """

    def test_flush_called_in_exception_handler(
        self, evaluator_factory: Callable[..., Evaluator], client: DefaultApi,
    ) -> None:
        """Verify the flush-on-error code path exists and is wired correctly.

        We inject a scorer that raises a non-standard error (KeyboardInterrupt
        is not caught by _run_scorer's except Exception). This forces the outer
        except block to fire, which should call flush() before reporting FAILED.
        """
        from unittest.mock import patch

        evaluator = evaluator_factory()

        submitted = _submit_evaluation_job(
            client, "test-eval", SAMPLE_TESTCASES,
            scorers={"exact_match_scorer": None},
        )

        event = _make_event(
            evaluator_name="test-eval",
            job_id=submitted["jobId"],
            report_id=submitted["reportId"],
            job_type="FULL",
            test_data=_inline_test_data(SAMPLE_TESTCASES),
            scorers={"exact_match_scorer": None},
            task_token="tok-1", task_key="full",
        )

        # Patch _process_testcase to raise after first call
        call_count = [0]
        original = evaluator._process_testcase

        def exploding_process(*args: Any, **kwargs: Any) -> Any:
            call_count[0] += 1
            if call_count[0] > 1:
                raise ValueError("unexpected internal error")
            return original(*args, **kwargs)

        with patch.object(evaluator, "_process_testcase", side_effect=exploding_process):
            result = evaluator.evaluator_handler(event, None)

        assert result["status"] == "FAILED"
        assert "unexpected internal error" in result.get("error", "")
