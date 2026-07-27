import time

import pytest
from awssolutions_gen_ai_evaluation_toolkit_python_client import ApiClient, DefaultApi
from awssolutions_gen_ai_evaluation_toolkit_python_client.models import CreateConfigurationRequestContent

from python_integration_tests.managers.test_configuration_manager import (
    ScopedConfigurationManager,
)


@pytest.mark.category("configurations")
class TestConfigurations:
    """Test case for Configuration API endpoints."""

    @pytest.fixture(autouse=True)
    def setup(self, genaietk_client: ApiClient, configuration_manager: ScopedConfigurationManager) -> None:
        self.genaietk_client = genaietk_client
        self.api = DefaultApi(genaietk_client)
        self.configuration_manager = configuration_manager
        self._created_configs = []

    def _build_config_detail(self, config_name: str):
        """Build a minimal ConfigurationDetail for V2 (WorkflowConfiguration carries opaque JSON)."""
        from awssolutions_gen_ai_evaluation_toolkit_python_client.models.configuration_detail import ConfigurationDetail
        from awssolutions_gen_ai_evaluation_toolkit_python_client.models.workflow_configuration import (
            WorkflowConfiguration,
        )

        # WorkflowConfiguration.evaluationConfiguration is an opaque JSON Document
        # (was a typed EvaluationConfig pre-V2; now opaque to the API).
        opaque_eval_config = {
            "testData": {"bucketName": "dummy-bucket", "prefix": "dummy-prefix"},
            "plugins": [{"plugin": "dummy-plugin", "configuration": {}}],
        }
        workflow_config = WorkflowConfiguration(evaluationConfiguration=opaque_eval_config)
        return ConfigurationDetail(name=config_name, config=workflow_config)

    def test_create_configuration(self) -> None:
        """Test creating a configuration."""
        config_name = f"test-config-{int(time.time())}"

        config_detail = self._build_config_detail(config_name)
        request = CreateConfigurationRequestContent(configuration=config_detail)

        response = self.api.create_configuration(
            create_configuration_request_content=request,
        )

        config = response
        assert config is not None
        self._created_configs.append(config_name)

    def test_get_configuration(self) -> None:
        """Test retrieving a configuration."""
        config_name = f"test-config-get-{int(time.time())}"

        config_detail = self._build_config_detail(config_name)
        request = CreateConfigurationRequestContent(configuration=config_detail)

        self.api.create_configuration(
            create_configuration_request_content=request,
        )
        self._created_configs.append(config_name)

        response = self.api.get_configuration(name=config_name)

        config = response
        assert config is not None

    def test_update_configuration(self) -> None:
        """Test updating a configuration."""
        config_name = f"test-config-update-{int(time.time())}"

        config_detail = self._build_config_detail(config_name)
        create_request = CreateConfigurationRequestContent(configuration=config_detail)

        self.api.create_configuration(
            create_configuration_request_content=create_request,
        )
        self._created_configs.append(config_name)

        from awssolutions_gen_ai_evaluation_toolkit_python_client.models.update_configuration_request_content import (
            UpdateConfigurationRequestContent,
        )

        updated_config_detail = self._build_config_detail(config_name)
        update_request = UpdateConfigurationRequestContent(configuration=updated_config_detail)

        response = self.api.update_configuration(
            update_configuration_request_content=update_request,
        )

        updated_config = response
        assert updated_config is not None

    def test_list_configurations(self) -> None:
        """Test listing configurations."""
        from awssolutions_gen_ai_evaluation_toolkit_python_client.models.list_configurations_request_content import (
            ListConfigurationsRequestContent,
        )

        request = ListConfigurationsRequestContent()

        response = self.api.list_configurations(list_configurations_request_content=request)

        assert response is not None
        assert hasattr(response, "configurations")
