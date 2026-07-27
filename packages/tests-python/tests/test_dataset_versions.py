import time

import pytest
from awssolutions_gen_ai_evaluation_toolkit_python_client import ApiClient, DefaultApi
from awssolutions_gen_ai_evaluation_toolkit_python_client.models import (
    PutDatasetVersionAnnotationRequestContent,
    RestoreDatasetRequestContent,
)

from python_integration_tests.managers.test_annotation_schema_manager import (
    ScopedAnnotationSchemaManager,
)
from python_integration_tests.managers.test_dataset_manager import (
    ScopedDatasetManager,
)


@pytest.mark.category("dataset_versions")
class TestDatasetVersions:
    """Test case for Dataset Version API endpoints."""

    @pytest.fixture(autouse=True)
    def setup(
        self,
        genaietk_client: ApiClient,
        dataset_manager: ScopedDatasetManager,
        annotation_schema_manager: ScopedAnnotationSchemaManager,
    ) -> None:
        self.genaietk_client = genaietk_client
        self.api = DefaultApi(genaietk_client)
        self.dataset_manager = dataset_manager
        self.annotation_schema_manager = annotation_schema_manager

    def test_get_dataset_version(self) -> None:
        """Test retrieving a dataset version."""
        dataset = self.dataset_manager.create_dataset(
            name=f"test-dataset-version-{int(time.time())}", description="Dataset for version retrieval"
        )

        # First mint a version to ensure version 1 exists
        self.api.create_dataset_version(dataset_id=dataset.dataset_id)

        # Poll until dataset status is ACTIVE
        import time as time_module

        max_attempts = 50
        for i in range(max_attempts):
            dataset_status = self.api.get_dataset(dataset_id=dataset.dataset_id)
            if hasattr(dataset_status, "status") and dataset_status.status == "ACTIVE":
                break
            if i == max_attempts - 1:
                raise Exception(f"Dataset {dataset.dataset_id} is not active after {max_attempts} attempts")
            time_module.sleep(0.5)

        # Get the dataset version
        response = self.api.get_dataset_version(dataset_id=dataset.dataset_id, version="1")

        # Basic assertions
        assert response is not None
        assert response.dataset_id == dataset.dataset_id
        assert response.version == 1

    def test_create_dataset_version(self) -> None:
        """Test creating a new dataset version."""
        dataset = self.dataset_manager.create_dataset(
            name=f"test-dataset-mint-{int(time.time())}", description="Dataset for version minting"
        )

        response = self.api.create_dataset_version(dataset_id=dataset.dataset_id)

        new_version = response
        assert new_version is not None

    def test_restore_dataset(self) -> None:
        """Test rolling back a dataset to a previous version."""
        dataset = self.dataset_manager.create_dataset(
            name=f"test-dataset-rollback-{int(time.time())}", description="Dataset for rollback testing"
        )

        # First mint a new version
        self.api.create_dataset_version(dataset_id=dataset.dataset_id)

        # Wait for version to be available
        import time as time_module

        from awssolutions_gen_ai_evaluation_toolkit_python_client.exceptions import ApiException

        for _ in range(10):
            try:
                # Then rollback to version 1
                rollback_request = RestoreDatasetRequestContent(version=1.0)

                self.api.restore_dataset(
                    dataset_id=dataset.dataset_id,
                    restore_dataset_request_content=rollback_request,
                )
                break
            except ApiException as e:
                if e.status == 422:
                    time_module.sleep(1)
                else:
                    raise

    def test_put_dataset_version_annotation(self) -> None:
        """Test adding annotation to a dataset version."""
        dataset = self.dataset_manager.create_dataset(
            name=f"test-dataset-annotation-{int(time.time())}", description="Dataset for version annotation"
        )

        # First mint a version to ensure version 1 exists
        self.api.create_dataset_version(dataset_id=dataset.dataset_id)

        # Create annotation schema using the working manager like TypeScript tests
        from awssolutions_gen_ai_evaluation_toolkit_python_client.models.annotation_value_type import AnnotationValueType
        from awssolutions_gen_ai_evaluation_toolkit_python_client.models.string_configurations import StringConfigurations
        from awssolutions_gen_ai_evaluation_toolkit_python_client.models.string_type import StringType

        string_config = StringConfigurations(enum=["high", "medium", "low"])
        string_obj = StringType(string_type=string_config)
        value_type = AnnotationValueType(actual_instance=string_obj)

        schema_name = f"test-quality-{int(time.time())}"
        self.annotation_schema_manager.create_annotation_schema(
            name=schema_name, value_type=value_type, description="Quality annotation schema"
        )

        from awssolutions_gen_ai_evaluation_toolkit_python_client.models.annotation_value import AnnotationValue
        from awssolutions_gen_ai_evaluation_toolkit_python_client.models.string_value import StringValue

        string_val = StringValue(string_value="high")
        annotation_val = AnnotationValue(actual_instance=string_val)

        annotation_request = PutDatasetVersionAnnotationRequestContent(name=schema_name, value=annotation_val)

        self.api.put_dataset_version_annotation(
            dataset_id=dataset.dataset_id,
            version=1.0,
            put_dataset_version_annotation_request_content=annotation_request,
        )

    def test_delete_dataset_version_annotation(self) -> None:
        """Test deleting annotation from a dataset version."""
        dataset = self.dataset_manager.create_dataset(
            name=f"test-dataset-del-annotation-{int(time.time())}", description="Dataset for annotation deletion"
        )

        # First mint a version to ensure version 1 exists
        self.api.create_dataset_version(dataset_id=dataset.dataset_id)

        # Create annotation schema using the working manager
        from awssolutions_gen_ai_evaluation_toolkit_python_client.models.annotation_value_type import AnnotationValueType
        from awssolutions_gen_ai_evaluation_toolkit_python_client.models.string_configurations import StringConfigurations
        from awssolutions_gen_ai_evaluation_toolkit_python_client.models.string_type import StringType

        string_config = StringConfigurations(enum=["high", "medium", "low"])
        string_obj = StringType(string_type=string_config)
        value_type = AnnotationValueType(actual_instance=string_obj)

        schema_name = f"test-quality-del-{int(time.time())}"
        self.annotation_schema_manager.create_annotation_schema(
            name=schema_name, value_type=value_type, description="Quality annotation schema"
        )

        # First add an annotation
        from awssolutions_gen_ai_evaluation_toolkit_python_client.models.annotation_value import AnnotationValue
        from awssolutions_gen_ai_evaluation_toolkit_python_client.models.string_value import StringValue

        string_val = StringValue(string_value="medium")
        annotation_val = AnnotationValue(actual_instance=string_val)

        annotation_request = PutDatasetVersionAnnotationRequestContent(name=schema_name, value=annotation_val)

        # Wait for version to be available
        import time as time_module

        from awssolutions_gen_ai_evaluation_toolkit_python_client.exceptions import NotFoundException

        for _ in range(10):
            try:
                self.api.put_dataset_version_annotation(
                    dataset_id=dataset.dataset_id,
                    version=1.0,
                    put_dataset_version_annotation_request_content=annotation_request,
                )
                break
            except NotFoundException:
                time_module.sleep(1)

        # Then delete it
        self.api.delete_dataset_version_annotation(
            dataset_id=dataset.dataset_id,
            version=1.0,
            annotation_name=schema_name,
        )

    def test_list_dataset_versions(self) -> None:
        """Test listing dataset versions."""
        dataset = self.dataset_manager.create_dataset(
            name=f"test-dataset-{int(time.time())}", description="Dataset for version listing"
        )

        # Mint a version
        self.api.create_dataset_version(dataset_id=dataset.dataset_id)

        # List dataset versions
        from awssolutions_gen_ai_evaluation_toolkit_python_client.models.list_dataset_versions_request_content import (
            ListDatasetVersionsRequestContent,
        )

        request = ListDatasetVersionsRequestContent()

        response = self.api.list_dataset_versions(
            dataset_id=dataset.dataset_id, list_dataset_versions_request_content=request
        )

        assert response is not None
        assert hasattr(response, "versions")

