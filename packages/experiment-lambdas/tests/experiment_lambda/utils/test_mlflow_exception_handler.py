import unittest

from experiment_lambda.api.utils.api_models import (
    ConflictException,
    InternalServerException,
    ResourceNotFoundException,
    ThrottlingException,
    UnauthorizedException,
    ValidationException,
)
from experiment_lambda.utils.mlflow_exception_handler import map_domain_exception


# Create a custom exception class for testing that mimics MlflowException
class MockMlflowException(Exception):
    """Mock class for MlflowException to use in tests"""

    def __init__(self, error_code: str, message: str):
        self.error_code = error_code
        self.message = message
        super().__init__(message)

    def __str__(self) -> str:
        return self.message


class TestMlflowExceptionHandler(unittest.TestCase):
    """Tests for mlflow_exception_handler.py"""

    def test_map_domain_exception_experiment_already_exists(self) -> None:
        """Test mapping of ALREADY_EXISTS exception for an experiment"""
        # Arrange
        mock_exception = MockMlflowException(
            error_code="ALREADY_EXISTS", message="Experiment 'test-experiment' already exists"
        )

        # Act
        result = map_domain_exception(mock_exception)

        # Assert
        self.assertIsInstance(result, ConflictException)
        self.assertIn("'test-experiment' already exists", str(result))

    def test_map_domain_exception_experiment_not_found(self) -> None:
        """Test mapping of NOT_FOUND exception for an experiment"""
        # Arrange
        mock_exception = MockMlflowException(
            error_code="RESOURCE_DOES_NOT_EXIST",
            message="Experiment 'missing-experiment' not found",
        )

        # Act
        result = map_domain_exception(mock_exception)

        # Assert
        self.assertIsInstance(result, ResourceNotFoundException)
        self.assertIn("'missing-experiment' not found", str(result))

    def test_map_domain_exception_bad_request(self) -> None:
        """Test mapping of BAD_REQUEST exception"""
        # Arrange
        mock_exception = MockMlflowException(error_code="BAD_REQUEST", message="Invalid parameter")

        # Act
        result = map_domain_exception(mock_exception)

        # Assert
        self.assertIsInstance(result, ValidationException)
        self.assertIn("Invalid request", str(result))

    def test_map_domain_exception_unauthenticated(self) -> None:
        """Test mapping of UNAUTHENTICATED exception"""
        # Arrange
        mock_exception = MockMlflowException(error_code="UNAUTHENTICATED", message="Authentication failed")

        # Act
        result = map_domain_exception(mock_exception)

        # Assert
        self.assertIsInstance(result, UnauthorizedException)

    def test_map_domain_exception_throttling(self) -> None:
        """Test mapping of REQUEST_LIMIT_EXCEEDED exception"""
        # Arrange
        mock_exception = MockMlflowException(error_code="REQUEST_LIMIT_EXCEEDED", message="Too many requests")

        # Act
        result = map_domain_exception(mock_exception)

        # Assert
        self.assertIsInstance(result, ThrottlingException)

    def test_map_domain_exception_conflict(self) -> None:
        """Test mapping of RESOURCE_CONFLICT exception"""
        # Arrange
        mock_exception = MockMlflowException(error_code="RESOURCE_CONFLICT", message="Resource conflict")

        # Act
        result = map_domain_exception(mock_exception)

        # Assert
        self.assertIsInstance(result, ConflictException)

    def test_map_domain_exception_unknown(self) -> None:
        """Test mapping of unknown exception"""
        # Arrange
        mock_exception = MockMlflowException(error_code="UNKNOWN_ERROR", message="Unknown error")

        # Act
        result = map_domain_exception(mock_exception)

        # Assert
        self.assertIsInstance(result, InternalServerException)

    def test_map_domain_exception_conflict_with_experiment_id(self) -> None:
        """Test mapping of ALREADY_EXISTS exception with experiment_id parameter"""
        # Arrange
        mock_exception = MockMlflowException(error_code="ALREADY_EXISTS", message="Experiment already exists")

        # Act
        result = map_domain_exception(mock_exception, experiment_id="exp-123")

        # Assert
        self.assertIsInstance(result, ConflictException)
        self.assertIn("Experiment with id 'exp-123' already exists", str(result))

    def test_map_domain_exception_conflict_with_experiment_name(self) -> None:
        """Test mapping of RESOURCE_ALREADY_EXISTS exception with experiment_name parameter"""
        # Arrange
        mock_exception = MockMlflowException(error_code="RESOURCE_ALREADY_EXISTS", message="Resource already exists")

        # Act
        result = map_domain_exception(mock_exception, experiment_name="my-experiment")

        # Assert
        self.assertIsInstance(result, ConflictException)
        self.assertIn("Experiment with name 'my-experiment' already exists", str(result))

    def test_map_domain_exception_not_found_with_experiment_id(self) -> None:
        """Test mapping of NOT_FOUND exception with experiment_id parameter"""
        # Arrange
        mock_exception = MockMlflowException(error_code="NOT_FOUND", message="Resource not found")

        # Act
        result = map_domain_exception(mock_exception, experiment_id="exp-456")

        # Assert
        self.assertIsInstance(result, ResourceNotFoundException)
        self.assertIn("Experiment with id 'exp-456' not found", str(result))

    def test_map_domain_exception_not_found_with_experiment_name(self) -> None:
        """Test mapping of RESOURCE_DOES_NOT_EXIST exception with experiment_name parameter"""
        # Arrange
        mock_exception = MockMlflowException(error_code="RESOURCE_DOES_NOT_EXIST", message="Resource does not exist")

        # Act
        result = map_domain_exception(mock_exception, experiment_name="missing-experiment")

        # Assert
        self.assertIsInstance(result, ResourceNotFoundException)
        self.assertIn("Experiment with name 'missing-experiment' not found", str(result))

    def test_map_domain_exception_conflict_with_both_parameters(self) -> None:
        """
        Test mapping when both experiment_id and experiment_name are provided
        (name takes precedence)
        """
        # Arrange
        mock_exception = MockMlflowException(error_code="RESOURCE_CONFLICT", message="Resource conflict")

        # Act
        result = map_domain_exception(mock_exception, experiment_id="exp-123", experiment_name="test-experiment")

        # Assert
        self.assertIsInstance(result, ConflictException)
        # experiment_name should take precedence since it's checked first
        self.assertIn("Experiment with name 'test-experiment' already exists", str(result))

    def test_map_domain_exception_not_found_with_both_parameters(self) -> None:
        """
        Test mapping when both experiment_id and experiment_name are provided
           (name takes precedence)
        """
        # Arrange
        mock_exception = MockMlflowException(error_code="NOT_FOUND", message="Resource not found")

        # Act
        result = map_domain_exception(mock_exception, experiment_id="exp-456", experiment_name="missing-experiment")

        # Assert
        self.assertIsInstance(result, ResourceNotFoundException)
        # experiment_name should take precedence since it's checked first
        self.assertIn("Experiment with name 'missing-experiment' not found", str(result))

    def test_map_domain_exception_additional_error_codes(self) -> None:
        """Test mapping of additional error codes to ensure comprehensive coverage"""
        # Test INVALID_PARAMETER_VALUE
        mock_exception1 = MockMlflowException(error_code="INVALID_PARAMETER_VALUE", message="Invalid parameter value")
        result1 = map_domain_exception(mock_exception1)
        self.assertIsInstance(result1, ValidationException)

        # Test INVALID_STATE
        mock_exception2 = MockMlflowException(error_code="INVALID_STATE", message="Invalid state")
        result2 = map_domain_exception(mock_exception2)
        self.assertIsInstance(result2, ValidationException)

        # Test PERMISSION_DENIED
        mock_exception3 = MockMlflowException(error_code="PERMISSION_DENIED", message="Permission denied")
        result3 = map_domain_exception(mock_exception3)
        self.assertIsInstance(result3, UnauthorizedException)

        # Test CUSTOMER_UNAUTHORIZED
        mock_exception4 = MockMlflowException(error_code="CUSTOMER_UNAUTHORIZED", message="Customer unauthorized")
        result4 = map_domain_exception(mock_exception4)
        self.assertIsInstance(result4, UnauthorizedException)

        # Test RESOURCE_EXHAUSTED
        mock_exception5 = MockMlflowException(error_code="RESOURCE_EXHAUSTED", message="Resource exhausted")
        result5 = map_domain_exception(mock_exception5)
        self.assertIsInstance(result5, ThrottlingException)


if __name__ == "__main__":
    unittest.main()
