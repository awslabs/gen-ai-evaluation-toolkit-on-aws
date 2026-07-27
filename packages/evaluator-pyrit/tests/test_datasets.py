"""Unit tests for the datasets module."""

from __future__ import annotations

from unittest.mock import patch

import pytest
import yaml

from evaluator_pyrit.datasets import list_datasets, load_pyrit_dataset


@pytest.fixture
def datasets_dir(tmp_path):
    """Create a temporary datasets directory with sample .prompt files."""
    dataset_dir = tmp_path / "datasets" / "seed_datasets" / "local"
    dataset_dir.mkdir(parents=True)

    # Valid dataset
    valid = {
        "dataset_name": "test_dataset",
        "seeds": [
            {"value": "objective one", "harm_categories": ["violence"]},
            {"value": "objective two", "harm_categories": ["fraud"]},
            {"value": "objective three", "harm_categories": ["violence", "fraud"]},
        ],
    }
    with open(dataset_dir / "test_dataset.prompt", "w", encoding="utf-8") as f:
        yaml.dump(valid, f)

    # Dataset with malformed seeds
    malformed = {
        "dataset_name": "malformed_dataset",
        "seeds": [
            {"value": "good seed"},
            "not a dict",
            {"no_value_key": "missing value"},
            None,
        ],
    }
    with open(dataset_dir / "malformed_dataset.prompt", "w", encoding="utf-8") as f:
        yaml.dump(malformed, f)

    # Empty YAML file
    with open(dataset_dir / "empty.prompt", "w", encoding="utf-8") as f:
        f.write("")

    return tmp_path


@pytest.fixture
def mock_pyrit_path(datasets_dir):
    """Patch _get_pyrit_datasets_path to use our temp dir."""
    path = str(datasets_dir / "datasets" / "seed_datasets" / "local")
    with patch("evaluator_pyrit.datasets._get_pyrit_datasets_path", return_value=path):
        yield path


class TestListDatasets:
    def test_lists_available_datasets(self, mock_pyrit_path):
        result = list_datasets()
        assert "test_dataset" in result
        assert "malformed_dataset" in result

    def test_skips_empty_yaml_files(self, mock_pyrit_path):
        result = list_datasets()
        # "empty" should not appear since yaml.safe_load returns None
        assert "empty" not in result


class TestLoadPyritDataset:
    def test_loads_all_seeds(self, mock_pyrit_path):
        result = load_pyrit_dataset("test_dataset")
        assert len(result) == 3
        assert result[0]["input"]["objective"] == "objective one"
        assert result[0]["metadata"]["source"] == "pyrit/test_dataset"

    def test_max_items_limits_results(self, mock_pyrit_path):
        result = load_pyrit_dataset("test_dataset", max_items=2)
        assert len(result) == 2

    def test_harm_categories_filter(self, mock_pyrit_path):
        result = load_pyrit_dataset("test_dataset", harm_categories=["violence"])
        assert len(result) == 2
        assert result[0]["input"]["objective"] == "objective one"
        assert result[1]["input"]["objective"] == "objective three"

    def test_harm_categories_case_insensitive(self, mock_pyrit_path):
        result = load_pyrit_dataset("test_dataset", harm_categories=["VIOLENCE"])
        assert len(result) == 2

    def test_raises_on_missing_dataset(self, mock_pyrit_path):
        with pytest.raises(ValueError, match="not found"):
            load_pyrit_dataset("nonexistent_dataset")

    def test_skips_malformed_seeds(self, mock_pyrit_path):
        result = load_pyrit_dataset("malformed_dataset")
        # Only the one with a valid "value" key should survive
        assert len(result) == 1
        assert result[0]["input"]["objective"] == "good seed"

    def test_includes_harm_categories_in_metadata(self, mock_pyrit_path):
        result = load_pyrit_dataset("test_dataset")
        assert result[0]["metadata"]["harm_categories"] == ["violence"]
