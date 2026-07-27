from datetime import datetime, timezone
from typing import Optional

from mlflow.entities import ViewType as MlflowViewType

from experiment_lambda.api.utils.api_models import (
    Experiment,
    LifecycleStage,
    MlflowLifecycleStage,
    ViewType,
)
from experiment_lambda.protocols import MlflowExperiment, MlflowTagIds


def map_experiment(src: MlflowExperiment) -> Experiment:
    experiment_name: str = src.name or "Unknown"
    description = get_experiment_description(src)
    creation_time = map_timestamp(src.creation_time)
    last_update_time = map_timestamp(src.last_update_time)

    # Create a copy of tags and remove description from tags if it exists
    tags = dict(src.tags or {})
    if MlflowTagIds.experiment_description in tags:
        del tags[MlflowTagIds.experiment_description]

    return Experiment(
        id=src.experiment_id,
        name=experiment_name,
        description=description,
        artifactLocation=src.artifact_location,
        lifecycleStage=(
            LifecycleStage.ACTIVE if src.lifecycle_stage == MlflowLifecycleStage.ACTIVE else LifecycleStage.DELETED
        ),
        tags=tags,
        createdAt=creation_time,
        updatedAt=last_update_time,
    )


def get_experiment_description(experiment: MlflowExperiment) -> Optional[str]:
    """Extract description from MLflow experiment tags."""
    experiment_tags = experiment.tags or {}
    note_content = experiment_tags.get(MlflowTagIds.experiment_description)
    return str(note_content) if note_content else None


def map_timestamp(src: int | None) -> datetime | None:
    """Extract last update time time from MLflow experiment"""
    if src:
        # Get timestamp (MLflow stores timestamps in milliseconds, convert to seconds)
        return datetime.fromtimestamp(float(src) / 1000, timezone.utc)
    return None


def map_view_type(view_type: Optional[ViewType]) -> int:
    """
    Maps our ViewType enum to MLflow ViewType enum values.

    Args:
        view_type: Our API ViewType enum value

    Returns:
        MLflow ViewType enum value
    """
    # Using "type: ignore" comments to satisfy both mypy and Pylance:
    # - mypy needs the values to be explicitly typed as int
    # - Pylance already knows they're ints and complains about unnecessary casts
    if view_type == ViewType.DELETED_ONLY:
        return MlflowViewType.DELETED_ONLY  # type: ignore
    elif view_type == ViewType.ALL:
        return MlflowViewType.ALL  # type: ignore

    # Default to active only
    return MlflowViewType.ACTIVE_ONLY  # type: ignore
