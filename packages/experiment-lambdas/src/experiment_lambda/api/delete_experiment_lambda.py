from logging import getLogger

from experiment_lambda.api.utils.api_gw_lambda_handler import (
    create_api_gw_lambda_handler,
)
from experiment_lambda.api.utils.api_models import (
    DeleteExperimentRequest,
    EmptyResponse,
)
from experiment_lambda.utils.mlflow_client import get_mlflow_client

logger = getLogger(__name__)


def delete_experiment(request: DeleteExperimentRequest) -> EmptyResponse:
    """
    Lambda handler to delete an MLflow experiment.

    Args:
        request: Validated DeleteExperimentRequest
        context: Lambda context

    Returns:
        EmptyResponse (204 No Content response)
    """
    experiment_name = request.name

    logger.info(f"Deleting experiment with Name {experiment_name}")

    client = get_mlflow_client()

    mlflow_experiment = client.get_experiment_by_name(name=request.name)
    if mlflow_experiment is None:
        logger.info(f"Experiment {experiment_name} already deleted or never existed")
        return EmptyResponse()

    client.delete_experiment(experiment_id=mlflow_experiment.experiment_id)

    logger.info(f"Experiment {experiment_name} deleted successfully")

    return EmptyResponse()


handler = create_api_gw_lambda_handler(
    input_model=DeleteExperimentRequest, output_model=EmptyResponse, operation=delete_experiment
)
