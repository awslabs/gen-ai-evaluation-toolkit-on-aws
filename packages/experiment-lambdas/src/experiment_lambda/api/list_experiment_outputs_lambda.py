from experiment_lambda.api.utils.api_gw_lambda_handler import (
    create_api_gw_lambda_handler,
)
from experiment_lambda.api.utils.api_models import (
    ListExperimentOutputsRequest,
    ListExperimentOutputsResponse,
    ValidationException,
)
from experiment_lambda.api.utils.experiment_outputs_service import (
    aggregate_runs_by_version,
    fetch_experiment_runs,
    get_experiment_id,
)


def list_experiment_outputs(request: ListExperimentOutputsRequest) -> ListExperimentOutputsResponse:
    """
    Lambda handler for tracing experiment outputs.

    Args:
        event: ListExperimentOutputsRequest
        context: Lambda context

    Returns:
        ExperimentOutputList with experiment outputs
    """
    if request.startVersion > request.endVersion:
        raise ValidationException("startVersion must be less than or equal to endVersion")

    experiment_id = get_experiment_id(request.name)
    runs_paged = fetch_experiment_runs(request)

    configurations = aggregate_runs_by_version(runs_paged)
    config_list = [config for _, config in sorted(configurations.items())]

    return ListExperimentOutputsResponse(
        id=experiment_id,
        outputs=config_list,
        hasMore=bool(runs_paged.token),
        nextToken=runs_paged.token,
    )


handler = create_api_gw_lambda_handler(
    input_model=ListExperimentOutputsRequest,
    output_model=ListExperimentOutputsResponse,
    operation=list_experiment_outputs,
)
