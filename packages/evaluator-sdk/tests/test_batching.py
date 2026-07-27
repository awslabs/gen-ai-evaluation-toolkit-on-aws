"""Tests for result batching behavior — flush timing and score delivery."""

from typing import Any
from unittest.mock import Mock

from awssolutions_gen_ai_evaluation_toolkit_python_client.models import (  # type: ignore[attr-defined]
    InlineTestCase,
    TaskStatus,
)

from evaluator_sdk import Evaluator

from .conftest import exact_match_scorer, simple_app


def _make_test_result(
    result_id: str, output: dict[str, Any] | None = None, expected: dict[str, Any] | None = None,
) -> Mock:
    """Create a mock TestResult for list_test_results responses."""
    return Mock(
        result_id=result_id,
        input={"q": "test"},
        output=output or {"answer": "4"},
        expected=expected or {"answer": "4"},
        metadata=None,
        scores={},
    )


def _mock_list_test_results(results: list[Mock], page_size: int = 200) -> Any:
    """Create a side_effect for list_test_results that paginates."""
    pages: list[tuple[list[Mock], str | None]] = []
    for i in range(0, len(results), page_size):
        chunk = results[i:i + page_size]
        next_token = str(i + page_size) if i + page_size < len(results) else None
        pages.append((chunk, next_token))

    call_count = 0

    def side_effect(*args: Any, **kwargs: Any) -> Mock:
        nonlocal call_count
        idx = min(call_count, len(pages) - 1)
        call_count += 1
        return Mock(test_results=pages[idx][0], next_token=pages[idx][1])

    return side_effect


def _echo_create(*args: Any, **kwargs: Any) -> Mock:
    """Echo client-provided result_ids back."""
    req = kwargs["batch_create_results_request_content"]
    results = [Mock(result_id=r.result_id, index=i) for i, r in enumerate(req.results)]
    return Mock(results=results, errors=[], count=len(results))


class TestBatching:
    """Tests for result batching behavior — requires mock call counts."""

    def test_flushes_at_batch_size(self, mock_api: Mock) -> None:
        """With batch_size=2 and 5 testcases, should flush 3 times (2+2+1)."""
        mock_api.batch_create_results.side_effect = _echo_create

        evaluator = Evaluator(
            name="test-eval",
            app_invoke=simple_app,
            scorers=[exact_match_scorer],
            batch_size=2,
            client=mock_api,
        )

        testcases = [
            InlineTestCase(input={"q": str(i)}, expected={"answer": "4"})
            for i in range(5)
        ]
        resp = evaluator.evaluate(testcases=testcases)

        assert len(resp.results) == 5
        assert mock_api.batch_create_results.call_count == 3

        calls = mock_api.batch_create_results.call_args_list
        assert len(calls[0].kwargs["batch_create_results_request_content"].results) == 2
        assert len(calls[1].kwargs["batch_create_results_request_content"].results) == 2
        assert len(calls[2].kwargs["batch_create_results_request_content"].results) == 1

    def test_exact_batch_size_no_extra_flush(self, mock_api: Mock) -> None:
        """With batch_size=2 and 4 testcases, should flush 2 times (2+2)."""
        mock_api.batch_create_results.side_effect = _echo_create

        evaluator = Evaluator(
            name="test-eval",
            app_invoke=simple_app,
            batch_size=2,
            client=mock_api,
        )

        testcases = [
            InlineTestCase(input={"q": str(i)})
            for i in range(4)
        ]
        resp = evaluator.invoke(testcases=testcases)

        assert len(resp.results) == 4
        assert mock_api.batch_create_results.call_count == 2

    def test_fewer_than_batch_size_flushes_once(self, mock_api: Mock) -> None:
        """With batch_size=40 (default) and 3 testcases, flushes once at end."""
        mock_api.batch_create_results.side_effect = _echo_create

        evaluator = Evaluator(
            name="test-eval",
            app_invoke=simple_app,
            client=mock_api,
        )

        testcases = [
            InlineTestCase(input={"q": str(i)})
            for i in range(3)
        ]
        resp = evaluator.invoke(testcases=testcases)

        assert len(resp.results) == 3
        assert mock_api.batch_create_results.call_count == 1

    def test_batch_scores_sent_with_each_flush(self, mock_api: Mock) -> None:
        """Scores are sent in the same batch as their results."""
        mock_api.batch_create_results.side_effect = _echo_create

        evaluator = Evaluator(
            name="test-eval",
            app_invoke=simple_app,
            scorers=[exact_match_scorer],
            batch_size=2,
            client=mock_api,
        )

        testcases = [
            InlineTestCase(input={"q": "1"}, expected={"answer": "4"}),
            InlineTestCase(input={"q": "2"}, expected={"answer": "4"}),
            InlineTestCase(input={"q": "3"}, expected={"answer": "4"}),
        ]
        resp = evaluator.evaluate(testcases=testcases)

        assert len(resp.results) == 3
        assert mock_api.batch_update_scores.call_count == 2


class TestScoreFromSourceBatching:
    """Tests that score(source_report_id=...) batches score updates."""

    def _setup_score_from_source(self, mock_api: Mock, num_results: int) -> None:
        """Configure mock_api for score-from-source with N results."""
        mock_api.submit_scoring_job.return_value = Mock(
            job_id="job-score-1", report_id="new-report-1",
        )
        results = [_make_test_result(f"r-{i}") for i in range(num_results)]
        mock_api.list_test_results.side_effect = _mock_list_test_results(results)

    def test_score_from_source_batches_scores(self, mock_api: Mock) -> None:
        """score(source_report_id=...) with batch_size=2 and 5 results should batch scores."""
        self._setup_score_from_source(mock_api, num_results=5)

        evaluator = Evaluator(
            name="test-eval",
            scorers=[exact_match_scorer],
            batch_size=2,
            client=mock_api,
        )

        resp = evaluator.score(source_report_id="src-report-1")

        assert resp.total_results == 5
        # With batch_size=2 and 5 results: should flush 3 times (2+2+1)
        assert mock_api.batch_update_scores.call_count == 3

        calls = mock_api.batch_update_scores.call_args_list
        assert len(calls[0].kwargs["batch_update_scores_request_content"].items) == 2
        assert len(calls[1].kwargs["batch_update_scores_request_content"].items) == 2
        assert len(calls[2].kwargs["batch_update_scores_request_content"].items) == 1

    def test_score_from_source_exact_batch_size(self, mock_api: Mock) -> None:
        """score(source_report_id=...) with batch_size=2 and 4 results flushes 2 times."""
        self._setup_score_from_source(mock_api, num_results=4)

        evaluator = Evaluator(
            name="test-eval",
            scorers=[exact_match_scorer],
            batch_size=2,
            client=mock_api,
        )

        resp = evaluator.score(source_report_id="src-report-1")

        assert resp.total_results == 4
        assert mock_api.batch_update_scores.call_count == 2

    def test_score_from_source_fewer_than_batch_size(self, mock_api: Mock) -> None:
        """score(source_report_id=...) with 3 results and default batch_size flushes once."""
        self._setup_score_from_source(mock_api, num_results=3)

        evaluator = Evaluator(
            name="test-eval",
            scorers=[exact_match_scorer],
            client=mock_api,
        )

        resp = evaluator.score(source_report_id="src-report-1")

        assert resp.total_results == 3
        assert mock_api.batch_update_scores.call_count == 1

    def test_score_from_source_retries_on_item_errors(self, mock_api: Mock) -> None:
        """Transient per-item errors are retried and succeed on second attempt."""
        self._setup_score_from_source(mock_api, num_results=3)

        # First call returns errors, second succeeds
        mock_api.batch_update_scores.side_effect = [
            Mock(errors=[Mock(id="r-0", message="NOT_FOUND")], updated_count=2),
            Mock(errors=[], updated_count=3),
        ]

        evaluator = Evaluator(
            name="test-eval",
            scorers=[exact_match_scorer],
            client=mock_api,
        )

        evaluator.score(source_report_id="src-report-1")

        # Should have retried — 2 calls for the single batch
        assert mock_api.batch_update_scores.call_count == 2

        # Job should be COMPLETED without error (retry succeeded)
        status_calls = mock_api.update_evaluator_job_status.call_args_list
        final_call = status_calls[-1]
        req = final_call.kwargs["update_evaluator_job_status_request_content"]
        assert req.status == TaskStatus.COMPLETED
        assert req.error is None

    def test_score_from_source_partial_failure_after_retries(self, mock_api: Mock) -> None:
        """Persistent per-item errors are tracked as PARTIAL_FAILURE after retries exhausted."""
        self._setup_score_from_source(mock_api, num_results=3)

        # All 3 attempts return the same error
        error_resp = Mock(errors=[Mock(id="r-0", message="NOT_FOUND")], updated_count=2)
        mock_api.batch_update_scores.return_value = error_resp

        evaluator = Evaluator(
            name="test-eval",
            scorers=[exact_match_scorer],
            client=mock_api,
        )

        evaluator.score(source_report_id="src-report-1")

        # Should have retried 3 times
        assert mock_api.batch_update_scores.call_count == 3

        # Job should be COMPLETED with PARTIAL_FAILURE
        status_calls = mock_api.update_evaluator_job_status.call_args_list
        final_call = status_calls[-1]
        req = final_call.kwargs["update_evaluator_job_status_request_content"]
        assert req.status == TaskStatus.COMPLETED
        assert req.error is not None
        assert req.error.code == "PARTIAL_FAILURE"

    def test_score_from_source_retries_on_exception(self, mock_api: Mock) -> None:
        """API exceptions are retried and succeed on second attempt."""
        self._setup_score_from_source(mock_api, num_results=2)

        # First call raises, second succeeds
        mock_api.batch_update_scores.side_effect = [
            RuntimeError("network timeout"),
            Mock(errors=[], updated_count=2),
        ]

        evaluator = Evaluator(
            name="test-eval",
            scorers=[exact_match_scorer],
            client=mock_api,
        )

        evaluator.score(source_report_id="src-report-1")

        assert mock_api.batch_update_scores.call_count == 2

        # Job should be COMPLETED without error
        status_calls = mock_api.update_evaluator_job_status.call_args_list
        final_call = status_calls[-1]
        req = final_call.kwargs["update_evaluator_job_status_request_content"]
        assert req.status == TaskStatus.COMPLETED
        assert req.error is None

    def test_score_from_source_exception_exhausts_retries(self, mock_api: Mock) -> None:
        """API exceptions that persist after all retries mark items as errors."""
        self._setup_score_from_source(mock_api, num_results=2)

        mock_api.batch_update_scores.side_effect = RuntimeError("persistent failure")

        evaluator = Evaluator(
            name="test-eval",
            scorers=[exact_match_scorer],
            client=mock_api,
        )

        evaluator.score(source_report_id="src-report-1")

        assert mock_api.batch_update_scores.call_count == 3  # all retries

        # Job should be COMPLETED with PARTIAL_FAILURE (items lost, not job crash)
        status_calls = mock_api.update_evaluator_job_status.call_args_list
        final_call = status_calls[-1]
        req = final_call.kwargs["update_evaluator_job_status_request_content"]
        assert req.status == TaskStatus.COMPLETED
        assert req.error is not None
        assert req.error.code == "PARTIAL_FAILURE"
