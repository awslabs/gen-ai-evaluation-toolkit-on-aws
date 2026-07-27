import unittest
from datetime import datetime, timezone
from unittest.mock import MagicMock

from experiment_lambda.api.utils.api_models import (
    Experiment,
    LifecycleStage,
    MlflowLifecycleStage,
    ViewType,
)
from experiment_lambda.api.utils.mapper import (
    get_experiment_description,
    map_experiment,
    map_timestamp,
    map_view_type,
)
from experiment_lambda.protocols import MlflowTagIds


class TestMapper(unittest.TestCase):
    """Tests for mapper.py"""

    def test_map_experiment_full(self) -> None:
        """Test mapping a complete MLflow experiment to a domain experiment"""
        # Arrange
        mock_experiment = MagicMock()
        mock_experiment.experiment_id = "test-id"
        mock_experiment.name = "Test Experiment"
        mock_experiment.artifact_location = "s3://test-bucket/test-artifact"
        mock_experiment.tags = {
            MlflowTagIds.experiment_description: "Test Description",
            "another_tag": "Another Value",
        }
        mock_experiment.creation_time = 1625097600000  # 2021-07-01 00:00:00 UTC in milliseconds
        mock_experiment.last_update_time = 1625184000000  # 2021-07-02 00:00:00 UTC in milliseconds
        mock_experiment.lifecycle_stage = MlflowLifecycleStage.ACTIVE

        # Act
        result = map_experiment(mock_experiment)

        # Assert
        self.assertIsInstance(result, Experiment)
        self.assertEqual(result.id, "test-id")
        self.assertEqual(result.name, "Test Experiment")
        self.assertEqual(result.description, "Test Description")
        self.assertEqual(result.artifactLocation, "s3://test-bucket/test-artifact")
        self.assertEqual(result.lifecycleStage, LifecycleStage.ACTIVE)
        self.assertEqual(result.createdAt, datetime(2021, 7, 1, 0, 0, 0, tzinfo=timezone.utc))
        self.assertEqual(result.updatedAt, datetime(2021, 7, 2, 0, 0, 0, tzinfo=timezone.utc))
        # Verify that the description is not in the tags but other tags are preserved
        self.assertIsNotNone(result.tags)
        tags = result.tags  # Type narrowing for static type checker
        if tags:  # Additional runtime check to satisfy the type checker
            self.assertNotIn(MlflowTagIds.experiment_description, tags)
            self.assertEqual(tags.get("another_tag"), "Another Value")

    def test_map_experiment_minimal(self) -> None:
        """Test mapping an MLflow experiment with minimal data"""
        # Arrange
        mock_experiment = MagicMock()
        mock_experiment.experiment_id = "test-minimal-id"
        mock_experiment.name = "test-id"
        mock_experiment.tags = None
        mock_experiment.artifact_location = None
        mock_experiment.creation_time = None
        mock_experiment.last_update_time = None
        mock_experiment.lifecycle_stage = MlflowLifecycleStage.ACTIVE

        # Act
        result = map_experiment(mock_experiment)

        # Assert
        self.assertIsInstance(result, Experiment)
        self.assertEqual(result.id, "test-minimal-id")
        self.assertEqual(result.name, "test-id")
        self.assertIsNone(result.description)
        self.assertIsNone(result.createdAt)
        self.assertIsNone(result.updatedAt)

    def test_get_experiment_description(self) -> None:
        """Test extracting experiment description from tags"""
        # Arrange
        mock_experiment = MagicMock()
        mock_experiment.tags = {MlflowTagIds.experiment_description: "Test Description"}

        # Act
        result = get_experiment_description(mock_experiment)

        # Assert
        self.assertEqual(result, "Test Description")

    def test_get_experiment_description_no_tags(self) -> None:
        """Test handling when experiment has no tags"""
        # Arrange
        mock_experiment = MagicMock()
        mock_experiment.tags = None

        # Act
        result = get_experiment_description(mock_experiment)

        # Assert
        self.assertIsNone(result)

    def test_get_experiment_description_no_description(self) -> None:
        """Test handling when experiment has tags but no description"""
        # Arrange
        mock_experiment = MagicMock()
        mock_experiment.tags = {"other_tag": "value"}

        # Act
        result = get_experiment_description(mock_experiment)

        # Assert
        self.assertIsNone(result)

    def test_map_timestamp_valid(self) -> None:
        """Test mapping a valid MLflow timestamp to datetime"""
        # Arrange
        timestamp_ms = 1625097600000  # 2021-07-01 00:00:00 UTC in milliseconds

        # Act
        result = map_timestamp(timestamp_ms)

        # Assert
        self.assertEqual(result, datetime(2021, 7, 1, 0, 0, 0, tzinfo=timezone.utc))

    def test_map_timestamp_none(self) -> None:
        """Test mapping None timestamp returns None"""
        # Act
        result = map_timestamp(None)

        # Assert
        self.assertIsNone(result)

    def test_map_view_type_active_only(self) -> None:
        """Test mapping ViewType.ACTIVE_ONLY to MLflow view type"""
        # Act
        result = map_view_type(ViewType.ACTIVE_ONLY)

        # Assert
        self.assertEqual(result, 1)  # 1 = ACTIVE_ONLY in MLflow

    def test_map_view_type_deleted_only(self) -> None:
        """Test mapping ViewType.DELETED_ONLY to MLflow view type"""
        # Act
        result = map_view_type(ViewType.DELETED_ONLY)

        # Assert
        self.assertEqual(result, 2)  # 2 = DELETED_ONLY in MLflow

    def test_map_view_type_all(self) -> None:
        """Test mapping ViewType.ALL to MLflow view type"""
        # Act
        result = map_view_type(ViewType.ALL)

        # Assert
        self.assertEqual(result, 3)  # 3 = ALL in MLflow

    def test_map_view_type_none(self) -> None:
        """Test mapping None view type defaults to ACTIVE_ONLY"""
        # Act
        result = map_view_type(None)

        # Assert
        self.assertEqual(result, 1)  # Default to ACTIVE_ONLY

    def test_map_experiment_lifecycle_stage(self) -> None:
        """Test mapping MLflow lifecycle stages to API lifecycle stages"""
        test_cases = [
            (MlflowLifecycleStage.ACTIVE, LifecycleStage.ACTIVE),
            ("active", LifecycleStage.ACTIVE),  # Test string value
            ("deleted", LifecycleStage.DELETED),
            ("unknown", LifecycleStage.DELETED),  # Any non-active value maps to DELETED
        ]

        for mlflow_stage, expected_api_stage in test_cases:
            with self.subTest(mlflow_stage=mlflow_stage, expected=expected_api_stage):
                # Arrange
                mock_experiment = MagicMock()
                mock_experiment.experiment_id = "test-id"
                mock_experiment.name = "Test"
                mock_experiment.tags = {}
                mock_experiment.artifact_location = None
                mock_experiment.creation_time = None
                mock_experiment.last_update_time = None
                mock_experiment.lifecycle_stage = mlflow_stage

                # Act
                result = map_experiment(mock_experiment)

                # Assert
                self.assertEqual(result.lifecycleStage, expected_api_stage)


if __name__ == "__main__":
    unittest.main()
