import unittest
from unittest.mock import MagicMock, patch

from experiment_lambda.eventbridge.report_configuration_lambda import (
    collect_plugin_configuratons,
    report_configuration,
)
from experiment_lambda.eventbridge.utils.eventbridge_models import (
    Config,
    ConfigurationReportingDetail,
    EmptyResponse,
    Evaluator,
    Plugin,
    PluginConfiguration,
    ResourceNotFoundException,
    S3BucketLocation,
)
from experiment_lambda.protocols import MlflowTagIds


class TestReportConfigurationLambda(unittest.TestCase):
    """Tests for report_configuration_lambda.py"""

    @patch("experiment_lambda.eventbridge.report_configuration_lambda.get_mlflow_client")
    def test_report_configuration_success(self, mock_get_mlflow_client: MagicMock) -> None:
        """Test successful reporting of configuration"""
        # Arrange
        mock_client = MagicMock()

        # Mock experiment
        mock_experiment = MagicMock()
        mock_experiment.experiment_id = "test-experiment-id"
        mock_client.get_experiment_by_name.return_value = mock_experiment

        # Mock run
        mock_run = MagicMock()
        mock_run.info.run_id = "test-run-id"
        mock_client.create_run.return_value = mock_run

        mock_get_mlflow_client.return_value = mock_client

        # Create test configuration
        config = Config(
            version=1,
            testData=S3BucketLocation(bucketName="test-bucket", prefix="test-prefix"),
            appId="test-app-id",
            plugins=[
                Plugin(
                    plugin="test-plugin",
                    configuration=PluginConfiguration(
                        evaluators=[Evaluator(name="metric1", params={"param1": "value1"})]
                    ),
                )
            ],
        )

        detail = ConfigurationReportingDetail(experimentName="test-experiment", runId="test-run", config=config)

        # Act
        result = report_configuration(detail)

        # Assert
        mock_client.get_experiment_by_name.assert_called_once_with("test-experiment")
        mock_client.create_run.assert_called_once_with(experiment_id="test-experiment-id", run_name="test-run")

        # Verify parameters were logged
        self.assertEqual(mock_client.log_param.call_count, 3)
        mock_client.log_param.assert_any_call("test-run-id", "testDataUrl", "test-bucket/test-prefix")
        mock_client.log_param.assert_any_call("test-run-id", "appId", "test-app-id")

        # Verify config version was logged as a metric
        mock_client.log_metric.assert_called_once_with(
            run_id="test-run-id", key=MlflowTagIds.configuration_version, value=1
        )

        self.assertIsInstance(result, EmptyResponse)

    @patch("experiment_lambda.eventbridge.report_configuration_lambda.get_mlflow_client")
    def test_report_configuration_experiment_not_found(self, mock_get_mlflow_client: MagicMock) -> None:
        """Test reporting configuration for a non-existent experiment"""
        # Arrange
        mock_client = MagicMock()
        mock_client.get_experiment_by_name.return_value = None
        mock_get_mlflow_client.return_value = mock_client

        config = Config(
            version=1,
            testData=S3BucketLocation(bucketName="test-bucket", prefix="test-prefix"),
            appId="test-app-id",
        )

        detail = ConfigurationReportingDetail(experimentName="non-existent-experiment", runId="test-run", config=config)

        # Act & Assert
        with self.assertRaises(ResourceNotFoundException) as exc_context:
            report_configuration(detail)

        self.assertIn("non-existent-experiment", str(exc_context.exception))
        mock_client.create_run.assert_not_called()
        mock_client.log_param.assert_not_called()
        mock_client.log_metric.assert_not_called()

    def test_collect_plugins_with_plugins(self) -> None:
        """Test collecting plugins from configuration"""
        # Arrange
        config = Config(
            version=1,
            testData=S3BucketLocation(bucketName="test-bucket", prefix="test-prefix"),
            appId="test-app-id",
            plugins=[
                Plugin(
                    plugin="plugin1",
                    configuration=PluginConfiguration(
                        evaluators=[
                            Evaluator(name="metric1", params={"param1": "value1"}),
                            Evaluator(name="metric2", params={"param2": "value2"}),
                        ]
                    ),
                ),
                Plugin(
                    plugin="plugin2",
                    configuration=PluginConfiguration(
                        evaluators=[Evaluator(name="metric3", params={"param3": "value3"})]
                    ),
                ),
            ],
        )

        # Act
        result = collect_plugin_configuratons(config)

        # Assert
        self.assertEqual(len(result), 2)

        # Check first plugin
        self.assertEqual(result[0].plugin, "plugin1")
        self.assertEqual(len(result[0].evaluators), 2)
        self.assertEqual(result[0].evaluators[0].name, "metric1")
        self.assertEqual(result[0].evaluators[0].params, {"param1": "value1"})
        self.assertEqual(result[0].evaluators[1].name, "metric2")
        self.assertEqual(result[0].evaluators[1].params, {"param2": "value2"})

        # Check second plugin
        self.assertEqual(result[1].plugin, "plugin2")
        self.assertEqual(len(result[1].evaluators), 1)
        self.assertEqual(result[1].evaluators[0].name, "metric3")
        self.assertEqual(result[1].evaluators[0].params, {"param3": "value3"})

    def test_collect_plugins_no_plugins(self) -> None:
        """Test collecting plugins from configuration with no plugins"""
        # Arrange
        config = Config(
            version=1,
            testData=S3BucketLocation(bucketName="test-bucket", prefix="test-prefix"),
            appId="test-app-id",
        )

        # Act
        result = collect_plugin_configuratons(config)

        # Assert
        self.assertEqual(result, [])

    def test_collect_plugins_with_builtin_evaluators(self) -> None:
        """Test collecting plugins with builtIn evaluators (LLM-as-Judge)"""
        # Arrange
        config = Config(
            version=1,
            testData=S3BucketLocation(bucketName="test-bucket", prefix="test-prefix"),
            appId="test-app-id",
            plugins=[
                Plugin(
                    plugin="llm-as-judge-eval",
                    configuration=PluginConfiguration(
                        evaluators=[
                            Evaluator(builtIn="toxicity", params={}),
                            Evaluator(builtIn="sample", params={}),
                        ]
                    ),
                ),
            ],
        )

        # Act
        result = collect_plugin_configuratons(config)

        # Assert
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0].plugin, "llm-as-judge-eval")
        self.assertEqual(len(result[0].evaluators), 2)
        self.assertEqual(result[0].evaluators[0].name, "toxicity")
        self.assertEqual(result[0].evaluators[1].name, "sample")


if __name__ == "__main__":
    unittest.main()
