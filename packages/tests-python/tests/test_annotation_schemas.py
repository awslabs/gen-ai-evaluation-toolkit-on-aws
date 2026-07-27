import time

import pytest
from awssolutions_gen_ai_evaluation_toolkit_python_client import ApiClient, DefaultApi
from awssolutions_gen_ai_evaluation_toolkit_python_client.models import CreateAnnotationSchemaRequestContent

from python_integration_tests.managers.test_annotation_schema_manager import (
    ScopedAnnotationSchemaManager,
)


@pytest.mark.category("annotation_schemas")
class TestAnnotationSchemas:
    """Test case for Annotation Schema API endpoints."""

    @pytest.fixture(autouse=True)
    def setup(self, genaietk_client: ApiClient, annotation_schema_manager: ScopedAnnotationSchemaManager) -> None:
        self.genaietk_client = genaietk_client
        self.api = DefaultApi(genaietk_client)
        self.annotation_schema_manager = annotation_schema_manager

    def test_create_annotation_schema(self) -> None:
        """Test creating an annotation schema."""
        schema_name = f"test-schema-{int(time.time())}"

        from awssolutions_gen_ai_evaluation_toolkit_python_client.models.annotation_value_type import AnnotationValueType
        from awssolutions_gen_ai_evaluation_toolkit_python_client.models.string_configurations import StringConfigurations
        from awssolutions_gen_ai_evaluation_toolkit_python_client.models.string_type import StringType

        # Create the StringType object properly
        string_config = StringConfigurations(enum=["high", "medium", "low"])
        string_obj = StringType(string_type=string_config)

        # Create AnnotationValueType with actual_instance
        value_type = AnnotationValueType(actual_instance=string_obj)

        schema = self.annotation_schema_manager.create_annotation_schema(
            name=schema_name, value_type=value_type, description="Test annotation schema"
        )

        assert schema is not None

    def test_get_annotation_schema(self) -> None:
        """Test retrieving an annotation schema."""
        schema_name = f"test-schema-get-{int(time.time())}"

        from awssolutions_gen_ai_evaluation_toolkit_python_client.models.annotation_value_type import AnnotationValueType
        from awssolutions_gen_ai_evaluation_toolkit_python_client.models.string_configurations import StringConfigurations
        from awssolutions_gen_ai_evaluation_toolkit_python_client.models.string_type import StringType

        # Create the StringType object properly
        string_config = StringConfigurations(enum=["high", "medium", "low"])
        string_obj = StringType(string_type=string_config)
        value_type = AnnotationValueType(actual_instance=string_obj)

        schema = self.annotation_schema_manager.create_annotation_schema(
            name=schema_name, value_type=value_type, description="Test schema for retrieval"
        )
        assert schema is not None

        response = self.api.get_annotation_schema(annotation_name=schema_name)

        schema = response
        assert schema is not None

    def test_list_annotation_schemas(self) -> None:
        """Test listing annotation schemas."""
        # First create an annotation schema to ensure list is non-empty
        schema_name = f"test-schema-list-{int(time.time())}"

        from awssolutions_gen_ai_evaluation_toolkit_python_client.models.annotation_value_type import AnnotationValueType

        value_type_dict = {"stringType": {"enum": ["high", "medium", "low"]}}
        value_type = AnnotationValueType.from_dict(value_type_dict)

        schema = self.annotation_schema_manager.create_annotation_schema(
            name=schema_name, value_type=value_type, description="Test schema for listing"
        )
        assert schema is not None

        # Now test listing
        response = self.api.list_annotation_schemas()

        schemas_list = response
        assert schemas_list is not None
        assert len(schemas_list.annotation_schemas) > 0

    def test_archive_annotation_schema(self) -> None:
        """Test archiving an annotation schema."""
        schema_name = f"test-schema-archive-{int(time.time())}"

        from awssolutions_gen_ai_evaluation_toolkit_python_client.models.annotation_value_type import AnnotationValueType

        value_type_dict = {"stringType": {"enum": ["high", "medium", "low"]}}
        value_type = AnnotationValueType.from_dict(value_type_dict)

        request = CreateAnnotationSchemaRequestContent(
            name=schema_name, value_type=value_type, description="Test schema for archiving"
        )

        self.api.create_annotation_schema(request)

        from awssolutions_gen_ai_evaluation_toolkit_python_client.models import ArchiveAnnotationSchemaRequestContent

        archive_request = ArchiveAnnotationSchemaRequestContent()

        self.api.archive_annotation_schema(
            annotation_name=schema_name,
            archive_annotation_schema_request_content=archive_request,
        )

