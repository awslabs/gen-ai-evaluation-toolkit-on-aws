import unittest
from unittest.mock import MagicMock, patch

from experiment_lambda.eventbridge.report_metrics_lambda import (
    report_metrics,
    sanitize_metric_name,
)
from experiment_lambda.eventbridge.utils.eventbridge_models import (
    EmptyResponse,
    MetricsReportingDetail,
    ResourceNotFoundException,
    Score,
)


class TestReportMetricsLambda(unittest.TestCase):
    """Tests for report_metrics_lambda.py"""

    @patch("experiment_lambda.eventbridge.report_metrics_lambda.get_mlflow_client")
    def test_report_metrics_success(self, mock_get_mlflow_client: MagicMock) -> None:
        """Test successful reporting of metrics"""
        # Arrange
        mock_client = MagicMock()

        # Mock experiment
        mock_experiment = MagicMock()
        mock_experiment.experiment_id = "test-experiment-id"
        mock_client.get_experiment_by_name.return_value = mock_experiment

        # Mock run
        mock_run = MagicMock()
        mock_run.info.run_id = "test-run-id"
        mock_client.search_runs.return_value = [mock_run]

        mock_get_mlflow_client.return_value = mock_client

        # Create test metrics
        metrics = [Score(metricId="accuracy", score=0.95), Score(metricId="precision", score=0.87)]

        detail = MetricsReportingDetail(experimentName="test-experiment", runId="test-run", aggregatedMetrics=metrics)

        # Act
        result = report_metrics(detail)

        # Assert
        mock_client.get_experiment_by_name.assert_called_once_with("test-experiment")
        mock_client.search_runs.assert_called_once_with(
            experiment_ids=["test-experiment-id"], filter_string="attribute.run_name = 'test-run'"
        )

        # Verify metrics were logged
        self.assertEqual(mock_client.log_metric.call_count, 2)
        mock_client.log_metric.assert_any_call(run_id="test-run-id", key="accuracy", value=0.95)
        mock_client.log_metric.assert_any_call(run_id="test-run-id", key="precision", value=0.87)

        # Verify run was terminated
        mock_client.set_terminated.assert_called_once_with("test-run-id")

        self.assertIsInstance(result, EmptyResponse)

    @patch("experiment_lambda.eventbridge.report_metrics_lambda.get_mlflow_client")
    def test_report_metrics_experiment_not_found(self, mock_get_mlflow_client: MagicMock) -> None:
        """Test reporting metrics for a non-existent experiment"""
        # Arrange
        mock_client = MagicMock()
        mock_client.get_experiment_by_name.return_value = None
        mock_get_mlflow_client.return_value = mock_client

        detail = MetricsReportingDetail(
            experimentName="non-existent-experiment",
            runId="test-run",
            aggregatedMetrics=[Score(metricId="accuracy", score=0.95)],
        )

        # Act & Assert
        with self.assertRaises(ResourceNotFoundException) as exc_context:
            report_metrics(detail)

        self.assertIn("non-existent-experiment", str(exc_context.exception))
        mock_client.search_runs.assert_not_called()
        mock_client.log_metric.assert_not_called()

    @patch("experiment_lambda.eventbridge.report_metrics_lambda.get_mlflow_client")
    def test_report_metrics_run_not_found(self, mock_get_mlflow_client: MagicMock) -> None:
        """Test reporting metrics for a non-existent run"""
        # Arrange
        mock_client = MagicMock()

        # Mock experiment exists
        mock_experiment = MagicMock()
        mock_experiment.experiment_id = "test-experiment-id"
        mock_client.get_experiment_by_name.return_value = mock_experiment

        # Mock run doesn't exist
        mock_client.search_runs.return_value = []

        mock_get_mlflow_client.return_value = mock_client

        detail = MetricsReportingDetail(
            experimentName="test-experiment",
            runId="non-existent-run",
            aggregatedMetrics=[Score(metricId="accuracy", score=0.95)],
        )

        # Act & Assert
        with self.assertRaises(ResourceNotFoundException) as exc_context:
            report_metrics(detail)

        self.assertIn("non-existent-run", str(exc_context.exception))
        mock_client.log_metric.assert_not_called()
        mock_client.set_terminated.assert_not_called()


class TestSanitizeMetricName(unittest.TestCase):
    """Tests for sanitize_metric_name function"""

    def test_sanitize_parentheses(self) -> None:
        """Test sanitization of parentheses with mode parameter"""
        result = sanitize_metric_name("ragas_topic_adherence(mode=precision)_count")
        self.assertEqual(result, "ragas_topic_adherence_precision_count")

    def test_sanitize_equals(self) -> None:
        """Test sanitization of equals sign"""
        result = sanitize_metric_name("metric=value")
        self.assertEqual(result, "metric_value")

    def test_sanitize_multiple_underscores(self) -> None:
        """Test collapsing multiple underscores"""
        result = sanitize_metric_name("metric___name")
        self.assertEqual(result, "metric_name")

    def test_sanitize_valid_name(self) -> None:
        """Test that valid names are unchanged"""
        result = sanitize_metric_name("valid_metric-name.123")
        self.assertEqual(result, "valid_metric-name.123")


if __name__ == "__main__":
    unittest.main()
