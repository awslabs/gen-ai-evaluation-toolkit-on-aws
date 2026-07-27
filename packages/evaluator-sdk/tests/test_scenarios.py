"""Run shared EvaluatorScenarios against the mock backend."""

from typing import Any
from unittest.mock import Mock

import pytest

from evaluator_sdk import Evaluator

from .helpers import exact_match_scorer, simple_app
from .scenarios import EvaluatorScenarios, ScoreOnlyScenarios


@pytest.fixture
def evaluator_factory(mock_api: Mock) -> Any:
    """Factory that builds an Evaluator wired to the mock API."""
    def factory(
        app_invoke: Any = simple_app,
        scorers: list[Any] | None = None,
        name: str = "test-eval",
    ) -> Evaluator:
        if scorers is None:
            scorers = [exact_match_scorer]
        return Evaluator(name=name, app_invoke=app_invoke, scorers=scorers, client=mock_api)
    return factory


class TestMockScenarios(EvaluatorScenarios):
    """Shared scenarios executed against the mock backend."""


class TestMockScoreOnly(ScoreOnlyScenarios):
    """Score-only scenarios — mock only (real handler rejects empty-report scoring)."""
