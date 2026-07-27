import unittest
from unittest.mock import MagicMock, patch

from experiment_lambda.api.delete_experiment_lambda import delete_experiment
from experiment_lambda.api.utils.api_models import (
    DeleteExperimentRequest,
    EmptyResponse,
)


class TestDeleteExperimentLambda(unittest.TestCase):
    """Tests for delete_experiment_lambda.py"""

    @patch("experiment_lambda.api.delete_experiment_lambda.get_mlflow_client")
    def test_delete_experiment_success(self, mock_get_mlflow_client: MagicMock) -> None:
        """Test successful deletion of an experiment"""
        # Arrange
        mock_client = MagicMock()
        mock_mlflow_experiment = MagicMock()
        mock_mlflow_experiment.experiment_id = "test-experiment-id"
        mock_client.get_experiment_by_name.return_value = mock_mlflow_experiment
        mock_get_mlflow_client.return_value = mock_client

        experiment_name = "test-experiment"
        request = DeleteExperimentRequest(name=experiment_name)

        # Act
        result = delete_experiment(request)

        # Assert
        mock_client.get_experiment_by_name.assert_called_once_with(name=experiment_name)
        mock_client.delete_experiment.assert_called_once_with(experiment_id="test-experiment-id")
        self.assertIsInstance(result, EmptyResponse)
        self.assertEqual(result.status_code, 204)

    @patch("experiment_lambda.api.delete_experiment_lambda.get_mlflow_client")
    def test_delete_experiment_resource_not_found(self, mock_get_mlflow_client: MagicMock) -> None:
        """Test handling of non-existent experiment (resource not found)"""
        # Arrange
        mock_client = MagicMock()
        # Return None to simulate experiment not found
        mock_client.get_experiment_by_name.return_value = None
        mock_get_mlflow_client.return_value = mock_client

        experiment_name = "non-existent-experiment"
        request = DeleteExperimentRequest(name=experiment_name)

        # Act
        result = delete_experiment(request)

        # Assert
        mock_client.get_experiment_by_name.assert_called_once_with(name=experiment_name)
        mock_client.delete_experiment.assert_not_called()
        self.assertIsInstance(result, EmptyResponse)
        self.assertEqual(result.status_code, 204)


if __name__ == "__main__":
    unittest.main()
