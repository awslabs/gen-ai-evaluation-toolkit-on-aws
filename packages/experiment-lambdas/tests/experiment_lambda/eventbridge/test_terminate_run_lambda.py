import unittest
from typing import Optional, cast
from unittest.mock import MagicMock, patch

from mlflow.store.entities import PagedList

from experiment_lambda.api.utils.api_models import Run
from experiment_lambda.eventbridge.terminate_run_handler import terminate_run
from experiment_lambda.eventbridge.utils.eventbridge_models import (
    ResourceNotFoundException,
    TerminateRunDetail,
)
from experiment_lambda.protocols import MlflowPagedList, MlflowRun


class TerminateRunTests(unittest.TestCase):
    """Tests for report_metrics_lambda.py"""

    def sample_event(self) -> TerminateRunDetail:
        return TerminateRunDetail(runId="test-run-123", experimentName="exp-123")

    @patch("experiment_lambda.eventbridge.terminate_run_handler.get_mlflow_client")
    def test_handler_success(self, mock_get_mlflow_client: MagicMock):
        # Create mock client instance
        mock_client = MagicMock()
        mock_get_mlflow_client.return_value = mock_client

        # Mock experiment
        mock_experiment = MagicMock()
        mock_experiment.experiment_id = "test-exp-id"
        mock_client.get_experiment_by_name.return_value = mock_experiment

        # Mock run
        mock_run = MagicMock()
        mock_run.info = MagicMock()
        mock_run.info.run_id = "test-run-id"
        mock_client.search_runs.return_value = get_mock_run_list([mock_run])

        # Act
        terminate_run(self.sample_event())

        # Verify MLflow client creation and interactions
        mock_client.get_experiment_by_name.assert_called_once_with("exp-123")
        mock_client.search_runs.assert_called_once_with(
            experiment_ids=["test-exp-id"], filter_string="attribute.run_name = 'test-run-123'"
        )

        # Verify run was terminated with FAILED status
        mock_client.set_terminated.assert_called_once_with("test-run-id", "FAILED")

    @patch("experiment_lambda.eventbridge.terminate_run_handler.get_mlflow_client")
    def test_handler_experiment_not_found(self, mock_get_mlflow_client: MagicMock):
        # Create mock client instance
        mock_client = MagicMock()
        mock_get_mlflow_client.return_value = mock_client

        # Mock experiment not found
        mock_client.get_experiment_by_name.return_value = None

        # Act and Assert
        with self.assertRaises(ResourceNotFoundException) as context:
            terminate_run(self.sample_event())

        # Verify exception message contains experiment name
        self.assertIn("exp-123", str(context.exception))

        # Verify no run termination was attempted
        mock_client.set_terminated.assert_not_called()

    @patch("experiment_lambda.eventbridge.terminate_run_handler.get_mlflow_client")
    def test_handler_error_on_more_than_one_run(self, mock_get_mlflow_client: MagicMock):
        # Create mock client instance
        mock_client = MagicMock()
        mock_get_mlflow_client.return_value = mock_client

        # Mock experiment
        mock_experiment = MagicMock()
        mock_experiment.experiment_id = "test-exp-id"
        mock_client.get_experiment_by_name.return_value = mock_experiment

        mock_runs: list[MlflowRun] = []
        for i in range(3):
            mock_run = MagicMock()
            mock_run.info = MagicMock()
            mock_run.info.run_id = f"test-run-id-{i + 1}"
            mock_runs.append(mock_run)

        mock_client.search_runs.return_value = get_mock_run_list(mock_runs)

        # Act and Assert
        with self.assertRaises(ValueError) as context:
            terminate_run(self.sample_event())

        # Verify exception message contains run name and count
        self.assertIn("test-run-123", str(context.exception))
        self.assertIn("3", str(context.exception))  # 3 runs found

        # Verify no run termination was attempted
        mock_client.set_terminated.assert_not_called()

    @patch("experiment_lambda.eventbridge.terminate_run_handler.get_mlflow_client")
    def test_handler_error_on_no_runs(self, mock_get_mlflow_client: MagicMock):
        # Create mock client instance
        mock_client = MagicMock()
        mock_get_mlflow_client.return_value = mock_client

        # Mock experiment
        mock_experiment = MagicMock()
        mock_experiment.experiment_id = "test-exp-id"
        mock_client.get_experiment_by_name.return_value = mock_experiment

        mock_client.search_runs.return_value = get_mock_run_list([])

        # Act and Assert
        with self.assertRaises(ResourceNotFoundException) as context:
            terminate_run(self.sample_event())

        # Verify exception message contains run name
        self.assertIn("test-run-123", str(context.exception))

        # Verify no run termination was attempted
        mock_client.set_terminated.assert_not_called()


def get_mock_run_list(
    runs: Optional[list[MlflowRun]] = None, token: Optional[str] = None
) -> MlflowPagedList[MlflowRun]:
    return cast(MlflowPagedList[MlflowRun], PagedList[Run](cast(list[Run], runs if runs else []), token))


if __name__ == "__main__":
    unittest.main()
