import re
from logging import getLogger

from experiment_lambda.eventbridge.utils.eventbridge_lambda_handler import (
    create_eventbridge_lambda_handler,
)
from experiment_lambda.eventbridge.utils.eventbridge_models import (
    EmptyResponse,
    MetricsReportingDetail,
    ResourceNotFoundException,
)
from experiment_lambda.utils.mlflow_client import get_mlflow_client

logger = getLogger(__name__)


def sanitize_metric_name(name: str) -> str:
    """Sanitize metric name to comply with MLflow naming rules.

    MLflow allows: alphanumerics, underscores (_), dashes (-), periods (.),
    spaces ( ), colons (:), and slashes (/).

    Args:
        name: Original metric name

    Returns:
        Sanitized metric name
    """
    # Remove mode= prefix from parentheses content
    sanitized = re.sub(r"\(mode=([^)]+)\)", r"_\1", name)
    # Replace remaining invalid characters with underscores
    sanitized = re.sub(r"[^a-zA-Z0-9_\-.: /]", "_", sanitized)
    # Collapse multiple underscores into one
    sanitized = re.sub(r"_+", "_", sanitized)
    return sanitized


def report_metrics(detail: MetricsReportingDetail) -> EmptyResponse:
    """
    Lambda handler to report metrics for an MLflow experiment run.

    Args:
        detail: Details of the metrics reporting event
        context: Lambda context

    Returns:
        Response with status code and run details
    """
    logger.info(f"Metric Reporting for experimentName {detail.experimentName} and runId {detail.runId}")

    client = get_mlflow_client()

    experiment = client.get_experiment_by_name(detail.experimentName)
    if not experiment:
        raise ResourceNotFoundException(f"Experiment '{detail.experimentName}' not found")

    runs = client.search_runs(
        experiment_ids=[experiment.experiment_id],
        filter_string=f"attribute.run_name = '{detail.runId}'",
    )

    if not runs:
        raise ResourceNotFoundException(f"No run found with name '{detail.runId}'")

    # Get the first run
    mlflow_run = runs[0]
    run_id = mlflow_run.info.run_id

    for metric in detail.aggregatedMetrics:
        sanitized_key = sanitize_metric_name(metric.metricId)
        client.log_metric(run_id=run_id, key=sanitized_key, value=metric.score)

    logger.info(
        f"Metric Reporting for experimentName {detail.experimentName} and runId {detail.runId} completed successfully"
    )

    # Set the run as terminated
    client.set_terminated(run_id)

    return EmptyResponse()


handler = create_eventbridge_lambda_handler(
    input_model=MetricsReportingDetail, output_model=EmptyResponse, operation=report_metrics
)
