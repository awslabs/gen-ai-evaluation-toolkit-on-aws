#!/usr/bin/env bash
# set-image-tag.sh
#
# Pre-flight: verify every plugin ECR repository has an image at $1 (the
# tag CI just pushed via the `docker:plugin` matrix), then write a JSON
# manifest to the deployed-image-manifest SSM parameter and read it back
# to confirm the write landed.
#
# CI wraps every plugin under one tag (`$CI_COMMIT_SHORT_SHA`) — same shape
# as the legacy single-string SSM, but stored as a manifest so the customer
# module's lookup can stay uniform regardless of whether CI or the local
# `build-and-push-images.sh` (per-image content hashes) wrote it.
#
# Called by:
#   - .gitlab/pipeline.yml `tf:set-image-tag` job (post-merge to dev).
#   - Optionally by hand when promoting an image tag between environments.
#
# Why split from pipeline.yml:
#   The original was ~70 lines of inline shell inside `script: - |`. Moving
#   it here mirrors the existing preflight-bootstrap.sh / build-and-push-images.sh
#   pattern, makes the logic unit-testable + runnable locally, and shrinks
#   pipeline.yml so CI changes are easier to review in isolation from
#   image-pinning logic.
#
# Usage:
#   ./set-image-tag.sh <image-tag>
#
# Expects in env:
#   AWS_DEFAULT_REGION (or AWS_REGION) — fail loud if absent
#   AWS credentials for the target account
#   TF_ENV — environment segment in the SSM path (defaults to dev)

set -euo pipefail

if [ "$#" -ne 1 ] || [ -z "$1" ]; then
  echo "usage: $0 <image-tag>" >&2
  echo "  e.g.  $0 \$CI_COMMIT_SHORT_SHA" >&2
  exit 2
fi
IMAGE_TAG="$1"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd)"
if [ -z "${SCRIPT_DIR:-}" ]; then
  echo "ERROR: set-image-tag: failed to resolve script directory." >&2
  exit 1
fi
# shellcheck source=common.sh
. "${SCRIPT_DIR}/common.sh"

etk::require_region
etk::resolve_env
etk::resolve_account
etk::resolve_ecr_registry

PLUGINS_YAML="${PLUGINS_YAML:-${SCRIPT_DIR}/../plugins.yaml}"

# Parse plugins.yaml into rows of: <ecr_repo>|<deploy_key>. We need both —
# the ecr_repo for the preflight describe-images call, the deploy_key as
# the manifest map's key.
ROWS=$(awk '
  function flush() {
    if (name == "") return
    if (ecr == "" || deploy_key == "") {
      printf "ERROR: plugins.yaml entry %s missing %s.\n", name,
        (ecr == "" ? "ecr_repo" : "deploy_key") > "/dev/stderr"
      bad = 1
      return
    }
    printf "%s|%s\n", ecr, deploy_key
  }
  /^  - name:/      { flush(); name=$3; ecr=""; deploy_key=""; next }
  /^    ecr_repo:/  { ecr=$2; next }
  /^    deploy_key:/{ deploy_key=$2; next }
  END { flush(); exit bad }
' "${PLUGINS_YAML}")
AWK_RC=$?

if [ "${AWK_RC}" -ne 0 ]; then
  echo "ERROR: ${PLUGINS_YAML} has malformed plugin entries (see above)." >&2
  exit 1
fi
if [ -z "${ROWS}" ]; then
  echo "ERROR: failed to parse ${PLUGINS_YAML} — no plugin entries found." >&2
  exit 1
fi

# Pre-flight: verify every plugin ECR repo has an image at IMAGE_TAG. If
# any is missing (e.g. docker:plugin was filtered out by a `changes:`
# mismatch) we refuse to write SSM — otherwise tf:apply would resolve
# <repo>:<tag> against ECR, get no image, and the deployment would fail
# at runtime.
REPOS=()
declare -a MANIFEST_KEYS
declare -a MANIFEST_VALS
while IFS='|' read -r REPO DEPLOY_KEY; do
  [ -z "${REPO}" ] && continue
  REPOS+=("${REPO}")
  MANIFEST_KEYS+=("${DEPLOY_KEY}")
  MANIFEST_VALS+=("${ECR_REGISTRY}/${REPO}:${IMAGE_TAG}")
done <<<"${ROWS}"

echo "==> Pre-flight: verifying ${IMAGE_TAG} exists in ${#REPOS[@]} plugin ECR repos..."
MISSING=0
CRED_ERR=0
for REPO in "${REPOS[@]}"; do
  if STDERR=$(aws ecr describe-images \
      --repository-name "${REPO}" \
      --image-ids "imageTag=${IMAGE_TAG}" \
      --region "${REGION}" 2>&1 >/dev/null); then
    continue
  fi
  # Distinguish credential/permission errors from ImageNotFound so the
  # operator knows whether to refresh credentials vs rebuild the image.
  if echo "${STDERR}" | grep -qE 'AccessDenied|UnrecognizedClientException|InvalidClientTokenId|ExpiredToken|RepositoryNotFoundException'; then
    echo "ERROR: aws ecr describe-images for ${REPO} failed with credential/repo error: ${STDERR}" >&2
    CRED_ERR=1
    break
  fi
  echo "ERROR: ${REPO}:${IMAGE_TAG} not found in ECR (${STDERR})" >&2
  MISSING=1
done

if [ "${CRED_ERR}" -ne 0 ]; then
  exit 1
fi
if [ "${MISSING}" -ne 0 ]; then
  echo "ERROR: one or more plugin images missing for tag ${IMAGE_TAG}; aborting SSM write." >&2
  exit 1
fi
echo "==> All ${#REPOS[@]} repos have ${IMAGE_TAG}."

# Build the manifest JSON — one entry per plugin, all pointing at the same
# CI-pushed tag. Read by terraform-deployment/main.tf via jsondecode().
# Pipefail propagates inner-jq failures so we never write an empty manifest.
if ! MANIFEST_JSON=$(
  set -o pipefail
  jq -n \
    --argjson keys   "$(printf '%s\n' "${MANIFEST_KEYS[@]}" | jq -R . | jq -s .)" \
    --argjson values "$(printf '%s\n' "${MANIFEST_VALS[@]}" | jq -R . | jq -s .)" \
    '[$keys, $values] | transpose | map({(.[0]): .[1]}) | add'
); then
  echo "ERROR: jq failed building the deployed-image manifest." >&2
  exit 1
fi
if [ -z "${MANIFEST_JSON}" ] || ! echo "${MANIFEST_JSON}" | jq -e 'type == "object" and length > 0' >/dev/null 2>&1; then
  echo "ERROR: jq returned an empty/invalid manifest JSON for ${#MANIFEST_KEYS[@]} entries." >&2
  exit 1
fi

SSM_NAME="/genai-etk/${ENV_NAME}/deployed-image-manifest"
echo "==> Writing ${SSM_NAME} (manifest, ${#MANIFEST_KEYS[@]} entries, all at ${IMAGE_TAG})"
if ! aws ssm put-parameter \
    --name "${SSM_NAME}" \
    --value "${MANIFEST_JSON}" \
    --type String \
    --overwrite \
    --region "${REGION}" >/dev/null; then
  echo "ERROR: aws ssm put-parameter ${SSM_NAME} failed." >&2
  exit 1
fi

# Read-back verification: guards against an IAM/KMS/throttle edge-case
# where put returns 200 but the write didn't persist.
echo "==> Read-back verifying SSM ${SSM_NAME}..."
if ! ACTUAL=$(aws ssm get-parameter \
    --name "${SSM_NAME}" \
    --query Parameter.Value --output text \
    --region "${REGION}"); then
  echo "ERROR: aws ssm get-parameter ${SSM_NAME} failed during read-back." >&2
  exit 1
fi
if [ "${ACTUAL}" != "${MANIFEST_JSON}" ]; then
  echo "ERROR: SSM manifest write did not land. expected and got differ." >&2
  exit 1
fi
echo "==> Set ${SSM_NAME} (verified)."
