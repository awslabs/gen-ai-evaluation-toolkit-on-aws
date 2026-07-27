import logging
from typing import List

from awssolutions_gen_ai_evaluation_toolkit_python_client import ApiClient, DefaultApi

logger = logging.getLogger(__name__)

class ScopedEvaluationManager:
    """Manager for creating and cleaning up evaluations in tests."""

    def __init__(self, genaietk_client: ApiClient) -> None:
        self.genaietk_client = genaietk_client
        self.api = DefaultApi(genaietk_client)
        self._created_evaluations: List[str] = []

    def start_evaluation(self, config, experiment_name: str = None):
        """Start an evaluation and track it for cleanup."""
        from awssolutions_gen_ai_evaluation_toolkit_python_client.models import StartEvaluationRequestContent
        
        request = StartEvaluationRequestContent(
            config=config,
            experiment_name=experiment_name,
        )

        response = self.api.start_evaluation(body=request,
        )

        if response.status_code == 200 and response:
            evaluation_id = response.evaluation_id
            self._created_evaluations.append(evaluation_id)
            logger.info(f"Started evaluation: {evaluation_id}")

        return response

    def try_cleanup(self) -> List[str]:
        """Clean up all created evaluations. Returns list of errors."""
        errors = []
        
        for evaluation_id in self._created_evaluations:
            try:
                self.api.stop_evaluation(evaluation_id=evaluation_id,
                )
                logger.info(f"Stopped evaluation: {evaluation_id}")
            except Exception as e:
                error_msg = f"Failed to stop evaluation {evaluation_id}: {str(e)}"
                logger.error(error_msg)
                errors.append(error_msg)
        
        self._created_evaluations.clear()
        return errors
