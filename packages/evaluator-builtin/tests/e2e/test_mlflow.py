"""E2E test for MLflow experiment logging via post-processing.

Submits a job with experimentName, waits for COMPLETED, then queries MLflow
to verify the experiment, run, metrics, and params were logged correctly.
"""

import os
import time

import pytest
from awssolutions_gen_ai_evaluation_toolkit_python_client.api import DefaultApi  # type: ignore[attr-defined]
from awssolutions_gen_ai_evaluation_toolkit_python_client.models import (  # type: ignore[attr-defined]
    SubmitEvaluationJobRequestContent,
    TestDataSource,
)

from .conftest import EVALUATOR_NAME, poll_job

pytestmark = pytest.mark.e2e


@pytest.fixture(scope="session")
def mlflow_tracking_arn() -> str:
    """Get MLflow tracking server ARN from env or SageMaker."""
    arn = os.environ.get("MLFLOW_TRACKING_SERVER_ARN")
    if arn:
        return arn
    try:
        import boto3
        region = os.environ.get("AWS_REGION", "eu-west-2")
        sm = boto3.client("sagemaker", region_name=region)
        resp = sm.describe_mlflow_tracking_server(TrackingServerName="GenAiEvaluationToolkitMLFlow")
        return resp["TrackingServerArn"]
    except Exception as e:
        pytest.skip(f"Cannot get MLflow ARN: {e}")
        return ""  # unreachable


class TestMLflowExperiment:

    def test_experiment_metrics_and_params(
        self, client: DefaultApi, mlflow_tracking_arn: str,
    ) -> None:
        """Submit with experimentName → verify MLflow experiment, run, metrics, params."""
        experiment_name = f"e2e-mlflow-{int(time.time())}"

        resp = client.submit_evaluation_job(
            EVALUATOR_NAME,
            SubmitEvaluationJobRequestContent(
                testCases=TestDataSource.from_dict({"inline": [
                    {"input": {"question": "What is AI?"}, "expected": {"answer": "Artificial Intelligence"}},
                    {"input": {"question": "What is ML?"}, "expected": {"answer": "Machine Learning"}},
                    {"input": {"question": "What is DL?"}, "expected": {"answer": "Deep Learning"}},
                ]}),
                scorers={"llm_as_judge": {"scores": {"sample": None, "toxicity": None}}},
                experimentName=experiment_name,
            ),
        )

        assert poll_job(client, resp.job_id) == "SUCCESS"

        # Verify job has experiment name
        job = client.get_evaluator_job(job_id=resp.job_id)
        assert job.experiment_name == experiment_name

        # Query MLflow
        try:
            import mlflow
        except ImportError:
            pytest.skip("mlflow not installed")

        os.environ["MLFLOW_TRACKING_ARN"] = mlflow_tracking_arn
        mlflow.set_tracking_uri(mlflow_tracking_arn)

        exp = mlflow.get_experiment_by_name(experiment_name)
        assert exp is not None, f"Experiment '{experiment_name}' not found in MLflow"

        runs = mlflow.search_runs(experiment_ids=[exp.experiment_id])
        assert len(runs) > 0, "No runs found"

        run = runs.iloc[0]
        assert run["status"] == "FINISHED"

        # Check metrics — should have mean/min/max/stddev/count for each score
        metric_cols = [c for c in runs.columns if c.startswith("metrics.")]
        assert len(metric_cols) > 0, f"No metrics logged. Columns: {list(runs.columns)}"

        expected_metric_prefixes = [
            "metrics.llm_as_judge.sample_",
            "metrics.llm_as_judge.toxicity_",
        ]
        for prefix in expected_metric_prefixes:
            matching = [c for c in metric_cols if c.startswith(prefix)]
            assert len(matching) > 0, f"No metrics with prefix '{prefix}'. Got: {metric_cols}"

        # Check aggregation stats exist (mean, count at minimum)
        assert any("sample_mean" in c for c in metric_cols), f"Missing sample_mean in {metric_cols}"
        assert any("sample_count" in c for c in metric_cols), f"Missing sample_count in {metric_cols}"
        assert any("toxicity_mean" in c for c in metric_cols), f"Missing toxicity_mean in {metric_cols}"

        # Check count = 3 (we submitted 3 testcases)
        count_col = [c for c in metric_cols if "sample_count" in c][0]
        assert run[count_col] == 3.0, f"Expected count=3, got {run[count_col]}"

        # Check params
        param_cols = [c for c in runs.columns if c.startswith("params.")]
        assert any("etk.evaluator_name" in c for c in param_cols), f"Missing evaluator_name param in {param_cols}"
        assert any("etk.job_type" in c for c in param_cols), f"Missing job_type param in {param_cols}"

        evaluator_col = [c for c in param_cols if "etk.evaluator_name" in c][0]
        assert run[evaluator_col] == EVALUATOR_NAME
