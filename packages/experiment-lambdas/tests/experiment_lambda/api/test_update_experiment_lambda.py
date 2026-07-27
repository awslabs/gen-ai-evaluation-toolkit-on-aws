import unittest
from unittest.mock import MagicMock, patch

from experiment_lambda.api.update_experiment_lambda import update_experiment
from experiment_lambda.api.utils.api_models import (
    Experiment,
    GetExperimentResponse,
    ResourceNotFoundException,
    UpdateExperimentRequest,
    UpdateExperimentResponse,
)
from experiment_lambda.protocols import MlflowTagIds


class TestUpdateExperimentLambda(unittest.TestCase):
    """Tests for update_experiment_lambda.py"""

    @patch("experiment_lambda.api.update_experiment_lambda.get_experiment")
    @patch("experiment_lambda.api.update_experiment_lambda.get_mlflow_client")
    def test_update_experiment_name_only(
        self, mock_get_mlflow_client: MagicMock, mock_get_experiment: MagicMock
    ) -> None:
        """Test updating experiment name only"""
        # Arrange
        mock_client = MagicMock()
        mock_mlflow_experiment = MagicMock()
        mock_mlflow_experiment.experiment_id = "test-experiment-id"
        mock_client.get_experiment_by_name.return_value = mock_mlflow_experiment
        mock_get_mlflow_client.return_value = mock_client

        experiment_name = "test-experiment"
        new_name = "Updated Experiment Name"

        # Mock get_experiment to return a response with the updated experiment
        updated_experiment = Experiment(id="test-experiment-id", name=new_name, description="Original Description")
        mock_get_experiment.return_value = GetExperimentResponse(**updated_experiment.model_dump())

        request = UpdateExperimentRequest(name=experiment_name, newName=new_name)

        # Act
        result = update_experiment(request)

        # Assert
        mock_client.get_experiment_by_name.assert_called_once_with(experiment_name)
        mock_client.rename_experiment.assert_called_once_with(experiment_id="test-experiment-id", new_name=new_name)
        mock_client.set_experiment_tag.assert_not_called()

        self.assertIsInstance(result, UpdateExperimentResponse)
        self.assertEqual(result.model_dump(), updated_experiment.model_dump())

    @patch("experiment_lambda.api.update_experiment_lambda.get_experiment")
    @patch("experiment_lambda.api.update_experiment_lambda.get_mlflow_client")
    def test_update_experiment_description_only(
        self, mock_get_mlflow_client: MagicMock, mock_get_experiment: MagicMock
    ) -> None:
        """Test updating experiment description only"""
        # Arrange
        mock_client = MagicMock()
        mock_mlflow_experiment = MagicMock()
        mock_mlflow_experiment.experiment_id = "test-experiment-id"
        mock_client.get_experiment_by_name.return_value = mock_mlflow_experiment
        mock_get_mlflow_client.return_value = mock_client

        experiment_name = "test-experiment"
        new_description = "Updated Description"

        # Mock get_experiment to return a response with the updated experiment
        updated_experiment = Experiment(id="test-experiment-id", name=experiment_name, description=new_description)
        mock_get_experiment.return_value = GetExperimentResponse(**updated_experiment.model_dump())

        request = UpdateExperimentRequest(name=experiment_name, description=new_description)

        # Act
        result = update_experiment(request)

        # Assert
        mock_client.get_experiment_by_name.assert_called_once_with(experiment_name)
        mock_client.rename_experiment.assert_not_called()
        mock_client.set_experiment_tag.assert_called_once_with(
            experiment_id="test-experiment-id",
            key=MlflowTagIds.experiment_description,
            value=new_description,
        )

        self.assertIsInstance(result, UpdateExperimentResponse)
        self.assertEqual(result.model_dump(), updated_experiment.model_dump())

    @patch("experiment_lambda.api.update_experiment_lambda.get_experiment")
    @patch("experiment_lambda.api.update_experiment_lambda.get_mlflow_client")
    def test_update_experiment_both_fields(
        self, mock_get_mlflow_client: MagicMock, mock_get_experiment: MagicMock
    ) -> None:
        """Test updating both experiment name and description"""
        # Arrange
        mock_client = MagicMock()
        mock_mlflow_experiment = MagicMock()
        mock_mlflow_experiment.experiment_id = "test-experiment-id"
        mock_client.get_experiment_by_name.return_value = mock_mlflow_experiment
        mock_get_mlflow_client.return_value = mock_client

        experiment_name = "test-experiment"
        new_name = "Updated Experiment Name"
        new_description = "Updated Description"

        # Mock get_experiment to return a response with the updated experiment
        updated_experiment = Experiment(id="test-experiment-id", name=new_name, description=new_description)
        mock_get_experiment.return_value = GetExperimentResponse(**updated_experiment.model_dump())

        request = UpdateExperimentRequest(name=experiment_name, newName=new_name, description=new_description)

        # Act
        result = update_experiment(request)

        # Assert
        mock_client.get_experiment_by_name.assert_called_once_with(experiment_name)
        mock_client.rename_experiment.assert_called_once_with(experiment_id="test-experiment-id", new_name=new_name)
        mock_client.set_experiment_tag.assert_called_once_with(
            experiment_id="test-experiment-id",
            key=MlflowTagIds.experiment_description,
            value=new_description,
        )

        self.assertIsInstance(result, UpdateExperimentResponse)
        self.assertEqual(result.model_dump(), updated_experiment.model_dump())

    @patch("experiment_lambda.api.update_experiment_lambda.get_mlflow_client")
    def test_update_experiment_not_found(self, mock_get_mlflow_client: MagicMock) -> None:
        """Test case when experiment is not found"""
        # Arrange
        mock_client = MagicMock()
        mock_client.get_experiment_by_name.return_value = None  # MLflow returns None for non-existent experiments
        mock_get_mlflow_client.return_value = mock_client

        experiment_name = "non-existent-experiment"
        request = UpdateExperimentRequest(name=experiment_name, newName="New Name")

        # Act & Assert
        with self.assertRaises(ResourceNotFoundException) as exc_context:
            update_experiment(request)

        self.assertIn("not found", str(exc_context.exception))
        mock_client.get_experiment_by_name.assert_called_once_with(experiment_name)
        mock_client.rename_experiment.assert_not_called()
        mock_client.set_experiment_tag.assert_not_called()


if __name__ == "__main__":
    unittest.main()
