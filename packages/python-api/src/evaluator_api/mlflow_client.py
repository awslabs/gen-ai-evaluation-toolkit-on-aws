"""MLflow client wrapper for the Evaluator API.

Provides experiment/run lifecycle operations against SageMaker MLflow.
Uses mlflow-skinny == 2.13.2 and sagemaker-mlflow-skinny == 0.1.1
to match the experiment-logger package versions exactly.
"""

import os
from logging import getLogger
from typing import Optional

from mlflow import set_tracking_uri
from mlflow.entities import Experiment, Run
from mlflow.tracking import MlflowClient

logger = getLogger(__name__)

_client: Optional[MlflowClient] = None


def get_mlflow_client() -> MlflowClient:
    """Get configured MLflow client with tracking URI set from environment."""
    global _client
    if _client is None:
        tracking_server_arn = os.environ["MLFLOW_TRACKING_SERVER_ARN"]
        set_tracking_uri(tracking_server_arn)
        _client = MlflowClient()
    return _client


def reset_mlflow_client() -> None:
    """Reset the cached client (for testing)."""
    global _client
    _client = None


def get_or_create_experiment(experiment_name: str) -> Experiment:
    """Get an experiment by name, creating it if it doesn't exist."""
    client = get_mlflow_client()
    experiment = client.get_experiment_by_name(experiment_name)
    if experiment:
        logger.info("Found existing experiment '%s' (id=%s)", experiment_name, experiment.experiment_id)
        return experiment

    experiment_id = client.create_experiment(experiment_name)
    logger.info("Created experiment '%s' (id=%s)", experiment_name, experiment_id)
    experiment = client.get_experiment(experiment_id)
    if not experiment:
        raise RuntimeError(f"Failed to retrieve newly created experiment '{experiment_name}'")
    return experiment


def create_run(experiment_id: str, run_name: str) -> Run:
    """Create a new run within an experiment."""
    client = get_mlflow_client()
    run = client.create_run(experiment_id=experiment_id, run_name=run_name)
    logger.info("Created run '%s' (id=%s) in experiment %s", run_name, run.info.run_id, experiment_id)
    return run


def find_run_by_name(experiment_id: str, run_name: str) -> str:
    """Find a run by name within an experiment. Returns run_id.

    If multiple runs exist with the same name (e.g. from EventBridge
    at-least-once delivery duplicates), returns the most recent one.
    """
    client = get_mlflow_client()
    runs = client.search_runs(
        experiment_ids=[experiment_id],
        filter_string=f"attribute.run_name = '{run_name}'",
    )
    if not runs:
        raise ValueError(f"No run found with name '{run_name}' in experiment {experiment_id}")
    if len(runs) > 1:
        logger.warning("Found %d runs with name '%s' — using most recent", len(runs), run_name)
    return str(runs[0].info.run_id)


def log_params(run_id: str, params: dict[str, str]) -> None:
    """Log parameters to a run."""
    client = get_mlflow_client()
    for key, value in params.items():
        client.log_param(run_id, key, value)
    logger.info("Logged %d params to run %s", len(params), run_id)


def log_metrics(run_id: str, metrics: dict[str, float]) -> None:
    """Log metrics to a run."""
    client = get_mlflow_client()
    for key, value in metrics.items():
        client.log_metric(run_id, key, value)
    logger.info("Logged %d metrics to run %s", len(metrics), run_id)


def log_artifact(run_id: str, local_path: str, artifact_path: str) -> None:
    """Log a local file as an artifact of a run."""
    client = get_mlflow_client()
    client.log_artifact(run_id, local_path, artifact_path)
    logger.info("Logged artifact %s → %s for run %s", local_path, artifact_path, run_id)


def terminate_run(run_id: str, status: str = "FINISHED") -> None:
    """Terminate a run with a given status (FINISHED or FAILED)."""
    client = get_mlflow_client()
    client.set_terminated(run_id, status)
    logger.info("Terminated run %s with status %s", run_id, status)
