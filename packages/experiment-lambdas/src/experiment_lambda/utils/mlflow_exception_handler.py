from logging import getLogger
from typing import Optional

from mlflow.protos.databricks_pb2 import (
    ALREADY_EXISTS,
    BAD_REQUEST,
    CUSTOMER_UNAUTHORIZED,
    INVALID_PARAMETER_VALUE,
    INVALID_STATE,
    NOT_FOUND,
    PERMISSION_DENIED,
    REQUEST_LIMIT_EXCEEDED,
    RESOURCE_ALREADY_EXISTS,
    RESOURCE_CONFLICT,
    RESOURCE_DOES_NOT_EXIST,
    RESOURCE_EXHAUSTED,
    UNAUTHENTICATED,
    ErrorCode,
)

from experiment_lambda.api.utils.api_models import (
    ConflictException,
    GenAiEtkException,
    InternalServerException,
    ResourceNotFoundException,
    ThrottlingException,
    UnauthorizedException,
    ValidationException,
)
from experiment_lambda.protocols import MlflowException

logger = getLogger(__name__)


def name_of(error_code: int) -> str:
    # mlflow just hates proper typing:
    return ErrorCode.Name(error_code)  # type: ignore


def map_domain_exception(
    exception: MlflowException,
    experiment_id: Optional[str] = None,
    experiment_name: Optional[str] = None,
) -> GenAiEtkException:
    """
    Map MLflow exceptions to domain-specific exceptions.

    Args:
        exception: The MLflow exception to handle
        experiment_id: The requested experiment id
        experiment_name: The requested experiment name

    Returns:
        A domain-specific exception
    """
    error_msg = str(exception)
    logger.error(f"MLflow exception: {error_msg}")

    # Handle based on error code
    error_code_name = exception.error_code

    if error_code_name in (
        name_of(ALREADY_EXISTS),
        name_of(RESOURCE_ALREADY_EXISTS),
        name_of(RESOURCE_CONFLICT),
    ):
        if experiment_name:
            return ConflictException(f"Experiment with name '{experiment_name}' already exists")
        if experiment_id:
            return ConflictException(f"Experiment with id '{experiment_id}' already exists")
        return ConflictException(f"Resource conflict in MLflow: {error_msg}")

    if error_code_name in (name_of(NOT_FOUND), name_of(RESOURCE_DOES_NOT_EXIST)):
        if experiment_name:
            return ResourceNotFoundException(f"Experiment with name '{experiment_name}' not found")
        if experiment_id:
            return ResourceNotFoundException(f"Experiment with id '{experiment_id}' not found")
        return ResourceNotFoundException(f"Resource not found in Mlflow: {error_msg}")

    if error_code_name in (
        name_of(BAD_REQUEST),
        name_of(INVALID_PARAMETER_VALUE),
        name_of(INVALID_STATE),
    ):
        return ValidationException(f"Invalid request: {error_msg}")

    if error_code_name in (
        name_of(UNAUTHENTICATED),
        name_of(PERMISSION_DENIED),
        name_of(CUSTOMER_UNAUTHORIZED),
    ):
        return UnauthorizedException(f"Unauthorized access to MLflow server: {error_msg}")

    if error_code_name in (name_of(REQUEST_LIMIT_EXCEEDED), name_of(RESOURCE_EXHAUSTED)):
        return ThrottlingException(f"MLflow request throttled: {error_msg}")

    return InternalServerException(f"Error in MLflow operation: {error_msg}")
