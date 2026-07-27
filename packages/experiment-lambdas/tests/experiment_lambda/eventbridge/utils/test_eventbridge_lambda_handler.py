import json
import unittest
from datetime import datetime
from typing import Any, Dict
from unittest.mock import MagicMock, patch

from pydantic import BaseModel

from experiment_lambda.api.utils.api_models import (
    GenAiEtkException,
    InternalServerException,
    ResourceNotFoundException,
    ThrottlingException,
    UnauthorizedException,
    ValidationException,
)
from experiment_lambda.eventbridge.utils.eventbridge_lambda_handler import (
    DateTimeEncoder,
    create_eventbridge_lambda_handler,
    process_eventbridge_lambda_event,
    response,
)


class MockDetail(BaseModel):
    param1: str
    param2: int


class MockResponse(BaseModel):
    result: str


class MockResponseWithStatus(BaseModel):
    result: str
    status_code: int


class MockDictResponse(BaseModel):
    result: str


def mock_operation(detail: MockDetail) -> MockResponse:
    return MockResponse(result=f"{detail.param1}:{detail.param2}")


class TestEventbridgeLambdaHandler(unittest.TestCase):
    """Tests for eventbridge_lambda_handler.py"""

    @patch("experiment_lambda.eventbridge.utils.eventbridge_lambda_handler.getLogger")
    def test_valid_input_processing(self, mock_get_logger: MagicMock) -> None:
        """Test that handler processes valid input correctly"""
        # Arrange
        mock_logger = MagicMock()
        mock_get_logger.return_value = mock_logger

        handler = create_eventbridge_lambda_handler(
            input_model=MockDetail, output_model=MockResponse, operation=mock_operation
        )

        event = {"detail": MockDetail(param1="test", param2=123).model_dump()}
        lambda_context = {}

        # Act
        result = handler(event, lambda_context)

        # Assert
        self.assertIsInstance(result, dict)
        body = result.get("body", "{}")
        body_dict = json.loads(body)
        self.assertEqual(body_dict, {"result": "test:123"})

    @patch("experiment_lambda.eventbridge.utils.eventbridge_lambda_handler.getLogger")
    def test_invalid_input_validation(self, mock_get_logger: MagicMock) -> None:
        """Test that handler properly validates input and returns error on validation error"""
        # Arrange
        mock_logger = MagicMock()
        mock_get_logger.return_value = mock_logger

        handler = create_eventbridge_lambda_handler(
            input_model=MockDetail, output_model=MockResponse, operation=mock_operation
        )

        # Missing required field in detail
        event = {
            "detail": {
                "param1": "test"
                # Missing param2
            }
        }
        lambda_context = {}

        # Act
        result = handler(event, lambda_context)

        # Assert
        self.assertEqual(result.get("statusCode"), 400)
        self.assertIn("ValidationException", result.get("body", ""))
        # Assertions on internal details like logging are removed

    @patch("experiment_lambda.eventbridge.utils.eventbridge_lambda_handler.getLogger")
    def test_unexpected_exception_handling(self, mock_get_logger: MagicMock) -> None:
        """Test that handler properly handles unexpected exceptions"""
        # Arrange
        mock_logger = MagicMock()
        mock_get_logger.return_value = mock_logger

        def operation_with_exception(detail: MockDetail) -> MockResponse:
            raise RuntimeError("Unexpected error")

        handler = create_eventbridge_lambda_handler(
            input_model=MockDetail, output_model=MockResponse, operation=operation_with_exception
        )

        event = {"detail": MockDetail(param1="test", param2=123).model_dump()}
        lambda_context = {}

        # Act
        result = handler(event, lambda_context)

        # Assert
        self.assertEqual(result.get("statusCode"), 500)  # Implementation returns 500 for unexpected exceptions
        self.assertIn("error", result.get("body", ""))
        self.assertIn("InternalServerException", result.get("body", ""))
        # Assertions on internal details like logging are removed

    def test_datetime_encoder(self) -> None:
        """Test the DateTimeEncoder class with datetime objects"""
        # Arrange
        dt = datetime(2023, 1, 1, 12, 0, 0)
        test_dict: Dict[str, Any] = {"timestamp": dt, "value": "test"}

        # Act
        result = json.dumps(test_dict, cls=DateTimeEncoder)
        parsed = json.loads(result)

        # Assert
        self.assertEqual(parsed["timestamp"], "2023-01-01T12:00:00")
        self.assertEqual(parsed["value"], "test")

    def test_datetime_encoder_non_datetime_object(self) -> None:
        """Test that DateTimeEncoder correctly falls back for non-datetime objects"""

        # Arrange
        class CustomClass:
            def __repr__(self) -> str:
                return "CustomClass"

        # The default method should call the parent's default method,
        # which will try to serialize the object as normal
        # We expect this to fail because CustomClass is not serializable
        custom_obj = CustomClass()
        test_dict = {"obj": custom_obj}

        # Act & Assert
        with self.assertRaises(TypeError):
            json.dumps(test_dict, cls=DateTimeEncoder)

    def test_response_format(self) -> None:
        """Test the response format function"""
        # Arrange
        data: Dict[str, str] = {"result": "success"}
        status_code = 200

        # Act
        result = response(data, status_code)

        # Assert
        self.assertEqual(result["statusCode"], 200)
        parsed_body = json.loads(result["body"])
        self.assertEqual(parsed_body, {"result": "success"})

    @patch("experiment_lambda.eventbridge.utils.eventbridge_lambda_handler.getLogger")
    def test_handler_with_invalid_status_code_type(self, mock_get_logger: MagicMock) -> None:
        """Test handler with a response that has non-integer status_code"""
        # Arrange
        mock_logger = MagicMock()
        mock_get_logger.return_value = mock_logger

        class MockStringStatusResponse(BaseModel):
            result: str
            status_code: str

        def operation_with_string_status_code(detail: MockDetail) -> MockStringStatusResponse:
            # Return a model with a string status_code
            return MockStringStatusResponse(result=f"{detail.param1}:{detail.param2}", status_code="201")

        handler = create_eventbridge_lambda_handler(
            input_model=MockDetail,
            output_model=MockResponse,
            operation=operation_with_string_status_code,
        )

        event = {"detail": MockDetail(param1="test", param2=123).model_dump()}
        lambda_context = {}

        # Act
        result = handler(event, lambda_context)

        # Assert - Should default to 200 when status_code is not an integer
        self.assertEqual(result["statusCode"], 200)
        body = json.loads(result["body"])
        self.assertEqual(body, {"result": "test:123"})  # status_code should be removed

    @patch("experiment_lambda.eventbridge.utils.eventbridge_lambda_handler.getLogger")
    def test_event_without_detail(self, mock_get_logger: MagicMock) -> None:
        """Test handler with an event that doesn't have a detail field"""
        # Arrange
        mock_logger = MagicMock()
        mock_get_logger.return_value = mock_logger

        handler = create_eventbridge_lambda_handler(
            input_model=MockDetail, output_model=MockResponse, operation=mock_operation
        )

        # Event without detail field
        event: Dict[str, Any] = {"param1": "test", "param2": 123}
        lambda_context = {}

        # Act
        result = handler(event, lambda_context)

        # Assert
        self.assertIsInstance(result, dict)
        body = result.get("body", "{}")
        body_dict = json.loads(body)
        self.assertEqual(body_dict, {"result": "test:123"})

    @patch("experiment_lambda.eventbridge.utils.eventbridge_lambda_handler.getLogger")
    def test_handler_with_return_value_as_dict(self, mock_get_logger: MagicMock) -> None:
        """Test handler when operation returns a dict-like object instead of a model"""
        # Arrange
        mock_logger = MagicMock()
        mock_get_logger.return_value = mock_logger

        def operation_returning_dict(detail: MockDetail) -> MockDictResponse:
            return MockDictResponse(result=f"{detail.param1}:{detail.param2}")

        handler = create_eventbridge_lambda_handler(
            input_model=MockDetail,
            output_model=MockDictResponse,
            operation=operation_returning_dict,
        )

        event = {"detail": MockDetail(param1="test", param2=123).model_dump()}
        lambda_context = {}

        # Act
        result = handler(event, lambda_context)

        # Assert
        self.assertIsInstance(result, dict)
        body = result.get("body", "{}")
        body_dict = json.loads(body)
        self.assertEqual(body_dict, {"result": "test:123"})

    @patch("experiment_lambda.eventbridge.utils.eventbridge_lambda_handler.getLogger")
    def test_handler_with_return_value_containing_status_code(self, mock_get_logger: MagicMock) -> None:
        """Test handler when operation returns a model with status_code"""
        # Arrange
        mock_logger = MagicMock()
        mock_get_logger.return_value = mock_logger

        def operation_with_status_code(detail: MockDetail) -> MockResponseWithStatus:
            return MockResponseWithStatus(result=f"{detail.param1}:{detail.param2}", status_code=201)

        handler = create_eventbridge_lambda_handler(
            input_model=MockDetail,
            output_model=MockResponseWithStatus,
            operation=operation_with_status_code,
        )

        event = {"detail": MockDetail(param1="test", param2=123).model_dump()}
        lambda_context = {}

        # Act
        result = handler(event, lambda_context)

        # Assert
        self.assertEqual(result["statusCode"], 201)  # Custom status code
        body = json.loads(result["body"])
        self.assertEqual(body, {"result": "test:123"})  # status_code should be removed from body

    @patch("experiment_lambda.eventbridge.utils.eventbridge_lambda_handler.getLogger")
    def test_validation_exception_handling(self, mock_get_logger: MagicMock) -> None:
        """Test handling of ValidationException"""
        # Arrange
        mock_logger = MagicMock()
        mock_get_logger.return_value = mock_logger

        def operation_with_exception(detail: MockDetail) -> MockResponse:
            raise ValidationException(message="Validation failed")

        handler = create_eventbridge_lambda_handler(
            input_model=MockDetail, output_model=MockResponse, operation=operation_with_exception
        )

        event = {"detail": MockDetail(param1="test", param2=123).model_dump()}
        lambda_context = {}

        # Act
        result = handler(event, lambda_context)

        # Assert
        self.assertEqual(result["statusCode"], 400)  # Default status for ValidationException
        body = json.loads(result["body"])
        self.assertEqual(body["error"], "ValidationException")

    @patch("experiment_lambda.eventbridge.utils.eventbridge_lambda_handler.getLogger")
    def test_resource_not_found_exception_handling(self, mock_get_logger: MagicMock) -> None:
        """Test handling of ResourceNotFoundException"""
        # Arrange
        mock_logger = MagicMock()
        mock_get_logger.return_value = mock_logger

        def operation_with_exception(detail: MockDetail) -> MockResponse:
            raise ResourceNotFoundException(message="Resource not found")

        handler = create_eventbridge_lambda_handler(
            input_model=MockDetail, output_model=MockResponse, operation=operation_with_exception
        )

        event = {"detail": MockDetail(param1="test", param2=123).model_dump()}
        lambda_context = {}

        # Act
        result = handler(event, lambda_context)

        # Assert
        self.assertEqual(result["statusCode"], 404)  # Default status for ResourceNotFoundException
        body = json.loads(result["body"])
        self.assertEqual(body["error"], "ResourceNotFoundException")

    @patch("experiment_lambda.eventbridge.utils.eventbridge_lambda_handler.getLogger")
    def test_unauthorized_exception_handling(self, mock_get_logger: MagicMock) -> None:
        """Test handling of UnauthorizedException"""
        # Arrange
        mock_logger = MagicMock()
        mock_get_logger.return_value = mock_logger

        def operation_with_exception(detail: MockDetail) -> MockResponse:
            raise UnauthorizedException(message="Unauthorized")

        handler = create_eventbridge_lambda_handler(
            input_model=MockDetail, output_model=MockResponse, operation=operation_with_exception
        )

        event = {"detail": MockDetail(param1="test", param2=123).model_dump()}
        lambda_context = {}

        # Act
        result = handler(event, lambda_context)

        # Assert
        self.assertEqual(result["statusCode"], 401)  # Default status for UnauthorizedException
        body = json.loads(result["body"])
        self.assertEqual(body["error"], "UnauthorizedException")

    @patch("experiment_lambda.eventbridge.utils.eventbridge_lambda_handler.getLogger")
    def test_throttling_exception_handling(self, mock_get_logger: MagicMock) -> None:
        """Test handling of ThrottlingException"""
        # Arrange
        mock_logger = MagicMock()
        mock_get_logger.return_value = mock_logger

        def operation_with_exception(detail: MockDetail) -> MockResponse:
            raise ThrottlingException(message="Throttled")

        handler = create_eventbridge_lambda_handler(
            input_model=MockDetail, output_model=MockResponse, operation=operation_with_exception
        )

        event = {"detail": MockDetail(param1="test", param2=123).model_dump()}
        lambda_context = {}

        # Act
        result = handler(event, lambda_context)

        # Assert
        self.assertEqual(result["statusCode"], 429)  # Default status for ThrottlingException
        body = json.loads(result["body"])
        self.assertEqual(body["error"], "ThrottlingException")

    @patch("experiment_lambda.eventbridge.utils.eventbridge_lambda_handler.getLogger")
    def test_internal_server_exception_handling(self, mock_get_logger: MagicMock) -> None:
        """Test handling of InternalServerException"""
        # Arrange
        mock_logger = MagicMock()
        mock_get_logger.return_value = mock_logger

        def operation_with_exception(detail: MockDetail) -> MockResponse:
            raise InternalServerException(message="Internal error")

        handler = create_eventbridge_lambda_handler(
            input_model=MockDetail, output_model=MockResponse, operation=operation_with_exception
        )

        event = {"detail": MockDetail(param1="test", param2=123).model_dump()}
        lambda_context = {}

        # Act
        result = handler(event, lambda_context)

        # Assert
        self.assertEqual(result["statusCode"], 500)  # Default status for InternalServerException
        body = json.loads(result["body"])
        self.assertEqual(body["error"], "InternalServerException")

    @patch("experiment_lambda.eventbridge.utils.eventbridge_lambda_handler.getLogger")
    def test_genaietk_exception_handling(self, mock_get_logger: MagicMock) -> None:
        """Test handling of generic GenAiEtkException"""
        # Arrange
        mock_logger = MagicMock()
        mock_get_logger.return_value = mock_logger

        def operation_with_exception(detail: MockDetail) -> MockResponse:
            exception = GenAiEtkException(message="Custom error")
            exception.error_code = "CustomError"
            exception.status_code = 418
            raise exception

        handler = create_eventbridge_lambda_handler(
            input_model=MockDetail, output_model=MockResponse, operation=operation_with_exception
        )

        event = {"detail": MockDetail(param1="test", param2=123).model_dump()}
        lambda_context = {}

        # Act
        result = handler(event, lambda_context)

        # Assert
        self.assertEqual(result["statusCode"], 418)  # Custom status code
        body = json.loads(result["body"])
        self.assertEqual(body["error"], "CustomError")

    @patch("experiment_lambda.eventbridge.utils.eventbridge_lambda_handler.getLogger")
    def test_process_event_with_invalid_input_format(self, mock_get_logger: MagicMock) -> None:
        """Test process_eventbridge_lambda_event with invalid input format (not JSON parseable)"""
        # Arrange
        mock_logger = MagicMock()
        mock_get_logger.return_value = mock_logger

        name = "test_operation"
        event: Dict[str, Any] = {
            "detail": {
                "param1": "test",
                "param2": "not-an-integer",  # This will cause a validation error
            }
        }

        # Act
        result = process_eventbridge_lambda_event(
            name=name,
            input_model=MockDetail,
            output_model=MockResponse,
            operation=mock_operation,
            event=event,
        )

        # Assert
        self.assertEqual(result["statusCode"], 400)
        body = json.loads(result["body"])
        self.assertEqual(body["error"], "ValidationException")
        # Removed assertion on internal implementation details like logging


if __name__ == "__main__":
    unittest.main()
