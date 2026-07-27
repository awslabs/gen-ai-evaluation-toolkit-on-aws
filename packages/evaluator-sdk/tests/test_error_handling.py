"""Tests that verify API call structure and job status transitions.

These tests inspect mock call args and can only run against the mock backend.
Behavioral tests (response assertions) are in scenarios.py.
"""

from typing import Any
from unittest.mock import Mock

from awssolutions_gen_ai_evaluation_toolkit_python_client.models import (  # type: ignore[attr-defined]
    InlineTestCase,
    ScoreInput,
    TaskStatus,
)

from evaluator_sdk import Evaluator, TestResult
from evaluator_sdk.batching import _FLUSH_MAX_RETRIES

# ---------------------------------------------------------------------------
# Local helpers (only used in this file)
# ---------------------------------------------------------------------------

def always_pass_scorer(*, test_result: TestResult) -> float:
    return 1.0


def returns_zero_scorer(*, test_result: TestResult) -> float:
    return 0.0


# ---------------------------------------------------------------------------
# API Call Verification
# ---------------------------------------------------------------------------


class TestAPICallVerification:
    def test_batch_create_results_fields_on_app_error(self, mock_api: Mock) -> None:
        def failing_app(input_data: dict[str, Any]) -> dict[str, Any]:
            raise ValueError("App crash!")

        evaluator = Evaluator(
            name="test-eval",
            app_invoke=failing_app,
            client=mock_api,
        )

        testcases = [InlineTestCase(input={"question": "test"}, expected={"answer": "expected"})]
        evaluator.invoke(testcases=testcases)

        mock_api.batch_create_results.assert_called_once()
        call_kwargs = mock_api.batch_create_results.call_args.kwargs

        assert call_kwargs["report_id"] == "report-456"
        request = call_kwargs["batch_create_results_request_content"]
        result_input = request.results[0]

        assert result_input.input == {"question": "test"}
        assert result_input.output is None
        assert result_input.expected == {"answer": "expected"}
        assert result_input.error == "App crash!"

    def test_batch_update_scores_structure(self, mock_api: Mock) -> None:
        def simple_app(input_data: dict[str, Any]) -> dict[str, Any]:
            return {"result": "success"}

        evaluator = Evaluator(
            name="test-eval",
            app_invoke=simple_app,
            scorers=[always_pass_scorer, returns_zero_scorer],
            client=mock_api,
        )

        testcases = [InlineTestCase(input={"test": True})]
        evaluator.evaluate(testcases=testcases)

        mock_api.batch_update_scores.assert_called_once()
        call_kwargs = mock_api.batch_update_scores.call_args.kwargs

        assert call_kwargs["report_id"] == "report-456"

        scores_request = call_kwargs["batch_update_scores_request_content"]
        assert len(scores_request.items) == 1

        score_item = scores_request.items[0]
        # result_id is client-generated — verify it matches what was sent to batch_create
        create_kwargs = mock_api.batch_create_results.call_args.kwargs
        created_result_id = create_kwargs["batch_create_results_request_content"].results[0].result_id
        assert score_item.result_id == created_result_id
        assert len(score_item.scores) == 2

        pass_score = score_item.scores["always_pass_scorer"]
        assert isinstance(pass_score, ScoreInput)
        assert pass_score.value == 1.0

        zero_score = score_item.scores["returns_zero_scorer"]
        assert isinstance(zero_score, ScoreInput)
        assert zero_score.value == 0.0

    def test_job_status_transitions(self, mock_api: Mock) -> None:
        def simple_app(input_data: dict[str, Any]) -> dict[str, Any]:
            return {"result": "success"}

        evaluator = Evaluator(
            name="test-eval",
            app_invoke=simple_app,
            client=mock_api,
        )

        testcases = [InlineTestCase(input={"test": True})]
        evaluator.invoke(testcases=testcases)

        assert mock_api.update_evaluator_job_status.call_count == 2

        first_call = mock_api.update_evaluator_job_status.call_args_list[0]
        assert first_call.kwargs["job_id"] == "job-123"
        assert first_call.kwargs["update_evaluator_job_status_request_content"].status == TaskStatus.RUNNING

        second_call = mock_api.update_evaluator_job_status.call_args_list[1]
        terminal = second_call.kwargs["update_evaluator_job_status_request_content"]
        assert terminal.status == TaskStatus.COMPLETED

    def test_no_scores_means_no_batch_update_call(self, mock_api: Mock) -> None:
        def failing_app(input_data: dict[str, Any]) -> dict[str, Any]:
            raise ValueError("App failed")

        evaluator = Evaluator(
            name="test-eval",
            app_invoke=failing_app,
            client=mock_api,
        )

        testcases = [InlineTestCase(input={"test": True})]
        evaluator.invoke(testcases=testcases)

        mock_api.batch_create_results.assert_called_once()
        mock_api.batch_update_scores.assert_not_called()

    def test_create_report_called_before_submit(self, mock_api: Mock) -> None:
        evaluator = Evaluator(
            name="test-eval",
            app_invoke=lambda d: {"result": "ok"},
            client=mock_api,
        )

        testcases = [InlineTestCase(input={"test": True})]
        resp = evaluator.invoke(testcases=testcases, experiment_name="my-exp")

        mock_api.create_report.assert_called_once()
        mock_api.submit_app_invocation_job.assert_called_once()

        assert resp.report_id == "report-456"
        assert resp.job_id == "job-123"


# ---------------------------------------------------------------------------
# Top-Level Failure (catastrophic)
# ---------------------------------------------------------------------------


class TestTopLevelFailure:
    """Test that API-level failures mark the job as FAILED and raise EvaluatorError."""

    def test_batch_create_results_failure_marks_partial_failure(self, mock_api: Mock) -> None:
        """Persistent create-results API failures are retried then reported as PARTIAL_FAILURE."""
        mock_api.batch_create_results.side_effect = RuntimeError("API unavailable")

        def simple_app(input_data: dict[str, Any]) -> dict[str, Any]:
            return {"result": "success"}

        evaluator = Evaluator(
            name="test-eval",
            app_invoke=simple_app,
            client=mock_api,
        )

        testcases = [InlineTestCase(input={"test": True})]

        resp = evaluator.invoke(testcases=testcases)

        assert mock_api.batch_create_results.call_count == _FLUSH_MAX_RETRIES
        status_calls = mock_api.update_evaluator_job_status.call_args_list
        final_status = status_calls[-1].kwargs[
            "update_evaluator_job_status_request_content"
        ]
        assert final_status.status == TaskStatus.COMPLETED
        assert resp.results is not None
        assert len(resp.results) == 1

    def test_batch_update_scores_failure_marks_partial_failure(self, mock_api: Mock) -> None:
        """Persistent score API failures are retried then reported as PARTIAL_FAILURE."""
        mock_api.batch_update_scores.side_effect = RuntimeError("Scores API down")

        def simple_app(input_data: dict[str, Any]) -> dict[str, Any]:
            return {"result": "success"}

        evaluator = Evaluator(
            name="test-eval",
            app_invoke=simple_app,
            scorers=[always_pass_scorer],
            client=mock_api,
        )

        testcases = [InlineTestCase(input={"test": True})]

        resp = evaluator.evaluate(testcases=testcases)

        assert len(resp.results) == 1
        status_calls = mock_api.update_evaluator_job_status.call_args_list
        req = status_calls[-1].kwargs["update_evaluator_job_status_request_content"]
        assert req.status == TaskStatus.COMPLETED
        assert req.error is not None
        assert req.error.code == "PARTIAL_FAILURE"
