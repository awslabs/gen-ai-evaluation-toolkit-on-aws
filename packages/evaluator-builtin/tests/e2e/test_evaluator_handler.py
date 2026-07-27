"""E2E tests for the evaluator-builtin handler against a deployed stack.

Tests the full production chain:
  Client → API → EventBridge → evaluator-builtin Lambda (Docker) → Bedrock → DDB → post-processing

Run with: uv run pytest tests/e2e -m e2e -v --timeout=600
"""

import json
import time
from typing import Any

import pytest
from awssolutions_gen_ai_evaluation_toolkit_python_client.api import DefaultApi  # type: ignore[attr-defined]
from awssolutions_gen_ai_evaluation_toolkit_python_client.models import (  # type: ignore[attr-defined]
    BatchCreateResultsRequestContent,
    BatchResultInput,
    CreateReportRequestContent,
    SubmitAppInvocationJobRequestContent,
    SubmitEvaluationJobRequestContent,
    SubmitScoringJobRequestContent,
    TestDataSource,
)

from .conftest import EVALUATOR_NAME, list_all_results, poll_job

pytestmark = pytest.mark.e2e

def _find_score(result: Any, name_fragment: str) -> Any:
    """Find a score by partial name match. Returns the score object."""
    for k, v in result.scores.items():
        if name_fragment in k:
            return v
    pytest.fail(f"Score '{name_fragment}' not found in {list(result.scores.keys())}")


LLM_SAMPLE = {"llm_as_judge": {"scores": {"sample": None}}}
LLM_TOXICITY = {"llm_as_judge": {"scores": {"toxicity": None}}}
LLM_SAMPLE_AND_TOXICITY = {"llm_as_judge": {"scores": {"sample": None, "toxicity": None}}}
RAGAS_ANSWER_RELEVANCY = {"ragas": {"scores": {"answer_relevancy": None}}}


# =========================================================================
# FULL evaluation
# =========================================================================


class TestFullEvaluation:
    """FULL job: Bedrock app_invoke + scoring."""

    def test_full_inline(self, client: DefaultApi) -> None:
        """FULL with inline testcases — app_invoke + LLM-as-Judge sample scoring."""
        resp = client.submit_evaluation_job(
            EVALUATOR_NAME,
            SubmitEvaluationJobRequestContent(
                testCases=TestDataSource.from_dict({"inline": [
                    {"input": {"question": "What is Python?"}, "expected": {"answer": "A programming language"}},
                    {"input": {"question": "What is 2+2?"}, "expected": {"answer": "4"}},
                ]}),
                scorers=LLM_SAMPLE,
            ),
        )

        assert poll_job(client, resp.job_id) == "SUCCESS"

        results = list_all_results(client, resp.report_id)
        assert len(results) == 2
        for r in results:
            assert r.output is not None, "Expected Bedrock app_invoke output"
            assert r.scores, "Expected LLM-as-Judge scores"
            assert any("sample" in k for k in r.scores)

    def test_full_dataset(self, client: DefaultApi, dataset_10: str) -> None:
        """FULL with dataset reference — handler fetches testcases from dataset API."""
        resp = client.submit_evaluation_job(
            EVALUATOR_NAME,
            SubmitEvaluationJobRequestContent(
                testCases=TestDataSource.from_dict({"dataset": {"datasetId": dataset_10}}),
                scorers=LLM_SAMPLE,
            ),
        )

        assert poll_job(client, resp.job_id) == "SUCCESS"

        results = list_all_results(client, resp.report_id)
        assert len(results) == 10
        for r in results:
            assert r.output is not None
            assert r.scores
            assert any("sample" in k for k in r.scores)

    def test_full_multi_scorer(self, client: DefaultApi) -> None:
        """FULL with sample + toxicity — both sub-scores present."""
        resp = client.submit_evaluation_job(
            EVALUATOR_NAME,
            SubmitEvaluationJobRequestContent(
                testCases=TestDataSource.from_dict({"inline": [
                    {"input": {"question": "What is AI?"}, "expected": {"answer": "Artificial Intelligence"}},
                ]}),
                scorers=LLM_SAMPLE_AND_TOXICITY,
            ),
        )

        assert poll_job(client, resp.job_id) == "SUCCESS"

        results = list_all_results(client, resp.report_id)
        assert len(results) == 1
        score_names = list(results[0].scores.keys())
        assert any("sample" in k for k in score_names)
        assert any("toxicity" in k for k in score_names)


# =========================================================================
# APP_INVOKE only
# =========================================================================


class TestAppInvoke:
    """APP_INVOKE job: Bedrock app_invoke, no scoring."""

    def test_app_invoke_only(self, client: DefaultApi) -> None:
        """APP_INVOKE produces output but no scores."""
        resp = client.submit_app_invocation_job(
            EVALUATOR_NAME,
            SubmitAppInvocationJobRequestContent(
                testCases=TestDataSource.from_dict({"inline": [
                    {"input": {"question": "What is gravity?"}},
                    {"input": {"question": "What is light?"}},
                    {"input": {"question": "What is sound?"}},
                ]}),
            ),
        )

        assert poll_job(client, resp.job_id) == "SUCCESS"

        results = list_all_results(client, resp.report_id)
        assert len(results) == 3
        for r in results:
            assert r.output is not None, "Expected app_invoke output"
            assert not r.scores, "APP_INVOKE should not produce scores"


# =========================================================================
# SCORE jobs
# =========================================================================


class TestScore:
    """SCORE job: score existing results from a source report."""

    def test_score_source_report(self, client: DefaultApi) -> None:
        """Create results manually, then score them via sourceReportId."""
        # Create source report with pre-computed results
        report_resp = client.create_report(CreateReportRequestContent(name="e2e-score-source"))
        source_id = report_resp.report.report_id

        client.batch_create_results(
            source_id,
            BatchCreateResultsRequestContent(results=[
                BatchResultInput(
                    input={"question": "Explain gravity"},
                    output={"answer": "Gravity is a fundamental force of attraction between objects with mass."},
                    expected={"answer": "A force of attraction"},
                ),
            ]),
        )

        # Score the source report
        resp = client.submit_scoring_job(
            EVALUATOR_NAME,
            SubmitScoringJobRequestContent(sourceReportId=source_id, scorers=LLM_SAMPLE),
        )

        assert poll_job(client, resp.job_id) == "SUCCESS"

        results = list_all_results(client, resp.report_id)
        assert len(results) == 1
        assert any("sample" in k for k in results[0].scores)

    def test_rescore_with_different_scorer(self, client: DefaultApi) -> None:
        """Score a source report with sample, then re-score with toxicity."""
        # Create source
        report_resp = client.create_report(CreateReportRequestContent(name="e2e-rescore"))
        source_id = report_resp.report.report_id
        client.batch_create_results(
            source_id,
            BatchCreateResultsRequestContent(results=[
                BatchResultInput(input={"q": "Hi"}, output={"a": "Hello there!"}),
                BatchResultInput(input={"q": "Bye"}, output={"a": "Goodbye!"}),
            ]),
        )

        # First score with sample
        resp1 = client.submit_scoring_job(
            EVALUATOR_NAME,
            SubmitScoringJobRequestContent(sourceReportId=source_id, scorers=LLM_SAMPLE),
        )
        assert poll_job(client, resp1.job_id) == "SUCCESS"
        r1 = list_all_results(client, resp1.report_id)
        assert len(r1) == 2
        assert all(any("sample" in k for k in r.scores) for r in r1)

        # Re-score same source with toxicity
        resp2 = client.submit_scoring_job(
            EVALUATOR_NAME,
            SubmitScoringJobRequestContent(sourceReportId=source_id, scorers=LLM_TOXICITY),
        )
        assert poll_job(client, resp2.job_id) == "SUCCESS"
        r2 = list_all_results(client, resp2.report_id)
        assert len(r2) == 2
        assert all(any("toxicity" in k for k in r.scores) for r in r2)


# =========================================================================
# RAGAS scorer
# =========================================================================


class TestRagas:
    """RAGAS scorer — answer_relevancy via deployed evaluator."""

    def test_ragas_answer_relevancy(self, client: DefaultApi) -> None:
        """FULL with RAGAS answer_relevancy scorer — expects a numeric score.

        RAGAS expects input.user_input and output.response field names.
        """
        resp = client.submit_evaluation_job(
            EVALUATOR_NAME,
            SubmitEvaluationJobRequestContent(
                testCases=TestDataSource.from_dict({"inline": [
                    {
                        "input": {"user_input": "What is machine learning?"},
                        "expected": {"answer": "A subset of AI that enables systems to learn from data"},
                    },
                ]}),
                scorers=RAGAS_ANSWER_RELEVANCY,
            ),
        )

        assert poll_job(client, resp.job_id) == "SUCCESS"

        results = list_all_results(client, resp.report_id)
        assert len(results) == 1
        assert results[0].output is not None
        ragas_score = _find_score(results[0], "answer_relevancy")
        assert ragas_score.value is not None, f"Expected numeric value, got error: {ragas_score.error}"
        assert 0.0 <= ragas_score.value <= 1.0

    def test_ragas_with_llm_as_judge(self, client: DefaultApi) -> None:
        """FULL with both RAGAS and LLM-as-Judge scorers — both produce numeric scores.

        Uses user_input field for RAGAS compatibility. LLM-as-Judge is flexible with field names.
        """
        resp = client.submit_evaluation_job(
            EVALUATOR_NAME,
            SubmitEvaluationJobRequestContent(
                testCases=TestDataSource.from_dict({"inline": [
                    {
                        "input": {"user_input": "What is deep learning?"},
                        "expected": {"answer": "Neural networks with multiple layers"},
                    },
                ]}),
                scorers={
                    "llm_as_judge": {"scores": {"sample": None}},
                    "ragas": {"scores": {"answer_relevancy": None}},
                },
            ),
        )

        assert poll_job(client, resp.job_id, timeout=300) == "SUCCESS"

        results = list_all_results(client, resp.report_id)
        assert len(results) == 1

        sample = _find_score(results[0], "sample")
        assert sample.value is not None, f"sample error: {sample.error}"

        relevancy = _find_score(results[0], "answer_relevancy")
        assert relevancy.value is not None, f"answer_relevancy error: {relevancy.error}"


class TestAllScorers:
    """All three built-in LLM scorers (DeepEval, RAGAS, LLM-as-Judge) in one job."""

    @staticmethod
    def _poll_status(client: DefaultApi, job_id: str, timeout: int = 300) -> str:
        """Poll a job to a terminal status, reading the raw response.

        Bypasses the generated client's strict model so a newer server-side
        ``stage`` value (e.g. ``COMPLETE``) does not fail deserialization — we
        only need ``status`` here.
        """
        status = "UNKNOWN"
        for _ in range(timeout // 5):
            raw = client.get_evaluator_job_without_preload_content(job_id=job_id)
            status = json.loads(raw.read()).get("status", "UNKNOWN")
            if status in ("SUCCESS", "PARTIAL_FAILURE", "FAILURE"):
                return status
            time.sleep(5)
        pytest.fail(f"Job {job_id} timed out at status {status} after {timeout}s")
        return status  # unreachable

    def test_deepeval_ragas_llm_as_judge_together(self, client: DefaultApi) -> None:
        """Score one result with all three scorers in a single SCORE job.

        Uses the unified test-case schema so a single result feeds every scorer:
          - input.text          -> DeepEval prompt
          - input.user_input    -> RAGAS prompt
          - input.retrieved_contexts -> shared context
          - output.response     -> shared response
          - expected.reference  -> shared ground truth
        LLM-as-Judge reads the whole input/output, so no extra fields are needed.
        """
        report_resp = client.create_report(CreateReportRequestContent(name="e2e-all-scorers"))
        report_id = report_resp.report.report_id

        client.batch_create_results(
            report_id,
            BatchCreateResultsRequestContent(results=[
                BatchResultInput(
                    input={
                        "text": "What is the capital of France?",
                        "user_input": "What is the capital of France?",
                        "retrieved_contexts": [
                            "Paris is the capital and most populous city of France.",
                        ],
                    },
                    output={"response": "The capital of France is Paris."},
                    expected={"reference": "Paris"},
                ),
            ]),
        )

        resp = client.submit_scoring_job(
            EVALUATOR_NAME,
            SubmitScoringJobRequestContent(
                reportId=report_id,
                scorers={
                    "deepeval": {
                        "params": {"model_id": "us.amazon.nova-lite-v1:0", "region": "us-east-1"},
                        "scores": {"answer_relevancy": None, "faithfulness": None},
                    },
                    "ragas": {"scores": {"answer_relevancy": None}},
                    "llm_as_judge": {"scores": {"sample": None}},
                },
            ),
        )

        assert self._poll_status(client, resp.job_id, timeout=300) == "SUCCESS"

        results = list_all_results(client, resp.report_id)
        assert len(results) == 1
        scores = results[0].scores

        # Each scorer produced its score (keys are prefixed by scorer name).
        deepeval_rel = scores["deepeval.answer_relevancy"]
        assert deepeval_rel.value is not None, f"deepeval.answer_relevancy error: {deepeval_rel.error}"
        deepeval_faith = scores["deepeval.faithfulness"]
        assert deepeval_faith.value is not None, f"deepeval.faithfulness error: {deepeval_faith.error}"

        ragas_rel = _find_score(results[0], "ragas.answer_relevancy")
        assert ragas_rel.value is not None, f"ragas.answer_relevancy error: {ragas_rel.error}"

        llm_sample = _find_score(results[0], "sample")
        assert llm_sample.value is not None, f"llm_as_judge.sample error: {llm_sample.error}"
