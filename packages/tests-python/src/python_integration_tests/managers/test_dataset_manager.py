import logging
from typing import List

from awssolutions_gen_ai_evaluation_toolkit_python_client import ApiClient, DefaultApi
from awssolutions_gen_ai_evaluation_toolkit_python_client.models import (
    CreateDatasetRequestContent,
    CreateDatasetResponseContent,
)

logger = logging.getLogger(__name__)


class ScopedDatasetManager:
    """Manager for creating and cleaning up datasets in tests."""

    def __init__(self, genaietk_client: ApiClient) -> None:
        self.genaietk_client = genaietk_client
        self.api = DefaultApi(genaietk_client)
        self._created_datasets: List[str] = []

    def create_dataset(
        self, name: str, description: str = "Test dataset"
    ) -> CreateDatasetResponseContent:
        """Create a dataset and track it for cleanup."""
        request = CreateDatasetRequestContent(
            name=name,
            description=description,
        )
        
        dataset = self.api.create_dataset(request)
        
        if dataset and dataset.dataset_id:
            self._created_datasets.append(dataset.dataset_id)
            logger.info(f"Created dataset: {dataset.dataset_id}")
        
        return dataset

    def try_cleanup(self) -> List[str]:
        """Clean up all created datasets. Returns list of errors."""
        errors = []
        
        for dataset_id in self._created_datasets:
            try:
                self.api.delete_dataset(dataset_id)
                logger.info(f"Deleted dataset: {dataset_id}")
            except Exception as e:
                error_msg = f"Failed to delete dataset {dataset_id}: {str(e)}"
                logger.error(error_msg)
                errors.append(error_msg)
        
        self._created_datasets.clear()
        return errors
