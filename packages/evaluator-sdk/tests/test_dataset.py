"""Tests for dataset-based testcase loading via the API."""

from typing import Any
from unittest.mock import Mock

from awssolutions_gen_ai_evaluation_toolkit_python_client.models import (  # type: ignore[attr-defined]
    GetTestCaseResponseContent,
    ListTestCasesResponseContent,
    TestCaseReference,
)

from evaluator_sdk import Evaluator, TestResult

from .conftest import simple_app


def _mock_dataset_api(
    mock_api: Mock,
    test_cases: list[GetTestCaseResponseContent],
    page_size: int | None = None,
) -> None:
    """Set up mock_api to return test cases with token-based pagination.

    Pages are accessed by token (supports both sequential iteration and
    checkpoint resume from a specific token).
    """
    refs = [TestCaseReference(id=tc.test_case_id) for tc in test_cases]
    effective_page_size = page_size or len(refs)

    pages: dict[str | None, ListTestCasesResponseContent] = {}
    for i in range(0, len(refs), effective_page_size):
        chunk = refs[i : i + effective_page_size]
        has_more = i + effective_page_size < len(refs)
        token = f"tok-{i}" if i > 0 else None
        next_tok = f"tok-{i + effective_page_size}" if has_more else None
        pages[token] = ListTestCasesResponseContent(
            test_cases=chunk, next_token=next_tok,
        )

    mock_api.list_test_cases.side_effect = (
        lambda dataset_id, version, max_results=200, next_token=None, **kw: pages[next_token]
    )
    tc_by_id = {tc.test_case_id: tc for tc in test_cases}
    mock_api.get_test_case.side_effect = (
        lambda dataset_id, version, test_case_id, **kw: tc_by_id[test_case_id]
    )


class TestDatasetLoading:
    """Tests for dataset-based testcase loading via the API — requires mock."""

    def test_invoke_with_dataset_id(self, mock_api: Mock) -> None:
        _mock_dataset_api(mock_api, [
            GetTestCaseResponseContent(
                input={"q": "What is 2+2?"},
                expected="4",
                test_case_id="tc-1",
            ),
            GetTestCaseResponseContent(
                input={"q": "What is 3+3?"},
                expected="6",
                test_case_id="tc-2",
            ),
        ])

        evaluator = Evaluator(
            name="test-eval",
            app_invoke=simple_app,
            client=mock_api,
        )

        resp = evaluator.invoke(dataset_id="ds-1", dataset_version="1")

        assert len(resp.results) == 2
        assert resp.results[0].input_data == {"q": "What is 2+2?"}
        assert resp.results[0].output == {"answer": "4"}
        assert resp.results[1].input_data == {"q": "What is 3+3?"}

        mock_api.list_test_cases.assert_called_once_with(
            dataset_id="ds-1", version="1", max_results=200, next_token=None,
            list_test_cases_request_content=None,
        )

    def test_evaluate_with_dataset_id(self, mock_api: Mock) -> None:
        _mock_dataset_api(mock_api, [
            GetTestCaseResponseContent(
                input={"q": "What is 2+2?"},
                expected="4",
                test_case_id="tc-1",
            ),
        ])

        def check_scorer(*, test_result: TestResult) -> float:
            return 1.0 if test_result.output == {"answer": "4"} else 0.0

        evaluator = Evaluator(
            name="test-eval",
            app_invoke=simple_app,
            scorers=[check_scorer],
            client=mock_api,
        )

        resp = evaluator.evaluate(dataset_id="ds-1", dataset_version="1")

        assert len(resp.results) == 1
        assert resp.results[0].output == {"answer": "4"}
        assert resp.results[0].scores["check_scorer"].value == 1.0
        assert resp.results[0].expected == "4"

    def test_dataset_pagination(self, mock_api: Mock) -> None:
        """Test that multiple pages of test cases are consumed lazily."""
        test_cases = [
            GetTestCaseResponseContent(
                input={"q": f"question-{i}"},
                expected=f"answer-{i}",
                test_case_id=f"tc-{i}",
            )
            for i in range(5)
        ]
        _mock_dataset_api(mock_api, test_cases, page_size=2)

        evaluator = Evaluator(
            name="test-eval",
            app_invoke=simple_app,
            client=mock_api,
        )

        resp = evaluator.invoke(dataset_id="ds-1", dataset_version="1")

        assert len(resp.results) == 5
        assert mock_api.list_test_cases.call_count == 3  # 2+2+1
        assert mock_api.get_test_case.call_count == 5

    def test_dataset_version_defaults_to_head(self, mock_api: Mock) -> None:
        _mock_dataset_api(mock_api, [
            GetTestCaseResponseContent(
                input={"q": "test"}, expected="ans", test_case_id="tc-1",
            ),
        ])

        evaluator = Evaluator(
            name="test-eval",
            app_invoke=simple_app,
            client=mock_api,
        )

        evaluator.invoke(dataset_id="ds-1")

        mock_api.list_test_cases.assert_called_once_with(
            dataset_id="ds-1", version="head", max_results=200, next_token=None,
            list_test_cases_request_content=None,
        )

    def test_dataset_testcases_flow_through_pipeline(self, mock_api: Mock) -> None:
        """Verify dataset input flows through to app_invoke."""
        captured: list[dict[str, Any]] = []

        def capturing_app(input_data: dict[str, Any]) -> dict[str, Any]:
            captured.append(input_data)
            return {"answer": "ok"}

        _mock_dataset_api(mock_api, [
            GetTestCaseResponseContent(
                input={"q": "test"}, expected="ans", test_case_id="tc-42",
            ),
        ])

        evaluator = Evaluator(
            name="test-eval",
            app_invoke=capturing_app,
            client=mock_api,
        )

        resp = evaluator.invoke(dataset_id="ds-1", dataset_version="1")

        assert len(resp.results) == 1
        assert captured == [{"q": "test"}]


def _make_dataset_event(
    dataset_id: str = "ds-1",
    checkpoint: dict | None = None,
    task_token: str | None = None,
    task_key: str | None = None,
    job_type: str = "APP_INVOKE",
    scorers: dict | None = None,
) -> dict[str, Any]:
    """Build a mock EventBridge event for dataset-based handler tests."""
    detail: dict[str, Any] = {
        "jobId": "j1", "reportId": "r1", "evaluatorName": "test-eval",
        "jobType": job_type,
        "testCases": {"dataset": {"datasetId": dataset_id}},
    }
    if checkpoint:
        detail["checkpoint"] = checkpoint
    if task_token:
        detail["taskToken"] = task_token
    if task_key:
        detail["taskKey"] = task_key
    if scorers is not None:
        detail["scorers"] = scorers
    return {"detail": detail}


class TestDatasetCheckpointResume:
    """Tests for token-based dataset checkpoint/resume in evaluator_handler."""

    def test_resume_skips_already_processed_pages(self, mock_api: Mock) -> None:
        """CONTINUE with dataset_next_token resumes from the right page."""
        test_cases = [
            GetTestCaseResponseContent(
                input={"q": f"Q{i}"}, expected=f"A{i}", test_case_id=f"tc-{i}",
            )
            for i in range(9)  # 3 pages of 3
        ]
        _mock_dataset_api(mock_api, test_cases, page_size=3)

        evaluator = Evaluator(name="test-eval", app_invoke=simple_app, client=mock_api)

        # Resume from page 2 (token "tok-3")
        event = _make_dataset_event(checkpoint={"dataset_next_token": "tok-3"})
        result = evaluator.evaluator_handler(event, None)
        assert result["status"] == "COMPLETED"

        # Should only have fetched pages 2 and 3 (not page 1)
        calls = mock_api.list_test_cases.call_args_list
        assert len(calls) == 2
        assert calls[0][1]["next_token"] == "tok-3"

        # Fetched 6 testcases (tc-3..tc-8), not 9
        assert mock_api.get_test_case.call_count == 6

    def test_continue_stores_dataset_next_token(self, mock_api: Mock) -> None:
        """CONTINUE checkpoint contains dataset_next_token (the next page to process)."""
        test_cases = [
            GetTestCaseResponseContent(
                input={"q": f"Q{i}"}, expected=f"A{i}", test_case_id=f"tc-{i}",
            )
            for i in range(9)
        ]
        _mock_dataset_api(mock_api, test_cases, page_size=3)

        evaluator = Evaluator(name="test-eval", app_invoke=simple_app, client=mock_api)

        # Context triggers CONTINUE after first page completes
        class _PageTimeout:
            """Returns <60s after the page is processed (page boundary check)."""
            def __init__(self) -> None:
                self._calls = 0
            def get_remaining_time_in_millis(self) -> int:
                self._calls += 1
                return 10_000  # always trigger CONTINUE

        event = _make_dataset_event()
        result = evaluator.evaluator_handler(event, _PageTimeout())
        assert result["status"] == "CONTINUE"

        # Checkpoint should have the next page token
        update_calls = mock_api.update_evaluator_job_status.call_args_list
        continue_calls = [c for c in update_calls
                          if c[1].get("update_evaluator_job_status_request_content")
                          and c[1]["update_evaluator_job_status_request_content"].checkpoint]
        assert len(continue_calls) == 1
        checkpoint = continue_calls[0][1]["update_evaluator_job_status_request_content"].checkpoint
        assert "dataset_next_token" in checkpoint
        # Should be "tok-3" (the token for page 2)
        assert checkpoint["dataset_next_token"] == "tok-3"

    def test_full_resume_chain(self, mock_api: Mock) -> None:
        """Simulate full CONTINUE chain: page 1 → CONTINUE → page 2 → CONTINUE → page 3 → DONE."""
        test_cases = [
            GetTestCaseResponseContent(
                input={"q": f"Q{i}"}, expected=f"A{i}", test_case_id=f"tc-{i}",
            )
            for i in range(9)
        ]
        _mock_dataset_api(mock_api, test_cases, page_size=3)

        evaluator = Evaluator(name="test-eval", app_invoke=simple_app, client=mock_api)

        class _AlwaysTimeout:
            def get_remaining_time_in_millis(self) -> int:
                return 10_000

        # Invocation 1: processes page 1, CONTINUEs
        event = _make_dataset_event()
        r1 = evaluator.evaluator_handler(event, _AlwaysTimeout())
        assert r1["status"] == "CONTINUE"
        mock_api.reset_mock()
        _mock_dataset_api(mock_api, test_cases, page_size=3)

        # Invocation 2: processes page 2, CONTINUEs
        event2 = _make_dataset_event(checkpoint={"dataset_next_token": "tok-3"})
        r2 = evaluator.evaluator_handler(event2, _AlwaysTimeout())
        assert r2["status"] == "CONTINUE"
        mock_api.reset_mock()
        _mock_dataset_api(mock_api, test_cases, page_size=3)

        # Invocation 3: processes page 3, completes (no next token)
        event3 = _make_dataset_event(checkpoint={"dataset_next_token": "tok-6"})
        r3 = evaluator.evaluator_handler(event3, None)  # no timeout = completes
        assert r3["status"] == "COMPLETED"

        # Invocation 3 should only fetch page 3 (1 list_test_cases call)
        assert mock_api.list_test_cases.call_count == 1
        assert mock_api.get_test_case.call_count == 3


class TestDatasetHandler:
    """Tests for dataset-based testcase loading in evaluator_handler."""

    def test_full_handler_with_dataset(self, mock_api: Mock) -> None:
        """FULL handler resolves testcases from dataset, processes all."""
        test_cases = [
            GetTestCaseResponseContent(
                input={"q": f"Q{i}"}, expected=f"A{i}", test_case_id=f"tc-{i}",
            )
            for i in range(3)
        ]
        _mock_dataset_api(mock_api, test_cases)

        def check_scorer(*, test_result: TestResult) -> float:
            return 1.0

        evaluator = Evaluator(
            name="test-eval", app_invoke=simple_app,
            scorers=[check_scorer], client=mock_api,
        )

        event = _make_dataset_event(job_type="FULL", scorers={"check_scorer": None})
        result = evaluator.evaluator_handler(event, None)

        assert result["status"] == "COMPLETED"
        assert mock_api.get_test_case.call_count == 3

    def test_app_invoke_handler_with_dataset(self, mock_api: Mock) -> None:
        """APP_INVOKE handler resolves testcases from dataset."""
        test_cases = [
            GetTestCaseResponseContent(
                input={"q": "hello"}, expected="world", test_case_id="tc-1",
            ),
        ]
        _mock_dataset_api(mock_api, test_cases)

        evaluator = Evaluator(
            name="test-eval", app_invoke=simple_app, client=mock_api,
        )

        event = _make_dataset_event(job_type="APP_INVOKE")
        result = evaluator.evaluator_handler(event, None)

        assert result["status"] == "COMPLETED"

    def test_handler_with_paginated_dataset(self, mock_api: Mock) -> None:
        """Handler correctly processes all pages of a large dataset."""
        test_cases = [
            GetTestCaseResponseContent(
                input={"q": f"Q{i}"}, expected=f"A{i}", test_case_id=f"tc-{i}",
            )
            for i in range(25)
        ]
        _mock_dataset_api(mock_api, test_cases, page_size=10)

        evaluator = Evaluator(
            name="test-eval", app_invoke=simple_app, client=mock_api,
        )

        event = _make_dataset_event(job_type="APP_INVOKE")
        result = evaluator.evaluator_handler(event, None)

        assert result["status"] == "COMPLETED"
        assert mock_api.list_test_cases.call_count == 3  # 10+10+5
        assert mock_api.get_test_case.call_count == 25


# ---------------------------------------------------------------------------
# Self-review Issue #1: Dataset CONTINUE saves None page_token
# ---------------------------------------------------------------------------


class TestDatasetContinueLastPage:
    """Regression: timeout on the last page must not checkpoint with None token.

    The CONTINUE check must only fire when there are more pages remaining.
    """

    def test_timeout_on_last_page_completes_not_continues(self, mock_api: Mock) -> None:
        """When timeout fires on the last page (no next_token), the handler
        should complete normally rather than returning CONTINUE with None token.
        """
        # Single page dataset — next_token will be None
        test_cases = [
            GetTestCaseResponseContent(
                input={"q": f"Q{i}"}, expected=f"A{i}", test_case_id=f"tc-{i}",
            )
            for i in range(3)
        ]
        _mock_dataset_api(mock_api, test_cases, page_size=10)

        evaluator = Evaluator(
            name="test-eval", app_invoke=simple_app, client=mock_api,
        )

        class _AlwaysTimeout:
            """Always reports being close to timeout."""
            def get_remaining_time_in_millis(self) -> int:
                return 1  # always below any buffer

        event = _make_dataset_event(task_token="tok-1", task_key="app_invoke")
        result = evaluator.evaluator_handler(event, _AlwaysTimeout())

        # Should COMPLETE, not CONTINUE — there are no more pages
        assert result["status"] == "COMPLETED", (
            "Handler returned CONTINUE on last page with None next_token. "
            "This would cause an infinite restart loop."
        )

    def test_timeout_on_last_page_does_not_checkpoint_none_token(self, mock_api: Mock) -> None:
        """Checkpoint should never contain dataset_next_token=None."""
        test_cases = [
            GetTestCaseResponseContent(
                input={"q": f"Q{i}"}, expected=f"A{i}", test_case_id=f"tc-{i}",
            )
            for i in range(3)
        ]
        _mock_dataset_api(mock_api, test_cases, page_size=10)

        evaluator = Evaluator(
            name="test-eval", app_invoke=simple_app, client=mock_api,
        )

        class _AlwaysTimeout:
            def get_remaining_time_in_millis(self) -> int:
                return 1

        event = _make_dataset_event(task_token="tok-1", task_key="app_invoke")
        evaluator.evaluator_handler(event, _AlwaysTimeout())

        # Check that no update_job_status call contains a None dataset_next_token
        update_calls = mock_api.update_evaluator_job_status.call_args_list
        for call in update_calls:
            content = call[1].get("update_evaluator_job_status_request_content")
            if content and content.checkpoint:
                token = content.checkpoint.get("dataset_next_token")
                assert token is not None, (
                    "Checkpoint saved with dataset_next_token=None. "
                    "This would restart processing from the beginning."
                )


class TestAnnotationFilterWarning:
    """Test that annotation_filter with inline testcases logs a warning."""

    def test_warns_when_filter_with_inline_testcases(self, mock_api: Mock, caplog) -> None:
        import logging
        caplog.set_level(logging.WARNING)

        evaluator = Evaluator(
            name="test-eval",
            app_invoke=simple_app,
            scorers=[lambda *, test_result: 1.0],
            client=mock_api,
        )

        evaluator.evaluate(
            testcases=[{"input": {"q": "hi"}, "expected": {"a": "hello"}}],
            annotation_filter={"condition": {"stringEnumCondition": {"name": "X", "value": "Y", "comparator": "="}}},
        )

        assert any("annotation_filter is ignored" in r.message for r in caplog.records)

    def test_no_warning_when_filter_with_dataset(self, mock_api: Mock, caplog) -> None:
        import logging
        caplog.set_level(logging.WARNING)
        _mock_dataset_api(mock_api, [
            GetTestCaseResponseContent(input={"q": "test"}, expected="ans", test_case_id="tc-1"),
        ])

        evaluator = Evaluator(
            name="test-eval",
            app_invoke=simple_app,
            scorers=[lambda *, test_result: 1.0],
            client=mock_api,
        )

        evaluator.evaluate(
            dataset_id="ds-1",
            annotation_filter={"condition": {"stringEnumCondition": {"name": "X", "value": "Y", "comparator": "="}}},
        )

        assert not any("annotation_filter is ignored" in r.message for r in caplog.records)
