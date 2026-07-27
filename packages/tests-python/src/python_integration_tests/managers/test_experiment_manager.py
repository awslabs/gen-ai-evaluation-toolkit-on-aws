import logging
from typing import List

from awssolutions_gen_ai_evaluation_toolkit_python_client import ApiClient, DefaultApi
from awssolutions_gen_ai_evaluation_toolkit_python_client.models import (
    CreateExperimentRequestContent,
    CreateExperimentResponseContent,
)

logger = logging.getLogger(__name__)


class ScopedExperimentManager:
    """Manager for creating and cleaning up experiments in tests."""

    def __init__(self, genaietk_client: ApiClient) -> None:
        self.genaietk_client = genaietk_client
        self.api = DefaultApi(genaietk_client)
        self._created_experiments: List[str] = []

    def create_experiment(
        self, name: str, description: str = "Test experiment"
    ) -> CreateExperimentResponseContent:
        """Create an experiment and track it for cleanup."""
        request = CreateExperimentRequestContent(
            name=name,
            description=description,
        )
        
        experiment = self.api.create_experiment(request)
        
        if experiment and hasattr(experiment, 'name'):
            self._created_experiments.append(experiment.name)
            logger.info(f"Created experiment: {experiment.name}")
        
        return experiment

    def try_cleanup(self) -> List[str]:
        """Clean up all created experiments. Returns list of errors."""
        errors = []
        
        for experiment_name in self._created_experiments:
            try:
                self.api.delete_experiment(experiment_name)
                logger.info(f"Deleted experiment: {experiment_name}")
            except Exception as e:
                error_msg = f"Failed to delete experiment {experiment_name}: {str(e)}"
                logger.error(error_msg)
                errors.append(error_msg)
        
        self._created_experiments.clear()
        return errors
