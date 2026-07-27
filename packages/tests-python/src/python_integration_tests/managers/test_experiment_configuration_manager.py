import logging
from typing import List

from awssolutions_gen_ai_evaluation_toolkit_python_client import ApiClient, DefaultApi

logger = logging.getLogger(__name__)

class ScopedExperimentConfigurationManager:
    """Manager for creating and cleaning up experiment configurations in tests."""

    def __init__(self, genaietk_client: ApiClient) -> None:
        self.genaietk_client = genaietk_client
        self.api = DefaultApi(genaietk_client)
        self._created_experiment_configurations: List[str] = []

    def create_experiment_configuration(self, experiment_name: str, configuration):
        """Create an experiment configuration and track it for cleanup."""
        from awssolutions_gen_ai_evaluation_toolkit_python_client.models import CreateExperimentConfigurationRequestContent
        
        request = CreateExperimentConfigurationRequestContent(
            configuration=configuration,
        )

        response = self.api.create_experiment_configuration(experiment_name=experiment_name,
            body=request,
        )

        if response.status_code == 200 and response:
            config_id = response.configuration_id
            self._created_experiment_configurations.append(config_id)
            logger.info(f"Created experiment configuration: {config_id}")

        return response

    def try_cleanup(self) -> List[str]:
        """Clean up all created experiment configurations. Returns list of errors."""
        # Note: No delete API available for experiment configurations
        # Configurations may be cleaned up automatically by the system
        logger.info(f"Skipping cleanup for {len(self._created_experiment_configurations)} experiment configurations (no delete API)")
        self._created_experiment_configurations.clear()
        return []
