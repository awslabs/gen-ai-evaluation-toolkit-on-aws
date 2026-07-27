import unittest
from unittest.mock import MagicMock, patch

from experiment_lambda.api.create_experiment_lambda import create_experiment
from experiment_lambda.api.utils.api_models import (
    ConflictException,
    CreateExperimentRequest,
    CreateExperimentResponse,
    Experiment,
    GetExperimentResponse,
)
from experiment_lambda.protocols import MlflowTagIds


class TestCreateExperimentLambda(unittest.TestCase):
    """Tests for create_experiment_lambda.py"""

    @patch("experiment_lambda.api.create_experiment_lambda.get_experiment")
    @patch("experiment_lambda.api.create_experiment_lambda.get_mlflow_client")
    def test_create_experiment_name_only(
        self, mock_get_mlflow_client: MagicMock, mock_get_experiment: MagicMock
    ) -> None:
        """Test creating experiment with name only"""
        # Arrange
        mock_client = MagicMock()
        mock_client.create_experiment.return_value = "test-experiment-id"
        mock_get_mlflow_client.return_value = mock_client

        experiment_name = "Test Experiment"

        # Mock get_experiment to return a response with the created experiment
        created_experiment = Experiment(
            id="test-experiment-id",
            name=experiment_name,
        )
        mock_get_experiment.return_value = GetExperimentResponse(**created_experiment.model_dump())

        request = CreateExperimentRequest(name=experiment_name)

        # Act
        result = create_experiment(request)

        # Assert
        mock_client.create_experiment.assert_called_once_with(name=experiment_name, tags=None)
        mock_get_experiment.assert_called_once()

        self.assertIsInstance(result, CreateExperimentResponse)
        self.assertEqual(result.model_dump(), created_experiment.model_dump())

    @patch("experiment_lambda.api.create_experiment_lambda.get_experiment")
    @patch("experiment_lambda.api.create_experiment_lambda.get_mlflow_client")
    def test_create_experiment_with_description(
        self, mock_get_mlflow_client: MagicMock, mock_get_experiment: MagicMock
    ) -> None:
        """Test creating experiment with name and description"""
        # Arrange
        mock_client = MagicMock()
        mock_client.create_experiment.return_value = "test-experiment-id"
        mock_get_mlflow_client.return_value = mock_client

        experiment_name = "Test Experiment"
        experiment_description = "Test Description"

        # Mock get_experiment to return a response with the created experiment
        created_experiment = Experiment(
            id="test-experiment-id", name=experiment_name, description=experiment_description
        )
        mock_get_experiment.return_value = GetExperimentResponse(**created_experiment.model_dump())

        request = CreateExperimentRequest(name=experiment_name, description=experiment_description)

        # Act
        result = create_experiment(request)

        # Assert
        expected_tags = {MlflowTagIds.experiment_description: experiment_description}
        mock_client.create_experiment.assert_called_once_with(name=experiment_name, tags=expected_tags)
        mock_get_experiment.assert_called_once()

        self.assertIsInstance(result, CreateExperimentResponse)
        self.assertEqual(result.model_dump(), created_experiment.model_dump())

    @patch("experiment_lambda.api.create_experiment_lambda.get_mlflow_client")
    def test_create_experiment_mlflow_exception(self, mock_get_mlflow_client: MagicMock) -> None:
        """Test handling of MlflowException during creation"""
        # Arrange
        mock_client = MagicMock()
        # Exception is automatically handled by the wrapper,
        # so we expect the domain exception directly

        mock_client.create_experiment.side_effect = ConflictException("Experiment name already exists")
        mock_get_mlflow_client.return_value = mock_client

        request = CreateExperimentRequest(name="Existing Experiment")

        # Act & Assert
        with self.assertRaises(ConflictException):
            create_experiment(request)

        mock_client.create_experiment.assert_called_once()


if __name__ == "__main__":
    unittest.main()
