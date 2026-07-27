"""Load PyRIT seed datasets as ETK test cases.

Provides a generic loader that converts PyRIT's YAML seed datasets
into ETK-compatible test case dicts ready for use with evaluator.evaluate().
"""

from __future__ import annotations

import glob
import logging
import os
from typing import Any

import yaml

logger = logging.getLogger(__name__)


def _get_pyrit_datasets_path() -> str:
    """Resolve the path to PyRIT's local seed datasets."""
    import pyrit

    return os.path.join(os.path.dirname(pyrit.__file__), "datasets", "seed_datasets", "local")


def list_datasets() -> list[str]:
    """List available PyRIT seed dataset names.

    Returns:
        List of dataset names (e.g. ['adv_bench', 'garak_access_shell_commands', ...])
    """
    path = _get_pyrit_datasets_path()
    datasets = []
    for f in glob.glob(os.path.join(path, "**/*.prompt"), recursive=True):
        with open(f, encoding="utf-8") as fh:
            data = yaml.safe_load(fh)
        if not data:
            continue
        name = data.get("dataset_name", os.path.splitext(os.path.basename(f))[0])
        datasets.append(name)
    return sorted(datasets)


def load_pyrit_dataset(
    dataset_name: str,
    *,
    max_items: int | None = None,
    harm_categories: list[str] | None = None,
) -> list[dict[str, Any]]:
    """Load a PyRIT seed dataset as ETK test cases.

    Each seed becomes a test case with:
    - input.objective: the adversarial prompt/objective
    - metadata.harm_categories: harm categories from the seed
    - metadata.source: dataset name

    Args:
        dataset_name: Name of the PyRIT dataset (e.g. 'adv_bench')
        max_items: Limit number of test cases returned
        harm_categories: Filter seeds by harm category (any match)

    Returns:
        List of ETK test case dicts ready for evaluator.evaluate(testcases=...)

    Example::

        from evaluator_pyrit.datasets import load_pyrit_dataset

        testcases = load_pyrit_dataset("adv_bench", max_items=10)
        response = evaluator.evaluate(testcases=testcases)
    """
    path = _get_pyrit_datasets_path()
    matching_files = []

    for f in glob.glob(os.path.join(path, "**/*.prompt"), recursive=True):
        with open(f, encoding="utf-8") as fh:
            data = yaml.safe_load(fh)
        if not data:
            continue
        name = data.get("dataset_name", os.path.splitext(os.path.basename(f))[0])
        if name == dataset_name:
            matching_files.append((f, data))

    if not matching_files:
        available = list_datasets()
        raise ValueError(
            f"Dataset '{dataset_name}' not found. Available: {available}"
        )

    _, data = matching_files[0]
    seeds = data.get("seeds", [])

    # Filter by harm categories if specified
    if harm_categories:
        category_set = {c.lower() for c in harm_categories}
        seeds = [
            s for s in seeds
            if any(
                isinstance(c, str) and c.lower() in category_set
                for c in (s.get("harm_categories") or [])
            )
        ]

    # Limit
    if max_items is not None:
        seeds = seeds[:max_items]

    # Convert to ETK test case format
    testcases = []
    for seed in seeds:
        if not isinstance(seed, dict) or "value" not in seed:
            logger.warning("Skipping malformed seed: %s", seed)
            continue
        tc: dict[str, Any] = {
            "input": {"objective": seed["value"]},
            "metadata": {
                "source": f"pyrit/{dataset_name}",
            },
        }
        if seed.get("harm_categories"):
            tc["metadata"]["harm_categories"] = seed["harm_categories"]
        testcases.append(tc)

    logger.info("Loaded %d test cases from PyRIT dataset '%s'", len(testcases), dataset_name)
    return testcases
