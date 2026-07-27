import logging
from typing import List

from awssolutions_gen_ai_evaluation_toolkit_python_client import ApiClient, DefaultApi

logger = logging.getLogger(__name__)

class ScopedGenerationManager:
    """Manager for creating and cleaning up generations in tests."""

    def __init__(self, genaietk_client: ApiClient) -> None:
        self.genaietk_client = genaietk_client
        self.api = DefaultApi(genaietk_client)
        self._created_generations: List[str] = []

    def start_generation(self, steps, experiment_name: str = None):
        """Start a generation and track it for cleanup."""
        from awssolutions_gen_ai_evaluation_toolkit_python_client.models import StartGenerationRequestContent
        
        request = StartGenerationRequestContent(
            steps=steps,
            experiment_name=experiment_name,
        )

        response = self.api.start_generation(body=request,
        )

        if response.status_code == 200 and response:
            generation_id = response.generation_id
            self._created_generations.append(generation_id)
            logger.info(f"Started generation: {generation_id}")

        return response

    def try_cleanup(self) -> List[str]:
        """Clean up all created generations. Returns list of errors."""
        errors = []
        
        for generation_id in self._created_generations:
            try:
                self.api.stop_generation(generation_id=generation_id,
                )
                logger.info(f"Stopped generation: {generation_id}")
            except Exception as e:
                error_msg = f"Failed to stop generation {generation_id}: {str(e)}"
                logger.error(error_msg)
                errors.append(error_msg)
        
        self._created_generations.clear()
        return errors
