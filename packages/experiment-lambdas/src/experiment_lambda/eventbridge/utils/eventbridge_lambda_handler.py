from datetime import datetime
from json import JSONEncoder, dumps
from logging import getLogger
from typing import Any, Callable, Tuple, Type, TypeVar, cast

from pydantic import BaseModel, ValidationError

from experiment_lambda.api.utils.api_models import (
    GenAiEtkException,
    InternalServerException,
    ResourceNotFoundException,
    ThrottlingException,
    UnauthorizedException,
    ValidationException,
)

logger = getLogger(__name__)


# Custom JSON encoder to handle datetime objects
class DateTimeEncoder(JSONEncoder):
    def default(self, o: Any) -> Any:
        if isinstance(o, datetime):
            return o.isoformat()
        return super().default(o)


InputModel = TypeVar("InputModel", bound=BaseModel)
OutputModel = TypeVar("OutputModel", bound=BaseModel)


def _extract_detail_from_event(event: dict[str, Any]) -> dict[str, Any]:
    """
    Extract the 'detail' field from an EventBridge event.

    EventBridge events follow a standard format where the actual payload
    is contained in the 'detail' field of the event.

    Args:
        event: The EventBridge event

    Returns:
        The event detail as a dictionary
    """
    # If the event has a detail field, extract it
    if "detail" in event and isinstance(event["detail"], dict):
        return cast(dict[str, Any], event["detail"])

    # Otherwise, return the event itself (fallback case)
    return event


def _extract_status_code(return_dict: dict[str, Any]) -> Tuple[int, dict[str, Any]]:
    """
    Extract the status code from the return dictionary if present.

    Args:
        return_dict: The dictionary to extract the status code from

    Returns:
        A tuple containing the status code and the modified dictionary
    """
    status_code: int = 200
    result_dict = return_dict.copy()

    if "status_code" in result_dict:
        status_code_value = result_dict.pop("status_code")
        if isinstance(status_code_value, int):
            status_code = status_code_value

    return status_code, result_dict


def response(obj: Any, status_code: int) -> dict[str, Any]:
    """
    Create a standardized response for EventBridge.

    For EventBridge Lambda functions:
    - 2xx status codes indicate success (event will be considered processed)
    - non-2xx status codes indicate failure (event may be retried or sent to DLQ)

    Args:
        obj: The object to be included in the response
        status_code: The HTTP status code for the response

    Returns:
        An object representing the response
    """
    return {"statusCode": status_code, "body": dumps(obj, cls=DateTimeEncoder)}


def create_eventbridge_lambda_handler(
    input_model: Type[InputModel],
    output_model: Type[OutputModel],
    operation: Callable[[InputModel], OutputModel],
) -> Callable[[dict[str, Any], Any], dict[str, Any]]:
    """
    Creates a Lambda handler function that processes EventBridge events.

    This function returns a handler that:
    1. Extracts and validates event data using the input model
    2. Calls the handler function with validated data
    3. Formats the response with proper status codes
    4. Handles exceptions with appropriate error responses

    Args:
        input_model: Pydantic model class to validate the input event with
        output_model: Pydantic model class to validate the output with
        operation: The function to call with validated input

    Returns:
        A Lambda handler function that takes an event and context
    """

    def handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
        return process_eventbridge_lambda_event(
            name=operation.__name__,
            input_model=input_model,
            output_model=output_model,
            operation=operation,
            event=event,
        )

    return handler


def process_eventbridge_lambda_event(
    name: str,
    input_model: Type[InputModel],
    output_model: Type[OutputModel],
    operation: Callable[[InputModel], OutputModel],
    event: dict[str, Any],
) -> dict[str, Any]:
    """
    Process an EventBridge Lambda event with standard validation and error handling.

    This function:
    1. Logs lambda invocation
    2. Extracts the detail from the event
    3. Validates input using a Pydantic model
    4. Invokes the handler function
    5. Validates output using a Pydantic model
    6. Wraps the return value in a standard response format
    7. Handles exceptions with appropriate error responses

    Args:
        name: Name of the lambda (for logging)
        input_model: Pydantic model class to validate the input event with
        output_model: Pydantic model class to validate the output with
        operation: The function to call with validated input
        event: The EventBridge event
        context: The Lambda context

    Returns:
        A dictionary with the Lambda response
    """
    # Do not log the raw event or validated payload: EventBridge details may carry
    # sensitive evaluation data (prompts, expected outputs, model config). Log only
    # non-sensitive event metadata.
    logger.info(
        f"Invoked {name} lambda",
        extra={
            "detail_type": event.get("detail-type"),
            "source": event.get("source"),
            "event_id": event.get("id"),
        },
    )

    try:
        # Extract the detail from the event
        detail_to_validate = _extract_detail_from_event(event)

        # Validate using the provided input model
        payload = input_model.model_validate(detail_to_validate)

        logger.info(f"EventBridge payload parsed and validated (type={input_model.__name__})")

        # Call the handler function with the validated payload
        return_value = operation(payload)

        logger.info("Handler successfully invoked.")

        # Convert the return value to a dictionary
        return_dict = return_value.model_dump()

        # Extract status code if provided
        status_code, return_dict = _extract_status_code(return_dict)

        # Return the response
        return response(return_dict, status_code)

    except ValidationError as ve:
        logger.exception(ve.errors(include_url=False))
        return response({"error": "ValidationException", "message": str(ve)}, 400)
    except ValidationException as ve:
        logger.exception(str(ve))
        return response({"error": "ValidationException", "message": ve.message}, ve.status_code)
    except ResourceNotFoundException as re:
        logger.exception(str(re))
        return response({"error": "ResourceNotFoundException", "message": re.message}, re.status_code)
    except UnauthorizedException as ue:
        logger.exception(str(ue))
        return response({"error": "UnauthorizedException", "message": ue.message}, ue.status_code)
    except ThrottlingException as te:
        logger.exception(str(te))
        return response({"error": "ThrottlingException", "message": te.message}, te.status_code)
    except InternalServerException as ie:
        logger.exception(str(ie))
        return response({"error": "InternalServerException", "message": ie.message}, ie.status_code)
    except GenAiEtkException as ce:
        logger.exception(str(ce))
        return response({"error": ce.error_code, "message": ce.message}, ce.status_code)
    except Exception as e:
        logger.exception(str(e))
        return response(
            {"error": "InternalServerException", "message": "An internal server error occurred"},
            500,
        )
