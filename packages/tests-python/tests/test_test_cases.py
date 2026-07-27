import time

import pytest
from awssolutions_gen_ai_evaluation_toolkit_python_client import ApiClient, DefaultApi
from awssolutions_gen_ai_evaluation_toolkit_python_client.models.create_test_case_request_content import CreateTestCaseRequestContent
from awssolutions_gen_ai_evaluation_toolkit_python_client.models.put_test_case_annotation_request_content import (
    PutTestCaseAnnotationRequestContent,
)

from python_integration_tests.managers.test_annotation_schema_manager import (
    ScopedAnnotationSchemaManager,
)
from python_integration_tests.managers.test_dataset_manager import (
    ScopedDatasetManager,
)
from python_integration_tests.managers.test_test_case_manager import (
    ScopedTestCaseManager,
)


@pytest.mark.category("test_cases")
class TestTestCases:
    """Test case for Test Case API endpoints."""

    @pytest.fixture(autouse=True)
    def setup(
        self,
        genaietk_client: ApiClient,
        dataset_manager: ScopedDatasetManager,
        test_case_manager: ScopedTestCaseManager,
        annotation_schema_manager: ScopedAnnotationSchemaManager,
    ) -> None:
        self.genaietk_client = genaietk_client
        self.api = DefaultApi(genaietk_client)
        self.dataset_manager = dataset_manager
        self.test_case_manager = test_case_manager
        self.annotation_schema_manager = annotation_schema_manager
        self._created_test_cases = []

    def test_create_test_case(self) -> None:
        """Test creating a test case."""
        dataset = self.dataset_manager.create_dataset(
            name=f"test-dataset-{int(time.time())}", description="Dataset for test case creation"
        )

        test_case = self.test_case_manager.create_test_case(
            dataset_id=dataset.dataset_id, input_data={"prompt": "Test prompt"}, expected_output="Expected response"
        )

        assert test_case is not None

    def test_get_test_case(self) -> None:
        """Test retrieving a test case."""
        dataset = self.dataset_manager.create_dataset(
            name=f"test-dataset-get-{int(time.time())}", description="Dataset for test case retrieval"
        )

        create_request = CreateTestCaseRequestContent(
            input={"prompt": "Test prompt for get"}, expected="Expected response for get"
        )

        create_response = self.api.create_test_case(
            dataset_id=dataset.dataset_id,
            create_test_case_request_content=create_request,
        )
        created_test_case = create_response
        assert created_test_case is not None

        if hasattr(created_test_case, "test_case_id"):
            self._created_test_cases.append(created_test_case.test_case_id)

            # Mint a version first
            self.api.create_dataset_version(dataset_id=dataset.dataset_id)

            # Poll until version is available
            import time as time_module

            from awssolutions_gen_ai_evaluation_toolkit_python_client.exceptions import NotFoundException

            response = None
            for _ in range(10):
                try:
                    response = self.api.get_test_case(
                        dataset_id=dataset.dataset_id,
                        version="1",
                        test_case_id=created_test_case.test_case_id,
                    )
                    break
                except NotFoundException:
                    time_module.sleep(1)

            assert response is not None

    def test_delete_test_case(self) -> None:
        """Test deleting a test case."""
        dataset = self.dataset_manager.create_dataset(
            name=f"test-dataset-delete-{int(time.time())}", description="Dataset for test case deletion"
        )

        create_request = CreateTestCaseRequestContent(
            input={"prompt": "Test prompt for delete"}, expected="Expected response for delete"
        )

        create_response = self.api.create_test_case(
            dataset_id=dataset.dataset_id,
            create_test_case_request_content=create_request,
        )
        created_test_case = create_response
        assert created_test_case is not None

        if hasattr(created_test_case, "test_case_id"):
            self.api.delete_test_case(
                dataset_id=dataset.dataset_id,
                test_case_id=created_test_case.test_case_id,
            )

    def test_put_test_case_annotation(self) -> None:
        """Test adding annotation to a test case."""
        dataset = self.dataset_manager.create_dataset(
            name=f"test-dataset-annotation-{int(time.time())}", description="Dataset for test case annotation"
        )

        create_request = CreateTestCaseRequestContent(
            input={"prompt": "Test prompt for annotation"}, expected="Expected response for annotation"
        )

        create_response = self.api.create_test_case(
            dataset_id=dataset.dataset_id,
            create_test_case_request_content=create_request,
        )
        created_test_case = create_response
        assert created_test_case is not None

        if hasattr(created_test_case, "test_case_id"):
            self._created_test_cases.append(created_test_case.test_case_id)

            # First create an annotation schema with unique name
            schema_name = f"test-schema-{int(time.time())}"
            from awssolutions_gen_ai_evaluation_toolkit_python_client.models.annotation_value_type import AnnotationValueType
            from awssolutions_gen_ai_evaluation_toolkit_python_client.models.string_configurations import StringConfigurations
            from awssolutions_gen_ai_evaluation_toolkit_python_client.models.string_type import StringType

            string_config = StringConfigurations(enum=["high", "medium", "low"])
            string_obj = StringType(string_type=string_config)
            value_type = AnnotationValueType(actual_instance=string_obj)

            schema = self.annotation_schema_manager.create_annotation_schema(
                name=schema_name, value_type=value_type, description="Test schema for annotation"
            )
            assert schema is not None

            from awssolutions_gen_ai_evaluation_toolkit_python_client.models.annotation_value import AnnotationValue
            from awssolutions_gen_ai_evaluation_toolkit_python_client.models.string_value import StringValue

            string_val = StringValue(string_value="high")
            annotation_val = AnnotationValue(actual_instance=string_val)

            annotation_request = PutTestCaseAnnotationRequestContent(name=schema_name, value=annotation_val)

            # Mint a dataset version first (required for annotations)
            mint_response = self.api.create_dataset_version(dataset_id=dataset.dataset_id)

            # Poll until annotation can be added
            import time as time_module

            for _ in range(10):  # Max 10 attempts
                response = self.api.put_test_case_annotation(
                    dataset_id=dataset.dataset_id,
                    test_case_id=created_test_case.test_case_id,
                    put_test_case_annotation_request_content=annotation_request,
                )
                break
                time_module.sleep(1)

    def test_delete_test_case_annotation(self) -> None:
        """Test deleting a test case annotation."""
        dataset = self.dataset_manager.create_dataset(
            name=f"test-dataset-{int(time.time())}", description="Dataset for annotation deletion test"
        )

        test_case = self.test_case_manager.create_test_case(
            dataset_id=dataset.dataset_id, input_data={"prompt": "Test prompt"}, expected_output="Expected response"
        )

        # Create annotation schema
        import random

        schema_name = f"test-schema-{int(time.time())}-{random.randint(1000, 9999)}"
        from awssolutions_gen_ai_evaluation_toolkit_python_client.models.annotation_value_type import AnnotationValueType
        from awssolutions_gen_ai_evaluation_toolkit_python_client.models.string_configurations import StringConfigurations
        from awssolutions_gen_ai_evaluation_toolkit_python_client.models.string_type import StringType

        string_config = StringConfigurations(enum=["high", "medium", "low"])
        string_type = StringType(string_type=string_config)
        value_type = AnnotationValueType(actual_instance=string_type)

        schema = self.annotation_schema_manager.create_annotation_schema(
            name=schema_name, value_type=value_type, description="Test schema for annotation deletion"
        )

        # Mint a dataset version first (required for annotations)
        mint_response = self.api.create_dataset_version(dataset_id=dataset.dataset_id)

        # Add annotation first
        import time as time_module

        from awssolutions_gen_ai_evaluation_toolkit_python_client.exceptions import NotFoundException
        from awssolutions_gen_ai_evaluation_toolkit_python_client.models.annotation_value import AnnotationValue
        from awssolutions_gen_ai_evaluation_toolkit_python_client.models.string_value import StringValue

        string_val = StringValue(string_value="high")
        annotation_val = AnnotationValue(actual_instance=string_val)

        annotation_request = PutTestCaseAnnotationRequestContent(name=schema_name, value=annotation_val)

        # Wait for version to be available
        for _ in range(10):
            try:
                self.api.put_test_case_annotation(
                    dataset_id=dataset.dataset_id,
                    test_case_id=test_case.test_case_id,
                    put_test_case_annotation_request_content=annotation_request,
                )
                break
            except NotFoundException:
                time_module.sleep(1)

        # Delete the annotation
        self.api.delete_test_case_annotation(
            dataset_id=dataset.dataset_id, test_case_id=test_case.test_case_id, annotation_name=schema_name
        )

    def test_list_test_cases_in_version(self) -> None:
        """Test listing test cases in a dataset version."""
        dataset = self.dataset_manager.create_dataset(
            name=f"test-dataset-{int(time.time())}", description="Dataset for test case listing"
        )

        # Create a test case
        test_case = self.test_case_manager.create_test_case(
            dataset_id=dataset.dataset_id, input_data={"prompt": "Test prompt"}, expected_output="Expected response"
        )

        # Mint a version
        mint_response = self.api.create_dataset_version(dataset_id=dataset.dataset_id)

        # List test cases in the version
        import time as time_module

        from awssolutions_gen_ai_evaluation_toolkit_python_client.exceptions import NotFoundException
        from awssolutions_gen_ai_evaluation_toolkit_python_client.models.list_test_cases_request_content import ListTestCasesRequestContent

        request = ListTestCasesRequestContent()

        # Wait for version to be available
        response = None
        for _ in range(10):
            try:
                response = self.api.list_test_cases(
                    dataset_id=dataset.dataset_id, version="1", list_test_cases_request_content=request
                )
                break
            except NotFoundException:
                time_module.sleep(1)

        assert response is not None
        assert hasattr(response, "test_cases")
