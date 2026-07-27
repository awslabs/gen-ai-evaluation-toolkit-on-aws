import logging
from typing import List

from awssolutions_gen_ai_evaluation_toolkit_python_client import ApiClient, DefaultApi

logger = logging.getLogger(__name__)

class ScopedConfigurationManager:
    """Manager for creating and cleaning up configurations in tests."""

    def __init__(self, genaietk_client: ApiClient) -> None:
        self.genaietk_client = genaietk_client
        self.api = DefaultApi(genaietk_client)
        self._created_configurations: List[str] = []

    def create_configuration(self, configuration):
        """Create a configuration and track it for cleanup."""
        from awssolutions_gen_ai_evaluation_toolkit_python_client.models import CreateConfigurationRequestContent
        
        request = CreateConfigurationRequestContent(
            configuration=configuration,
        )

        response = self.api.create_configuration(body=request,
        )

        if response.status_code == 200 and response:
            config_id = response.configuration_id
            self._created_configurations.append(config_id)
            logger.info(f"Created configuration: {config_id}")

        return response

    def try_cleanup(self) -> List[str]:
        """Clean up all created configurations. Returns list of errors."""
        # Note: No delete API available for configurations
        # Configurations may be cleaned up automatically by the system
        logger.info(f"Skipping cleanup for {len(self._created_configurations)} configurations (no delete API)")
        self._created_configurations.clear()
        return []
