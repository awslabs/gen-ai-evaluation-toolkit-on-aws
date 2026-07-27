#!/usr/bin/env python3
"""Patch OpenAPI spec to add nullable additionalProperties for @sparse maps.

Smithy's OpenAPI conversion ignores the @sparse trait on map shapes
(https://github.com/smithy-lang/smithy/issues/1822). This script reads the
Smithy model JSON to discover which map shapes are sparse, then patches the
corresponding OpenAPI schema definitions to include ``"nullable": true`` on
their ``additionalProperties``.

Usage:
    python patch_openapi_sparse.py <model.json> <openapi.json>

Fails with a non-zero exit code if:
- Any sparse map shape from the Smithy model is missing in the OpenAPI spec
- The OpenAPI schema doesn't have additionalProperties to patch
"""

from __future__ import annotations

import json
import sys


def find_sparse_maps(model: dict) -> dict[str, dict]:
    """Return {simple_name: shape_def} for all sparse map shapes in the model."""
    sparse_maps: dict[str, dict] = {}
    for fq_name, shape in model.get("shapes", {}).items():
        if shape.get("type") != "map":
            continue
        traits = shape.get("traits", {})
        if "smithy.api#sparse" not in traits:
            continue
        simple_name = fq_name.rsplit("#", 1)[-1]
        sparse_maps[simple_name] = shape
    return sparse_maps


def patch_openapi(openapi: dict, sparse_maps: dict[str, dict]) -> list[str]:
    """Make additionalProperties nullable for sparse map schemas.

    In OpenAPI 3.0, ``$ref`` replaces all sibling keywords, so we can't just
    add ``"nullable": true`` next to a ``$ref``.  Instead we wrap the ``$ref``
    in ``allOf`` and set ``nullable`` at the top level::

        Before: {"$ref": "#/components/schemas/Foo"}
        After:  {"nullable": true, "allOf": [{"$ref": "#/components/schemas/Foo"}]}

    For free-form maps (``additionalProperties: {}``) we simply add
    ``"nullable": true`` directly.

    Returns list of patched schema names.
    """
    schemas = openapi.get("components", {}).get("schemas", {})
    patched: list[str] = []
    missing: list[str] = []

    for name in sparse_maps:
        schema = schemas.get(name)
        if schema is None:
            missing.append(name)
            continue

        ap = schema.get("additionalProperties")
        if ap is None:
            missing.append(f"{name} (no additionalProperties)")
            continue

        if not isinstance(ap, dict):
            missing.append(f"{name} (additionalProperties is not an object: {ap!r})")
            continue

        if "$ref" in ap:
            # Wrap $ref in allOf so nullable isn't ignored
            schema["additionalProperties"] = {
                "nullable": True,
                "allOf": [{"$ref": ap["$ref"]}],
            }
        else:
            ap["nullable"] = True

        patched.append(name)

    if missing:
        print(f"ERROR: Could not patch sparse maps: {missing}", file=sys.stderr)
        sys.exit(1)

    return patched


def main() -> None:
    if len(sys.argv) != 3:
        print(f"Usage: {sys.argv[0]} <model.json> <openapi.json>", file=sys.stderr)
        sys.exit(1)

    model_path, openapi_path = sys.argv[1], sys.argv[2]

    with open(model_path) as f:
        model = json.load(f)

    with open(openapi_path) as f:
        openapi = json.load(f)

    sparse_maps = find_sparse_maps(model)
    if not sparse_maps:
        print("WARNING: No sparse map shapes found in Smithy model", file=sys.stderr)
        return

    patched = patch_openapi(openapi, sparse_maps)

    with open(openapi_path, "w") as f:
        json.dump(openapi, f, indent=4)
        f.write("\n")

    print(f"Patched {len(patched)} sparse maps: {patched}")


if __name__ == "__main__":
    main()
