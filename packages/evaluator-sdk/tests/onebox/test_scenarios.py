"""Run shared EvaluatorScenarios against the integration backend (onebox or e2e)."""

from ..scenarios import EvaluatorScenarios


class TestIntegrationScenarios(EvaluatorScenarios):
    """Shared scenarios executed against the integration backend."""
