"""Tests for client-generated result IDs and partial failure handling.

These tests verify that the SDK generates result IDs client-side and uses
them directly for score updates, and that partial failures from
batch_create_results are handled correctly.
"""

from typing import Any
from unittest.mock import Mock

from awssolutions_gen_ai_evaluation_toolkit_python_client.models import (  # type: ignore[attr-defined]
    InlineTestCase,
    TaskStatus,
)

from evaluator_sdk import Evaluator

from .helpers import exact_match_scorer

# ---------------------------------------------------------------------------
# Local helper: echoes input back (unlike shared simple_app which returns "4")
# ---------------------------------------------------------------------------

def echo_app(input_data: dict[str, Any]) -> dict[str, Any]:
    return {"answer": input_data.get("q", "?")}


# ===========================================================================
# Client-generated result IDs
# ===========================================================================


class TestClientGeneratedIds:
    """Verify that result IDs are generated client-side and sent to the API."""

    def test_result_ids_sent_to_create(self, mock_api: Mock) -> None:
        """batch_create_results receives client-generated result_ids."""
        evaluator = Evaluator(
            name="test", app_invoke=echo_app,
            scorers=[exact_match_scorer], client=mock_api,
        )

        evaluator.evaluate(testcases=[
            InlineTestCase(input={"q": "a"}, expected={"answer": "a"}),
            InlineTestCase(input={"q": "b"}, expected={"answer": "b"}),
        ])

        create_req = mock_api.batch_create_results.call_args.kwargs[
            "batch_create_results_request_content"
        ]
        for r in create_req.results:
            assert r.result_id is not None
            assert len(r.result_id) == 32  # uuid hex

    def test_score_ids_match_create_ids(self, mock_api: Mock) -> None:
        """batch_update_scores uses the same IDs sent to batch_create_results."""
        evaluator = Evaluator(
            name="test", app_invoke=echo_app,
            scorers=[exact_match_scorer], client=mock_api,
        )

        evaluator.evaluate(testcases=[
            InlineTestCase(input={"q": "a"}, expected={"answer": "a"}),
            InlineTestCase(input={"q": "b"}, expected={"answer": "b"}),
        ])

        create_req = mock_api.batch_create_results.call_args.kwargs[
            "batch_create_results_request_content"
        ]
        created_ids = {r.result_id for r in create_req.results}

        score_req = mock_api.batch_update_scores.call_args.kwargs[
            "batch_update_scores_request_content"
        ]
        scored_ids = {item.result_id for item in score_req.items}

        assert scored_ids == created_ids

    def test_each_result_gets_unique_id(self, mock_api: Mock) -> None:
        """Every result in a batch gets a distinct client-generated ID."""
        evaluator = Evaluator(
            name="test", app_invoke=echo_app,
            scorers=[exact_match_scorer], client=mock_api,
        )

        evaluator.evaluate(testcases=[
            InlineTestCase(input={"q": "a"}, expected={"answer": "a"}),
            InlineTestCase(input={"q": "b"}, expected={"answer": "b"}),
            InlineTestCase(input={"q": "c"}, expected={"answer": "c"}),
        ])

        create_req = mock_api.batch_create_results.call_args.kwargs[
            "batch_create_results_request_content"
        ]
        ids = [r.result_id for r in create_req.results]
        assert len(set(ids)) == 3


# ===========================================================================
# Partial failures from batch_create_results
# ===========================================================================


class TestPartialFailures:
    """Verify handling when some items fail in batch_create_results."""

    def _mock_with_created_ids(self, mock_api: Mock, created_ids: set[str]) -> None:
        """Configure mock to return only the specified IDs as created."""
        def create_with_filter(*args: Any, **kwargs: Any) -> Mock:
            req = kwargs["batch_create_results_request_content"]
            results = []
            errors = []
            for idx, r in enumerate(req.results):
                if r.result_id in created_ids:
                    results.append(Mock(result_id=r.result_id, index=idx))
                else:
                    errors.append(Mock(index=idx, message="create failed"))
            return Mock(results=results, errors=errors)

        mock_api.batch_create_results.side_effect = create_with_filter

    def test_partial_failure_scores_still_sent_for_all(self, mock_api: Mock) -> None:
        """Scores are sent for all items regardless of create failures."""
        evaluator = Evaluator(
            name="test", app_invoke=echo_app,
            scorers=[exact_match_scorer], client=mock_api,
        )

        # Second item fails to create, but scores should still be sent for all 3
        def create_failing_second(*args: Any, **kwargs: Any) -> Mock:
            req = kwargs["batch_create_results_request_content"]
            results = [
                Mock(result_id=req.results[0].result_id, index=0),
                Mock(result_id=req.results[2].result_id, index=2),
            ]
            errors = [Mock(index=1, message="create failed")]
            return Mock(results=results, errors=errors)

        mock_api.batch_create_results.side_effect = create_failing_second

        resp = evaluator.evaluate(testcases=[
            InlineTestCase(input={"q": "a"}, expected={"answer": "a"}),
            InlineTestCase(input={"q": "b"}, expected={"answer": "b"}),
            InlineTestCase(input={"q": "c"}, expected={"answer": "c"}),
        ])

        assert len(resp.results) == 3

        score_req = mock_api.batch_update_scores.call_args.kwargs[
            "batch_update_scores_request_content"
        ]
        assert len(score_req.items) == 3

    def test_total_create_failure_scores_still_sent(self, mock_api: Mock) -> None:
        """Even if all creates fail, scores are still sent (server handles missing results)."""
        mock_api.batch_create_results.side_effect = None
        mock_api.batch_create_results.return_value = Mock(
            results=[],
            errors=[Mock(index=0, message="bad"), Mock(index=1, message="bad")],
        )

        evaluator = Evaluator(
            name="test", app_invoke=echo_app,
            scorers=[exact_match_scorer], client=mock_api,
        )

        resp = evaluator.evaluate(testcases=[
            InlineTestCase(input={"q": "a"}, expected={"answer": "a"}),
            InlineTestCase(input={"q": "b"}, expected={"answer": "b"}),
        ])

        assert len(resp.results) == 2
        mock_api.batch_update_scores.assert_called_once()

    def test_create_failure_then_score_failure_both_counted(self, mock_api: Mock) -> None:
        """If a result fails to create, its score update also fails — both errors tracked.

        Flow:
        1. batch_create_results: 3 items, item #1 fails → after retries, 1 create error
        2. batch_update_scores: 3 score items sent (all, no filtering),
           server returns 1 error (result doesn't exist) → after retries, 1 score error
        3. Job completes with PARTIAL_FAILURE, total errors = 2
        """
        # Create: item at index 1 always fails
        def create_failing_second(*args: Any, **kwargs: Any) -> Mock:
            req = kwargs["batch_create_results_request_content"]
            return Mock(
                results=[
                    Mock(result_id=req.results[0].result_id, index=0),
                    Mock(result_id=req.results[2].result_id, index=2),
                ],
                errors=[Mock(index=1, message="create failed")],
            )

        # Score: always returns 1 error (simulating server rejecting missing result)
        def score_with_one_error(*args: Any, **kwargs: Any) -> Mock:
            return Mock(errors=[Mock(id="bad-id", message="result not found")])

        mock_api.batch_create_results.side_effect = create_failing_second
        mock_api.batch_update_scores.side_effect = score_with_one_error

        evaluator = Evaluator(
            name="test", app_invoke=echo_app,
            scorers=[exact_match_scorer], client=mock_api,
        )

        resp = evaluator.evaluate(testcases=[
            InlineTestCase(input={"q": "a"}, expected={"answer": "a"}),
            InlineTestCase(input={"q": "b"}, expected={"answer": "b"}),
            InlineTestCase(input={"q": "c"}, expected={"answer": "c"}),
        ])

        assert len(resp.results) == 3

        # Both operations retried 3 times (errors persist)
        assert mock_api.batch_create_results.call_count == 3
        assert mock_api.batch_update_scores.call_count == 3

        # Score call included all 3 items (no filtering by created IDs)
        first_score_req = mock_api.batch_update_scores.call_args_list[0].kwargs[
            "batch_update_scores_request_content"
        ]
        assert len(first_score_req.items) == 3

        # Job reports PARTIAL_FAILURE: 1 create error + 1 score error = 2
        status_calls = mock_api.update_evaluator_job_status.call_args_list
        final = status_calls[-1].kwargs[
            "update_evaluator_job_status_request_content"
        ]
        assert final.status == TaskStatus.COMPLETED
        assert final.error is not None
        assert final.error.code == "PARTIAL_FAILURE"

    def test_partial_failure_with_no_scores(self, mock_api: Mock) -> None:
        """invoke() (no scorers) with partial failure — no score update needed."""
        def create_partial(*args: Any, **kwargs: Any) -> Mock:
            req = kwargs["batch_create_results_request_content"]
            return Mock(
                results=[Mock(result_id=req.results[0].result_id, index=0)],
                errors=[Mock(index=1, message="server error")],
            )

        mock_api.batch_create_results.side_effect = create_partial

        evaluator = Evaluator(
            name="test", app_invoke=echo_app, client=mock_api,
        )

        resp = evaluator.invoke(testcases=[
            InlineTestCase(input={"q": "a"}),
            InlineTestCase(input={"q": "b"}),
        ])

        assert len(resp.results) == 2
        mock_api.batch_update_scores.assert_not_called()


# ===========================================================================
# Partial failures across multiple batches
# ===========================================================================


class TestPartialFailuresAcrossBatches:
    """Verify partial failure handling when results span multiple batch flushes."""

    def test_partial_failure_in_second_batch(self, mock_api: Mock) -> None:
        """First batch succeeds fully, second batch has a partial failure.

        Scores are sent for all items in each batch regardless of create failures.
        """
        call_count = [0]

        def create_with_partial(*args: Any, **kwargs: Any) -> Mock:
            call_count[0] += 1
            req = kwargs["batch_create_results_request_content"]
            if call_count[0] == 1:
                # First batch: all succeed
                return Mock(
                    results=[Mock(result_id=r.result_id, index=i) for i, r in enumerate(req.results)],
                    errors=[],
                )
            else:
                # Second batch: first item succeeds, second fails
                return Mock(
                    results=[Mock(result_id=req.results[0].result_id, index=0)],
                    errors=[Mock(index=1, message="bad data")],
                )

        mock_api.batch_create_results.side_effect = create_with_partial

        evaluator = Evaluator(
            name="test", app_invoke=echo_app,
            scorers=[exact_match_scorer],
            batch_size=2, client=mock_api,
        )

        resp = evaluator.evaluate(testcases=[
            InlineTestCase(input={"q": "a"}, expected={"answer": "a"}),
            InlineTestCase(input={"q": "b"}, expected={"answer": "b"}),
            InlineTestCase(input={"q": "c"}, expected={"answer": "c"}),
            InlineTestCase(input={"q": "d"}, expected={"answer": "d"}),
        ])

        assert len(resp.results) == 4

        # Both batches send scores for all items (2 each)
        first_score_call = mock_api.batch_update_scores.call_args_list[0]
        first_req = first_score_call.kwargs["batch_update_scores_request_content"]
        assert len(first_req.items) == 2

        second_score_call = mock_api.batch_update_scores.call_args_list[1]
        second_req = second_score_call.kwargs["batch_update_scores_request_content"]
        assert len(second_req.items) == 2


# ===========================================================================
# Report creation folded into submit
# ===========================================================================


class TestReportCreation:
    """Verify that create_report is called before submit, and report_id is passed through."""

    def test_evaluate_creates_report_then_submits(self, mock_api: Mock) -> None:
        evaluator = Evaluator(
            name="test", app_invoke=echo_app,
            scorers=[exact_match_scorer], client=mock_api,
        )

        resp = evaluator.evaluate(
            testcases=[InlineTestCase(input={"q": "a"}, expected={"answer": "a"})],
            experiment_name="my-experiment",
        )

        mock_api.create_report.assert_called_once()
        mock_api.submit_evaluation_job.assert_called_once()
        assert resp.report_id == "report-456"
        assert resp.job_id == "job-123"

    def test_score_creates_report_then_submits(self, mock_api: Mock) -> None:
        evaluator = Evaluator(
            name="test", scorers=[exact_match_scorer], client=mock_api,
        )

        resp = evaluator.score(
            testcases=[{"input": {"q": "a"}, "output": {"answer": "a"}, "expected": {"answer": "a"}}],
            experiment_name="score-exp",
        )

        mock_api.create_report.assert_called_once()
        mock_api.submit_scoring_job.assert_called_once()
        assert resp.report_id == "report-456"

    def test_invoke_creates_report_then_submits(self, mock_api: Mock) -> None:
        evaluator = Evaluator(
            name="test", app_invoke=echo_app, client=mock_api,
        )

        resp = evaluator.invoke(
            testcases=[InlineTestCase(input={"q": "a"})],
            experiment_name="invoke-exp",
        )

        mock_api.create_report.assert_called_once()
        mock_api.submit_app_invocation_job.assert_called_once()
        assert resp.report_id == "report-456"


# ===========================================================================
# Edge cases
# ===========================================================================


class TestEdgeCases:
    """Edge cases for client-generated IDs and scoring."""

    def test_no_scores_when_no_scorers(self, mock_api: Mock) -> None:
        """invoke() with no scorers — no batch_update_scores call."""
        evaluator = Evaluator(
            name="test", app_invoke=echo_app, client=mock_api,
        )

        resp = evaluator.invoke(testcases=[
            InlineTestCase(input={"q": "a"}),
            InlineTestCase(input={"q": "b"}),
        ])

        assert len(resp.results) == 2
        mock_api.batch_update_scores.assert_not_called()

    def test_app_invoke_error_no_scores_for_failed(self, mock_api: Mock) -> None:
        """When app_invoke fails, no scores are produced for that result."""
        call_count = [0]

        def sometimes_failing(input_data: dict[str, Any]) -> dict[str, Any]:
            call_count[0] += 1
            if call_count[0] == 1:
                raise ValueError("failed")
            return {"answer": "ok"}

        evaluator = Evaluator(
            name="test", app_invoke=sometimes_failing,
            scorers=[exact_match_scorer], client=mock_api,
        )

        resp = evaluator.evaluate(testcases=[
            InlineTestCase(input={"q": "a"}, expected={"answer": "ok"}),
            InlineTestCase(input={"q": "b"}, expected={"answer": "ok"}),
        ])

        assert resp.results[0].scores == {}
        assert resp.results[0].error == "failed"
        assert resp.results[1].scores["exact_match_scorer"].value == 1.0

        score_req = mock_api.batch_update_scores.call_args.kwargs[
            "batch_update_scores_request_content"
        ]
        # Only one score item — the failed app_invoke produces no scores
        assert len(score_req.items) == 1

    def test_errors_field_missing_from_response(self, mock_api: Mock) -> None:
        """If the API doesn't return an errors field at all, SDK handles gracefully."""
        result_mock = Mock(spec=["results"])
        result_mock.results = [Mock(result_id="id-0", index=0)]
        mock_api.batch_create_results.return_value = result_mock

        evaluator = Evaluator(
            name="test", app_invoke=echo_app,
            scorers=[exact_match_scorer], client=mock_api,
        )

        resp = evaluator.evaluate(
            testcases=[InlineTestCase(input={"q": "a"}, expected={"answer": "a"})],
        )

        assert len(resp.results) == 1
