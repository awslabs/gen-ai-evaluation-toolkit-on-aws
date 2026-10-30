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
#
# Installed from a hash-pinned wheel URL: the old pip doing this download still
# validates TLS against the pre-upgrade trust store, which trusts the compromised
# emSign roots (GHSA-6q48-6c7w-9gw2), so a `pip==26.2.2` resolved through the index
# could accept a forged cert. The #sha256 pin makes a tampered wheel fail closed.
python -m pip install --upgrade \
  "pip @ https://files.pythonhosted.org/packages/3f/06/3e4420302363fbb71be3c7f35ce042f54bfca330e3e66b3a2e3c4cca579f/pip-26.2.2-py3-none-any.whl#sha256=fd7f4dfa8190e014013b9f08f3e973f4e4c26ffd179a204895533a7254813a70"

# Install hatch with compatible virtualenv version
# virtualenv 21.0.0+ removed 'propose_interpreters' causing hatch build failures
#   uv>=0.13.4: uv <0.13.4 bundles webpki roots trusting the compromised
#     emSign roots (GHSA-6q48-6c7w-9gw2, GHSA-hq85-5cpj-mr62) and uv runs the
#     PyPI downloads when building python-api; floor an existing env's old uv forward.
#   certifi>=2026.10.19: the mise Python env's own certifi cacert.pem still bundles
#     the compromised emSign roots (GHSA-6q48-6c7w-9gw2); floor it forward here.
python -m pip install hatch 'virtualenv<21' 'uv>=0.13.4' 'certifi>=2026.10.19'
