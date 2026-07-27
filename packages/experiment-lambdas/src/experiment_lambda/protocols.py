"""
Protocol definitions for type checking.

mlflow SDK is partially missing type hints which leads to all fields being
annotated as 'Unknown'-type when parsed through Pylance.

These protocols help guiding the type checker.
"""

from enum import Enum
from typing import Generic, Optional, Protocol, TypeVar


# https://mlflow.org/docs/latest/api_reference/_modules/mlflow/exceptions.html#get_error_code
class MlflowException(Protocol):
    error_code: str  # mlflow accepts error codes as ints in the ctor but stores it internally via name


# https://mlflow.org/docs/latest/api_reference/python_api/mlflow.entities.html#mlflow.entities.LifecycleStage
class MlflowLifecycleStage(Enum):
    ACTIVE = "active"
    DELETED = "deleted"


# https://mlflow.org/docs/latest/api_reference/python_api/mlflow.entities.html#mlflow.entities.RunStatus
class MlflowRunStatus(Enum):
    RUNNING = 1
    SCHEDULED = 2
    FINISHED = 3
    FAILED = 4
    KILLED = 5


# https://mlflow.org/docs/latest/api_reference/python_api/mlflow.entities.html?highlight=experiment#mlflow.entities.Experiment
class MlflowExperiment(Protocol):
    artifact_location: str
    creation_time: Optional[int]
    experiment_id: str
    last_update_time: Optional[int]
    lifecycle_stage: Optional[MlflowLifecycleStage]
    name: Optional[str]
    tags: Optional[dict[str, str]]


# https://mlflow.org/docs/latest/api_reference/python_api/mlflow.entities.html#mlflow.entities.RunInfo
class MlflowRunInfo(Protocol):
    artifact_uri: Optional[str]
    end_time: Optional[int]
    experiment_id: str
    lifecycle_stage: Optional[MlflowLifecycleStage]
    run_id: str
    run_name: Optional[str]
    start_time: Optional[int]
    user_id: Optional[str]
    status: MlflowRunStatus


# https://mlflow.org/docs/latest/api_reference/python_api/mlflow.entities.html#mlflow.entities.RunData
class MlflowRunData(Protocol):
    metrics: Optional[dict[str, float]]
    params: Optional[dict[str, str]]
    tags: Optional[dict[str, str]]


# https://mlflow.org/docs/latest/api_reference/python_api/mlflow.entities.html#mlflow.entities.Dataset
class MlflowDataset(Protocol):
    digest: str
    name: str
    profile: str
    schema: str
    source: str
    source_type: str


# https://mlflow.org/docs/latest/api_reference/python_api/mlflow.entities.html#mlflow.entities.InputTag
class MlFlowInputTag(Protocol):
    key: str
    value: str


# https://mlflow.org/docs/latest/api_reference/python_api/mlflow.entities.html#mlflow.entities.DatasetInput
class MlflowDatasetInput(Protocol):
    dataset: MlflowDataset
    tags: Optional[list[MlFlowInputTag]]


# https://mlflow.org/docs/latest/api_reference/python_api/mlflow.entities.html#mlflow.entities.LoggedModelInput
class MlflowLoggedModelInput(Protocol):
    model_id: str


# https://mlflow.org/docs/latest/api_reference/python_api/mlflow.entities.html#mlflow.entities.RunInputs
class MlflowRunInputs(Protocol):
    dataset_inputs: list[MlflowDatasetInput]
    model_inputs: list[MlflowLoggedModelInput]


# https://mlflow.org/docs/latest/api_reference/python_api/mlflow.entities.html#mlflow.entities.LoggedModelOutput
class MlflowLoggedModelOutput(Protocol):
    model_id: str
    step: str


# https://mlflow.org/docs/latest/api_reference/python_api/mlflow.entities.html#mlflow.entities.RunOutputs
class MlflowRunOutputs(Protocol):
    model_outputs: list[MlflowLoggedModelOutput]


# https://mlflow.org/docs/latest/api_reference/python_api/mlflow.entities.html#mlflow.entities.Run
class MlflowRun(Protocol):
    data: MlflowRunData
    info: MlflowRunInfo
    inputs: MlflowRunInputs
    outputs: MlflowRunOutputs


class MlflowTagIds:
    experiment_description = "mlflow.note.content"
    configuration_version = "metadata.config_version"


T = TypeVar("T")


# https://mlflow.org/docs/latest/api_reference/python_api/mlflow.entities.html#mlflow.store.entities.PagedList
class MlflowPagedList(list[T], Generic[T]):
    """
    Wrapper for MLflow's PagedList class.
    Contains a token string attribute that can be passed to the pagination API.
    """

    token: Optional[str]


# Protocol for MLflow Client methods used in the codebase
class MlflowClient(Protocol):
    """
    Protocol for MLflow Client methods to provide type hints.
    Only includes methods used in the codebase.
    """

    def create_experiment(self, name: str, tags: Optional[dict[str, str]] = None) -> str:
        """
        Create an experiment with a given name and tags.

        Args:
            name: Experiment name
            tags: Optional dictionary of tags for the experiment

        Returns:
            ID of the created experiment
        """
        ...  # pragma: no cover

    def get_experiment(self, experiment_id: str) -> Optional[MlflowExperiment]:
        """
        Get an experiment by ID.

        Args:
            experiment_id: ID of the experiment to get

        Returns:
            Experiment object or None if not found
        """
        ...  # pragma: no cover

    def get_experiment_by_name(self, name: str) -> Optional[MlflowExperiment]:
        """
        Get an experiment by name.

        Args:
            name: Name of the experiment to get

        Returns:
            Experiment object or None if not found
        """
        ...  # pragma: no cover

    def delete_experiment(self, experiment_id: str) -> None:
        """
        Delete an experiment by ID.

        Args:
            experiment_id: ID of the experiment to delete
        """
        ...  # pragma: no cover

    def rename_experiment(self, experiment_id: str, new_name: str) -> None:
        """
        Rename an experiment.

        Args:
            experiment_id: ID of the experiment to rename
            new_name: New name for the experiment
        """
        ...  # pragma: no cover

    def set_experiment_tag(self, experiment_id: str, key: str, value: str) -> None:
        """
        Set a tag on an experiment.

        Args:
            experiment_id: ID of the experiment to tag
            key: Tag key
            value: Tag value
        """
        ...  # pragma: no cover

    def search_experiments(
        self,
        filter_string: Optional[str] = None,
        order_by: Optional[list[str]] = None,
        view_type: int = 1,  # Default is ACTIVE_ONLY
        page_token: Optional[str] = None,
        max_results: Optional[int] = None,
    ) -> MlflowPagedList[MlflowExperiment]:
        """
        Search for experiments.

        Args:
            filter_string: Filter string
            order_by: Order by expression
            view_type: View type (ACTIVE_ONLY, DELETED_ONLY, ALL)
            page_token: Page token for pagination
            max_results: Maximum number of results to return

        Returns:
            List of experiments matching the search criteria
        """
        ...  # pragma: no cover

    def log_metric(self, run_id: str, key: str, value: float) -> None:
        """
        Log a metric for a run.

        Args:
            run_id: ID of the run
            key: Metric key
            value: Metric value
        """
        ...  # pragma: no cover

    def set_terminated(self, run_id: str) -> None:
        """
        Set a run as terminated.

        Args:
            run_id: ID of the run to terminate
        """
        ...  # pragma: no cover

    def search_runs(
        self,
        experiment_ids: list[str],
        filter_string: str = "",
        run_view_type: int = 1,  # Default is ACTIVE_ONLY
        max_results: int = 1000,
        order_by: Optional[list[str]] = None,
        page_token: Optional[str] = None,
    ) -> MlflowPagedList[MlflowRun]:
        """
        Search for runs within the specified experiments.

        Args:
            experiment_ids: List of experiment IDs to search within
            filter_string: Filter string

        Returns:
            List of runs matching the search criteria
        """
        ...  # pragma: no cover

    def create_run(
        self,
        experiment_id: str,
        run_name: Optional[str] = None,
        tags: Optional[dict[str, str]] = None,
    ) -> MlflowRun:
        """
        Create a new run under the specified experiment.

        Args:
            experiment_id: ID of the experiment to create the run under
            run_name: Name of the run
            tags: Additional tags for the run

        Returns:
            The created run
        """
        ...  # pragma: no cover

    def log_param(self, run_id: str, key: str, value: str) -> None:
        """
        Log a parameter for a run.

        Args:
            run_id: ID of the run
            key: Parameter key
            value: Parameter value
        """
        ...  # pragma: no cover
