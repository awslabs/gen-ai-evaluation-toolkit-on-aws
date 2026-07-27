"""E2e test for MLflow experiment integration via orchestrated flow.

Submits a job to the builtin evaluator (no process_locally), waits for SFN
to complete, then verifies MLflow experiment/run/metrics/artifacts.

Requires:
- SSM /genai-etk/restApiEndpoint in the target account
- MLflow tracking server named GenAiEvaluationToolkitMLFlow in the target account
"""

import os
import time
import uuid

import pytest
from awssolutions_gen_ai_evaluation_toolkit_python_client.api import DefaultApi
from awssolutions_gen_ai_evaluation_toolkit_python_client.models import (
    JobStatus,
    SubmitEvaluationJobRequestContent,
    TestDataSource,
)

pytestmark = pytest.mark.e2e

TIMEOUT_S = 300
POLL_INTERVAL_S = 5


def _wait_for_terminal(client: DefaultApi, job_id: str) -> JobStatus:
    deadline = time.monotonic() + TIMEOUT_S
    while time.monotonic() < deadline:
        resp = client.get_evaluator_job(job_id)
        if resp.status in (JobStatus.SUCCESS, JobStatus.FAILURE, JobStatus.PARTIAL_FAILURE):
            return resp.status
        time.sleep(POLL_INTERVAL_S)
    raise TimeoutError(f"Job {job_id} did not complete within {TIMEOUT_S}s")


@pytest.fixture
def mlflow_client():
    arn = os.environ.get("MLFLOW_TRACKING_SERVER_ARN")
    if not arn:
        try:
            import boto3
            region = os.environ.get("AWS_REGION", "eu-west-2")
            sm = boto3.client("sagemaker", region_name=region)
            resp = sm.describe_mlflow_tracking_server(TrackingServerName="GenAiEvaluationToolkitMLFlow")
            arn = resp["TrackingServerArn"]
        except Exception as e:
            pytest.skip(f"Cannot resolve MLflow tracking server ARN: {e}")
    from mlflow import set_tracking_uri
    from mlflow.tracking import MlflowClient

    set_tracking_uri(arn)
    return MlflowClient()


INLINE_TESTCASES = [
    {"input": {"question": "What is 2+2?"}, "expected": {"answer": "4"}},
    {"input": {"question": "Capital of France?"}, "expected": {"answer": "Paris"}},
]


class TestExperimentOrchestrated:
    """Submit a FULL job with experiment_name → SFN runs → verify MLflow."""

    def test_experiment_metrics_and_artifacts(
        self, client: DefaultApi, mlflow_client,
    ) -> None:
        experiment_name = f"sdk-e2e-{uuid.uuid4().hex[:8]}"
        test_data = TestDataSource.from_dict({"inline": INLINE_TESTCASES})

        resp = client.submit_evaluation_job(
            "builtin",
            SubmitEvaluationJobRequestContent(
                testCases=test_data,
                scorers={"llm_as_judge": None},
                experimentName=experiment_name,
            ),
        )

        status = _wait_for_terminal(client, resp.job_id)
        assert status == JobStatus.SUCCESS, f"Expected SUCCESS, got {status}"

        # Wait for MLflow run to finish (post-processing is async)
        experiment = None
        for _ in range(30):
            experiment = mlflow_client.get_experiment_by_name(experiment_name)
            if experiment:
                break
            time.sleep(2)
        assert experiment is not None, f"Experiment '{experiment_name}' not found"

        run = None
        for _ in range(30):
            runs = mlflow_client.search_runs(
                experiment_ids=[experiment.experiment_id],
                filter_string=f"attribute.run_name = '{resp.job_id}'",
            )
            if runs and runs[0].info.status == "FINISHED":
                run = runs[0]
                break
            time.sleep(2)
        assert run is not None and run.info.status == "FINISHED"

        # Verify params
        assert run.data.params.get("etk.evaluator_name") == "builtin"
        assert run.data.params.get("etk.report_id") == resp.report_id

        # Verify aggregated metrics exist
        assert any("mean" in k for k in run.data.metrics)

        # Verify artifacts
        artifacts = mlflow_client.list_artifacts(run.info.run_id)
        artifact_paths = [a.path for a in artifacts]
        assert "Test Case Results Json" in artifact_paths
        assert "Test Case Results HTML" in artifact_paths

        # Clean up
        mlflow_client.delete_experiment(experiment.experiment_id)
