"""
This handler acts as a wrapper for API GW calls with validation layer.
Ideally, it is replaced by a similar implementation through Smithy codegen
"""

from datetime import datetime
from json import JSONDecodeError, JSONEncoder, dumps, loads
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


def _extract_body_from_event(event: dict[str, Any]) -> dict[str, Any]:
    """
    Extract and parse the body from an API Gateway event.

    Args:
        event: The API Gateway event

    Returns:
        The parsed body as a dictionary
    """
    # Start with an empty dict to build up
    result: dict[str, Any] = {}

    # Add path parameters to the result
    if "pathParameters" in event and isinstance(event["pathParameters"], dict):
        path_params = cast(dict[str, str], event["pathParameters"])
        result.update(path_params)

    # Add query parameters to the result
    if "queryStringParameters" in event and isinstance(event["queryStringParameters"], dict):
        query_params = cast(dict[str, str], event["queryStringParameters"])
        result.update(query_params)

    # Add body parameters to the result
    if "body" in event and isinstance(event["body"], str):
        body_content = loads(event["body"])
        if isinstance(body_content, dict):
            body_dict = cast(dict[str, Any], body_content)
            # Merge body content with result
            result.update(body_dict)
            return result

    # If we've extracted pathParameters but have no body, return what we have
    if result:
        return result

    # Use the event itself as the data if no body or pathParameters
    return event


def _convert_return_value_to_dict(return_value: Any) -> dict[str, Any]:
    """
    Convert the return value to a dictionary for JSON serialization.

    Args:
        return_value: The return value from the handler function

    Returns:
        A dictionary representation of the return value
    """
    if isinstance(return_value, BaseModel):
        return return_value.model_dump()
    elif isinstance(return_value, dict):
        return cast(dict[str, Any], return_value)
    else:
        return {"result": return_value}


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
    Create a standardized response.

    Args:
        obj: The object to be included in the response
        status_code: The HTTP status code for the response

    Returns:
        An object representing the response
    """
    return {"statusCode": status_code, "body": dumps(obj, cls=DateTimeEncoder)}


def create_api_gw_lambda_handler(
    input_model: Type[InputModel],
    output_model: Type[OutputModel],
    operation: Callable[[InputModel], OutputModel],
) -> Callable[[dict[str, Any], Any], dict[str, Any]]:
    """
    Creates a Lambda handler function that processes API Gateway events.

    This function returns a handler that:
    1. Extracts and validates request data using the input model
    2. Calls the handler function with validated data
    3. Formats the response with proper status codes
    4. Handles exceptions with appropriate error responses

    Args:
        name: Name of the lambda (for logging)
        input_model: Pydantic model class to validate the input event with
        output_model: Pydantic model class to validate the output with
        handler_func: The function to call with validated input

    Returns:
        A Lambda handler function that takes an event and context
    """

    def handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
        return process_api_gw_lambda_event(
            name=operation.__name__,
            input_model=input_model,
            output_model=output_model,
            operation=operation,
            event=event,
        )

    return handler


def process_api_gw_lambda_event(
    name: str,
    input_model: Type[InputModel],
    output_model: Type[OutputModel],
    operation: Callable[[InputModel], OutputModel],
    event: dict[str, Any],
) -> dict[str, Any]:
    """
    Process an API Gateway Lambda event with standard validation and error handling.

    This function:
    1. Logs lambda invocation
    2. Extracts and parses the request body if present
    3. Validates input using a Pydantic model
    4. Invokes the handler function
    5. Validates output using a Pydantic model
    6. Wraps the return value in a standard response format
    7. Handles exceptions with appropriate error responses

    Args:
        name: Name of the lambda (for logging)
        input_model: Pydantic model class to validate the input event with
        output_model: Pydantic model class to validate the output with
        handler_func: The function to call with validated input
        event: The API Gateway event
        context: The Lambda context

    Returns:
        A dictionary with the Lambda response
    """
    # Do not log the raw event or request body: experiment payloads may carry
    # sensitive evaluation data (prompts, expected outputs, model config). Log
    # only non-sensitive request metadata.
    logger.info(
        f"Invoked {name} lambda",
        extra={
            "http_method": event.get("httpMethod"),
            "resource": event.get("resource"),
            "request_id": event.get("requestContext", {}).get("requestId"),
        },
    )

    try:
        # Extract and parse the request body
        data_to_validate = _extract_body_from_event(event)

        # Validate using the provided input model
        payload = input_model.model_validate(data_to_validate)

        logger.info(f"Lambda payload parsed and validated (type={input_model.__name__})")

        # Call the handler function with the validated payload
        return_value = operation(payload)

        logger.info("Handler successfully invoked.")

        # Convert the return value to a dictionary
        return_dict = _convert_return_value_to_dict(return_value)

        # Extract status code if provided
        status_code, return_dict = _extract_status_code(return_dict)

        # Return the response
        return response(return_dict, status_code)

    except JSONDecodeError as je:
        logger.exception(str(je))
        return response({"error": "ValidationException", "message": str(je)}, 400)
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
