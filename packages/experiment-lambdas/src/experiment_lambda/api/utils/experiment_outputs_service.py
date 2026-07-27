from logging import getLogger
from typing import Sequence, Set

from pydantic import ValidationError

from experiment_lambda.api.utils.api_models import (
    ExperimentOutput,
    ListExperimentOutputsRequest,
    MetricsMap,
    ResourceNotFoundException,
    Run,
)
from experiment_lambda.protocols import MlflowPagedList, MlflowRun, MlflowTagIds
from experiment_lambda.utils.mlflow_client import get_mlflow_client
from experiment_lambda.utils.storage_models import MlflowLogStorageModel

logger = getLogger(__name__)


def get_experiment_id(experiment_name: str) -> str:
    """
    Get experiment ID by name.

    Args:
        experiment_name: Name of the experiment

    Returns:
        Experiment ID

    Raises:
        ResourceNotFoundException: If experiment is not found
    """
    client = get_mlflow_client()
    experiment = client.get_experiment_by_name(name=experiment_name)
    if experiment is None:
        raise ResourceNotFoundException(f"Experiment with name '{experiment_name}' not found")
    return str(experiment.experiment_id)


def fetch_experiment_runs(request: ListExperimentOutputsRequest) -> MlflowPagedList[MlflowRun]:
    """
    Fetch experiment runs from MLflow.

    Args:
        request: Request containing experiment name, version range and pagination info

    Returns:
        PagedList of experiment runs

    Raises:
        ResourceNotFoundException: If experiment is not found
    """

    client = get_mlflow_client()

    filter_conditions = [
        f"metric.{MlflowTagIds.configuration_version} >= {request.startVersion}",
        f"metric.{MlflowTagIds.configuration_version} <= {request.endVersion}",
    ]

    filter_string = " AND ".join(filter_conditions)

    experiment = client.get_experiment_by_name(name=request.name)
    if experiment is None:
        raise ResourceNotFoundException(f"Experiment with name '{request.name}' not found")

    return client.search_runs(
        experiment_ids=[experiment.experiment_id],
        order_by=["start_time DESC"],
        filter_string=filter_string,
        max_results=request.maxResults,
        page_token=request.nextToken,
    )


def aggregate_runs_by_version(runs_list: Sequence[MlflowRun]) -> dict[int, ExperimentOutput]:
    """
    Process runs and build configurations dictionary grouped by version.

    Args:
        runs_list: List of MLflow runs to process

    Returns:
        Dictionary mapping version numbers to ExperimentOutput objects
    """
    configurations: dict[int, ExperimentOutput] = {}

    for run in runs_list:
        if not run.data.metrics:
            continue
        try:
            version_float = run.data.metrics.get(MlflowTagIds.configuration_version)
            if not version_float:
                continue
            version = int(version_float)

            configuration = MlflowLogStorageModel.model_load_from_storage(run.data.params if run.data.params else {})
            evaluator_names = {evaluator.name for plugin in configuration.plugins for evaluator in plugin.evaluators}

            if version not in configurations:
                configurations[version] = ExperimentOutput(
                    id=f"{run.info.experiment_id}-v{version}",
                    version=version,
                    configuration=configuration,
                    runs=[],
                )
            configurations[version].runs.append(_map_run(run, evaluator_names))
        except ValidationError:
            # Skip runs with invalid configuration
            logger.warning(
                "Skipping invalid parameter configuration",
                extra={"run_id": run.info.run_id, "params": run.data.params},
            )
            continue

    return configurations


def _map_run(run: MlflowRun, evaluators: Set[str]) -> Run:
    if run.info.status == "FINISHED":
        # Only process metrics for finished runs
        return Run(
            run_id=run.info.run_id,
            run_status=run.info.status,
            run_name=run.info.run_name if run.info.run_name else f"Run-{run.info.run_id}",
            metrics=_group_metrics_by_descriptor(run, evaluators),
        )
    # For other statuses, just return run_id, run_name, and run_status
    return Run(
        run_id=run.info.run_id,
        run_status=run.info.status,
        run_name=run.info.run_name if run.info.run_name else f"Run-{run.info.run_id}",
        metrics={},
    )


def _group_metrics_by_descriptor(run: MlflowRun, metrics: Set[str]) -> MetricsMap:
    """
    Transforms a flat dictionary with metric_descriptor keys into a nested dictionary grouped by
    metrics.

    The function expects keys in the format 'metric_descriptor' and groups values by metric name,
    creating a nested structure where descriptors become inner keys.

    Args:
        input_dict (dict): Flat dictionary with keys in format 'metric_descriptor'
            Example: {'m1_avg': 1.0, 'm1_std': 0.2}
        metrics: The set of metrics to emit

    Returns:
        dict: Nested dictionary grouped by metrics
            Example: {'m1': {'avg': 1.0, 'std': 0.2}}

    Example:
        >>> d = {'m1_avg': 1.0, 'm1_std': 0.2, 'm2_avg': 2.0, 'm2_std': 0.1}
        >>> transform_metric_dict(d)
        {
            'm1': {'avg': 1.0, 'std': 0.2},
            'm2': {'avg': 2.0, 'std': 0.1}
        }
    """
    result: MetricsMap = {}
    if not run.data.metrics:
        return result

    for key, value in run.data.metrics.items():
        # input                   |        metric      | descriptor
        # ------------------------+--------------------+-----------
        # factual_correctness_avg | factual_correctness|    avg
        # simple                  |      simple        |   simple

        if "_" in key:
            metric, descriptor = key.rsplit("_", 1)
        else:
            metric = descriptor = key

        if metric not in metrics:
            # skip metrics which were not requested by the user
            # E.g. we store version as metric but don't want to emit it
            continue

        if metric not in result:
            result[metric] = {}

        result[metric][descriptor] = value
    return result
