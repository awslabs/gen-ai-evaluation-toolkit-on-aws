import logging
from typing import List, Tuple

from awssolutions_gen_ai_evaluation_toolkit_python_client import ApiClient, DefaultApi

from awssolutions_gen_ai_evaluation_toolkit_python_client.models import (
    CreateTestCaseRequestContent,
)

logger = logging.getLogger(__name__)

class ScopedTestCaseManager:
    """Manager for creating and cleaning up test cases in tests."""

    def __init__(self, genaietk_client: ApiClient) -> None:
        self.genaietk_client = genaietk_client
        self.api = DefaultApi(genaietk_client)
        self._created_test_cases: List[Tuple[str, str]] = []  # (dataset_id, test_case_id)

    def create_test_case(self, dataset_id: str, input_data, expected_output: str = "Expected response"):
        """Create a test case and track it for cleanup."""
        request = CreateTestCaseRequestContent(
            input=input_data,
            expected=expected_output,
        )

        response = self.api.create_test_case(
            dataset_id=dataset_id,
            create_test_case_request_content=request,
        )

        if response and hasattr(response, 'test_case_id'):
            test_case_id = response.test_case_id
            self._created_test_cases.append((dataset_id, test_case_id))
            logger.info(f"Created test case: {test_case_id} in dataset: {dataset_id}")

        return response

    def try_cleanup(self) -> List[str]:
        """Clean up all created test cases. Returns list of errors."""
        errors = []
        
        for dataset_id, test_case_id in self._created_test_cases:
            try:
                self.api.delete_test_case(dataset_id=dataset_id,
                    test_case_id=test_case_id,
                )
                logger.info(f"Deleted test case: {test_case_id}")
            except Exception as e:
                error_msg = f"Failed to delete test case {test_case_id}: {str(e)}"
                logger.error(error_msg)
                errors.append(error_msg)
        
        self._created_test_cases.clear()
        return errors
