import unittest
from unittest.mock import MagicMock, patch

from experiment_lambda.api.list_experiment_outputs_lambda import (
    list_experiment_outputs,
)
from experiment_lambda.api.utils.api_models import (
    ExperimentConfiguration,
    ExperimentOutput,
    ListExperimentOutputsRequest,
    ListExperimentOutputsResponse,
    ValidationException,
)
from experiment_lambda.protocols import MlflowPagedList, MlflowRun


class TestListExperimentOutputsLambda(unittest.TestCase):
    """Tests for list_experiment_outputs_lambda.py"""

    @patch("experiment_lambda.api.list_experiment_outputs_lambda.get_experiment_id")
    @patch("experiment_lambda.api.list_experiment_outputs_lambda.fetch_experiment_runs")
    @patch("experiment_lambda.api.list_experiment_outputs_lambda.aggregate_runs_by_version")
    def test_version_params_validation_success(
        self,
        mock_group_runs: MagicMock,
        mock_fetch_runs: MagicMock,
        mock_get_experiment_id: MagicMock,
    ) -> None:
        """Test that version validation succeeds with valid params"""
        # Arrange
        result: MlflowPagedList[MlflowRun] = MlflowPagedList([])
        result.token = None
        mock_fetch_runs.return_value = result
        mock_group_runs.return_value = {}
        mock_get_experiment_id.return_value = "test-experiment-id"

        request = ListExperimentOutputsRequest(name="test-experiment", startVersion=1, endVersion=5, maxResults=100)

        # Act & Assert - should not raise an exception
        list_experiment_outputs(request)  # No exception means validation passed

        # Verify service methods were called
        mock_get_experiment_id.assert_called_once_with("test-experiment")
        mock_fetch_runs.assert_called_once_with(request)

    @patch("experiment_lambda.api.list_experiment_outputs_lambda.get_experiment_id")
    @patch("experiment_lambda.api.list_experiment_outputs_lambda.fetch_experiment_runs")
    @patch("experiment_lambda.api.list_experiment_outputs_lambda.aggregate_runs_by_version")
    def test_version_params_validation_equal(
        self,
        mock_group_runs: MagicMock,
        mock_fetch_runs: MagicMock,
        mock_get_experiment_id: MagicMock,
    ) -> None:
        """Test that version validation succeeds when startVersion equals endVersion"""
        # Arrange
        result: MlflowPagedList[MlflowRun] = MlflowPagedList([])
        result.token = None
        mock_fetch_runs.return_value = result
        mock_group_runs.return_value = {}
        mock_get_experiment_id.return_value = "test-experiment-id"

        request = ListExperimentOutputsRequest(name="test-experiment", startVersion=5, endVersion=5, maxResults=100)

        # Act & Assert - should not raise an exception
        list_experiment_outputs(request)  # No exception means validation passed

        # Verify service methods were called
        mock_get_experiment_id.assert_called_once_with("test-experiment")
        mock_fetch_runs.assert_called_once_with(request)

    @patch("experiment_lambda.api.list_experiment_outputs_lambda.fetch_experiment_runs")
    @patch("experiment_lambda.api.list_experiment_outputs_lambda.aggregate_runs_by_version")
    def test_version_params_validation_invalid(self, mock_group_runs: MagicMock, mock_fetch_runs: MagicMock) -> None:
        """Test that version validation fails when startVersion > endVersion"""
        # Arrange
        # These should not be called since validation will fail first
        result: MlflowPagedList[MlflowRun] = MlflowPagedList([])
        result.token = None
        mock_fetch_runs.return_value = result
        mock_group_runs.return_value = {}

        request = ListExperimentOutputsRequest(name="test-experiment", startVersion=10, endVersion=5, maxResults=100)

        # Act & Assert
        with self.assertRaises(ValidationException) as context:
            list_experiment_outputs(request)

        self.assertIn("startVersion must be less than or equal to endVersion", str(context.exception))

        # Verify service methods were NOT called since validation failed
        mock_fetch_runs.assert_not_called()

    @patch("experiment_lambda.api.list_experiment_outputs_lambda.get_experiment_id")
    @patch("experiment_lambda.api.list_experiment_outputs_lambda.fetch_experiment_runs")
    @patch("experiment_lambda.api.list_experiment_outputs_lambda.aggregate_runs_by_version")
    def test_list_experiment_outputs_success(
        self,
        mock_group_runs: MagicMock,
        mock_fetch_runs: MagicMock,
        mock_get_experiment_id: MagicMock,
    ) -> None:
        """Test successful listing of experiment outputs"""
        # Arrange
        # Mock the runs
        mock_run1 = MagicMock()
        mock_run2 = MagicMock()
        mock_runs = [mock_run1, mock_run2]

        # Create a proper PagedList with a token
        mock_runs_paged = MlflowPagedList(mock_runs)
        mock_runs_paged.token = "next-token"
        mock_fetch_runs.return_value = mock_runs_paged
        mock_get_experiment_id.return_value = "test-experiment-id"

        # Mock process_runs
        mock_config1 = ExperimentOutput(
            id="test-experiment-id-v1",
            version=1,
            configuration=ExperimentConfiguration(
                testDataUrl="1.json",
                appId="1",
                plugins=[],
            ),
            runs=[],
        )
        mock_config2 = ExperimentOutput(
            id="test-experiment-id-v2",
            version=2,
            configuration=ExperimentConfiguration(
                testDataUrl="2.json",
                appId="2",
                plugins=[],
            ),
            runs=[],
        )
        mock_group_runs.return_value = {1: mock_config1, 2: mock_config2}

        # Create request
        request = ListExperimentOutputsRequest(name="Test Experiment", startVersion=1, endVersion=10, maxResults=100)

        # Act
        result = list_experiment_outputs(request)

        # Assert
        mock_get_experiment_id.assert_called_once_with("Test Experiment")
        mock_fetch_runs.assert_called_once_with(request)
        mock_group_runs.assert_called_once_with(mock_runs)
        self.assertIsInstance(result, ListExperimentOutputsResponse)
        self.assertEqual(result.id, "test-experiment-id")
        self.assertEqual(len(result.outputs), 2)
        self.assertEqual(result.hasMore, True)
        self.assertEqual(result.nextToken, "next-token")


if __name__ == "__main__":
    unittest.main()
