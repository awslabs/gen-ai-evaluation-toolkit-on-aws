#!/usr/bin/env bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

main_version="$(jq -r '.version' "$PROJECT_ROOT/package.json")"
echo "Setting version number to '$main_version'"

# Detect OS for sed compatibility
# SED_ARGS is an array: Linux uses [-i], macOS uses [-i '']
# It must be an array otherwise the '' will interpretted literally
SED_ARGS=(-i)
if [[ "$OSTYPE" == "darwin"* ]]; then
  SED_ARGS=(-i '')
fi

for package in "$PROJECT_ROOT"/packages/*; do
  # Skip test packages — never published or consumed by version, so they
  # deliberately stay outside the monorepo versioning scheme (tests-ts is
  # additionally marked "private" in its package.json).
  if [[ "$package" == *tests-* ]]; then
    continue
  fi

  # Update smithy models
  if [[ "$(basename "$package")" = "models" ]]; then
    # Update main.smithy service version
    # This updates OpenAPI and generated python client
    main_smithy="$package/model/main.smithy"
    if [[ -f "$main_smithy" ]]; then
      echo "Updating $main_smithy service version"
      sed "${SED_ARGS[@]}" "s/^    version: \".*\"/    version: \"$main_version\"/" "$main_smithy"
    else
      tput setaf 3 # Use yellow colour
      echo "Warning: $main_smithy not found" >&2
      tput sgr0 # Reset colour
    fi

    # Update smithy-build.json packageVersion fields
    # This updates generated TS clients
    smithy_build="$PROJECT_ROOT/packages/models/smithy-build.json"
    if [[ -f "$smithy_build" ]]; then
      echo "Updating $smithy_build packageVersion fields"
      sed "${SED_ARGS[@]}" "s/\"packageVersion\": \".*\"/\"packageVersion\": \"$main_version\"/" "$smithy_build"
    else
      tput setaf 3 # Use yellow colour
      echo "Warning: $smithy_build not found" >&2
      tput sgr0 # Reset colour
    fi

    continue
  fi

  # If package.json exists, update its version number
  package_json="$package/package.json"
  if [[ -f "$package_json" ]]; then
    echo "Updating $package_json"
    sed "${SED_ARGS[@]}" "s/\"version\": *\".*\"/\"version\": \"$main_version\"/" "$package_json"
    continue
  fi

  # If pyproject.toml exists, update its version number
  pyproject="$package/pyproject.toml"
  if [[ -f "$pyproject" ]]; then
    echo "Updating $pyproject"
    sed "${SED_ARGS[@]}" "s/^version = \".*\"/version = \"$main_version\"/" "$pyproject"
  fi
done
