from logging import getLogger

from experiment_lambda.api.get_experiment_lambda import get_experiment
from experiment_lambda.api.utils.api_gw_lambda_handler import (
    create_api_gw_lambda_handler,
)
from experiment_lambda.api.utils.api_models import (
    CreateExperimentRequest,
    CreateExperimentResponse,
    GetExperimentRequest,
)
from experiment_lambda.protocols import MlflowTagIds
from experiment_lambda.utils.mlflow_client import get_mlflow_client

logger = getLogger(__name__)


def create_experiment(request: CreateExperimentRequest) -> CreateExperimentResponse:
    """
    Lambda handler to create an MLflow experiment.

    Args:
        request: Validated CreateExperimentRequest
        context: Lambda context

    Returns:
        CreateExperimentResponse with experiment details
    """
    experiment_name = request.name
    experiment_description = request.description

    logger.info(f"Creating experiment with name {experiment_name}")

    client = get_mlflow_client()

    # Create the experiment with optional description as tags
    tags = {MlflowTagIds.experiment_description: experiment_description} if experiment_description else None

    experiment_id = client.create_experiment(name=experiment_name, tags=tags)

    logger.info(f"Experiment created successfully with identifier {experiment_id} and name {experiment_name}")

    get_experiment_response = get_experiment(GetExperimentRequest(name=experiment_name))

    return CreateExperimentResponse(**get_experiment_response.model_dump())


handler = create_api_gw_lambda_handler(
    input_model=CreateExperimentRequest,
    output_model=CreateExperimentResponse,
    operation=create_experiment,
)
