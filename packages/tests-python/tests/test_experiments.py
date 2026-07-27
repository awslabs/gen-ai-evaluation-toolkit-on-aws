import pytest
import time
from awssolutions_gen_ai_evaluation_toolkit_python_client import ApiClient, DefaultApi

from awssolutions_gen_ai_evaluation_toolkit_python_client.models import (
    ListExperimentsRequestContent,
    ListExperimentOutputsRequestContent,
    UpdateExperimentRequestContent,
)

from python_integration_tests.managers.test_experiment_manager import (
    ScopedExperimentManager,
)


class TestExperiments:
    """Test case for Experiment API endpoints."""

    @pytest.fixture(autouse=True)
    def setup(
        self,
        experiment_manager: ScopedExperimentManager,
        genaietk_client: ApiClient,
    ) -> None:
        self.experiment_manager = experiment_manager
        self.genaietk_client = genaietk_client
        self.api = DefaultApi(genaietk_client)

    def test_create_experiment(self) -> None:
        """Test creating an experiment."""
        experiment_name = f"test-experiment-create-{int(time.time())}"
        
        experiment = self.experiment_manager.create_experiment(
            name=experiment_name,
            description="Test experiment for creation"
        )
        
        assert experiment.name == experiment_name
        assert experiment.description == "Test experiment for creation"

    def test_get_experiment(self) -> None:
        """Test retrieving an experiment."""
        experiment_name = f"test-experiment-get-{int(time.time())}"
        
        created_experiment = self.experiment_manager.create_experiment(
            name=experiment_name,
            description="Test experiment for retrieval"
        )
        
        response = self.api.get_experiment(name=created_experiment.name)
        
        retrieved_experiment = response
        assert retrieved_experiment is not None
        assert hasattr(retrieved_experiment, 'name')
        assert retrieved_experiment.name == experiment_name

    def test_list_experiments(self) -> None:
        """Test listing experiments."""
        # Create a test experiment
        experiment_name = f"test-experiment-list-{int(time.time())}"
        created_experiment = self.experiment_manager.create_experiment(
            name=experiment_name,
            description="Test experiment for listing"
        )
        
        # List experiments requires a body parameter
        list_request = ListExperimentsRequestContent()
        
        response = self.api.list_experiments(list_experiments_request_content=list_request)
        
        experiments_list = response
        assert experiments_list is not None
        assert hasattr(experiments_list, 'experiments')
        
        # Check that our experiment is in the list
        experiment_names = [exp.name for exp in experiments_list.experiments if hasattr(exp, 'name')]
        assert created_experiment.name in experiment_names

    def test_get_experiment_src(self) -> None:
        """Test retrieving an experiment (from src)."""
        experiment_name = f"test-experiment-get-{int(time.time())}"
        
        created_experiment = self.experiment_manager.create_experiment(
            name=experiment_name,
            description="Test experiment for retrieval"
        )
        
        response = self.api.get_experiment(name=created_experiment.name)
        
        retrieved_experiment = response
        assert retrieved_experiment is not None
        assert hasattr(retrieved_experiment, 'name')
        assert retrieved_experiment.name == experiment_name

    def test_list_experiment_outputs(self) -> None:
        """Test listing experiment outputs."""
        experiment_name = f"test-experiment-outputs-{int(time.time())}"
        created_experiment = self.experiment_manager.create_experiment(
            name=experiment_name,
            description="Test experiment for output listing"
        )
        
        request = ListExperimentOutputsRequestContent(
            start_version=1.0,
            end_version=1.0
        )
        
        response = self.api.list_experiment_outputs(created_experiment.name, request)
        
        outputs_list = response
        assert outputs_list is not None

    def test_list_experiment_outputs_with_filters(self) -> None:
        """Test listing experiment outputs with filters."""
        experiment_name = f"test-experiment-outputs-filter-{int(time.time())}"
        created_experiment = self.experiment_manager.create_experiment(
            name=experiment_name,
            description="Test experiment for filtered output listing"
        )
        
        request = ListExperimentOutputsRequestContent(
            start_version=1.0,
            end_version=2.0
        )
        
        response = self.api.list_experiment_outputs(created_experiment.name, request)
        
        outputs_list = response
        assert outputs_list is not None
    def test_update_experiment(self) -> None:
        """Test updating an experiment."""
        experiment_name = f"test-experiment-update-{int(time.time())}"
        created_experiment = self.experiment_manager.create_experiment(
            name=experiment_name,
            description="Original description"
        )
        
        update_request = UpdateExperimentRequestContent(
            description="Updated description"
        )
        
        response = self.api.update_experiment(created_experiment.name, update_request)
        
        updated_experiment = response
        assert updated_experiment is not None
