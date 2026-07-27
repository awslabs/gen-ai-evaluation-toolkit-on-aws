#!/usr/bin/env bash
# seed-placeholder-images.sh
#
# Pushes a tiny placeholder image (public busybox) to every plugin ECR
# repository in the target account, tagged with a deterministic
# "bootstrap-placeholder". Also writes the deployed-image-manifest SSM
# parameter so `terraform plan` passes the preflight check.
#
# Intended for:
#   - First-time local deploys where plugin images haven't been built
#     via the CI pipeline yet.
#   - Sanity test after `bootstrap-apply` to confirm the ECR + SSM
#     wiring is functional before burning ~20 min on real builds.
#
# This is NOT a substitute for real plugin images — ECS / Lambda
# resources will deploy but obviously won't run the real plugin code.
# Use `nx run terraform-deployment:build-and-push-images` (or wait for CI) to
# replace the placeholder with real artefacts.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd)"
if [ -z "${SCRIPT_DIR:-}" ]; then
  echo "ERROR: failed to resolve seed-placeholder-images script directory." >&2
  exit 1
fi
# shellcheck source=common.sh
. "${SCRIPT_DIR}/common.sh"

etk::require_region
etk::resolve_env
etk::require_docker
etk::resolve_account
etk::resolve_ecr_registry

PLUGINS_YAML="${PLUGINS_YAML:-${SCRIPT_DIR}/../plugins.yaml}"
PLACEHOLDER_TAG="bootstrap-placeholder"

# Parse plugins.yaml into rows of: <ecr_repo>|<deploy_key>. We need the
# deploy_key to build the manifest entries — same shape as the production
# build script.
PLACEHOLDER_ROWS=$(awk '
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
if [ -z "${PLACEHOLDER_ROWS}" ]; then
  echo "ERROR: no ecr_repo/deploy_key pairs found in ${PLUGINS_YAML}." >&2
  exit 1
fi

# ECR login: use pipefail to catch either side of the pipe failing (aws
# returns no password, or docker rejects it). `set -o pipefail` is already
# on from `set -euo pipefail` above, so a bare pipe suffices.
echo "==> Logging Docker into ECR ${ECR_REGISTRY}"
if ! aws ecr get-login-password --region "${REGION}" \
    | docker login --username AWS --password-stdin "${ECR_REGISTRY}"; then
  echo "ERROR: ECR docker login failed (aws get-login-password or docker login)" >&2
  exit 1
fi

echo "==> Pulling public busybox as placeholder"
if ! docker pull --quiet public.ecr.aws/docker/library/busybox:latest; then
  echo "ERROR: docker pull public.ecr.aws/docker/library/busybox:latest failed." >&2
  echo "  Check Docker daemon is running and network reachable." >&2
  exit 1
fi

declare -a MANIFEST_KEYS
declare -a MANIFEST_VALS
COUNT=0

while IFS='|' read -r ECR_REPO DEPLOY_KEY; do
  [ -z "${ECR_REPO}" ] && continue
  TARGET="${ECR_REGISTRY}/${ECR_REPO}:${PLACEHOLDER_TAG}"
  echo "==> Tagging + pushing ${TARGET}"
  if ! docker tag public.ecr.aws/docker/library/busybox:latest "${TARGET}"; then
    echo "ERROR: docker tag → ${TARGET} failed." >&2
    exit 1
  fi
  # Tolerate "tag already exists" since the placeholder tag is shared and
  # this script is meant to be idempotent.
  if ! PUSH_STDERR=$(docker push --quiet "${TARGET}" 2>&1); then
    if echo "${PUSH_STDERR}" | grep -qiE 'immutable|already exists'; then
      echo "==> ${TARGET} already present (immutable tag) — skipping."
    else
      echo "ERROR: docker push ${TARGET} failed — check ECR repo exists + Docker auth." >&2
      echo "${PUSH_STDERR}" >&2
      exit 1
    fi
  fi
  MANIFEST_KEYS+=("${DEPLOY_KEY}")
  MANIFEST_VALS+=("${TARGET}")
  COUNT=$((COUNT + 1))
done <<<"${PLACEHOLDER_ROWS}"

if [ "${COUNT}" -eq 0 ]; then
  echo "ERROR: no plugin images pushed." >&2
  exit 1
fi

if ! MANIFEST_JSON=$(
  set -o pipefail
  jq -n \
    --argjson keys   "$(printf '%s\n' "${MANIFEST_KEYS[@]}" | jq -R . | jq -s .)" \
    --argjson values "$(printf '%s\n' "${MANIFEST_VALS[@]}" | jq -R . | jq -s .)" \
    '[$keys, $values] | transpose | map({(.[0]): .[1]}) | add'
); then
  echo "ERROR: jq failed building the placeholder image manifest." >&2
  exit 1
fi
if [ -z "${MANIFEST_JSON}" ] || ! echo "${MANIFEST_JSON}" | jq -e 'type == "object" and length > 0' >/dev/null 2>&1; then
  echo "ERROR: jq returned an empty/invalid placeholder manifest JSON for ${COUNT} entries." >&2
  exit 1
fi

SSM_NAME="/genai-etk/${ENV_NAME}/deployed-image-manifest"
echo "==> Writing ${SSM_NAME} (placeholder manifest, ${COUNT} entries)"
if ! aws ssm put-parameter \
    --name "${SSM_NAME}" \
    --value "${MANIFEST_JSON}" \
    --type String \
    --overwrite \
    --region "${REGION}" >/dev/null; then
  echo "ERROR: aws ssm put-parameter ${SSM_NAME} failed." >&2
  exit 1
fi

echo ""
echo "Placeholder images pushed to ${COUNT} plugin repositories."
echo "Preflight check will now pass. Replace with real images via"
echo "\`nx run terraform-deployment:build-and-push-images\` before using the deployment."
