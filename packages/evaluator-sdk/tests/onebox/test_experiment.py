"""Onebox tests for the experiment (MLflow) integration pipeline.

Tests the full flow: evaluate() with experiment_name -> pre-processing
(MLflow experiment/run creation) -> COMPLETED -> post-processing
(aggregation + MLflow metrics/artifacts + COMPLETED).

Requires MLFLOW_TRACKING_SERVER_ARN to be set (uses real MLflow).
DynamoDB is mocked via moto; MLflow calls pass through to real AWS via
moto's passthrough config for sagemaker and sts services.
"""

import os
import uuid
from collections.abc import Generator
from typing import Any, Callable

import boto3
import pytest
from awssolutions_gen_ai_evaluation_toolkit_python_client.api import DefaultApi  # type: ignore[attr-defined]
from awssolutions_gen_ai_evaluation_toolkit_python_client.models import (  # type: ignore[attr-defined]
    InlineTestCase,
)
from evaluator_api.eventbridge import init_eventbridge, reset_eventbridge
from evaluator_api.routes import init_aws
from moto import mock_aws
from moto.core.config import default_user_config

from evaluator_sdk import Evaluator

from ..helpers import make_sample_testcases
from .conftest import create_moto_tables

# Requires real MLflow credentials — excluded from CI via pytest marker
pytestmark = pytest.mark.mlflow

# Save real AWS credentials at module load time — BEFORE any autouse fixture
# overwrites them with moto fake values.
_REAL_AWS_ENV = {
    k: os.environ.get(k)
    for k in [
        "AWS_ACCESS_KEY_ID",
        "AWS_SECRET_ACCESS_KEY",
        "AWS_SESSION_TOKEN",
        "AWS_DEFAULT_REGION",
        "AWS_PROFILE",
        "AWS_DEFAULT_PROFILE",
    ]
}


@pytest.fixture(autouse=True)
def _reset_mlflow_client() -> Any:
    """Reset the cached MLflow client before/after each test."""
    from evaluator_api.mlflow_client import reset_mlflow_client

    reset_mlflow_client()
    yield
    reset_mlflow_client()


def _restore_real_aws_env() -> None:
    """Restore real AWS credentials from module-level snapshot."""
    for k, v in _REAL_AWS_ENV.items():
        if v is not None:
            os.environ[k] = v
        elif k in os.environ:
            del os.environ[k]


@pytest.fixture
def setup_handler(test_config: str) -> Generator[None, None, None]:
    """Override conftest's setup_handler: mocks DDB but passes through SageMaker/STS for MLflow.

    Uses moto's passthrough config to let sagemaker-mlflow-skinny authenticate
    with real AWS while DynamoDB and EventBridge stay mocked.
    """
    if test_config == "e2e":
        yield
        return

    # Configure moto to pass through SageMaker and STS calls (needed for MLflow auth)
    # and to NOT mock credentials (so real AWS profile creds are used for passthrough)
    original_passthrough = list(
        default_user_config.get("core", {}).get("passthrough", {}).get("services", [])
    )
    original_mock_creds = default_user_config.get("core", {}).get("mock_credentials", True)
    default_user_config["core"]["passthrough"]["services"] = ["sagemaker", "sts", "s3"]  # type: ignore[index]
    default_user_config["core"]["mock_credentials"] = False  # type: ignore[index]

    try:
        with mock_aws():
            # Restore real AWS credentials (overwritten by conftest's aws_credentials)
            _restore_real_aws_env()

            ddb = boto3.resource("dynamodb", region_name="us-east-1")
            create_moto_tables(ddb)

            events_client = boto3.client("events", region_name="us-east-1")
            events_client.create_event_bus(Name="test-bus")
            init_eventbridge(client=events_client, event_bus_name="test-bus")

            init_aws(ddb=ddb)
            yield
            init_aws(ddb=None)
            reset_eventbridge()
    finally:
        # Restore moto config
        default_user_config["core"]["passthrough"]["services"] = original_passthrough  # type: ignore[index]
        default_user_config["core"]["mock_credentials"] = original_mock_creds  # type: ignore[index]


class TestExperimentPipeline:
    """Full experiment pipeline: pre-processing + post-processing via real MLflow."""

    def test_evaluate_with_experiment_creates_mlflow_run(
        self,
        evaluator_factory: Callable[..., Evaluator],
        client: DefaultApi,
    ) -> None:
        """evaluate() with experiment_name creates MLflow experiment/run,
        then post-processing aggregates scores and logs metrics."""
        from evaluator_api.mlflow_client import get_mlflow_client
        from evaluator_api.routes import get_report_dao

        experiment_name = f"onebox-{uuid.uuid4().hex[:8]}"
        evaluator = evaluator_factory()

        resp = evaluator.evaluate(
            testcases=make_sample_testcases(),
            experiment_name=experiment_name,
        )

        assert resp.report_id
        assert resp.job_id

        # Verify job is in COMPLETED state (not yet COMPLETED)
        job_resp = client.get_evaluator_job(
            job_id=resp.job_id,
        )
        assert job_resp.status.value == "SUCCESS"

        # Verify MLflow experiment and run were created by pre-processing
        mlflow_client = get_mlflow_client()
        experiment = mlflow_client.get_experiment_by_name(experiment_name)
        assert experiment is not None, f"Experiment '{experiment_name}' not found in MLflow"

        runs = mlflow_client.search_runs(
            experiment_ids=[experiment.experiment_id],
            filter_string=f"attribute.run_name = '{resp.job_id}'",
        )
        assert len(runs) == 1, f"Expected 1 run, found {len(runs)}"
        run = runs[0]

        # Verify params logged during pre-processing
        assert run.data.params.get("etk.evaluator_name") == "test-eval"
        assert run.data.params.get("etk.job_id") == resp.job_id
        assert run.data.params.get("etk.report_id") == resp.report_id
        assert run.data.params.get("etk.job_type") == "FULL"

        # Simulate post-processing Lambda using the event payload
        from .conftest import simulate_post_processing

        simulate_post_processing({"jobId": resp.job_id, "evaluatorName": "test-eval", "reportId": resp.report_id})

        # Verify job transitioned to COMPLETED
        job_resp = client.get_evaluator_job(job_id=resp.job_id)
        assert job_resp.status.value == "SUCCESS"

        # Verify MLflow metrics were logged
        updated_run = mlflow_client.get_run(run.info.run_id)
        metrics = updated_run.data.metrics
        assert "exact_match_scorer_mean" in metrics, (
            f"Expected exact_match_scorer_mean in metrics, got: {list(metrics.keys())}"
        )
        assert "exact_match_scorer_count" in metrics
        assert metrics["exact_match_scorer_count"] == 2.0

        # Verify run was terminated with FINISHED status
        assert updated_run.info.status == "FINISHED"

        # Verify aggregated metrics stored on report
        report = get_report_dao().get(resp.report_id)
        assert report is not None
        assert report.aggregated_metrics is not None
        assert "exact_match_scorer" in report.aggregated_metrics

    def test_evaluate_without_experiment_still_aggregates(
        self,
        evaluator_factory: Callable[..., Evaluator],
        client: DefaultApi,
    ) -> None:
        """evaluate() without experiment_name still aggregates scores on the report."""
        from evaluator_api.routes import get_report_dao

        from .conftest import simulate_post_processing

        evaluator = evaluator_factory()

        resp = evaluator.evaluate(testcases=make_sample_testcases())

        job_resp = client.get_evaluator_job(job_id=resp.job_id)
        assert job_resp.status.value == "SUCCESS"

        simulate_post_processing({"jobId": resp.job_id, "evaluatorName": "test-eval", "reportId": resp.report_id})

        job_resp = client.get_evaluator_job(job_id=resp.job_id)
        assert job_resp.status.value == "SUCCESS"

        report = get_report_dao().get(resp.report_id)
        assert report is not None
        assert report.aggregated_metrics is not None
        assert "exact_match_scorer" in report.aggregated_metrics

    def test_experiment_with_mixed_scores(
        self,
        evaluator_factory: Callable[..., Evaluator],
        client: DefaultApi,
    ) -> None:
        """Verify aggregation with different score values (one match, one mismatch)."""
        from evaluator_api.mlflow_client import get_mlflow_client

        experiment_name = f"onebox-mixed-{uuid.uuid4().hex[:8]}"
        evaluator = evaluator_factory()

        testcases = [
            InlineTestCase(input={"question": "What is 2+2?"}, expected={"answer": "4"}),
            InlineTestCase(input={"question": "What is 3+3?"}, expected={"answer": "6"}),
        ]

        resp = evaluator.evaluate(testcases=testcases, experiment_name=experiment_name)

        # Run post-processing via event payload
        from .conftest import simulate_post_processing

        simulate_post_processing({"jobId": resp.job_id, "evaluatorName": "test-eval", "reportId": resp.report_id})

        # Check aggregated metrics
        mlflow_client = get_mlflow_client()
        experiment = mlflow_client.get_experiment_by_name(experiment_name)
        assert experiment is not None

        runs = mlflow_client.search_runs(
            experiment_ids=[experiment.experiment_id],
            filter_string=f"attribute.run_name = '{resp.job_id}'",
        )
        assert len(runs) == 1
        metrics = mlflow_client.get_run(runs[0].info.run_id).data.metrics

        # simple_app always returns {"answer": "4"}
        # First testcase expected {"answer": "4"} -> match -> 1.0
        # Second testcase expected {"answer": "6"} -> mismatch -> 0.0
        assert metrics["exact_match_scorer_mean"] == 0.5
        assert metrics["exact_match_scorer_count"] == 2.0
        assert metrics["exact_match_scorer_min"] == 0.0
        assert metrics["exact_match_scorer_max"] == 1.0
