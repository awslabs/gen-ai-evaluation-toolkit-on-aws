"""Onebox tests for invoke() and score() flows.

invoke() exercises app_invoke against the real handler.
score(source_report_id=...) re-scores results from an existing report.
These tests work in both onebox (moto) and e2e (real AWS) modes.
"""

from typing import Any, Callable

from awssolutions_gen_ai_evaluation_toolkit_python_client.api import DefaultApi  # type: ignore[attr-defined]
from awssolutions_gen_ai_evaluation_toolkit_python_client.models import (  # type: ignore[attr-defined]
    InlineTestCase,
)

from evaluator_sdk import Evaluator, Scorer, ScoreResult, TestResult, scorer

from ..helpers import exact_match_scorer


def test_invoke_persists_results(
    evaluator_factory: Callable[..., Evaluator], client: DefaultApi,
) -> None:
    """invoke() stores results via the real handler and they can be listed back."""
    evaluator = evaluator_factory(scorers=[])

    resp = evaluator.invoke(testcases=[
        InlineTestCase(input={"question": "What is 2+2?"}, expected={"answer": "4"}),
        InlineTestCase(input={"question": "What is 3+3?"}, expected={"answer": "6"}),
    ])

    assert resp.total_results == 2
    assert resp.results[0].output == {"answer": "4"}
    assert resp.results[1].output == {"answer": "4"}

    # Verify persisted in the handler
    results_resp = client.list_test_results(report_id=resp.report_id)
    assert len(results_resp.test_results) == 2


def test_invoke_error_persists(
    evaluator_factory: Callable[..., Evaluator], client: DefaultApi,
) -> None:
    """When app_invoke fails, the error is persisted and the job still completes."""
    def failing_app(input_data: dict[str, Any]) -> dict[str, Any]:
        raise ValueError("boom")

    evaluator = evaluator_factory(app_invoke=failing_app, scorers=[])

    resp = evaluator.invoke(
        testcases=[InlineTestCase(input={"q": "test"})],
    )

    assert resp.total_results == 1
    assert resp.results[0].error == "boom"
    assert resp.results[0].output is None

    # Job reaches SUCCESS — post-processing runs inline on COMPLETED
    job_resp = client.get_evaluator_job(job_id=resp.job_id)
    assert job_resp.status.value == "SUCCESS"


def test_invoke_then_score_source_report(
    evaluator_factory: Callable[..., Evaluator], client: DefaultApi,
) -> None:
    """invoke() populates results, then score(source_report_id=...) re-scores them."""
    # Step 1: invoke to populate results (output but no scores)
    invoker = evaluator_factory(scorers=[exact_match_scorer])
    invoke_resp = invoker.invoke(testcases=[
        InlineTestCase(input={"question": "What is 2+2?"}, expected={"answer": "4"}),
        InlineTestCase(input={"question": "What is 3+3?"}, expected={"answer": "6"}),
    ])
    assert invoke_resp.total_results == 2
    assert invoke_resp.results[0].scores == {}  # no scoring in invoke

    # Step 2: score the invoke report via source_report_id
    score_eval = evaluator_factory(scorers=[exact_match_scorer])
    score_resp = score_eval.score(source_report_id=invoke_resp.report_id)

    assert score_resp.total_results == 2
    # simple_app always returns {"answer": "4"}, so one matches expected and one doesn't
    scores = sorted(r.scores["exact_match_scorer"].value for r in score_resp.results)
    assert scores == [0.0, 1.0]

    # Verify scores persisted in the new report
    results_resp = client.list_test_results(report_id=score_resp.report_id)
    assert len(results_resp.test_results) == 2
    assert score_resp.report_id != invoke_resp.report_id  # new report created


def test_score_source_report_with_scorer_class(
    evaluator_factory: Callable[..., Evaluator],
) -> None:
    """invoke() then score(source_report_id=...) with a Scorer subclass using @scorer."""

    class QualityScorer(Scorer):
        @scorer
        def length_check(self, test_result: TestResult) -> float:
            return 1.0 if len(str((test_result.output or {}).get("answer", ""))) > 0 else 0.0

        @scorer
        def has_answer(self, test_result: TestResult) -> ScoreResult:
            has_it = "answer" in (test_result.output or {})
            return ScoreResult(value=1.0 if has_it else 0.0, reason=f"has_answer={has_it}")

    # invoke first
    invoker = evaluator_factory(scorers=[QualityScorer])
    invoke_resp = invoker.invoke(testcases=[
        InlineTestCase(input={"question": "What is 2+2?"}, expected={"answer": "4"}),
    ])

    # score from source
    score_eval = evaluator_factory(scorers=[QualityScorer])
    score_resp = score_eval.score(source_report_id=invoke_resp.report_id)

    assert score_resp.total_results == 1
    assert score_resp.results[0].scores["QualityScorer.length_check"].value == 1.0
    sr = score_resp.results[0].scores["QualityScorer.has_answer"]
    assert sr.value == 1.0
    assert sr.reason == "has_answer=True"


def test_large_invoke_then_score_with_pagination(
    evaluator_factory: Callable[..., Evaluator], client: DefaultApi,
) -> None:
    """invoke() 200 testcases, then score(source_report_id=...) paginates and scores all."""
    num_testcases = 200
    testcases = [
        InlineTestCase(input={"q": str(i)}, expected={"answer": "4"})
        for i in range(num_testcases)
    ]

    invoker = evaluator_factory(scorers=[exact_match_scorer])
    invoke_resp = invoker.invoke(testcases=testcases)
    assert invoke_resp.total_results == num_testcases

    # Verify all results persisted
    all_results = []
    next_token = None
    while True:
        resp = client.list_test_results(report_id=invoke_resp.report_id, next_token=next_token)
        all_results.extend(resp.test_results)
        next_token = resp.next_token
        if not next_token:
            break
    assert len(all_results) == num_testcases

    # Score from source — exercises pagination in _iter_results
    score_eval = evaluator_factory(scorers=[exact_match_scorer])
    score_resp = score_eval.score(source_report_id=invoke_resp.report_id)

    assert score_resp.total_results == num_testcases
    scored_values = [r.scores["exact_match_scorer"].value for r in score_resp.results]
    assert all(v in (0.0, 1.0) for v in scored_values)
