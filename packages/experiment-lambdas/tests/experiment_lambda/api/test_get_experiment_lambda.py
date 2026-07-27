import unittest
from unittest.mock import MagicMock, patch

from experiment_lambda.api.get_experiment_lambda import get_experiment
from experiment_lambda.api.utils.api_models import (
    Experiment,
    GetExperimentRequest,
    GetExperimentResponse,
    ResourceNotFoundException,
    ValidationException,
)


class TestGetExperimentLambda(unittest.TestCase):
    """Tests for get_experiment_lambda.py"""

    @patch("experiment_lambda.api.get_experiment_lambda.map_experiment")
    @patch("experiment_lambda.api.get_experiment_lambda.get_mlflow_client")
    def test_get_experiment_success(self, mock_get_mlflow_client: MagicMock, mock_map_experiment: MagicMock) -> None:
        """Test successful retrieval of an experiment"""
        # Arrange
        mock_client = MagicMock()
        mock_mlflow_experiment = MagicMock()
        mock_client.get_experiment_by_name.return_value = mock_mlflow_experiment
        mock_get_mlflow_client.return_value = mock_client

        experiment_name = "Test Experiment"
        mapped_experiment = Experiment(id="test-experiment-id", name=experiment_name, description="Test Description")
        mock_map_experiment.return_value = mapped_experiment

        request = GetExperimentRequest(name=experiment_name)

        # Act
        result = get_experiment(request)

        # Assert
        mock_client.get_experiment_by_name.assert_called_once_with(name=experiment_name)
        mock_map_experiment.assert_called_once_with(mock_mlflow_experiment)
        self.assertIsInstance(result, GetExperimentResponse)
        self.assertEqual(result.model_dump(), mapped_experiment.model_dump())

    @patch("experiment_lambda.api.get_experiment_lambda.get_mlflow_client")
    def test_get_experiment_not_found(self, mock_get_mlflow_client: MagicMock) -> None:
        """Test case when experiment is not found"""
        # Arrange
        mock_client = MagicMock()
        mock_client.get_experiment_by_name.return_value = None  # MLflow returns None for non-existent experiments
        mock_get_mlflow_client.return_value = mock_client

        experiment_name = "non-existent-experiment"
        request = GetExperimentRequest(name=experiment_name)

        # Act & Assert
        with self.assertRaises(ResourceNotFoundException) as exc_context:
            get_experiment(request)

        self.assertIn("not found", str(exc_context.exception))
        mock_client.get_experiment_by_name.assert_called_once_with(name=experiment_name)

    @patch("experiment_lambda.api.get_experiment_lambda.get_mlflow_client")
    def test_get_experiment_mlflow_exception(self, mock_get_mlflow_client: MagicMock) -> None:
        """Test handling of MlflowException during retrieval"""
        # Arrange
        mock_client = MagicMock()
        experiment_name = "invalid-name"
        # Exception is automatically handled by the wrapper,
        # so we expect the domain exception directly

        mock_client.get_experiment_by_name.side_effect = ValidationException("Invalid experiment name")
        mock_get_mlflow_client.return_value = mock_client

        request = GetExperimentRequest(name=experiment_name)

        # Act & Assert
        with self.assertRaises(ValidationException):
            get_experiment(request)

        mock_client.get_experiment_by_name.assert_called_once()


if __name__ == "__main__":
    unittest.main()
