from logging import getLogger
from typing import Optional

from experiment_lambda.api.utils.api_gw_lambda_handler import (
    create_api_gw_lambda_handler,
)
from experiment_lambda.api.utils.api_models import (
    ListExperimentsRequest,
    ListExperimentsResponse,
    ValidationException,
)
from experiment_lambda.api.utils.mapper import (
    map_experiment,
    map_view_type,
)
from experiment_lambda.utils.mlflow_client import get_mlflow_client

logger = getLogger(__name__)

# Security note: filter_expr and order_by are user-controlled inputs forwarded
# to SageMaker MLflow's search_experiments API. We delegate input validation to
# MLflow's own parser, which rejects invalid syntax with clear error messages.
# Access is gated by IAM (sagemaker-mlflow:SearchExperiments) and the API
# Gateway authoriser. Input is length-capped below to guard against pathological
# parsing. We intentionally do NOT maintain a grammar validator here — a shadow
# parser would drift from MLflow's actual grammar over time and create ongoing
# maintenance without meaningful security benefit.
_MAX_FILTER_LEN = 1024
_MAX_ORDER_BY_ITEMS = 8
_MAX_ORDER_BY_LEN = 128


def _validate_filter_expr(filter_expr: Optional[str]) -> Optional[str]:
    """Length-cap the MLflow filter_string before forwarding to the client."""
    if filter_expr is None:
        return None
    if not isinstance(filter_expr, str):
        raise ValidationException("filter must be a string")
    if filter_expr.strip() == "":
        return None
    if len(filter_expr) > _MAX_FILTER_LEN:
        raise ValidationException(
            f"filter exceeds maximum length of {_MAX_FILTER_LEN} characters"
        )
    return filter_expr


def _validate_order_by(order_by: Optional[list[str]]) -> Optional[list[str]]:
    """Length-cap the MLflow order_by list before forwarding to the client."""
    if order_by is None:
        return None
    if not isinstance(order_by, list):
        raise ValidationException("orderBy must be a list of strings")
    if len(order_by) > _MAX_ORDER_BY_ITEMS:
        raise ValidationException(
            f"orderBy supports at most {_MAX_ORDER_BY_ITEMS} entries"
        )
    for item in order_by:
        if not isinstance(item, str):
            raise ValidationException("orderBy entries must be strings")
        if len(item) > _MAX_ORDER_BY_LEN:
            raise ValidationException(
                f"orderBy entry exceeds maximum length of {_MAX_ORDER_BY_LEN}"
            )
    return order_by


def list_experiments(request: ListExperimentsRequest) -> ListExperimentsResponse:
    """
    Lambda handler to list MLflow experiments.

    Args:
        request: Validated ListExperimentsRequest
        context: Lambda context

    Returns:
        ListExperimentsResponse with list of experiments
    """
    filter_expr = _validate_filter_expr(request.filter)
    order_by = _validate_order_by(request.orderBy)
    view_type = request.viewType
    max_results = request.maxResults
    next_token = request.nextToken

    logger.info(
        "Listing experiments with the following parameters: "
        f"filter={filter_expr}, "
        f"view_type={view_type}, "
        f"max_results={max_results}, "
        f"next_token={next_token}"
    )

    client = get_mlflow_client()

    mlflow_view_type = map_view_type(view_type)

    search_result = client.search_experiments(
        filter_string=filter_expr,
        order_by=order_by,
        view_type=mlflow_view_type,
        page_token=next_token,
        max_results=max_results,
    )

    next_token_value: Optional[str] = search_result.token

    experiments = [map_experiment(dto) for dto in search_result]

    logger.info(f"Successfully retrieved {len(experiments)} experiments")

    return ListExperimentsResponse(experiments=experiments, nextToken=next_token_value)


handler = create_api_gw_lambda_handler(
    input_model=ListExperimentsRequest,
    output_model=ListExperimentsResponse,
    operation=list_experiments,
)
