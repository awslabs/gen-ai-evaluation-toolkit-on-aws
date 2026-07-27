#!/usr/bin/env bash
# preflight-bootstrap.sh
#
# Verifies that the target account has been bootstrapped before running
# `terraform plan` / `apply`. Checks the plugin ECR repositories and the
# deployed-image-manifest SSM parameter exist.
#
# Why this is a shell preflight and not HCL:
# Terraform's `try()` / postconditions cannot catch provider-read errors
# on `data "aws_ecr_repository"` or `data "aws_ssm_parameter"` — the
# provider API call fails before HCL expressions evaluate. A preflight
# turns the cryptic "ResourceNotFoundException" into a readable "run
# bootstrap first" message.
#
# Called by:
#   - tf:plan in .gitlab/pipeline.yml (CI)
#   - the `plan` target in packages/terraform-deployment/project.json (local dev)
#
# Expects in env:
#   AWS_DEFAULT_REGION (or AWS_REGION)
#   AWS credentials for the target account

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd)"
if [ -z "${SCRIPT_DIR:-}" ]; then
  echo "ERROR: failed to resolve preflight script directory." >&2
  exit 1
fi
# shellcheck source=common.sh
. "${SCRIPT_DIR}/common.sh"

etk::require_region
etk::resolve_env

# Source of truth for which ECR repositories must exist. Override
# PLUGINS_YAML to validate against an alternate plugin set without
# forking the script — the same shape build-and-push-images.sh uses.
PLUGINS_YAML="${PLUGINS_YAML:-${SCRIPT_DIR}/../plugins.yaml}"
SSM_PARAM_NAME="/genai-etk/${ENV_NAME}/deployed-image-manifest"

readarray -t REPOS < <(etk::parse_plugins_yaml "${PLUGINS_YAML}")
if [ "${#REPOS[@]}" -eq 0 ]; then
  echo "ERROR: failed to parse ${PLUGINS_YAML} — no ecr_repo entries found." >&2
  echo "  Either plugins.yaml layout changed or the file is empty." >&2
  exit 1
fi

MISSING_REPOS=()
for REPO in "${REPOS[@]}"; do
  STDERR=$(aws ecr describe-repositories \
      --repository-names "${REPO}" \
      --region "${REGION}" 2>&1 >/dev/null) || {
    etk::aws_err_class "${STDERR}"
    MISSING_REPOS+=("${REPO}")
  }
done

SSM_MISSING=0
STDERR=$(aws ssm get-parameter \
    --name "${SSM_PARAM_NAME}" \
    --region "${REGION}" 2>&1 >/dev/null) || {
  etk::aws_err_class "${STDERR}"
  SSM_MISSING=1
}

if [ "${#MISSING_REPOS[@]}" -gt 0 ] || [ "${SSM_MISSING}" -ne 0 ]; then
  echo "ERROR: target AWS account has not been bootstrapped." >&2
  echo "" >&2
  if [ "${#MISSING_REPOS[@]}" -gt 0 ]; then
    echo "Missing plugin ECR repositories:" >&2
    for R in "${MISSING_REPOS[@]}"; do
      echo "  - ${R}" >&2
    done
  fi
  if [ "${SSM_MISSING}" -ne 0 ]; then
    echo "Missing SSM parameter: ${SSM_PARAM_NAME}" >&2
  fi
  echo "" >&2
  echo "Run 'nx run terraform-deployment:bootstrap-apply' against this account before planning." >&2
  echo "See packages/terraform-deployment/README.md § Bootstrap." >&2
  exit 1
fi

echo "Bootstrap preflight OK: ${#REPOS[@]} ECR repositories + SSM parameter present in ${REGION}."
