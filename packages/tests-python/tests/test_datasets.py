import pytest
from awssolutions_gen_ai_evaluation_toolkit_python_client import ApiClient, DefaultApi

from python_integration_tests.managers.test_dataset_manager import (
    ScopedDatasetManager,
)


class TestDatasets:
    """Test case for Dataset API endpoints."""

    @pytest.fixture(autouse=True)
    def setup(
        self,
        dataset_manager: ScopedDatasetManager,
        genaietk_client: ApiClient,
    ) -> None:
        self.dataset_manager = dataset_manager
        self.genaietk_client = genaietk_client
        self.api = DefaultApi(genaietk_client)

    def test_create_dataset(self) -> None:
        """Test creating a dataset."""
        dataset_name = "test-dataset-create"

        dataset = self.dataset_manager.create_dataset(name=dataset_name, description="Test dataset for creation")

        assert dataset.dataset_id is not None
        assert dataset.name == dataset_name
        assert dataset.description == "Test dataset for creation"

    def test_get_dataset(self) -> None:
        """Test retrieving a dataset."""
        dataset_name = "test-dataset-get"

        created_dataset = self.dataset_manager.create_dataset(
            name=dataset_name, description="Test dataset for retrieval"
        )

        retrieved_dataset = self.api.get_dataset(created_dataset.dataset_id)

        assert retrieved_dataset is not None
        assert hasattr(retrieved_dataset, "dataset_id")
        assert retrieved_dataset.dataset_id == created_dataset.dataset_id
        assert hasattr(retrieved_dataset, "name")
        assert retrieved_dataset.name == dataset_name

    def test_list_datasets(self) -> None:
        """Test listing datasets."""
        # Create a test dataset
        dataset_name = "test-dataset-list"
        created_dataset = self.dataset_manager.create_dataset(name=dataset_name, description="Test dataset for listing")

        datasets_list = self.api.list_datasets()

        assert datasets_list is not None
        assert hasattr(datasets_list, "datasets")

        # Check that our dataset is in the list
        dataset_ids = [ds.dataset_id for ds in datasets_list.datasets if hasattr(ds, "dataset_id")]
        assert created_dataset.dataset_id in dataset_ids
