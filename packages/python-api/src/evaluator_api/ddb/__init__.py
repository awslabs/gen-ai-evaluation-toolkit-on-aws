"""DynamoDB data access layer.

This package contains:
  - models.py  - Pydantic models for DynamoDB item structures
  - common.py  - Shared utilities (_LoggedTable, logging, placeholder encoding)
  - jobs.py    - JobDao
  - results.py - ResultDao
  - reports.py - ReportDao
"""

from evaluator_api.ddb.common import encode_score_placeholder
from evaluator_api.ddb.jobs import JobDao
from evaluator_api.ddb.models import (
    JobErrorItem,
    JobItem,
    JobStatus,
    ReportItem,
    ReportStatus,
    ResultItem,
    ScoreItemModel,
    TaskEntry,
    TaskStatus,
)
from evaluator_api.ddb.reports import ReportDao
from evaluator_api.ddb.results import ResultDao

__all__ = [
    # DAOs
    "JobDao",
    "ReportDao",
    "ResultDao",
    # Models
    "JobErrorItem",
    "JobItem",
    "JobStatus",
    "TaskEntry",
    "TaskStatus",
    "ReportItem",
    "ReportStatus",
    "ResultItem",
    "ScoreItemModel",
    # Utils
    "encode_score_placeholder",
]
