import unittest
from datetime import datetime
from typing import Any, Generic, List, NamedTuple, Optional, TypeVar, cast
from unittest.mock import MagicMock, patch

from mlflow.entities import Experiment, LifecycleStage, Run, RunData, RunInfo
from mlflow.exceptions import MlflowException
from mlflow.store.entities import PagedList
from pydantic import BaseModel

from experiment_lambda.api.utils.api_models import (
    EvaluatorConfiguration,
    ListExperimentOutputsRequest,
    PluginConfiguration,
    ResourceNotFoundException,
)
from experiment_lambda.api.utils.experiment_outputs_service import (
    aggregate_runs_by_version,
    fetch_experiment_runs,
    get_experiment_id,
)
from experiment_lambda.protocols import (
    MlflowExperiment,
    MlflowPagedList,
    MlflowRun,
    MlflowRunData,
    MlflowRunInfo,
    MlflowRunStatus,
    MlflowTagIds,
)
from experiment_lambda.utils.storage_models import MlflowLogStorageModel


class TestExperimentOutputsService(unittest.TestCase):
    """Tests for experiment_outputs_service.py"""

    @patch("experiment_lambda.api.utils.experiment_outputs_service.get_mlflow_client")
    def test_get_experiment_id_success(self, mock_get_mlflow_client: MagicMock) -> None:
        """Test successful retrieval of experiment ID by name"""
        # Arrange
        mock_client = MagicMock()
        mock_experiment = get_mock_experiment(experiment_id="test-exp-123", name="test-experiment")
        mock_client.get_experiment_by_name.return_value = mock_experiment
        mock_get_mlflow_client.return_value = mock_client

        # Act
        result = get_experiment_id("test-experiment")

        # Assert
        self.assertEqual(result, "test-exp-123")
        mock_client.get_experiment_by_name.assert_called_once_with(name="test-experiment")

    @patch("experiment_lambda.api.utils.experiment_outputs_service.get_mlflow_client")
    def test_get_experiment_id_not_found(self, mock_get_mlflow_client: MagicMock) -> None:
        """Test ResourceNotFoundException when experiment is not found"""
        # Arrange
        mock_client = MagicMock()
        mock_client.get_experiment_by_name.return_value = None
        mock_get_mlflow_client.return_value = mock_client

        # Act & Assert
        with self.assertRaises(ResourceNotFoundException) as context:
            get_experiment_id("non-existent-experiment")

        self.assertIn("non-existent-experiment", str(context.exception))
        mock_client.get_experiment_by_name.assert_called_once_with(name="non-existent-experiment")

    @patch("experiment_lambda.api.utils.experiment_outputs_service.get_mlflow_client")
    def test_fetch_experiment_runs_experiment_not_found(self, mock_get_mlflow_client: MagicMock) -> None:
        """Test that ResourceNotFoundException is raised when experiment is not found"""
        # Arrange
        mock_client = MagicMock()
        mock_client.get_experiment_by_name.return_value = None
        mock_get_mlflow_client.return_value = mock_client

        request = ListExperimentOutputsRequest(
            name="non-existent-experiment", startVersion=1, endVersion=5, maxResults=100
        )

        # Act & Assert
        with self.assertRaises(ResourceNotFoundException) as context:
            fetch_experiment_runs(request)

        self.assertIn("non-existent-experiment", str(context.exception))
        mock_client.get_experiment_by_name.assert_called_once_with(name="non-existent-experiment")

    @patch("experiment_lambda.api.utils.experiment_outputs_service.get_mlflow_client")
    def test_fetch_experiment_runs_mlflow_exception(self, mock_get_mlflow_client: MagicMock) -> None:
        """Test handling of MlflowException when fetching experiment"""
        # Arrange
        mock_client = MagicMock()
        mock_client.get_experiment_by_name.side_effect = MlflowException("MLflow error")
        mock_get_mlflow_client.return_value = mock_client

        request = ListExperimentOutputsRequest(name="test-experiment", startVersion=1, endVersion=5, maxResults=100)

        # Act & Assert - The exception should be mapped by the mapper
        with self.assertRaises(MlflowException):
            fetch_experiment_runs(request)

        mock_client.get_experiment_by_name.assert_called_once_with(name="test-experiment")

    @patch("experiment_lambda.api.utils.experiment_outputs_service.get_mlflow_client")
    def test_fetch_experiment_runs_search_exception(self, mock_get_mlflow_client: MagicMock) -> None:
        """Test handling of MlflowException when searching runs"""
        # Arrange
        mock_client = MagicMock()
        mock_client.get_experiment_by_name.return_value = get_mock_experiment()
        mock_client.search_runs.side_effect = MlflowException("Search error")
        mock_get_mlflow_client.return_value = mock_client

        request = ListExperimentOutputsRequest(name="test-experiment", startVersion=1, endVersion=5, maxResults=100)

        # Act & Assert - The exception should be mapped by the mapper
        with self.assertRaises(MlflowException):
            fetch_experiment_runs(request)

        mock_client.get_experiment_by_name.assert_called_once_with(name="test-experiment")
        mock_client.search_runs.assert_called_once()

    @patch("experiment_lambda.api.utils.experiment_outputs_service.get_mlflow_client")
    def test_fetch_experiment_runs_success(self, mock_get_mlflow_client: MagicMock) -> None:
        """Test fetching experiment runs successfully"""
        # Arrange
        run1 = get_mock_run(
            run_info=get_mock_run_info(run_id="run-1"),
        )
        run2 = get_mock_run(
            run_info=get_mock_run_info(run_id="run-2"),
        )
        mock_runs = get_mock_run_list([run1, run2])

        mock_client = MagicMock()
        mock_client.get_experiment_by_name.return_value = get_mock_experiment()
        mock_client.search_runs.return_value = mock_runs
        mock_get_mlflow_client.return_value = mock_client

        request = ListExperimentOutputsRequest(
            name="test-experiment",
            startVersion=1,
            endVersion=5,
            maxResults=100,
            nextToken="page-token",
        )

        # Act
        result = fetch_experiment_runs(request)

        # Assert
        self.assertEqual(result, mock_runs)
        mock_client.get_experiment_by_name.assert_called_once_with(name="test-experiment")
        mock_client.search_runs.assert_called_once_with(
            experiment_ids=["test-experiment-id"],
            order_by=["start_time DESC"],
            filter_string=(
                f"metric.{MlflowTagIds.configuration_version} >= 1 AND metric.{MlflowTagIds.configuration_version} <= 5"
            ),
            max_results=100,
            page_token="page-token",
        )

    def test_process_runs_empty(self) -> None:
        """Test processing of empty runs list"""
        # Arrange
        runs_list: List[Any] = get_mock_run_list([])

        # Act
        result = aggregate_runs_by_version(runs_list)

        # Assert
        self.assertEqual(len(result), 0)

    def test_process_runs_with_valid_data(self) -> None:
        """Test processing runs with valid data"""

        params = get_mock_config(
            plugins=[
                PluginConfiguration(
                    plugin="plugin1",
                    evaluators=[
                        EvaluatorConfiguration(name="metric1", params={}),
                        EvaluatorConfiguration(name="metric2", params={}),
                    ],
                )
            ]
        )
        # Arrange
        # Create mock run 1
        mock_run1 = get_mock_run(
            run_info=get_mock_run_info(run_id="run-1", run_name="Run 1", status="FINISHED"),
            run_data=get_mock_run_data(
                metrics={
                    MlflowTagIds.configuration_version: 1,
                    "metric1_avg": 0.9,
                    "metric1_max": 0.95,
                    "metric2_avg": 0.8,
                },
                params=params,
            ),
        )

        # Create mock run 2 (different version)
        mock_run2 = get_mock_run(
            run_info=get_mock_run_info(run_id="run-2", run_name="Run 2", status="FINISHED"),
            run_data=get_mock_run_data(
                metrics={
                    MlflowTagIds.configuration_version: 2,
                    "metric1_avg": 0.92,
                    "metric2_avg": 0.85,
                },
                params=params,
            ),
        )

        # Create mock run 3 (missing version, should be skipped)
        mock_run3 = get_mock_run(
            run_info=get_mock_run_info(run_id="run-3", run_name="Run 3", status="FINISHED"),
            run_data=get_mock_run_data(
                metrics={
                    # No version metric
                    "metric1_avg": 0.7
                },
                params=params,
            ),
        )

        runs_list = get_mock_run_list([mock_run1, mock_run2, mock_run3])

        # Act
        result = aggregate_runs_by_version(runs_list)

        # Assert
        self.assertEqual(len(result), 2)  # Should have 2 versions

        # Check version 1
        self.assertIn(1, result)
        self.assertEqual(result[1].version, 1)

        # Check version 2
        self.assertIn(2, result)
        self.assertEqual(result[2].version, 2)

    def test_process_runs_with_invalid_config_version(self) -> None:
        """Test processing runs with invalid config version format"""
        # Arrange
        mock_run_data = get_mock_run_data(
            metrics={
                MlflowTagIds.configuration_version: "not-an-integer",  # type: ignore
                "metric1_avg": 0.9,
            },
        )
        mock_run = get_mock_run(run_data=mock_run_data)

        runs_list = get_mock_run_list([mock_run])

        with self.assertRaises(ValueError):
            aggregate_runs_by_version(runs_list)

    def test_process_runs_with_type_error_in_processing(self) -> None:
        """Test processing runs with TypeError"""
        # Arrange
        mock_run_info = get_mock_run_info(run_id="type-error-run", run_name="Type Error Run")
        mock_run_data = get_mock_run_data(
            metrics={MlflowTagIds.configuration_version: 1, "metric1_avg": 0.9},
            params=WrongModel(key=123),  # type: ignore
        )
        mock_run = get_mock_run(run_data=mock_run_data, run_info=mock_run_info)

        runs_list = get_mock_run_list([mock_run])

        # Act
        result = aggregate_runs_by_version(runs_list)

        # Assert
        self.assertEqual(len(result), 0)  # Run should be skipped due to TypeError

    def test_process_runs_with_none_metrics(self) -> None:
        """Test processing runs where metrics is None"""
        # Arrange
        mock_run = get_mock_run(
            run_data=get_mock_run_data(
                metrics=None,  # Metrics is None
            )
        )

        runs_list = get_mock_run_list([mock_run])

        # Act
        result = aggregate_runs_by_version(runs_list)

        # Assert
        self.assertEqual(len(result), 0)  # Should skip the run due to missing metrics

    def test_process_runs_with_metric_variants(self) -> None:
        """
        Test processing runs correctly
        """

        # Create run with different metric naming patterns
        mock_run = get_mock_run(
            run_info=get_mock_run_info(run_id="variant-test-run", run_name="Variant Test Run", status="FINISHED"),
            run_data=get_mock_run_data(
                metrics={
                    MlflowTagIds.configuration_version: 1,
                    # Single part metric
                    "simple": 0.5,
                    # Multiple part metrics
                    "test_metric_avg": 0.85,
                    "test_metric_max": 0.95,
                    "ragas_factual_information_min": 0.75,
                },
                params=get_mock_config(
                    plugins=[
                        PluginConfiguration(
                            plugin="test-plugin",
                            evaluators=[
                                EvaluatorConfiguration(name="simple", params={}),
                                EvaluatorConfiguration(name="test_metric", params={}),
                                EvaluatorConfiguration(name="ragas_factual_information", params={}),
                            ],
                        )
                    ]
                ),
            ),
        )

        runs_list = get_mock_run_list([mock_run])

        # Act
        result = aggregate_runs_by_version(runs_list)

        # Assert - Check that configuration was created
        self.assertIn(1, result)
        self.assertTrue(result[1].runs)  # Ensure there's at least one run

        # Verify the run is present in the result
        found_run = False
        for run in result[1].runs:
            if run.run_id == "variant-test-run":
                found_run = True
                break
        self.assertTrue(found_run, "Expected run not found in results")

        # In the current module implementation, we should verify metrics exist
        run_metrics = result[1].runs[0].metrics
        self.assertIsInstance(run_metrics, dict)
        self.assertGreater(len(run_metrics), 0)  # Should have some metrics

    def test_process_runs_metric_extraction_empty_string(self) -> None:
        """Test metric extraction with empty string metric name"""
        metrics: dict[str, float] = {
            MlflowTagIds.configuration_version: 1,
            "": 0.5,  # Empty string metric
        }
        params = params = get_mock_config(
            plugins=[PluginConfiguration(plugin="test-plugin", evaluators=[EvaluatorConfiguration(name="", params={})])]
        )

        mock_run_data = get_mock_run_data(metrics=metrics, params=params)

        mock_run = get_mock_run(
            run_info=get_mock_run_info(run_id="empty-metric-run", run_name="Empty Metric Run", status="FINISHED"),
            run_data=mock_run_data,
        )

        runs_list = get_mock_run_list([mock_run])

        # Act - Should not raise any exceptions
        result = aggregate_runs_by_version(runs_list)

        # Assert - Should create configuration
        self.assertIn(1, result)

    def test_process_runs_with_metrics_matching_evaluator_names(self) -> None:
        """Test processing runs with metrics that match evaluator names"""

        # Create run with metrics that match evaluator names
        mock_run = get_mock_run(
            run_info=get_mock_run_info(
                run_id="matching-metrics-run", run_name="Matching Metrics Run", status="FINISHED"
            ),
            run_data=get_mock_run_data(
                metrics={
                    MlflowTagIds.configuration_version: 1,
                    "accuracy_avg": 0.92,
                    "accuracy_max": 0.98,
                    "precision_mean": 0.87,
                    "recall_value": 0.91,
                    "unrelated_metric": 0.5,  # This should be ignored
                },
                # Configuration with evaluators that match the metrics
                params=get_mock_config(
                    plugins=[
                        PluginConfiguration(
                            plugin="test-plugin",
                            evaluators=[
                                EvaluatorConfiguration(name="accuracy", params={}),
                                EvaluatorConfiguration(name="precision", params={}),
                                EvaluatorConfiguration(name="recall", params={}),
                            ],
                        )
                    ]
                ),
            ),
        )

        runs_list = get_mock_run_list([mock_run])

        # Act
        result = aggregate_runs_by_version(runs_list)

        # Assert
        self.assertIn(1, result)
        self.assertEqual(len(result[1].runs), 1)

        # Verify metrics were processed correctly
        run_metrics = result[1].runs[0].metrics
        self.assertIn("accuracy", run_metrics)
        self.assertIn("avg", run_metrics["accuracy"])
        self.assertIn("max", run_metrics["accuracy"])
        self.assertEqual(run_metrics["accuracy"]["avg"], 0.92)
        self.assertEqual(run_metrics["accuracy"]["max"], 0.98)

        self.assertIn("precision", run_metrics)
        self.assertIn("mean", run_metrics["precision"])
        self.assertEqual(run_metrics["precision"]["mean"], 0.87)

        self.assertIn("recall", run_metrics)
        self.assertIn("value", run_metrics["recall"])
        self.assertEqual(run_metrics["recall"]["value"], 0.91)

        # Unrelated metric should be ignored
        self.assertNotIn("unrelated_metric", run_metrics)


def get_mock_run_info(
    experiment_id: Optional[str] = None,
    run_id: Optional[str] = None,
    run_name: Optional[str] = None,
    status: Optional[MlflowRunStatus] = None,
    user_id: Optional[str] = None,
    lifecycle_stage: Optional[LifecycleStage] = None,
) -> MlflowRunInfo:
    return cast(
        MlflowRunInfo,
        RunInfo(
            experiment_id=experiment_id if experiment_id else "experimentid",
            run_id=run_id if run_id else "run_id",
            run_uuid=run_id if run_id else "run_uuid",
            status=status if status else MlflowRunStatus.RUNNING,
            run_name=run_name,
            user_id=user_id if user_id else "test-user-id",
            lifecycle_stage=lifecycle_stage if lifecycle_stage else LifecycleStage.ACTIVE,
            start_time=datetime.now(),
            end_time=datetime.now(),
        ),
    )


def get_mock_run_data(
    metrics: Optional[dict[str, float]] = None,
    params: Optional[MlflowLogStorageModel] = None,
    tags: Optional[dict[str, str]] = None,
) -> MlflowRunData:
    return cast(
        MlflowRunData,
        RunData(
            metrics=to_key_value_pairs(metrics if metrics else {}),
            params=to_key_value_pairs(params.model_dump_for_storage() if params else {}),
            tags=to_key_value_pairs(tags if tags else {}),
        ),
    )


def get_mock_run(run_data: Optional[MlflowRunData] = None, run_info: Optional[MlflowRunInfo] = None) -> MlflowRun:
    return cast(
        MlflowRun,
        Run(
            run_data=cast(RunData, run_data if run_data else get_mock_run_data()),
            run_info=cast(RunInfo, run_info if run_info else get_mock_run_info()),
        ),
    )


def get_mock_run_list(
    runs: Optional[list[MlflowRun]] = None, token: Optional[str] = None
) -> MlflowPagedList[MlflowRun]:
    return cast(MlflowPagedList[MlflowRun], PagedList[Run](cast(list[Run], runs if runs else []), token))


def get_mock_experiment(
    experiment_id: Optional[str] = None,
    name: Optional[str] = None,
    artifact_location: Optional[str] = None,
) -> MlflowExperiment:
    return cast(
        MlflowExperiment,
        Experiment(
            experiment_id=experiment_id if experiment_id else "test-experiment-id",
            name=name if name else "test-experiment",
            artifact_location=artifact_location if artifact_location else "artifact_location",
            lifecycle_stage=LifecycleStage.ACTIVE,
        ),
    )


def get_mock_config(
    testDataUrl: Optional[str] = None,
    appId: Optional[str] = None,
    plugins: Optional[list[PluginConfiguration]] = None,
) -> MlflowLogStorageModel:
    return MlflowLogStorageModel(
        testDataUrl=testDataUrl if testDataUrl else "test-bucket/test-prefix",
        appId=appId if appId else "test-app-id",
        plugins=plugins
        if plugins
        else [
            PluginConfiguration(
                plugin="test-plugin",
                evaluators=[
                    EvaluatorConfiguration(name="metric1", params={}),
                    EvaluatorConfiguration(name="metric2", params={}),
                ],
            )
        ],
    )


T = TypeVar("T")


class KeyValuePair(NamedTuple, Generic[T]):
    key: str
    value: T


def to_key_value_pairs(d: dict[str, T]) -> List[KeyValuePair[T]]:
    return [KeyValuePair(k, v) for k, v in d.items()]


class WrongModel(BaseModel):
    def model_dump_for_storage(self) -> dict[str, Any]:
        return {}

    pass
