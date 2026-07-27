import unittest
from os import environ
from unittest.mock import MagicMock, patch

from mlflow.exceptions import MlflowException

from experiment_lambda.utils.mlflow_client import (
    MlflowClientWithExceptionHandling,
    get_mlflow_client,
)


class TestMlflowClient(unittest.TestCase):
    """Tests for mlflow_client.py"""

    def setUp(self) -> None:
        """Reset the module-level cache before each test"""
        # Access the internal module variable using the module's namespace
        import experiment_lambda.utils.mlflow_client as client_module

        client_module._mlflow_client = None  # type: ignore

    @patch("experiment_lambda.utils.mlflow_client.UntypedMlflowClient")
    @patch.dict(environ, {"MLFLOW_TRACKING_SERVER_ARN": "test-arn"})
    def test_get_mlflow_client_creates_client(self, mock_mlflow_client: MagicMock) -> None:
        """Test that get_mlflow_client creates and returns a client when none exists"""
        # Arrange
        mock_client_instance = MagicMock()
        mock_mlflow_client.return_value = mock_client_instance

        # Act
        client = get_mlflow_client()

        # Assert
        mock_mlflow_client.assert_called_once_with()
        # The client is now wrapped, so we just verify it exists and is not the raw mock
        self.assertIsNotNone(client)
        # The returned client should be the wrapper, not the original mock
        self.assertNotEqual(client, mock_client_instance)

    @patch("experiment_lambda.utils.mlflow_client.UntypedMlflowClient")
    @patch.dict(environ, {"MLFLOW_TRACKING_SERVER_ARN": "test-arn"})
    def test_get_mlflow_client_uses_cached_client(self, mock_mlflow_client: MagicMock) -> None:
        """Test that get_mlflow_client returns the cached client on subsequent calls"""
        # Arrange
        mock_client_instance = MagicMock()
        mock_mlflow_client.return_value = mock_client_instance

        # Act
        client1 = get_mlflow_client()
        client2 = get_mlflow_client()

        # Assert
        mock_mlflow_client.assert_called_once()  # Should only be called once
        self.assertEqual(client1, client2)

    @patch("experiment_lambda.utils.mlflow_client.UntypedMlflowClient")
    @patch.dict(environ, {}, clear=True)
    def test_get_mlflow_client_without_env_variable(self, mock_mlflow_client: MagicMock) -> None:
        """Test that get_mlflow_client raises an exception when environment variable is not set"""
        # Act & Assert
        with self.assertRaises(Exception) as context:
            get_mlflow_client()

        self.assertIn("MLFLOW_TRACKING_SERVER_ARN environment variable is not set", str(context.exception))
        mock_mlflow_client.assert_not_called()

    @patch("experiment_lambda.utils.mlflow_client.UntypedMlflowClient")
    @patch.dict(environ, {"MLFLOW_TRACKING_SERVER_ARN": "test-arn"})
    def test_wrapper_callable_method_success(self, mock_mlflow_client: MagicMock) -> None:
        """Test that wrapper correctly forwards callable method calls"""
        # Arrange
        mock_client_instance = MagicMock()
        mock_method = MagicMock(return_value="test_result")
        mock_client_instance.some_method = mock_method
        mock_mlflow_client.return_value = mock_client_instance

        wrapper = MlflowClientWithExceptionHandling()

        # Act
        result = wrapper.some_method("arg1", kwarg1="value1")

        # Assert
        self.assertEqual(result, "test_result")
        mock_method.assert_called_once_with("arg1", kwarg1="value1")

    @patch("experiment_lambda.utils.mlflow_client.UntypedMlflowClient")
    @patch.dict(environ, {"MLFLOW_TRACKING_SERVER_ARN": "test-arn"})
    def test_wrapper_non_callable_attribute(self, mock_mlflow_client: MagicMock) -> None:
        """Test that wrapper correctly forwards non-callable attribute access"""
        # Arrange
        mock_client_instance = MagicMock()
        mock_client_instance.some_property = "test_property_value"
        mock_mlflow_client.return_value = mock_client_instance

        wrapper = MlflowClientWithExceptionHandling()

        # Act
        result = wrapper.some_property

        # Assert
        self.assertEqual(result, "test_property_value")

    @patch("experiment_lambda.utils.mlflow_client.UntypedMlflowClient")
    @patch("experiment_lambda.utils.mlflow_client.map_domain_exception")
    @patch.dict(environ, {"MLFLOW_TRACKING_SERVER_ARN": "test-arn"})
    def test_wrapper_method_with_mlflow_exception_experiment_id(
        self, mock_map_exception: MagicMock, mock_mlflow_client: MagicMock
    ) -> None:
        """Test that wrapper handles MlflowException with experiment_id"""
        # Arrange
        mock_client_instance = MagicMock()
        mlflow_exception = MlflowException("Test exception")
        mock_method = MagicMock(side_effect=mlflow_exception)
        mock_client_instance.some_method = mock_method
        mock_mlflow_client.return_value = mock_client_instance

        mapped_exception = Exception("Mapped exception")
        mock_map_exception.return_value = mapped_exception

        wrapper = MlflowClientWithExceptionHandling()

        # Act & Assert
        with self.assertRaises(Exception) as context:
            wrapper.some_method(experiment_id="exp123")

        self.assertEqual(context.exception, mapped_exception)
        mock_map_exception.assert_called_once_with(mlflow_exception, "exp123", None)

    @patch("experiment_lambda.utils.mlflow_client.UntypedMlflowClient")
    @patch("experiment_lambda.utils.mlflow_client.map_domain_exception")
    @patch.dict(environ, {"MLFLOW_TRACKING_SERVER_ARN": "test-arn"})
    def test_wrapper_method_with_mlflow_exception_experiment_name(
        self, mock_map_exception: MagicMock, mock_mlflow_client: MagicMock
    ) -> None:
        """Test that wrapper handles MlflowException with experiment_name"""
        # Arrange
        mock_client_instance = MagicMock()
        mlflow_exception = MlflowException("Test exception")
        mock_method = MagicMock(side_effect=mlflow_exception)
        mock_client_instance.some_method = mock_method
        mock_mlflow_client.return_value = mock_client_instance

        mapped_exception = Exception("Mapped exception")
        mock_map_exception.return_value = mapped_exception

        wrapper = MlflowClientWithExceptionHandling()

        # Act & Assert
        with self.assertRaises(Exception) as context:
            wrapper.some_method(name="exp_name")

        self.assertEqual(context.exception, mapped_exception)
        mock_map_exception.assert_called_once_with(mlflow_exception, None, "exp_name")

    @patch("experiment_lambda.utils.mlflow_client.UntypedMlflowClient")
    @patch("experiment_lambda.utils.mlflow_client.map_domain_exception")
    @patch.dict(environ, {"MLFLOW_TRACKING_SERVER_ARN": "test-arn"})
    def test_wrapper_method_with_mlflow_exception_experiment_ids_list(
        self, mock_map_exception: MagicMock, mock_mlflow_client: MagicMock
    ) -> None:
        """Test that wrapper handles MlflowException with experiment_ids list"""
        # Arrange
        mock_client_instance = MagicMock()
        mlflow_exception = MlflowException("Test exception")
        mock_method = MagicMock(side_effect=mlflow_exception)
        mock_client_instance.some_method = mock_method
        mock_mlflow_client.return_value = mock_client_instance

        mapped_exception = Exception("Mapped exception")
        mock_map_exception.return_value = mapped_exception

        wrapper = MlflowClientWithExceptionHandling()

        # Act & Assert
        with self.assertRaises(Exception) as context:
            wrapper.some_method(experiment_ids=["exp1", "exp2"])

        self.assertEqual(context.exception, mapped_exception)
        mock_map_exception.assert_called_once_with(mlflow_exception, "exp1", None)

    @patch("experiment_lambda.utils.mlflow_client.UntypedMlflowClient")
    @patch("experiment_lambda.utils.mlflow_client.map_domain_exception")
    @patch.dict(environ, {"MLFLOW_TRACKING_SERVER_ARN": "test-arn"})
    def test_wrapper_method_with_mlflow_exception_empty_experiment_ids_list(
        self, mock_map_exception: MagicMock, mock_mlflow_client: MagicMock
    ) -> None:
        """Test that wrapper handles MlflowException with empty experiment_ids list"""
        # Arrange
        mock_client_instance = MagicMock()
        mlflow_exception = MlflowException("Test exception")
        mock_method = MagicMock(side_effect=mlflow_exception)
        mock_client_instance.some_method = mock_method
        mock_mlflow_client.return_value = mock_client_instance

        mapped_exception = Exception("Mapped exception")
        mock_map_exception.return_value = mapped_exception

        wrapper = MlflowClientWithExceptionHandling()

        # Act & Assert
        with self.assertRaises(Exception) as context:
            wrapper.some_method(experiment_ids=[])

        self.assertEqual(context.exception, mapped_exception)
        mock_map_exception.assert_called_once_with(mlflow_exception, None, None)


if __name__ == "__main__":
    unittest.main()
