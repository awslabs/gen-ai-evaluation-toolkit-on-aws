"""Pytest fixtures for evaluator SDK unit tests."""

from typing import Any
from unittest.mock import Mock

import pytest
from awssolutions_gen_ai_evaluation_toolkit_python_client.models import (  # type: ignore[attr-defined]
    InlineTestCase,
)

from .helpers import exact_match_scorer, make_sample_testcases, simple_app

# Re-export helpers so existing test files that import from .conftest still work
__all__ = ["exact_match_scorer", "simple_app"]

# --- Mock API ---


@pytest.fixture
def mock_api() -> Any:
    """Mock DefaultApi client."""
    api = Mock()
    api.create_report.return_value = Mock(
        report=Mock(report_id="report-456"),
    )
    api.update_evaluator_job_status.return_value = None
    api.submit_evaluation_job.return_value = Mock(job_id="job-123")
    api.submit_scoring_job.return_value = Mock(job_id="job-123")
    api.submit_app_invocation_job.return_value = Mock(job_id="job-123")
    def _echo_create_results(*args: Any, **kwargs: Any) -> Mock:
        """Echo back client-provided result_ids, mimicking real server behavior."""
        req = kwargs.get("batch_create_results_request_content")
        if req is None:
            return Mock(results=[], errors=[], count=0)
        results = [
            Mock(result_id=r.result_id, index=i)
            for i, r in enumerate(req.results)
        ]
        return Mock(results=results, errors=[], count=len(results))

    api.batch_create_results.side_effect = _echo_create_results
    api.batch_update_scores.return_value = Mock(errors=[], count=0)
    return api


@pytest.fixture
def sample_testcases() -> list[InlineTestCase]:
    """Sample testcases for evaluation."""
    return make_sample_testcases()
