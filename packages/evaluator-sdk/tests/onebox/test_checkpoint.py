"""Onebox tests for checkpoint resume behavior.

Tests the handler's ability to resume from a checkpoint, skipping
already-processed testcases. CONTINUE loop tests are in test_orchestration.py.
"""

from typing import Callable

from awssolutions_gen_ai_evaluation_toolkit_python_client.api import DefaultApi
from awssolutions_gen_ai_evaluation_toolkit_python_client.models import (
    BatchCreateResultsRequestContent,
    BatchResultInput,
    TaskStatus,
    UpdateEvaluatorJobStatusRequestContent,
)

from evaluator_sdk import Evaluator

from .test_evaluator_handler import (
    _inline_test_data,
    _make_event,
    _submit_evaluation_job,
)

MANY_TESTCASES = [
    {"input": {"question": f"Q{i}"}, "expected": {"answer": f"A{i}"}}
    for i in range(10)
]


class TestHandlerCheckpointResume:
    """Checkpoint resume: second invocation skips already-processed testcases."""

    def test_resume_skips_processed(
        self, evaluator_factory: Callable[..., Evaluator], client: DefaultApi,
    ) -> None:
        """Second invocation with checkpoint skips testcases below the index."""
        evaluator = evaluator_factory()

        submitted = _submit_evaluation_job(
            client, "test-eval", MANY_TESTCASES,
            scorers={"exact_match_scorer": None},
        )
        job_id = submitted["jobId"]
        report_id = submitted["reportId"]

        # First invocation: manually write first 5 results to simulate partial progress
        client.batch_create_results(
            report_id,
            BatchCreateResultsRequestContent(results=[
                BatchResultInput(
                    input=tc["input"], output=tc["expected"], expected=tc["expected"],
                )
                for tc in MANY_TESTCASES[:5]
            ]),
        )

        # Second invocation with checkpoint at index 5 — should process 5-9 only
        event2 = _make_event(
            evaluator_name="test-eval", job_id=job_id, report_id=report_id,
            job_type="FULL", test_data=_inline_test_data(MANY_TESTCASES),
            scorers={"exact_match_scorer": None},
            task_token="tok-2", task_key="full",
        )
        event2["detail"]["checkpoint"] = {"inline_testcase_index": 5}

        # Mark RUNNING so handler doesn't re-send it
        client.update_evaluator_job_status(
            job_id,
            UpdateEvaluatorJobStatusRequestContent(status=TaskStatus.RUNNING),
        )

        result = evaluator.evaluator_handler(event2, None)
        assert result["status"] == "COMPLETED"

        # Should have 5 (pre-existing) + 5 (new) = 10 results
        results_resp = client.list_test_results(report_id=report_id)
        assert len(results_resp.test_results) == 10
