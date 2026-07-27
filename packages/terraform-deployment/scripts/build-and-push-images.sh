#!/usr/bin/env bash
# build-and-push-images.sh
#
# Audience: ETK maintainers + monorepo developers running a local end-to-end
# deploy against their own AWS account. Customers consuming the customer
# module at packages/terraform/ are NOT expected to run this script — it is
# deployment-internal and assumes the bootstrap-owned ECR repos + plugin
# layout from packages/terraform-deployment/plugins.yaml. Customers wire
# their own image build/push pipeline (kaniko, CodeBuild, GitHub Actions,
# manual `docker push`) and supply the resulting URIs via the customer
# module's `deployed_image_uris` variable.
#
# Behaviour: for each plugin in plugins.yaml,
#   1. Compute a deterministic content hash over the build inputs (Dockerfile
#      + build context, excluding generated/transient files).
#   2. Tag = `etk-<12-char-hash>`. Same content → same tag (idempotent).
#   3. Skip the build entirely if `<repo>:<tag>` already exists in ECR.
#   4. Otherwise build + push, then move on.
# After all plugins are handled, write a single SSM JSON *manifest*
# (`/genai-etk/<env>/deployed-image-manifest`) mapping each plugin's
# `deploy_key` to its `<repo>:<tag>`. The deployment package's main.tf reads
# the manifest, decodes it, and supplies it to the customer module via
# `deployed_image_uris`.
#
# Why this shape (deliberately mirrors CDK's pre-reqs.ts):
#   - CDK already uses content-hash tags (`<image>.hash` files) joined to
#     the image name. Same image content → same tag forever. Local rebuild
#     of unchanged source is a no-op against ECR.
#   - The single-string SSM `deployed-image-tag` it replaces had two
#     fragility points: (a) ECR repos are IMMUTABLE (CKV_AWS_51), so
#     re-running the script after a transient push failure required a tag
#     bump and orphaned the previously-pushed images; (b) the same SHA
#     was applied to all repos, so a partial-build state was indistinguishable
#     from a clean one. Per-image content hashes + a manifest lift both.
#
# For plan-only validation, `seed-placeholder-images.sh` is cheaper — it
# pushes busybox to every repo and writes a placeholder manifest.
#
# Called by: nx run terraform-deployment:build-and-push-images
#
# Expects in env:
#   AWS credentials for the target account (active profile)
#   AWS_DEFAULT_REGION (or AWS_REGION)
#   TF_ENV                  — SSM path segment (defaults to 'dev')
#   PLUGINS_YAML            — path to a plugins.yaml file (defaults to the
#                             one shipped at packages/terraform-deployment/
#                             plugins.yaml). Override to ship a different
#                             plugin set without forking the script.
#
# No git dependency — we no longer derive tags from the commit SHA. CI's
# `tf:set-image-tag` job (set-image-tag.sh) builds the same manifest from
# its own per-image-tag inputs.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd)"
if [ -z "${SCRIPT_DIR:-}" ]; then
  echo "ERROR: failed to resolve script directory." >&2
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
if [ ! -f "${PLUGINS_YAML}" ]; then
  echo "ERROR: plugins.yaml not found at ${PLUGINS_YAML}." >&2
  echo "  Override the path via PLUGINS_YAML=<path> if your registry lives elsewhere." >&2
  exit 1
fi
REPO_ROOT="${SCRIPT_DIR}/../../.."

echo "==> Logging Docker into ECR ${ECR_REGISTRY}"
# pipefail (set -o pipefail from set -euo pipefail above) catches either side
# of the pipe failing — aws returns no password OR docker rejects it.
if ! aws ecr get-login-password --region "${REGION}" \
    | docker login --username AWS --password-stdin "${ECR_REGISTRY}"; then
  echo "ERROR: ECR docker login failed (aws get-login-password or docker login)." >&2
  exit 1
fi

# Parse plugins.yaml into 5-field rows:
# <package>|<dockerfile-or-empty>|<docker_context-or-empty>|<ecr_repo>|<deploy_key>.
# docker_context is optional; default (empty) → packages/<package>.
MAPPINGS=$(awk '
  function flush() {
    if (name == "") return
    if (package == "" || ecr == "" || deploy_key == "") {
      printf "ERROR: plugins.yaml entry %s missing %s.\n", name,
        (package == "" ? "package" : (ecr == "" ? "ecr_repo" : "deploy_key")) > "/dev/stderr"
      bad = 1
      return
    }
    printf "%s|%s|%s|%s|%s\n", package, dockerfile, docker_context, ecr, deploy_key
  }
  /^  - name:/         { flush(); name=$3; package=""; dockerfile=""; docker_context=""; ecr=""; deploy_key=""; next }
  /^    dockerfile:/   { dockerfile=$2; next }
  /^    docker_context:/{ docker_context=$2; next }
  /^    package:/      { package=$2; next }
  /^    ecr_repo:/     { ecr=$2; next }
  /^    deploy_key:/   { deploy_key=$2; next }
  END { flush(); exit bad }
' "${PLUGINS_YAML}")
AWK_RC=$?

if [ "${AWK_RC}" -ne 0 ]; then
  echo "ERROR: ${PLUGINS_YAML} has malformed plugin entries (see above)." >&2
  exit 1
fi
if [ -z "${MAPPINGS}" ]; then
  echo "ERROR: failed to parse ${PLUGINS_YAML} — no plugin entries found." >&2
  exit 1
fi

# Compute a deterministic content hash for a plugin's build context. Inputs:
# the Dockerfile and every file that ends up in the build context, after
# excluding paths that are generated/cached and shouldn't influence the tag.
# Outputs: 12-char hex prefix of sha256.
#
# We list-sort the file set explicitly (find | LC_ALL=C sort) so the hash is
# stable across hosts/filesystems with different default ordering.
plugin_content_hash() {
  local context="$1"
  local dockerfile_path="$2"
  local hash

  if [ ! -d "${context}" ]; then
    echo "ERROR: plugin_content_hash: context dir '${context}' not found." >&2
    return 1
  fi
  if [ ! -f "${context}/${dockerfile_path}" ]; then
    echo "ERROR: plugin_content_hash: Dockerfile '${context}/${dockerfile_path}' not found." >&2
    return 1
  fi

  # set -o pipefail propagates failure from any stage of the inner pipeline
  # (cd / sha256sum / find / sort / xargs / sha256sum) into ${PIPESTATUS},
  # so an empty digest from a broken stage fails the function instead of
  # producing a misleading 12-char hash of empty input.
  #
  # find -print0 | sort -z | xargs -0 is null-safe — defends against
  # filenames with whitespace, newlines, or shell metacharacters in
  # transitive deps (a bot-flagged command-injection vector).
  hash=$(
    set -o pipefail
    cd "${context}" || exit 1
    {
      sha256sum "${dockerfile_path}" || exit 1
      find . -type f \
        ! -path './node_modules/*' \
        ! -path './dist/*' \
        ! -path './build/*' \
        ! -path './.venv/*' \
        ! -path './.pytest_cache/*' \
        ! -path './__pycache__/*' \
        ! -path './output/*' \
        ! -path './*.egg-info/*' \
        ! -name '*.pyc' \
        -print0 \
        | LC_ALL=C sort -z \
        | xargs -0 sha256sum || exit 1
    } | sha256sum | cut -c1-12
  ) || {
    echo "ERROR: plugin_content_hash: digest pipeline failed for ${context}." >&2
    return 1
  }

  if [ -z "${hash}" ] || [ "${#hash}" -ne 12 ]; then
    echo "ERROR: plugin_content_hash for ${context} returned invalid hash '${hash}'." >&2
    return 1
  fi
  printf '%s' "${hash}"
}

# Build the SSM manifest entries as we go. We emit JSON at the end via a
# single jq invocation to avoid hand-rolling string escaping.
#
# A skipped plugin (Dockerfile not found) is omitted from the manifest —
# this is intentional and matches `_resolve_image`'s "missing key →
# placeholder" contract. We track skips separately so the final summary
# distinguishes "0 plugins built" (empty plugins.yaml — should error)
# from "5 built + 2 skipped" (partial registry, e.g. closed-source plugin
# the Dockerfile lives outside this repo — expected).
declare -a MANIFEST_KEYS
declare -a MANIFEST_VALS
declare -i SKIPPED_PLUGINS=0

# Use here-string so loop body runs in the parent shell (errors inside the
# loop terminate the script via `set -e`). Piping into `while` runs the body
# in a subshell, which can mask failures.
while IFS='|' read -r PACKAGE DOCKERFILE DOCKER_CONTEXT_REL ECR_REPO DEPLOY_KEY; do
  [ -z "${ECR_REPO}" ] && continue
  # Default context = the plugin's own package dir. Plugins that COPY sibling
  # packages (e.g. plugin-gen-* COPY plugin-gen-sdk) set
  # `docker_context: packages` in plugins.yaml so the build sees both.
  CONTEXT="${REPO_ROOT}/${DOCKER_CONTEXT_REL:-packages/${PACKAGE}}"
  DOCKERFILE_NAME="${DOCKERFILE:-Dockerfile}"
  # Absolute Dockerfile path (always under the plugin's own package dir,
  # regardless of where the build context root is) — used for `docker build -f`
  # and the existence check below.
  DOCKERFILE_PATH="${REPO_ROOT}/packages/${PACKAGE}/${DOCKERFILE_NAME}"
  # Dockerfile path *relative to ${CONTEXT}* — needed by plugin_content_hash,
  # which `cd`s into context and runs `sha256sum` on this relative path.
  if [ -n "${DOCKER_CONTEXT_REL}" ]; then
    DOCKERFILE_REL_TO_CONTEXT="${PACKAGE}/${DOCKERFILE_NAME}"
  else
    DOCKERFILE_REL_TO_CONTEXT="${DOCKERFILE_NAME}"
  fi

  if [ ! -f "${DOCKERFILE_PATH}" ]; then
    echo "==> SKIP ${ECR_REPO}: Dockerfile not found at ${DOCKERFILE_PATH}"
    SKIPPED_PLUGINS+=1
    continue
  fi

  if ! HASH=$(plugin_content_hash "${CONTEXT}" "${DOCKERFILE_REL_TO_CONTEXT}"); then
    echo "ERROR: failed to compute content hash for ${ECR_REPO} (context=${CONTEXT})." >&2
    exit 1
  fi
  TAG="etk-${HASH}"
  TARGET="${ECR_REGISTRY}/${ECR_REPO}:${TAG}"

  # ECR cache — skip the build if the same content has already been pushed.
  # Suppresses ImageNotFoundException stderr; surfaces any other error class
  # via etk::aws_err_class so the caller knows whether to retry.
  if STDERR=$(aws ecr describe-images \
      --repository-name "${ECR_REPO}" \
      --image-ids "imageTag=${TAG}" \
      --region "${REGION}" 2>&1 >/dev/null); then
    echo "==> CACHED ${ECR_REPO}:${TAG} — already in ECR, skipping build"
  else
    if echo "${STDERR}" | grep -qE 'AccessDenied|UnrecognizedClientException|InvalidClientTokenId|ExpiredToken|RepositoryNotFoundException'; then
      echo "ERROR: aws ecr describe-images for ${ECR_REPO} failed: ${STDERR}" >&2
      exit 1
    fi
    # Not found → build + push.
    echo "==> Building ${TARGET} (context=${CONTEXT} dockerfile=${DOCKERFILE_PATH})"
    if ! docker build -t "${TARGET}" -f "${DOCKERFILE_PATH}" "${CONTEXT}"; then
      echo "ERROR: docker build ${TARGET} failed — see build output above." >&2
      exit 1
    fi
    echo "==> Pushing ${TARGET}"
    if ! docker push --quiet "${TARGET}"; then
      echo "ERROR: docker push ${TARGET} failed — check ECR repo + Docker auth." >&2
      exit 1
    fi
  fi

  MANIFEST_KEYS+=("${DEPLOY_KEY}")
  MANIFEST_VALS+=("${TARGET}")
done <<<"${MAPPINGS}"

if [ "${#MANIFEST_KEYS[@]}" -eq 0 ]; then
  echo "ERROR: no plugins emitted to manifest." >&2
  exit 1
fi

# Render the manifest as JSON. We avoid hand-quoting and let jq do it.
# Pin pipefail explicitly inside the subshell so a failure in any inner jq
# (malformed input, OOM, missing binary) propagates out instead of producing
# an empty MANIFEST_JSON that we'd happily write to SSM.
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
echo "==> Writing ${SSM_NAME} (manifest with ${#MANIFEST_KEYS[@]} entries)"
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
echo "Plugin images resolved (${#MANIFEST_KEYS[@]} entries, ${SKIPPED_PLUGINS} skipped)."
echo "SSM manifest: ${SSM_NAME}"
echo "Next: nx run terraform-deployment:plan && nx run terraform-deployment:apply"
