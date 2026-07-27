from logging import getLogger

from experiment_lambda.api.get_experiment_lambda import get_experiment
from experiment_lambda.api.utils.api_gw_lambda_handler import (
    create_api_gw_lambda_handler,
)
from experiment_lambda.api.utils.api_models import (
    GetExperimentRequest,
    ResourceNotFoundException,
    UpdateExperimentRequest,
    UpdateExperimentResponse,
)
from experiment_lambda.protocols import MlflowTagIds
from experiment_lambda.utils.mlflow_client import get_mlflow_client

logger = getLogger(__name__)


def update_experiment(request: UpdateExperimentRequest) -> UpdateExperimentResponse:
    """
    Lambda handler to update an MLflow experiment.

    Args:
        request: Validated UpdateExperimentRequest
        context: Lambda context

    Returns:
        UpdateExperimentResponse with updated experiment details
    """

    experiment_name = request.name
    new_name = request.newName
    new_description = request.description

    logger.info(f"Updating experiment with name {experiment_name}")

    client = get_mlflow_client()

    # First check if the experiment exists
    mlflow_experiment = client.get_experiment_by_name(experiment_name)
    if not mlflow_experiment:
        raise ResourceNotFoundException(f"Experiment with Name '{experiment_name}' not found")

    if new_name is not None:
        client.rename_experiment(experiment_id=mlflow_experiment.experiment_id, new_name=new_name)

    # Update description if provided
    if new_description is not None:
        client.set_experiment_tag(
            experiment_id=mlflow_experiment.experiment_id,
            key=MlflowTagIds.experiment_description,
            value=new_description,
        )

    logger.info(f"Successfully updated experiment {mlflow_experiment.experiment_id}")

    get_experiment_response = get_experiment(GetExperimentRequest(name=new_name if new_name else request.name))
    return UpdateExperimentResponse(**get_experiment_response.model_dump())


handler = create_api_gw_lambda_handler(
    input_model=UpdateExperimentRequest,
    output_model=UpdateExperimentResponse,
    operation=update_experiment,
)
