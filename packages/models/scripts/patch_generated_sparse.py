#!/usr/bin/env python3
"""Patch generated Python client to preserve None values in sparse map to_dict().

The openapi-generator Python template generates ``to_dict()`` methods that skip
None values in dict fields using ``if self.field[key]:``. For sparse maps
(where None is a valid value meaning "use defaults"), this silently drops
entries. This script fixes the pattern to use ``is not None`` instead.

Usage:
    python patch_generated_sparse.py <openapi.json> <generated-models-dir>

Reads the OpenAPI spec to find schemas with nullable additionalProperties
that reference a model type (sparse maps), then patches any generated model
that references those schemas.

Fails with a non-zero exit code if expected files or patterns aren't found.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path


def find_sparse_map_schemas(openapi: dict) -> dict[str, str]:
    """Return {schema_name: value_type} for sparse maps with model-typed values.

    Only includes maps whose additionalProperties reference a model via $ref
    or allOf (not free-form Any maps), since those are the ones that get a
    to_dict() loop in the generated code.
    """
    schemas = openapi.get("components", {}).get("schemas", {})
    sparse: dict[str, str] = {}
    for name, schema in schemas.items():
        if schema.get("type") != "object":
            continue
        ap = schema.get("additionalProperties")
        if not isinstance(ap, dict):
            continue
        if ap.get("nullable") is not True:
            continue
        ref = ap.get("$ref", "")
        if ref:
            value_type = ref.rsplit("/", 1)[-1]
            sparse[name] = value_type
        elif "allOf" in ap:
            for item in ap["allOf"]:
                if "$ref" in item:
                    value_type = item["$ref"].rsplit("/", 1)[-1]
                    sparse[name] = value_type
                    break
    return sparse


def find_referencing_models(openapi: dict, sparse_names: dict[str, str] | list[str]) -> dict[str, list[str]]:
    """Find schemas that reference sparse map schemas as properties.

    Returns {schema_name: [property_name, ...]} for schemas that have
    properties referencing any of the sparse map schemas.
    """
    schemas = openapi.get("components", {}).get("schemas", {})
    refs_to_find = {f"#/components/schemas/{n}" for n in sparse_names}
    result: dict[str, list[str]] = {}

    for schema_name, schema in schemas.items():
        if schema_name in sparse_names:
            continue
        props = schema.get("properties", {})
        for prop_name, prop_def in props.items():
            ref = prop_def.get("$ref")
            if ref in refs_to_find:
                result.setdefault(schema_name, []).append(prop_name)

    return result


def schema_to_filename(schema_name: str) -> str:
    """Convert CamelCase schema name to snake_case filename."""
    s1 = re.sub(r"([A-Z]+)([A-Z][a-z])", r"\1_\2", schema_name)
    return re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", s1).lower() + ".py"


def patch_type_annotations(file_path: Path, prop_names: list[str], sparse_value_types: dict[str, str]) -> bool:
    """Fix Pydantic field type annotations to allow None values in sparse maps.

    Changes: Dict[str, ModelType] → Dict[str, Optional[ModelType]]
    """
    content = file_path.read_text()
    patched = False

    for prop in prop_names:
        for _sparse_name, value_type in sparse_value_types.items():
            pattern = rf"(    {prop}: Optional\[Dict\[str, ){value_type}(\]\])"
            replacement = rf"\1Optional[{value_type}]\2"
            new_content, count = re.subn(pattern, replacement, content)
            if count > 0:
                content = new_content
                patched = True

    if patched:
        file_path.write_text(content)

    return patched


def patch_to_dict(file_path: Path, prop_names: list[str]) -> bool:
    """Fix to_dict() null handling for sparse map properties in a generated model.

    Changes:
        if self.field[_key_field]:
            _field_dict[_key_field] = self.field[_key_field].to_dict()

    To:
        if self.field[_key_field] is not None:
            _field_dict[_key_field] = self.field[_key_field].to_dict()
        else:
            _field_dict[_key_field] = None
    """
    content = file_path.read_text()
    patched = False

    for prop in prop_names:
        # Match the generated pattern: if self.prop[_key_prop]:
        #     _field_dict[_key_prop] = self.prop[_key_prop].to_dict()
        pattern = (
            rf"(                if self\.{prop}\[_key_{prop}\]):"
            rf"(\n                    _field_dict\[_key_{prop}\] = self\.{prop}\[_key_{prop}\]\.to_dict\(\))"
        )
        replacement = (
            rf"\1 is not None:\2"
            rf"\n                else:"
            rf"\n                    _field_dict[_key_{prop}] = None"
        )

        new_content, count = re.subn(pattern, replacement, content)
        if count > 0:
            content = new_content
            patched = True

    if patched:
        file_path.write_text(content)

    return patched


def main() -> None:
    if len(sys.argv) != 3:
        print(f"Usage: {sys.argv[0]} <openapi.json> <generated-models-dir>", file=sys.stderr)
        sys.exit(1)

    openapi_path, models_dir = sys.argv[1], Path(sys.argv[2])

    with open(openapi_path) as f:
        openapi = json.load(f)

    sparse_maps = find_sparse_map_schemas(openapi)
    if not sparse_maps:
        print("No sparse map schemas with model-typed values found — nothing to patch")
        return

    referencing = find_referencing_models(openapi, sparse_maps)
    if not referencing:
        print(f"WARNING: Found sparse maps {list(sparse_maps)} but no schemas reference them", file=sys.stderr)
        return

    patched_files: list[str] = []
    errors: list[str] = []

    for schema_name, prop_names in referencing.items():
        filename = schema_to_filename(schema_name)
        file_path = models_dir / filename
        if not file_path.exists():
            errors.append(f"{filename} (from {schema_name})")
            continue

        patched = False
        if patch_to_dict(file_path, prop_names):
            patched = True
        if patch_type_annotations(file_path, prop_names, sparse_maps):
            patched = True
        if patched:
            patched_files.append(f"{filename} ({', '.join(prop_names)})")
        else:
            errors.append(f"{filename}: pattern not found for {prop_names}")

    if errors:
        print(f"ERROR: Failed to patch: {errors}", file=sys.stderr)
        sys.exit(1)

    print(f"Patched {len(patched_files)} files: {patched_files}")


if __name__ == "__main__":
    main()
