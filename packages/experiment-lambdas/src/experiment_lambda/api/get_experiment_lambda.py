from logging import getLogger

from experiment_lambda.api.list_experiments_lambda import map_experiment
from experiment_lambda.api.utils.api_gw_lambda_handler import (
    create_api_gw_lambda_handler,
)
from experiment_lambda.api.utils.api_models import (
    GetExperimentRequest,
    GetExperimentResponse,
    ResourceNotFoundException,
)
from experiment_lambda.utils.mlflow_client import get_mlflow_client

logger = getLogger(__name__)


def get_experiment(request: GetExperimentRequest) -> GetExperimentResponse:
    experiment_name = request.name

    logger.info(f"Getting experiment with Name {experiment_name}")

    client = get_mlflow_client()

    mlflow_experiment = client.get_experiment_by_name(name=request.name)
    if not mlflow_experiment:
        raise ResourceNotFoundException(f"Experiment with Name '{request.name}' not found")

    logger.info(f"Successfully retrieved experiment with Name {request.name}")

    experiment = map_experiment(mlflow_experiment)

    return GetExperimentResponse(**experiment.model_dump())


handler = create_api_gw_lambda_handler(
    input_model=GetExperimentRequest, output_model=GetExperimentResponse, operation=get_experiment
)
