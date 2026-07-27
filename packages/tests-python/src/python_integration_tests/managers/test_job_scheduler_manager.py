import logging
from typing import List

from awssolutions_gen_ai_evaluation_toolkit_python_client import ApiClient, DefaultApi

logger = logging.getLogger(__name__)

class ScopedJobSchedulerManager:
    """Manager for creating and cleaning up job schedulers in tests."""

    def __init__(self, genaietk_client: ApiClient) -> None:
        self.genaietk_client = genaietk_client
        self.api = DefaultApi(genaietk_client)
        self._created_job_schedulers: List[str] = []

    def create_job_scheduler(self, scheduler):
        """Create a job scheduler and track it for cleanup."""
        from awssolutions_gen_ai_evaluation_toolkit_python_client.models import CreateJobSchedulerRequestContent
        
        request = CreateJobSchedulerRequestContent(
            scheduler=scheduler,
        )

        response = self.api.create_job_scheduler(body=request,
        )

        if response.status_code == 200 and response:
            scheduler_id = response.scheduler_id
            self._created_job_schedulers.append(scheduler_id)
            logger.info(f"Created job scheduler: {scheduler_id}")

        return response

    def try_cleanup(self) -> List[str]:
        """Clean up all created job schedulers. Returns list of errors."""
        errors = []
        
        for scheduler_id in self._created_job_schedulers:
            try:
                self.api.delete_job_scheduler(scheduler_id=scheduler_id,
                )
                logger.info(f"Deleted job scheduler: {scheduler_id}")
            except Exception as e:
                error_msg = f"Failed to delete job scheduler {scheduler_id}: {str(e)}"
                logger.error(error_msg)
                errors.append(error_msg)
        
        self._created_job_schedulers.clear()
        return errors
