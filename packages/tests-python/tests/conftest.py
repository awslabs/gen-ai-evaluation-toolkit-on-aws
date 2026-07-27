from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Generator

import boto3
import pytest
from awssolutions_gen_ai_evaluation_toolkit_python_client import ApiClient
from awssolutions_gen_ai_evaluation_toolkit_python_client.configuration import Configuration
from requests_aws4auth import AWS4Auth

from python_integration_tests.managers.test_annotation_schema_manager import (
    ScopedAnnotationSchemaManager,
)
from python_integration_tests.managers.test_configuration_manager import (
    ScopedConfigurationManager,
)
from python_integration_tests.managers.test_dataset_manager import (
    ScopedDatasetManager,
)
from python_integration_tests.managers.test_evaluation_manager import (
    ScopedEvaluationManager,
)
from python_integration_tests.managers.test_experiment_manager import (
    ScopedExperimentManager,
)
from python_integration_tests.managers.test_generation_manager import (
    ScopedGenerationManager,
)
from python_integration_tests.managers.test_job_scheduler_manager import (
    ScopedJobSchedulerManager,
)
from python_integration_tests.managers.test_test_case_manager import (
    ScopedTestCaseManager,
)
from python_integration_tests.test_config import Config

if TYPE_CHECKING:
    from mypy_boto3_cloudformation.client import CloudFormationClient
    from mypy_boto3_s3.client import S3Client

logger = logging.getLogger(__name__)


@pytest.fixture(name="experiment_manager")
def fixture_experiment_manager(
    genaietk_client: ApiClient,
) -> Generator[ScopedExperimentManager, None, None]:
    """Create and yield a ScopedExperimentManager fixture for managing experiments during tests."""
    experiment_manager = ScopedExperimentManager(genaietk_client=genaietk_client)
    yield experiment_manager

    errors = experiment_manager.try_cleanup()
    if errors:
        logger.warning(f"Experiment cleanup errors occurred: {'; '.join(errors)}")


@pytest.fixture(name="evaluation_manager")
def fixture_evaluation_manager(
    genaietk_client: ApiClient,
) -> Generator[ScopedEvaluationManager, None, None]:
    """Create and yield a ScopedEvaluationManager fixture for managing evaluations during tests."""
    evaluation_manager = ScopedEvaluationManager(genaietk_client=genaietk_client)
    yield evaluation_manager

    errors = evaluation_manager.try_cleanup()
    if errors:
        logger.warning(f"Evaluation cleanup errors occurred: {'; '.join(errors)}")


@pytest.fixture(name="configuration_manager")
def fixture_configuration_manager(
    genaietk_client: ApiClient,
) -> Generator[ScopedConfigurationManager, None, None]:
    """Create and yield a ScopedConfigurationManager fixture for managing configurations during tests."""
    configuration_manager = ScopedConfigurationManager(genaietk_client=genaietk_client)
    yield configuration_manager

    errors = configuration_manager.try_cleanup()
    if errors:
        logger.warning(f"Configuration cleanup errors occurred: {'; '.join(errors)}")


@pytest.fixture(name="job_scheduler_manager")
def fixture_job_scheduler_manager(
    genaietk_client: ApiClient,
) -> Generator[ScopedJobSchedulerManager, None, None]:
    """Create and yield a ScopedJobSchedulerManager fixture for managing job schedulers during tests."""
    job_scheduler_manager = ScopedJobSchedulerManager(genaietk_client=genaietk_client)
    yield job_scheduler_manager

    errors = job_scheduler_manager.try_cleanup()
    if errors:
        logger.warning(f"Job scheduler cleanup errors occurred: {'; '.join(errors)}")


@pytest.fixture(name="generation_manager")
def fixture_generation_manager(
    genaietk_client: ApiClient,
) -> Generator[ScopedGenerationManager, None, None]:
    """Create and yield a ScopedGenerationManager fixture for managing generations during tests."""
    generation_manager = ScopedGenerationManager(genaietk_client=genaietk_client)
    yield generation_manager

    errors = generation_manager.try_cleanup()
    if errors:
        logger.warning(f"Generation cleanup errors occurred: {'; '.join(errors)}")


@pytest.fixture(name="test_case_manager")
def fixture_test_case_manager(
    genaietk_client: ApiClient,
) -> Generator[ScopedTestCaseManager, None, None]:
    """Create and yield a ScopedTestCaseManager fixture for managing test cases during tests."""
    test_case_manager = ScopedTestCaseManager(genaietk_client=genaietk_client)
    yield test_case_manager

    errors = test_case_manager.try_cleanup()
    if errors:
        logger.warning(f"Test case cleanup errors occurred: {'; '.join(errors)}")


@pytest.fixture(name="annotation_schema_manager")
def fixture_annotation_schema_manager(
    genaietk_client: ApiClient,
) -> Generator[ScopedAnnotationSchemaManager, None, None]:
    """Create and yield a ScopedAnnotationSchemaManager fixture for managing annotation schemas during tests."""
    annotation_schema_manager = ScopedAnnotationSchemaManager(genaietk_client=genaietk_client)
    yield annotation_schema_manager

    errors = annotation_schema_manager.try_cleanup()
    if errors:
        logger.warning(f"Annotation schema cleanup errors occurred: {'; '.join(errors)}")


@pytest.fixture(name="dataset_manager")
def fixture_dataset_manager(
    genaietk_client: ApiClient,
) -> Generator[ScopedDatasetManager, None, None]:
    """Create and yield a ScopedDatasetManager fixture for managing datasets during tests."""
    dataset_manager = ScopedDatasetManager(genaietk_client=genaietk_client)
    yield dataset_manager

    errors = dataset_manager.try_cleanup()
    if errors:
        logger.warning(f"Dataset cleanup errors occurred: {'; '.join(errors)}")


@pytest.fixture(name="cloudformation_client", scope="session")
def fixture_cloudformation_client() -> CloudFormationClient:
    config = Config()
    return boto3.client("cloudformation", region_name=config.REGION)


@pytest.fixture(name="s3_client", scope="session")
def fixture_s3_client() -> S3Client:
    config = Config()
    return boto3.client("s3", region_name=config.REGION)


@pytest.fixture(name="genaietk_client", scope="session")
def fixture_genaietk_client() -> ApiClient:
    config = Config()
    configuration = Configuration(host=config.API_URL)
    # Disable SSL verification for testing
    configuration.verify_ssl = False
    api_client = ApiClient(configuration)

    # Patch the REST client to add AWS authentication using requests-aws4auth
    original_request = api_client.rest_client.request

    def request_with_aws_auth(
        method,
        url,
        query_params=None,
        headers=None,
        body=None,
        post_params=None,
        _preload_content=True,
        _request_timeout=None,
    ):
        # Get AWS credentials and sign the request
        session = boto3.Session()
        credentials = session.get_credentials()

        if credentials and headers:
            auth = AWS4Auth(
                credentials.access_key,
                credentials.secret_key,
                config.REGION,
                "execute-api",
                session_token=credentials.token,
            )

            # Sign request
            import requests

            req = requests.Request(method, url, headers=headers, json=body)
            prepared = req.prepare()
            auth(prepared)  # Modifies headers in-place

            # Copy signed headers
            headers.update(prepared.headers)

        return original_request(method, url, headers=headers, body=body)

    api_client.rest_client.request = request_with_aws_auth
    return api_client


@pytest.fixture(name="genaietk_unauthorized_client", scope="session")
def fixture_genaietk_unauthorized_client() -> ApiClient:
    config = Config()
    configuration = Configuration(host=config.API_URL)
    # Disable SSL verification for testing
    configuration.verify_ssl = False
    api_client = ApiClient(configuration)
    return api_client


def pytest_addoption(parser: pytest.Parser) -> None:
    parser.addoption("--category", action="store", help="category: uncategorized, cat1, cat2...")


def pytest_collection_modifyitems(config: pytest.Config, items: list[pytest.Item]) -> None:
    try:
        category = config.getoption("--category")
    except ValueError:
        # --category option not provided, run all tests
        return

    updated_items = []

    if not category:
        return

    if category == "uncategorized":
        for item in items:
            if not any(item.iter_markers(name="category")):
                updated_items.append(item)
    else:
        for item in items:
            if any(marker.args[0] == category for marker in item.iter_markers(name="category")):
                updated_items.append(item)

    items.clear()
    items.extend(updated_items)
