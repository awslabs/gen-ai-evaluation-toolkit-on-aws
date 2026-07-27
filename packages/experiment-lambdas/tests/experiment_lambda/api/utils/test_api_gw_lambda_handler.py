import json
import unittest
from datetime import datetime
from typing import Any, Dict, Optional, TypeVar
from unittest.mock import MagicMock, patch

from pydantic import BaseModel

from experiment_lambda.api.utils.api_gw_lambda_handler import (
    DateTimeEncoder,
    create_api_gw_lambda_handler,
)
from experiment_lambda.api.utils.api_models import (
    GenAiEtkException,
    InternalServerException,
    ResourceNotFoundException,
    ThrottlingException,
    UnauthorizedException,
    ValidationException,
)

T = TypeVar("T", bound=BaseModel)
U = TypeVar("U", bound=BaseModel)


class MockRequest(BaseModel):
    param1: str
    param2: int


class MockResponse(BaseModel):
    result: str
    created_at: Optional[datetime] = None


class TestApiGwLambdaHandler(unittest.TestCase):
    """Tests for api_gw_lambda_handler.py"""

    def setUp(self) -> None:
        # Define a simple operation function
        def test_operation(request: MockRequest) -> MockResponse:
            return MockResponse(result=f"{request.param1}:{request.param2}")

        self.test_operation = test_operation

    def test_datetime_encoder(self) -> None:
        """Test that DateTimeEncoder properly handles datetime objects"""
        # Arrange
        test_date = datetime(2023, 1, 1, 12, 0, 0)
        encoder = DateTimeEncoder()

        # Act
        result = encoder.default(test_date)

        # Assert
        self.assertEqual(result, "2023-01-01T12:00:00")

        # Test fallback to parent method
        with self.assertRaises(TypeError):
            encoder.default(complex(1, 2))  # complex is not JSON serializable

    @patch("experiment_lambda.api.utils.api_gw_lambda_handler.getLogger")
    def test_valid_input_processing(self, mock_logging: MagicMock) -> None:
        """Test that handler processes valid input correctly"""
        # Arrange
        handler = create_api_gw_lambda_handler(
            input_model=MockRequest, output_model=MockResponse, operation=self.test_operation
        )

        event: Dict[str, Any] = {"body": json.dumps({"param1": "test", "param2": 123})}
        context = {}

        # Act
        result = handler(event, context)

        # Assert
        self.assertEqual(result["statusCode"], 200)
        body = json.loads(result["body"])
        self.assertEqual(body["result"], "test:123")

    @patch("experiment_lambda.api.utils.api_gw_lambda_handler.getLogger")
    def test_datetime_serialization(self, mock_logging: MagicMock) -> None:
        """Test that handler properly serializes datetime objects in response"""

        # Arrange
        def operation_with_datetime(request: MockRequest) -> MockResponse:
            return MockResponse(
                result=f"{request.param1}:{request.param2}",
                created_at=datetime(2023, 1, 1, 12, 0, 0),
            )

        handler = create_api_gw_lambda_handler(
            input_model=MockRequest, output_model=MockResponse, operation=operation_with_datetime
        )

        event: Dict[str, Any] = {"body": json.dumps({"param1": "test", "param2": 123})}
        context = {}

        # Act
        result = handler(event, context)

        # Assert
        self.assertEqual(result["statusCode"], 200)
        body = json.loads(result["body"])
        self.assertEqual(body["result"], "test:123")
        self.assertEqual(body["created_at"], "2023-01-01T12:00:00")

    @patch("experiment_lambda.api.utils.api_gw_lambda_handler.getLogger")
    def test_path_parameters(self, mock_logging: MagicMock) -> None:
        """Test that handler correctly processes path parameters"""
        # Arrange
        handler = create_api_gw_lambda_handler(
            input_model=MockRequest, output_model=MockResponse, operation=self.test_operation
        )

        event: Dict[str, Any] = {
            "pathParameters": {"param1": "test"},
            "body": json.dumps({"param2": 123}),
        }
        context = {}

        # Act
        result = handler(event, context)

        # Assert
        self.assertEqual(result["statusCode"], 200)
        body = json.loads(result["body"])
        self.assertEqual(body["result"], "test:123")

    @patch("experiment_lambda.api.utils.api_gw_lambda_handler.getLogger")
    def test_path_parameters_only(self, mock_logging: MagicMock) -> None:
        """Test that handler works with only path parameters"""
        # Arrange
        handler = create_api_gw_lambda_handler(
            input_model=MockRequest, output_model=MockResponse, operation=self.test_operation
        )

        event: Dict[str, Any] = {
            "pathParameters": {
                "param1": "test",
                "param2": "123",  # Will be converted to int by Pydantic
            }
        }
        context = {}

        # Act
        result = handler(event, context)

        # Assert
        self.assertEqual(result["statusCode"], 200)
        body = json.loads(result["body"])
        self.assertEqual(body["result"], "test:123")

    @patch("experiment_lambda.api.utils.api_gw_lambda_handler.getLogger")
    def test_different_return_types(self, mock_logging: MagicMock) -> None:
        """Test that handler handles different return value types"""

        # Define model class for our return types
        class DictResponse(BaseModel):
            result: str

        # Case 1: Return a model instance directly
        def operation_return_model(request: MockRequest) -> DictResponse:
            return DictResponse(result=f"{request.param1}:{request.param2}")

        handler_dict = create_api_gw_lambda_handler(
            input_model=MockRequest, output_model=DictResponse, operation=operation_return_model
        )

        # For test purposes, use TestResponse instead of StringWrapper since handler actually
        # expects the model type to match
        def operation_return_response(request: MockRequest) -> MockResponse:
            return MockResponse(result=f"{request.param1}:{request.param2}")

        handler_primitive = create_api_gw_lambda_handler(
            input_model=MockRequest, output_model=MockResponse, operation=operation_return_response
        )

        event: Dict[str, Any] = {"body": json.dumps({"param1": "test", "param2": 123})}
        context = {}

        # Act & Assert - Dictionary case
        result = handler_dict(event, context)
        self.assertEqual(result["statusCode"], 200)
        body = json.loads(result["body"])
        self.assertEqual(body["result"], "test:123")

        # Act & Assert - Primitive value case
        result = handler_primitive(event, context)
        self.assertEqual(result["statusCode"], 200)
        body = json.loads(result["body"])
        self.assertEqual(body["result"], "test:123")

    @patch("experiment_lambda.api.utils.api_gw_lambda_handler.getLogger")
    def test_custom_status_code(self, mock_logging: MagicMock) -> None:
        """Test that handler respects custom status codes in response"""

        # Arrange
        # Define a response model that can include status_code
        class StatusResponse(BaseModel):
            result: str
            status_code: Optional[int] = None

        def operation_with_status(request: MockRequest) -> StatusResponse:
            return StatusResponse(
                result=f"{request.param1}:{request.param2}",
                status_code=201,  # Created
            )

        handler = create_api_gw_lambda_handler(
            input_model=MockRequest, output_model=StatusResponse, operation=operation_with_status
        )

        event: Dict[str, Any] = {"body": json.dumps({"param1": "test", "param2": 123})}
        context = {}

        # Act
        result = handler(event, context)

        # Assert
        self.assertEqual(result["statusCode"], 201)
        body = json.loads(result["body"])
        self.assertEqual(body["result"], "test:123")
        # status_code should be stripped from response body
        self.assertNotIn("status_code", body)

    @patch("experiment_lambda.api.utils.api_gw_lambda_handler.getLogger")
    def test_invalid_input_validation(self, mock_logging: MagicMock) -> None:
        """Test that handler properly validates input and returns 400 on validation error"""
        # Arrange
        handler = create_api_gw_lambda_handler(
            input_model=MockRequest, output_model=MockResponse, operation=self.test_operation
        )

        # Missing required field
        event: Dict[str, Any] = {
            "body": json.dumps(
                {
                    "param1": "test"
                    # Missing param2
                }
            )
        }
        context = {}

        # Act
        result = handler(event, context)

        # Assert
        self.assertEqual(result["statusCode"], 400)
        body = json.loads(result["body"])
        self.assertEqual(body["error"], "ValidationException")
        self.assertIn("param2", body["message"])  # Error message should mention the missing field

    @patch("experiment_lambda.api.utils.api_gw_lambda_handler.getLogger")
    def test_invalid_json_body(self, mock_logging: MagicMock) -> None:
        """Test that handler properly handles invalid JSON in request body"""
        # Arrange
        handler = create_api_gw_lambda_handler(
            input_model=MockRequest, output_model=MockResponse, operation=self.test_operation
        )

        event: Dict[str, Any] = {"body": "{invalid json}"}
        context = {}

        # Act
        result = handler(event, context)

        # Assert
        self.assertEqual(result["statusCode"], 400)
        body = json.loads(result["body"])
        self.assertEqual(body["error"], "ValidationException")

    @patch("experiment_lambda.api.utils.api_gw_lambda_handler.getLogger")
    def test_domain_exception_handling(self, mock_logging: MagicMock) -> None:
        """Test that handler properly handles domain exceptions"""

        # Arrange
        def operation_with_exception(request: MockRequest) -> MockResponse:
            raise ValidationException("Test validation error")

        handler = create_api_gw_lambda_handler(
            input_model=MockRequest, output_model=MockResponse, operation=operation_with_exception
        )

        event: Dict[str, Any] = {"body": json.dumps({"param1": "test", "param2": 123})}
        context = {}

        # Act
        result = handler(event, context)

        # Assert
        self.assertEqual(result["statusCode"], 400)  # ValidationException maps to 400
        body = json.loads(result["body"])
        self.assertEqual(body["error"], "ValidationException")
        self.assertEqual(body["message"], "Test validation error")

    @patch("experiment_lambda.api.utils.api_gw_lambda_handler.getLogger")
    def test_resource_not_found_exception(self, mock_logging: MagicMock) -> None:
        """Test that handler properly handles ResourceNotFoundException"""

        # Arrange
        def operation_with_exception(request: MockRequest) -> MockResponse:
            raise ResourceNotFoundException("Resource not found")

        handler = create_api_gw_lambda_handler(
            input_model=MockRequest, output_model=MockResponse, operation=operation_with_exception
        )

        event: Dict[str, Any] = {"body": json.dumps({"param1": "test", "param2": 123})}
        context = {}

        # Act
        result = handler(event, context)

        # Assert
        self.assertEqual(result["statusCode"], 404)
        body = json.loads(result["body"])
        self.assertEqual(body["error"], "ResourceNotFoundException")
        self.assertEqual(body["message"], "Resource not found")

    @patch("experiment_lambda.api.utils.api_gw_lambda_handler.getLogger")
    def test_unauthorized_exception(self, mock_logging: MagicMock) -> None:
        """Test that handler properly handles UnauthorizedException"""

        # Arrange
        def operation_with_exception(request: MockRequest) -> MockResponse:
            raise UnauthorizedException("Unauthorized access")

        handler = create_api_gw_lambda_handler(
            input_model=MockRequest, output_model=MockResponse, operation=operation_with_exception
        )

        event: Dict[str, Any] = {"body": json.dumps({"param1": "test", "param2": 123})}
        context = {}

        # Act
        result = handler(event, context)

        # Assert
        self.assertEqual(result["statusCode"], 401)
        body = json.loads(result["body"])
        self.assertEqual(body["error"], "UnauthorizedException")
        self.assertEqual(body["message"], "Unauthorized access")

    @patch("experiment_lambda.api.utils.api_gw_lambda_handler.getLogger")
    def test_throttling_exception(self, mock_logging: MagicMock) -> None:
        """Test that handler properly handles ThrottlingException"""

        # Arrange
        def operation_with_exception(request: MockRequest) -> MockResponse:
            raise ThrottlingException("Too many requests")

        handler = create_api_gw_lambda_handler(
            input_model=MockRequest, output_model=MockResponse, operation=operation_with_exception
        )

        event: Dict[str, Any] = {"body": json.dumps({"param1": "test", "param2": 123})}
        context = {}

        # Act
        result = handler(event, context)

        # Assert
        self.assertEqual(result["statusCode"], 429)
        body = json.loads(result["body"])
        self.assertEqual(body["error"], "ThrottlingException")
        self.assertEqual(body["message"], "Too many requests")

    @patch("experiment_lambda.api.utils.api_gw_lambda_handler.getLogger")
    def test_internal_server_exception(self, mock_logging: MagicMock) -> None:
        """Test that handler properly handles InternalServerException"""

        # Arrange
        def operation_with_exception(request: MockRequest) -> MockResponse:
            raise InternalServerException("Internal server error")

        handler = create_api_gw_lambda_handler(
            input_model=MockRequest, output_model=MockResponse, operation=operation_with_exception
        )

        event: Dict[str, Any] = {"body": json.dumps({"param1": "test", "param2": 123})}
        context = {}

        # Act
        result = handler(event, context)

        # Assert
        self.assertEqual(result["statusCode"], 500)
        body = json.loads(result["body"])
        self.assertEqual(body["error"], "InternalServerException")
        self.assertEqual(body["message"], "Internal server error")

    @patch("experiment_lambda.api.utils.api_gw_lambda_handler.getLogger")
    def test_genaietk_exception(self, mock_logging: MagicMock) -> None:
        """Test that handler properly handles generic GenAiEtkException"""

        # Arrange
        # Create a custom exception class for this test
        class TeapotException(GenAiEtkException):
            def __init__(self, message: Optional[str] = None):
                self.message = message or "I'm a teapot"
                self.status_code = 418
                self.error_code = "CustomErrorCode"
                super().__init__(self.message)

        def operation_with_exception(request: MockRequest) -> MockResponse:
            raise TeapotException("Custom error")

        handler = create_api_gw_lambda_handler(
            input_model=MockRequest, output_model=MockResponse, operation=operation_with_exception
        )

        event: Dict[str, Any] = {"body": json.dumps({"param1": "test", "param2": 123})}
        context = {}

        # Act
        result = handler(event, context)

        # Assert
        self.assertEqual(result["statusCode"], 418)
        body = json.loads(result["body"])
        self.assertEqual(body["error"], "CustomErrorCode")
        self.assertEqual(body["message"], "Custom error")

    @patch("experiment_lambda.api.utils.api_gw_lambda_handler.getLogger")
    def test_unexpected_exception_handling(self, mock_logging: MagicMock) -> None:
        """Test that handler properly handles unexpected exceptions"""

        # Arrange
        def operation_with_exception(request: MockRequest) -> MockResponse:
            raise RuntimeError("Unexpected error")

        handler = create_api_gw_lambda_handler(
            input_model=MockRequest, output_model=MockResponse, operation=operation_with_exception
        )

        event: Dict[str, Any] = {"body": json.dumps({"param1": "test", "param2": 123})}
        context = {}

        # Act
        result = handler(event, context)

        # Assert
        self.assertEqual(result["statusCode"], 500)  # Unexpected exceptions map to 500
        body = json.loads(result["body"])
        self.assertEqual(body["error"], "InternalServerException")
        self.assertEqual(body["message"], "An internal server error occurred")

    @patch("experiment_lambda.api.utils.api_gw_lambda_handler.getLogger")
    def test_body_content_not_dict(self, mock_logging: MagicMock) -> None:
        """Test that handler handles body content that is not a dictionary"""
        # Arrange
        handler = create_api_gw_lambda_handler(
            input_model=MockRequest, output_model=MockResponse, operation=self.test_operation
        )

        # Event with body that parses to a list instead of dict
        event: Dict[str, Any] = {
            "body": json.dumps(["not", "a", "dict"]),
            "pathParameters": {"param1": "test", "param2": "123"},
        }
        context = {}

        # Act
        result = handler(event, context)

        # Assert
        self.assertEqual(result["statusCode"], 200)
        body = json.loads(result["body"])
        self.assertEqual(body["result"], "test:123")

    @patch("experiment_lambda.api.utils.api_gw_lambda_handler.getLogger")
    def test_query_string_parameters(self, mock_logging: MagicMock) -> None:
        """Test that handler correctly processes query string parameters"""
        # Arrange
        handler = create_api_gw_lambda_handler(
            input_model=MockRequest, output_model=MockResponse, operation=self.test_operation
        )

        event: Dict[str, Any] = {"queryStringParameters": {"param1": "test", "param2": "123"}}
        context = {}

        # Act
        result = handler(event, context)

        # Assert
        self.assertEqual(result["statusCode"], 200)
        body = json.loads(result["body"])
        self.assertEqual(body["result"], "test:123")

    @patch("experiment_lambda.api.utils.api_gw_lambda_handler.getLogger")
    def test_no_body_no_path_parameters(self, mock_logging: MagicMock) -> None:
        """Test that handler uses the event itself when no body or pathParameters"""
        # Arrange
        handler = create_api_gw_lambda_handler(
            input_model=MockRequest, output_model=MockResponse, operation=self.test_operation
        )

        # Event with neither body nor pathParameters, but has the required fields directly
        event: Dict[str, Any] = {"param1": "test", "param2": 123}
        context = {}

        # Act
        result = handler(event, context)

        # Assert
        self.assertEqual(result["statusCode"], 200)
        body = json.loads(result["body"])
        self.assertEqual(body["result"], "test:123")

    @patch("experiment_lambda.api.utils.api_gw_lambda_handler.getLogger")
    def test_empty_path_and_query_parameters(self, mock_logging: MagicMock) -> None:
        """Test that handler handles empty pathParameters and queryStringParameters"""
        # Arrange
        handler = create_api_gw_lambda_handler(
            input_model=MockRequest, output_model=MockResponse, operation=self.test_operation
        )

        event: Dict[str, Any] = {
            "pathParameters": {},
            "queryStringParameters": {},
            "body": json.dumps({"param1": "test", "param2": 123}),
        }
        context = {}

        # Act
        result = handler(event, context)

        # Assert
        self.assertEqual(result["statusCode"], 200)
        body = json.loads(result["body"])
        self.assertEqual(body["result"], "test:123")

    def test_combined_parameters_precedence(self) -> None:
        """
        Test parameter precedence when pathParameters, queryStringParameters, and body all exist
        """
        # Arrange
        handler = create_api_gw_lambda_handler(
            input_model=MockRequest, output_model=MockResponse, operation=self.test_operation
        )

        event: Dict[str, Any] = {
            "pathParameters": {"param1": "path_value"},
            "queryStringParameters": {
                "param1": "query_value"  # This should override path
            },
            "body": json.dumps(
                {
                    "param1": "body_value",  # This should override both
                    "param2": 123,
                }
            ),
        }
        context = {}

        # Act
        result = handler(event, context)

        # Assert
        self.assertEqual(result["statusCode"], 200)
        body = json.loads(result["body"])
        # Body should take precedence (last update wins)
        self.assertEqual(body["result"], "body_value:123")


if __name__ == "__main__":
    unittest.main()
