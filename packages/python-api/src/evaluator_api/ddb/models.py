"""Pydantic models for DynamoDB item structures.

These models represent the DynamoDB table schemas and handle type conversions
(e.g., Decimal to int/float) when reading from DynamoDB.

Separate from the API request/response models in routes/models.py.
These enums are intentionally decoupled from the API enums so that
persistence and API contract can evolve independently.
"""

from decimal import Decimal
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from evaluator_api.ddb.common import decimals_to_float


class JobStatus(str, Enum):
    """Job-level status values — computed from task states for orchestrated jobs."""

    PENDING = "PENDING"
    RUNNING = "RUNNING"
    SUCCESS = "SUCCESS"
    PARTIAL_FAILURE = "PARTIAL_FAILURE"
    FAILURE = "FAILURE"


class TaskStatus(str, Enum):
    """Per-task status values stored in DynamoDB tasks map."""

    PENDING = "PENDING"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class ReportStatus(str, Enum):
    """Report status values stored in DynamoDB."""

    ACTIVE = "ACTIVE"
    DELETING = "DELETING"


class JobErrorItem(BaseModel):
    """DynamoDB item structure for job error."""

    model_config = ConfigDict(extra="ignore")

    code: Optional[str] = None
    message: Optional[str] = None
    stackTrace: Optional[str] = None


class TaskEntry(BaseModel):
    """A single task within a job's tasks map (stored in DDB)."""

    model_config = ConfigDict(extra="ignore")

    status: str = "PENDING"
    evaluatorName: Optional[str] = None
    error: Optional[str] = None
    checkpoint: Optional[dict[str, Any]] = None
    scorers: Optional[dict[str, Any]] = None


class JobItem(BaseModel):
    """DynamoDB item structure for jobs table."""

    model_config = ConfigDict(extra="ignore")

    evaluator_name: str
    job_id: str
    job_type: str
    report_id: str
    source_report_id: Optional[str] = None
    experiment_name: Optional[str] = None
    status: str = JobStatus.PENDING
    created_at: str
    updated_at: Optional[str] = None
    dataset_id: Optional[str] = None
    test_data: Optional[dict[str, Any]] = None
    scorers: Optional[dict[str, Any]] = None
    app: Optional[dict[str, Any]] = None
    tasks: Optional[dict[str, "TaskEntry"]] = None
    stage: str = "PENDING"
    result: Optional[dict[str, Any]] = None
    error: Optional[JobErrorItem] = None

class ScoreItemModel(BaseModel):
    """DynamoDB item structure for a score within a result."""

    model_config = ConfigDict(extra="ignore")

    value: Optional[float] = None
    reason: Optional[str] = None
    error: Optional[str] = None
    context: Optional[dict[str, Any]] = None
    scoredAt: Optional[str] = None

    @field_validator("value", mode="before")
    @classmethod
    def convert_decimal_to_float(cls, v: Any) -> Optional[float]:
        """Convert Decimal from DynamoDB to float."""
        if v is None:
            return None
        if isinstance(v, Decimal):
            return float(v)
        return float(v)

    @field_validator("context", mode="before")
    @classmethod
    def convert_context_decimals_to_float(cls, v: Any) -> Any:
        """Recursively convert nested Decimals from DynamoDB back to floats.

        Scores are written with floats_to_decimal (which converts nested floats —
        e.g. per-requirement scores — to Decimal for DynamoDB). Without this, those
        Decimals would surface in API responses and break JSON serialization.
        """
        if v is None:
            return None
        return decimals_to_float(v)


class ResultItem(BaseModel):
    """DynamoDB item structure for results table."""

    model_config = ConfigDict(extra="ignore")

    report_id: str
    result_id: str
    created_at: str
    updated_at: Optional[str] = None
    testcase_id: Optional[str] = None
    input: Optional[Any] = None
    output: Optional[Any] = None
    expected: Optional[Any] = None
    context: Optional[Any] = None
    app_metrics: Optional[dict[str, Any]] = None
    error: Optional[str] = None
    metadata: Optional[Any] = None
    scores: dict[str, ScoreItemModel] = Field(default_factory=dict)


class ReportItem(BaseModel):
    """DynamoDB item structure for reports table."""

    model_config = ConfigDict(extra="ignore")

    report_id: str
    created_at: str
    updated_at: Optional[str] = None
    status: str = ReportStatus.ACTIVE
    name: Optional[str] = None
    description: Optional[str] = None
    experiment_name: Optional[str] = None
    metadata: Optional[dict[str, Any]] = None
    aggregated_metrics: Optional[dict[str, Any]] = None
    job_ids: list[str] = Field(default_factory=list)


__all__ = [
    "JobErrorItem",
    "JobItem",
    "JobStatus",
    "ReportItem",
    "ReportStatus",
    "ResultItem",
    "ScoreItemModel",
]
