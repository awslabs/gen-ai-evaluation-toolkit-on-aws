from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict

MetricValues = dict[str, float]  # e.g., {"avg": 0.95, "mean": 0.92}
MetricsMap = dict[str, MetricValues]  # e.g., {"harmfulness": {"avg": 0.95}}


class BaseConfig(BaseModel):
    model_config = ConfigDict(extra="ignore")  # Ignore unspecified fields


# genai-etk/packages/models/model/entity/experimentation/viewType.smithy
class ViewType(str, Enum):
    """Qualifier for type of experiments to be returned."""

    ACTIVE_ONLY = "ACTIVE_ONLY"
    DELETED_ONLY = "DELETED_ONLY"
    ALL = "ALL"


class LifecycleStage(str, Enum):
    """Experiment lifecycle stage values."""

    ACTIVE = "ACTIVE"
    DELETED = "DELETED"


class MlflowLifecycleStage(str, Enum):
    """MLflow experiment lifecycle stage values."""

    ACTIVE = "active"
    DELETED = "deleted"


# Custom exceptions that map to Smithy error models
class GenAiEtkException(Exception):
    """Base exception for all GenAI-ETK service exceptions."""

    status_code = 500
    error_code = "InternalServerException"

    def __init__(self, message: Optional[str] = None):
        self.message = message or "An internal server error occurred"
        super().__init__(self.message)


class ValidationException(GenAiEtkException):
    """Exception raised for validation errors."""

    status_code = 400
    error_code = "ValidationException"

    def __init__(self, message: Optional[str] = None):
        self.message = message or "A validation error occurred"
        super().__init__(self.message)


class UnauthorizedException(GenAiEtkException):
    """Exception raised for unauthorized access."""

    status_code = 401
    error_code = "UnauthorizedException"

    def __init__(self, message: Optional[str] = None):
        self.message = message or "Unauthorized access"
        super().__init__(self.message)


class ResourceNotFoundException(GenAiEtkException):
    """Exception raised when a requested resource is not found."""

    status_code = 404
    error_code = "ResourceNotFoundException"

    def __init__(self, message: Optional[str] = None):
        self.message = message or "Resource not found"
        super().__init__(self.message)


class ThrottlingException(GenAiEtkException):
    """Exception raised when request rate exceeds the allowed threshold."""

    status_code = 429
    error_code = "ThrottlingException"

    def __init__(self, message: Optional[str] = None):
        self.message = message or "Request was throttled, please try again later"
        super().__init__(self.message)


class InternalServerException(GenAiEtkException):
    """Exception raised for internal server errors."""

    status_code = 500
    error_code = "InternalServerException"

    def __init__(self, message: Optional[str] = None):
        self.message = message or "Internal server error"
        super().__init__(self.message)


class ConflictException(GenAiEtkException):
    """Exception raised when there is a conflict with existing resources."""

    status_code = 409
    error_code = "ConflictException"

    def __init__(self, message: Optional[str] = None):
        self.message = message or "Conflict with existing resource"
        super().__init__(self.message)


# genai-etk/packages/models/model/entity/experimentation/experiment.smithy
class Experiment(BaseConfig):
    """Model representing an experiment."""

    name: str
    description: Optional[str] = None
    artifactLocation: Optional[str] = None
    lifecycleStage: Optional[str] = None
    createdAt: Optional[datetime] = None
    updatedAt: Optional[datetime] = None
    tags: Optional[dict[str, str]] = None
    id: str


# genai-etk/packages/models/model/operation/experiment/createExperiment.smithy # noqa: E501
class CreateExperimentRequest(BaseConfig):
    """Model representing an experiment creation request."""

    name: str
    description: Optional[str] = None


# genai-etk/packages/models/model/operation/experiment/listExperimentOutputs.smithy # noqa: E501
class ListExperimentOutputsRequest(BaseConfig):
    """Request model for tracing experiment outputs."""

    name: str
    startVersion: int
    endVersion: int
    maxResults: int = 1000
    nextToken: Optional[str] = None


# genai-etk/packages/models/model/operation/experiment/createExperiment.smithy # noqa: E501
class CreateExperimentResponse(Experiment):
    """Model representing an experiment creation response."""


# genai-etk/packages/models/model/entity/experimentation/experimentOutput.smithy # noqa: E501
class Run(BaseConfig):
    """Individual run output with its metrics"""

    run_id: str
    run_name: str
    run_status: str
    metrics: MetricsMap


class EvaluatorConfiguration(BaseConfig):
    name: str
    params: dict[str, Any]


class PluginConfiguration(BaseConfig):
    plugin: str
    evaluators: list[EvaluatorConfiguration]


class ExperimentConfiguration(BaseConfig):
    testDataUrl: str
    appId: str
    plugins: list[PluginConfiguration]


# genai-etk/packages/models/model/entity/experimentation/experimentOutput.smithy # noqa: E501
class ExperimentOutput(BaseConfig):
    """Single version of experiment output"""

    version: int
    configuration: ExperimentConfiguration
    runs: list[Run]


# genai-etk/packages/models/model/operation/experiment/listExperimentOutputs.smithy # noqa: E501
class ListExperimentOutputsResponse(BaseConfig):
    """Complete response from list_experiment_outputs"""

    id: str
    outputs: list[ExperimentOutput]
    hasMore: bool
    nextToken: Optional[str] = None


# genai-etk/packages/models/model/operation/experiment/getExperiment.smithy # noqa: E501
class GetExperimentRequest(BaseConfig):
    """Request to get an existing experiment by name."""

    name: str


# genai-etk/packages/models/model/operation/experiment/getExperiment.smithy # noqa: E501
class GetExperimentResponse(Experiment):
    """Response containing the requested experiment."""


# genai-etk/packages/models/model/operation/experiment/deleteExperiment.smithy # noqa: E501
class DeleteExperimentRequest(BaseConfig):
    """Request to delete an existing experiment by name."""

    name: str


# genai-etk/packages/models/model/operation/experiment/updateExperiment.smithy
class UpdateExperimentRequest(BaseConfig):
    """Request to update an existing experiment."""

    name: str
    newName: Optional[str] = None
    description: Optional[str] = None


# genai-etk/packages/models/model/operation/experiment/updateExperiment.smithy
class UpdateExperimentResponse(Experiment):
    """Response containing the updated experiment."""


# genai-etk/packages/models/model/operation/experiment/listExperiments.smithy
class ListExperimentsRequest(BaseConfig):
    """Request to list available experiments."""

    filter: Optional[str] = None
    orderBy: Optional[list[str]] = None
    viewType: Optional[ViewType] = ViewType.ACTIVE_ONLY
    maxResults: int = 1000
    nextToken: Optional[str] = None


# genai-etk/packages/models/model/operation/experiment/listExperiments.smithy
class ListExperimentsResponse(BaseConfig):
    """Response containing a list of experiments."""

    experiments: list[Experiment]
    nextToken: Optional[str] = None


# Empty response model for 204 No Content responses
class EmptyResponse(BaseConfig):
    """Empty response model for 204 No Content responses."""

    status_code: int = 204
