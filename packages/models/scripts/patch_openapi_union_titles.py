#!/usr/bin/env python3
"""Patch OpenAPI spec to resolve oneOf inline title collisions.

The Smithy openapi plugin generates inline oneOf variants with `title` derived
from the union member name.  When a union member name matches a top-level schema
name (e.g. union member "dataset" collides with entity schema "Dataset"),
openapi-generator produces a class that shadows the entity.

This script renames colliding inline oneOf titles so the generated wrapper class
gets a distinct name while preserving the wire-format property key.

Usage:
    python patch_openapi_union_titles.py <openapi.json>

Mappings are defined in TITLE_RENAMES below.
"""

from __future__ import annotations

import json
import sys

# Map: (schema_name, old_title) -> new_title
TITLE_RENAMES: dict[tuple[str, str], str] = {
    ("TestDataSource", "dataset"): "datasetSource",
}


def patch(openapi: dict) -> list[str]:
    """Rename colliding oneOf titles. Returns list of changes made."""
    schemas = openapi.get("components", {}).get("schemas", {})
    changes: list[str] = []

    for (schema_name, old_title), new_title in TITLE_RENAMES.items():
        schema = schemas.get(schema_name)
        if schema is None:
            print(f"WARNING: schema {schema_name!r} not found", file=sys.stderr)
            continue
        one_of = schema.get("oneOf", [])
        for variant in one_of:
            if variant.get("title") == old_title:
                variant["title"] = new_title
                changes.append(f"{schema_name}.oneOf[title={old_title!r}] -> {new_title!r}")
                break
        else:
            print(f"WARNING: title {old_title!r} not found in {schema_name}.oneOf", file=sys.stderr)

    return changes


def main() -> None:
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <openapi.json>", file=sys.stderr)
        sys.exit(1)

    openapi_path = sys.argv[1]

    with open(openapi_path) as f:
        openapi = json.load(f)

    changes = patch(openapi)

    if changes:
        with open(openapi_path, "w") as f:
            json.dump(openapi, f, indent=4)
            f.write("\n")
        print(f"Patched {len(changes)} union titles: {changes}")
    else:
        print("No union title collisions found to patch")


if __name__ == "__main__":
    main()
