import pytest
from awssolutions_gen_ai_evaluation_toolkit_python_client import ApiClient, DefaultApi
from awssolutions_gen_ai_evaluation_toolkit_python_client.models.start_generation_request_content import StartGenerationRequestContent

from python_integration_tests.managers.test_generation_manager import (
    ScopedGenerationManager,
)


@pytest.mark.category("generations")
class TestGenerations:
    """Test case for Generation API endpoints."""

    @pytest.fixture(autouse=True)
    def setup(
        self,
        genaietk_client: ApiClient,
        generation_manager: ScopedGenerationManager,
    ) -> None:
        self.genaietk_client = genaietk_client
        self.api = DefaultApi(genaietk_client)
        self.generation_manager = generation_manager
        self._started_generations = []

    def teardown_method(self) -> None:
        """Clean up started generations."""
        for generation_id in self._started_generations:
            try:
                self.api.stop_generation(id=generation_id)
            except Exception:
                pass

    def test_start_generation(self) -> None:
        """Test starting a generation."""
        from awssolutions_gen_ai_evaluation_toolkit_python_client.models.generation_step import GenerationStep

        steps = [GenerationStep(plugin="dummy-plugin", configuration={})]

        request = StartGenerationRequestContent(steps=steps)

        response = self.api.start_generation(request)

        generation = response
        assert generation is not None
        if hasattr(generation, "generation_id"):
            self._started_generations.append(generation.id)

    def test_get_generation(self) -> None:
        """Test retrieving a generation."""
        from awssolutions_gen_ai_evaluation_toolkit_python_client.models.generation_step import GenerationStep

        steps = [GenerationStep(plugin="dummy-plugin", configuration={})]

        start_request = StartGenerationRequestContent(steps=steps)

        start_response = self.api.start_generation(start_request)
        started_generation = start_response
        assert started_generation is not None

        if hasattr(started_generation, "generation_id"):
            self._started_generations.append(started_generation.id)

            response = self.api.get_generation(id=started_generation.id)

            retrieved_generation = response
            assert retrieved_generation is not None

    def test_list_generations(self) -> None:
        """Test listing generations."""
        response = self.api.list_generations()

        generations_list = response
        assert generations_list is not None

    def test_stop_generation(self) -> None:
        """Test stopping a generation."""
        from awssolutions_gen_ai_evaluation_toolkit_python_client.models.generation_step import GenerationStep

        steps = [GenerationStep(plugin="dummy-plugin", configuration={})]

        start_request = StartGenerationRequestContent(steps=steps)

        start_response = self.api.start_generation(start_request)
        started_generation = start_response
        assert started_generation is not None

        if hasattr(started_generation, "generation_id"):
            self.api.stop_generation(id=started_generation.id)
