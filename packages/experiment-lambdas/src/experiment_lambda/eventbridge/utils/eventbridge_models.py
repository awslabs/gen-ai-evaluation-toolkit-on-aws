from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, model_validator


class BaseConfig(BaseModel):
    model_config = ConfigDict(extra="ignore")  # Ignore unspecified fields


# genai-etk/packages/cdk/src/evaluation/lambdas/createSummaryHandler.ts
class Score(BaseConfig):
    """Model representing a metric score."""

    metricId: str
    score: float


# genai-etk/packages/cdk/src/evaluation/constructs/evaluationWorkflow.ts
class MetricsReportingDetail(BaseConfig):
    """Model representing an evaluation summary event."""

    runId: str
    experimentName: str
    appId: Optional[str] = None
    timestamp: Optional[str] = None
    timeTaken: Optional[float] = None
    aggregatedMetrics: list[Score]
    fullResultsLocation: Optional[str] = None


class TerminateRunDetail(BaseModel):
    """Model representing a run termination event."""

    runId: str
    experimentName: str


class MetricsReportingEvent(BaseConfig):
    """Wrapper model for the metrics reporting event."""

    detail: MetricsReportingDetail


class ResourceNotFoundException(Exception):
    """Exception raised when a requested resource is not found."""

    status_code = 404
    error_code = "ResourceNotFoundException"

    def __init__(self, message: Optional[str] = None):
        self.message = message or "Resource not found"
        super().__init__(self.message)


class Evaluator(BaseConfig):
    """Model representing an evaluator configuration."""

    name: Optional[str] = None
    builtIn: Optional[str] = None
    params: dict[str, Any] = {}

    @model_validator(mode='after')
    def validate_name_or_builtin_provided(self) -> 'Evaluator':
        if self.name and self.builtIn:
            raise ValueError("Cannot specify both 'name' and 'builtIn' fields")
        if not self.name and not self.builtIn:
            raise ValueError("Must specify either 'name' or 'builtIn' field")
        return self


class PluginConfiguration(BaseConfig):
    """Model representing a plugin configuration."""

    evaluators: list[Evaluator]


class Plugin(BaseConfig):
    """Model representing a plugin."""

    plugin: str
    configuration: PluginConfiguration


class S3BucketLocation(BaseConfig):
    """Model representing test data location."""

    bucketName: str
    prefix: str = ""


class Config(BaseConfig):
    """Model representing the experiment configuration."""

    version: int
    testData: S3BucketLocation
    appId: str
    plugins: Optional[list[Plugin]] = None


class ConfigurationReportingDetail(BaseConfig):
    """Model representing event details."""

    experimentName: str
    runId: str
    config: Config


class ConfigurationReportingEvent(BaseConfig):
    """Wrapper model for the event."""

    detail: ConfigurationReportingDetail


# Empty response model for 204 No Content responses
class EmptyResponse(BaseConfig):
    """Empty response model for 204 No Content responses."""

    status_code: int = 204
