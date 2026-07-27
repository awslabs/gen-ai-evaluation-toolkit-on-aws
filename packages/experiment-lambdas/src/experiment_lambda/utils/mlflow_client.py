from logging import getLogger
from os import environ
from typing import Any, Optional, cast

from mlflow import set_tracking_uri
from mlflow.exceptions import MlflowException as UntypedMlflowException
from mlflow.tracking import MlflowClient as UntypedMlflowClient

from experiment_lambda.protocols import MlflowClient, MlflowException
from experiment_lambda.utils.mlflow_exception_handler import map_domain_exception

# Module-level cache for MLflow client to avoid recreation during lambda warm starts
_mlflow_client: Optional[MlflowClient] = None

logger = getLogger(__name__)


class MlflowClientWithExceptionHandling:
    """
    Wrapper that automatically applies exception handling to all MLflow client methods.

    This is usually an anti-pattern and the logic should remain slim.
    The point is that generic exception handling is usually not possible:
    Exception handling is defined by the caller not the callee.
    However, in this case - as we are just proxying from our own calls to mlflow calls -
    the exceptions remain the same when entering our domain. E.g.:
    - mlflow experiment id not found exception always yields a ResourceNotFoundException
    - mlflow unauthorized exception always yields an UnauthorizedException

    Once this is not the case anymore this exception handler should be removed.

    The advantage is that business code can remain free of try/except blocks with repeated
    Exception handling code.
    """

    def __init__(self) -> None:
        tracking_server_arn = environ.get("MLFLOW_TRACKING_SERVER_ARN")
        if not tracking_server_arn:
            raise KeyError("MLFLOW_TRACKING_SERVER_ARN environment variable is not set")

        logger.info(f"Create new mlflow client with tracking url {tracking_server_arn}")

        # For whatever reason providing the tracking server arn to the ctor of UntypedMlflowClient
        # throws a runtime error "list index out of range" on e.g. searchExperiments while parsing
        # the arn. Engineering par excellence!
        # It doesn't hurt to set it here globally, though, as the tracking server does not change
        # during the lifetime of a lambda and we cache the client anyway:
        set_tracking_uri(tracking_server_arn)

        # Create the underlying client
        self._client = cast(MlflowClient, UntypedMlflowClient())

    def __getattr__(self, name: str) -> Any:
        """
        Intercept all method/attribute access and automatically wrap callable methods
        with exception handling.
        """
        attr = getattr(self._client, name)

        if callable(attr):

            def wrapped_method(*args: Any, **kwargs: Any) -> Any:
                try:
                    return attr(*args, **kwargs)
                except UntypedMlflowException as e:
                    experiment_id = cast(str | None, kwargs.get("experiment_id"))
                    experiment_name = cast(str | None, kwargs.get("name"))

                    if "experiment_ids" in kwargs and isinstance(kwargs["experiment_ids"], list):
                        experiment_ids_list = cast(list[str] | None, kwargs.get("experiment_ids"))
                        if experiment_ids_list:
                            experiment_id = experiment_ids_list[0]

                    # Cast to MlflowException for the handler
                    mlflow_exception = cast(MlflowException, e)
                    raise map_domain_exception(mlflow_exception, experiment_id, experiment_name) from e

            return wrapped_method
        return attr


def get_mlflow_client() -> MlflowClient:
    """
    Returns a configured MlflowClient instance with automatic exception handling.

    The client instance is cached at module level to avoid recreation during lambda warm starts.

    Returns:
        MlflowClient: A type-safe, configured MlflowClient instance with automatic exception
        handling
    """
    global _mlflow_client

    if _mlflow_client is not None:
        return _mlflow_client

    # Return wrapped client with automatic exception handling
    _mlflow_client = cast(MlflowClient, MlflowClientWithExceptionHandling())
    return _mlflow_client
