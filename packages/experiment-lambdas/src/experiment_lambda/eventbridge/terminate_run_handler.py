from logging import getLogger

from experiment_lambda.eventbridge.utils.eventbridge_lambda_handler import (
    create_eventbridge_lambda_handler,
)
from experiment_lambda.eventbridge.utils.eventbridge_models import (
    EmptyResponse,
    ResourceNotFoundException,
    TerminateRunDetail,
)
from experiment_lambda.protocols import MlflowRunStatus
from experiment_lambda.utils.mlflow_client import get_mlflow_client

logger = getLogger(__name__)


def terminate_run(detail: TerminateRunDetail) -> EmptyResponse:
    """
    Lambda handler to terminate an MLflow experiment run with Failed Status.

     Args:
         detail: Lambda event containing experiment and run details
         context: Lambda context

     Returns:
         Response with status code and run details
    """
    logger.info(f"Terminating runId {detail.runId} for experimentName {detail.experimentName} ")

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
    if len(runs) != 1:
        raise ValueError(f"Expected exactly 1 run with name '{detail.runId}', but found {len(runs)} runs")

    run_id = runs[0].info.run_id

    # Set the run as terminated
    client.set_terminated(run_id, MlflowRunStatus.FAILED.name)
    logger.info(
        f"Run terminated with Failed Status: Experiment {detail.experimentName} and runId {detail.runId} failed"
    )

    return EmptyResponse()


handler = create_eventbridge_lambda_handler(
    input_model=TerminateRunDetail, output_model=EmptyResponse, operation=terminate_run
)
