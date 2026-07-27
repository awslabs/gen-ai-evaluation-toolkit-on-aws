#!/usr/bin/env bash

set -eu

if ! command -v python; then
  echo "Python is not installed, install it first!" >&2
  exit 1
fi

# Ensure pip is installed
python -m ensurepip --upgrade

# Pin pip to the version required by Python packages' [tool.hatch.env].requires.
# Must match the `pip==X` declared there (currently in
# `packages/experiment-lambdas/pyproject.toml` and
# `packages/plugin-eval-sdk/pyproject.toml`). Pre-installing this version
# pre-empts the in-place upgrade that Hatch would otherwise perform on first
# invocation, which races across parallel NX Python builds and intermittently
# breaks .venv/bin/pip* during self-replacement.
python -m pip install --upgrade 'pip==26.0.1'

# Install hatch with compatible virtualenv version
# virtualenv 21.0.0+ removed 'propose_interpreters' causing hatch build failures
python -m pip install hatch 'virtualenv<21'
