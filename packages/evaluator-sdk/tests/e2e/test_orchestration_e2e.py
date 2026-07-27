"""E2e tests for the full orchestrated flow (SFN → evaluator Lambda → post-processing).

Submits jobs via the API and lets Step Functions dispatch to the deployed
builtin evaluator Lambda. Tests poll for completion.
"""

import os
import time
from typing import Any

import boto3
import pytest
from awssolutions_gen_ai_evaluation_toolkit_python_client.api import DefaultApi
from awssolutions_gen_ai_evaluation_toolkit_python_client.models import (
    InlineTestResult,
    JobStatus,
    ScorerConfig,
    SubmitAppInvocationJobRequestContent,
    SubmitEvaluationJobRequestContent,
    SubmitScoringJobRequestContent,
    TestDataSource,
)

pytestmark = pytest.mark.e2e

TIMEOUT_S = 300  # max wait for SFN to complete
POLL_INTERVAL_S = 5


def _wait_for_terminal(client: DefaultApi, job_id: str) -> JobStatus:
    """Poll until the job reaches a terminal status."""
    deadline = time.monotonic() + TIMEOUT_S
    while time.monotonic() < deadline:
        resp = client.get_evaluator_job(job_id)
        if resp.status in (JobStatus.SUCCESS, JobStatus.FAILURE, JobStatus.PARTIAL_FAILURE):
            return resp.status
        time.sleep(POLL_INTERVAL_S)
    raise TimeoutError(f"Job {job_id} did not reach terminal status within {TIMEOUT_S}s")


INLINE_TESTCASES = [
    {"input": {"question": "What is 2+2?"}, "expected": {"answer": "4"}},
    {"input": {"question": "Capital of France?"}, "expected": {"answer": "Paris"}},
]


class TestOrchestratedFullEvaluation:
    """FULL job: SFN → builtin evaluator (app_invoke + scoring) → post-processing."""

    def test_full_job_completes_via_sf(self, client: DefaultApi) -> None:
        test_data = TestDataSource.from_dict({"inline": INLINE_TESTCASES})

        resp = client.submit_evaluation_job(
            "builtin",
            SubmitEvaluationJobRequestContent(
                testCases=test_data,
                scorers={"llm_as_judge": None},
            ),
        )

        status = _wait_for_terminal(client, resp.job_id)
        assert status == JobStatus.SUCCESS, f"Expected SUCCESS, got {status}"

        results = client.list_test_results(resp.report_id)
        assert len(results.test_results) == len(INLINE_TESTCASES)
        for tr in results.test_results:
            assert tr.output is not None
            assert tr.scores is not None
            assert len(tr.scores) > 0


class TestOrchestratedAppInvoke:
    """APP_INVOKE job: SFN → builtin evaluator (invoke only) → post-processing."""

    def test_invoke_job_completes_via_sf(self, client: DefaultApi) -> None:
        test_data = TestDataSource.from_dict({"inline": INLINE_TESTCASES})

        resp = client.submit_app_invocation_job(
            "builtin",
            SubmitAppInvocationJobRequestContent(testCases=test_data),
        )

        status = _wait_for_terminal(client, resp.job_id)
        assert status == JobStatus.SUCCESS, f"Expected SUCCESS, got {status}"

        results = client.list_test_results(resp.report_id)
        assert len(results.test_results) == len(INLINE_TESTCASES)
        for tr in results.test_results:
            assert tr.output is not None


class TestOrchestratedScoreFromSource:
    """SCORE job with sourceReportId: copy results → score → post-processing."""

    def test_score_from_source_completes_via_sf(self, client: DefaultApi) -> None:
        # First create results via an APP_INVOKE job
        test_data = TestDataSource.from_dict({"inline": INLINE_TESTCASES})
        invoke_resp = client.submit_app_invocation_job(
            "builtin",
            SubmitAppInvocationJobRequestContent(testCases=test_data),
        )
        invoke_status = _wait_for_terminal(client, invoke_resp.job_id)
        assert invoke_status == JobStatus.SUCCESS

        # Now score those results
        score_resp = client.submit_scoring_job(
            "builtin",
            SubmitScoringJobRequestContent(
                sourceReportId=invoke_resp.report_id,
                scorers={"llm_as_judge": None},
            ),
        )

        status = _wait_for_terminal(client, score_resp.job_id)
        assert status == JobStatus.SUCCESS, f"Expected SUCCESS, got {status}"

        results = client.list_test_results(score_resp.report_id)
        assert len(results.test_results) == len(INLINE_TESTCASES)
        for tr in results.test_results:
            assert tr.scores is not None
            assert len(tr.scores) > 0


class TestOrchestratedScoreInlineResults:
    """SCORE job with inline testResults: API pre-writes → SFN dispatches scorer → scores added."""

    def test_score_inline_results_completes_via_sf(self, client: DefaultApi) -> None:
        """Inline test results with outputs are scored end-to-end via Step Functions."""
        test_results = [
            InlineTestResult.from_dict({
                "input": {"question": "What is 2+2?"},
                "output": {"answer": "4"},
                "expected": {"answer": "4"},
            }),
            InlineTestResult.from_dict({
                "input": {"question": "Capital of France?"},
                "output": {"answer": "Paris"},
                "expected": {"answer": "Paris"},
            }),
        ]

        resp = client.submit_scoring_job(
            "builtin",
            SubmitScoringJobRequestContent(
                testResults=test_results,
                scorers={"llm_as_judge": {"scores": {"sample": None}}},
            ),
        )

        status = _wait_for_terminal(client, resp.job_id)
        assert status == JobStatus.SUCCESS, f"Expected SUCCESS, got {status}"

        results = client.list_test_results(resp.report_id)
        assert len(results.test_results) == 2, "Both inline results should be present"
        for tr in results.test_results:
            assert tr.output is not None, "Output should be preserved from inline testResults"
            assert tr.scores is not None, "Scores should be added by scorer"
            assert len(tr.scores) > 0, "At least one score should be present"


class TestMultiEvaluatorTopology:
    """Multi-evaluator: separate scorer tasks dispatched in parallel via SFN.

    Routes one scorer to "builtin" and another to a fake evaluator name.
    The fake scorer will time out/fail, but this proves the topology split
    (app_invoke + parallel score tasks) works end-to-end.
    """

    def test_multi_evaluator_splits_into_separate_tasks(self, client: DefaultApi) -> None:
        """Scorers on different evaluators create app_invoke + score:* tasks."""
        test_data = TestDataSource.from_dict({"inline": INLINE_TESTCASES})

        # Route scorers to DIFFERENT evaluator names to trigger the split.
        # "builtin" handles app_invoke + llm_as_judge scorer.
        # "other-scorer" doesn't exist — its task will fail, but we prove
        # the topology was created correctly.
        resp = client.submit_evaluation_job(
            "builtin",
            SubmitEvaluationJobRequestContent(
                testCases=test_data,
                heartbeatSeconds=30,  # Fast timeout for non-existent scorer
                scorers={
                    "llm_as_judge": ScorerConfig(
                        evaluatorName="builtin",
                        scores={"sample": None},
                    ),
                    "ragas": ScorerConfig(
                        evaluatorName="other-scorer",
                        scores={"faithfulness": None},
                    ),
                },
            ),
        )

        # Will be PARTIAL_FAILURE (builtin scorer succeeds, other-scorer times out)
        status = _wait_for_terminal(client, resp.job_id)
        assert status in (JobStatus.SUCCESS, JobStatus.PARTIAL_FAILURE, JobStatus.FAILURE), \
            f"Expected terminal status, got {status}"

        # Verify tasks were split into multi-evaluator topology
        job = client.get_evaluator_job(resp.job_id)
        assert job.tasks is not None, "Job should have tasks"
        task_keys = set(job.tasks.keys())
        assert "app_invoke" in task_keys, f"Should have app_invoke task, got {task_keys}"
        assert "score:llm_as_judge" in task_keys, f"Should have score:llm_as_judge, got {task_keys}"
        assert "score:ragas" in task_keys, f"Should have score:ragas, got {task_keys}"
        assert "post_process" in task_keys, f"Should have post_process, got {task_keys}"

        # The builtin scorer's task should have completed
        assert job.tasks["score:llm_as_judge"].status.value == "COMPLETED", \
            "builtin scorer should complete"

        # Results should have outputs (from app_invoke) and scores from builtin scorer
        results = client.list_test_results(resp.report_id)
        assert len(results.test_results) == len(INLINE_TESTCASES)
        for tr in results.test_results:
            assert tr.output is not None, "app_invoke should have produced output"


class TestOrchestratedDataset:
    """FULL job with dataset reference: SFN → evaluator reads from dataset API."""

    def test_dataset_evaluation_completes_via_sf(
        self, client: DefaultApi, dataset: dict[str, Any],
    ) -> None:
        test_data = TestDataSource.from_dict({
            "dataset": {"datasetId": dataset["dataset_id"]},
        })

        resp = client.submit_evaluation_job(
            "builtin",
            SubmitEvaluationJobRequestContent(
                testCases=test_data,
                scorers={"llm_as_judge": None},
            ),
        )

        status = _wait_for_terminal(client, resp.job_id)
        assert status == JobStatus.SUCCESS, f"Expected SUCCESS, got {status}"

        results = client.list_test_results(resp.report_id)
        assert len(results.test_results) == dataset["test_case_count"]
        for tr in results.test_results:
            assert tr.output is not None
            assert tr.scores is not None


class TestContinueCheckpoint:
    """FULL job with high continueBufferMs to force CONTINUE/checkpoint loop.

    Uses continueBufferMs=840000 (14 min) so the handler thinks it's almost
    out of time after processing the first test case, checkpoints, and returns
    CONTINUE. SFN re-invokes with the checkpoint. Verifies all results arrive
    and confirms CONTINUE fired via CloudWatch Logs.
    """

    def test_continue_checkpoint_produces_all_results(self, client: DefaultApi) -> None:
        test_cases = [
            {"input": {"question": f"Question {i}?"}, "expected": {"answer": f"Answer {i}"}}
            for i in range(5)
        ]
        test_data = TestDataSource.from_dict({"inline": test_cases})

        start_time = int(time.time() * 1000)  # epoch ms for log query

        resp = client.submit_evaluation_job(
            "builtin",
            SubmitEvaluationJobRequestContent(
                testCases=test_data,
                scorers={"llm_as_judge": {"scores": {"sample": None}}},
                continueBufferMs=899000,  # 14m59s — forces CONTINUE after each test case
            ),
        )

        status = _wait_for_terminal(client, resp.job_id)
        assert status == JobStatus.SUCCESS, f"Expected SUCCESS, got {status}"

        # Verify all results arrived
        results = client.list_test_results(resp.report_id)
        assert len(results.test_results) == len(test_cases), (
            f"Expected {len(test_cases)} results after CONTINUE loop, got {len(results.test_results)}"
        )
        for tr in results.test_results:
            assert tr.scores is not None

        # Verify CONTINUE actually fired by checking CloudWatch Logs
        region = os.environ.get("AWS_REGION", "eu-west-2")
        log_group = os.environ.get("ETK_EVALUATOR_LOG_GROUP")
        if not log_group:
            try:
                ssm = boto3.client("ssm", region_name=region)
                log_group = ssm.get_parameter(Name="/genai-etk/evaluatorLogGroupName")["Parameter"]["Value"]
            except Exception as e:
                pytest.skip(f"ETK_EVALUATOR_LOG_GROUP not set and SSM lookup failed: {e}")

        # Wait briefly for logs to propagate
        time.sleep(5)
        logs_client = boto3.client("logs", region_name=region)
        try:
            response = logs_client.filter_log_events(
                logGroupName=log_group,
                startTime=start_time,
                filterPattern=f'"{resp.job_id}" "CONTINUE"',
                limit=10,
            )
        except Exception as e:
            pytest.skip(
                f"CloudWatch Logs filter_log_events failed "
                f"(permissions/throttling/missing log group {log_group}): {e}"
            )
        continue_events = response.get("events", [])
        assert len(continue_events) >= 1, (
            f"Expected at least 1 CONTINUE log entry for job {resp.job_id}, "
            f"got {len(continue_events)}. CONTINUE mechanism may not have fired."
        )
