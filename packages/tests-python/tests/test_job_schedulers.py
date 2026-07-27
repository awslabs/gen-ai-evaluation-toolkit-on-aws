import pytest
from awssolutions_gen_ai_evaluation_toolkit_python_client import ApiClient, DefaultApi
from awssolutions_gen_ai_evaluation_toolkit_python_client.models.create_job_scheduler_request_content import (
    CreateJobSchedulerRequestContent,
)
from awssolutions_gen_ai_evaluation_toolkit_python_client.models.update_job_scheduler_request_content import (
    UpdateJobSchedulerRequestContent,
)

from python_integration_tests.managers.test_job_scheduler_manager import (
    ScopedJobSchedulerManager,
)


def _build_create_request(name_suffix: str = "") -> CreateJobSchedulerRequestContent:
    """Build a minimal CreateJobSchedulerRequestContent valid under the V2 schema.

    V2 schema requires: cron, jobType, evaluatorName. For FULL jobs, testCases + scorers are
    also required. testCases uses the TestDataSource union (inline variant here).
    """
    from awssolutions_gen_ai_evaluation_toolkit_python_client.models.job_type import JobType
    from awssolutions_gen_ai_evaluation_toolkit_python_client.models.test_data_source import TestDataSource

    test_cases = TestDataSource.from_dict({"inline": [{"input": {"q": "ping"}}]})
    scorers = {"dummy-scorer": None}

    return CreateJobSchedulerRequestContent(
        cron="0 0 * * ? *",  # Daily at midnight (AWS cron format)
        jobType=JobType.FULL,
        evaluatorName=f"dummy-evaluator{name_suffix}",
        testCases=test_cases,
        scorers=scorers,
    )


@pytest.mark.category("job_schedulers")
class TestJobSchedulers:
    """Test case for Job Scheduler API endpoints."""

    @pytest.fixture(autouse=True)
    def setup(self, genaietk_client: ApiClient, job_scheduler_manager: ScopedJobSchedulerManager) -> None:
        self.genaietk_client = genaietk_client
        self.api = DefaultApi(genaietk_client)
        self.job_scheduler_manager = job_scheduler_manager

    def test_create_job_scheduler(self) -> None:
        """Test creating a job scheduler."""
        request = _build_create_request()

        response = self.api.create_job_scheduler(
            create_job_scheduler_request_content=request,
        )

        scheduler = response
        assert scheduler is not None

    def test_get_job_scheduler(self) -> None:
        """Test retrieving a job scheduler."""
        create_request = _build_create_request()

        create_response = self.api.create_job_scheduler(create_job_scheduler_request_content=create_request)

        scheduler_name = create_response.name
        response = self.api.get_job_scheduler(name=scheduler_name)

        scheduler = response
        assert scheduler is not None

    def test_update_job_scheduler(self) -> None:
        """Test updating a job scheduler."""
        create_request = _build_create_request()

        create_response = self.api.create_job_scheduler(create_job_scheduler_request_content=create_request)

        scheduler_name = create_response.name
        update_request = UpdateJobSchedulerRequestContent(cron="0 1 * * ? *")

        response = self.api.update_job_scheduler(
            name=scheduler_name,
            update_job_scheduler_request_content=update_request,
        )

        updated_scheduler = response
        assert updated_scheduler is not None

    def test_list_job_schedulers(self) -> None:
        """Test listing job schedulers."""
        response = self.api.list_job_schedulers()

        schedulers_list = response
        assert schedulers_list is not None

    def test_delete_job_scheduler(self) -> None:
        """Test deleting a job scheduler."""
        create_request = _build_create_request()

        create_response = self.api.create_job_scheduler(create_job_scheduler_request_content=create_request)

        scheduler_name = create_response.name
        self.api.delete_job_scheduler(name=scheduler_name)
