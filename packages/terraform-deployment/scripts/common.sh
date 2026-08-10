# common.sh — shared helpers for packages/terraform-deployment/scripts/*.sh
#
# Source this from another script with:
#
#   SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd)"
#   if [ -z "${SCRIPT_DIR:-}" ]; then
#     echo "ERROR: failed to resolve script directory." >&2; exit 1
#   fi
#   # shellcheck source=common.sh
#   . "${SCRIPT_DIR}/common.sh"
#
# The caller is expected to have run `set -euo pipefail` already.
#
# What this file provides:
#   etk::require_region        — fail loud if AWS region not set in env / profile
#   etk::resolve_env           — whitelist + export ENV_NAME from TF_ENV (default: dev)
#   etk::resolve_account       — set ACCOUNT_ID from sts:GetCallerIdentity
#   etk::resolve_ecr_registry  — set ECR_REGISTRY from ACCOUNT_ID + REGION
#   etk::require_docker        — fail loud if `docker` (or compatible) not on PATH
#   etk::parse_plugins_yaml    — emit ecr_repo lines from plugins.yaml
#   etk::aws_err_class         — classify aws CLI stderr; exit on auth/permission errors

# Resolve REGION from AWS_DEFAULT_REGION or AWS_REGION. Fail loud if neither
# is set — silent defaults have caused deploys to land in unexpected regions.
etk::require_region() {
  REGION="${AWS_DEFAULT_REGION:-${AWS_REGION:-}}"
  if [ -z "${REGION}" ]; then
    echo "ERROR: AWS region not set." >&2
    echo "  Set AWS_DEFAULT_REGION (or AWS_REGION) in your shell, or configure" >&2
    echo "  the active AWS profile (\`aws configure set region <region>\`)." >&2
    exit 1
  fi
  export REGION
}

# Whitelist TF_ENV. Defaults to 'dev'. Prevents arbitrary SSM/state path
# construction from a typo'd env var.
#
# To add a new environment: append it to the case statement below AND add
# a matching `AWS_CREDS_TARGET_ROLE_<ENV>` GitLab CI variable + bootstrap
# the target account so the SSM path /<project-prefix>/<env>/deployed-image-manifest
# exists. Both must change together; CI fails preflight otherwise.
etk::resolve_env() {
  ENV_NAME="${TF_ENV:-dev}"
  case "${ENV_NAME}" in
    tf-beta|tf-release|tf-prod|dev|staging|prod) ;;
    *)
      echo "ERROR: TF_ENV='${ENV_NAME}' is not one of: tf-beta, tf-release, tf-prod, dev, staging, prod." >&2
      echo "  To add a new env, update the whitelist in common.sh::etk::resolve_env" >&2
      echo "  AND bootstrap the target account so /<project-prefix>/<env>/deployed-image-manifest exists." >&2
      exit 1
      ;;
  esac
  export ENV_NAME
}

# Resolve current account ID via STS. Fails loud with a hint to refresh creds.
etk::resolve_account() {
  if ! ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>&1); then
    echo "ERROR: aws sts get-caller-identity failed: ${ACCOUNT_ID}" >&2
    echo "  Check AWS credentials are set (e.g. \`ada credentials update\` or \`aws sso login\`)." >&2
    exit 1
  fi
  export ACCOUNT_ID
}

# Compute the ECR registry hostname for the active account + region.
# Requires REGION + ACCOUNT_ID to be set (call etk::require_region and
# etk::resolve_account first).
etk::resolve_ecr_registry() {
  if [ -z "${ACCOUNT_ID:-}" ] || [ -z "${REGION:-}" ]; then
    echo "ERROR: etk::resolve_ecr_registry called before ACCOUNT_ID/REGION are set." >&2
    exit 1
  fi
  ECR_REGISTRY="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"
  export ECR_REGISTRY
}

# Verify a `docker`-compatible CLI is on PATH. The error message acknowledges
# finch / podman / colima are acceptable replacements (the Dockerfiles are
# vanilla OCI-spec — anything that exposes a `docker` shim works).
etk::require_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "ERROR: docker CLI not found." >&2
    echo "  Install Docker, or use a compatible alternative (finch, podman, colima)" >&2
    echo "  that exposes a \`docker\` shim on PATH." >&2
    exit 1
  fi
}

# Emit one line per `ecr_repo:` entry from a plugins.yaml file.
# Usage: readarray -t REPOS < <(etk::parse_plugins_yaml "${PLUGINS_YAML}")
etk::parse_plugins_yaml() {
  local file="$1"
  if [ ! -f "${file}" ]; then
    echo "ERROR: ${file} not found." >&2
    exit 1
  fi
  # Capture awk's output + exit status so a malformed YAML file (mid-file
  # parse error) surfaces here rather than producing a silently-truncated
  # repo list. set -e on the caller would skip past a `awk | other_cmd`
  # pipe failure on the awk side.
  local out
  if ! out=$(awk '/^  - /{flag=1} /^$/{flag=0} flag && /ecr_repo:/{print $2}' "${file}"); then
    echo "ERROR: failed to parse ${file} via awk." >&2
    exit 1
  fi
  printf '%s\n' "${out}"
}

# Classify aws CLI stderr. If it looks like an auth/credential/permission
# error, fail loud — operators waste time blaming "missing resources" when
# in fact their token expired. Otherwise return without exiting.
#
# Usage:
#   STDERR=$(aws ... 2>&1 >/dev/null) || {
#     etk::aws_err_class "${STDERR}"
#     # the call returns here only for non-auth errors; handle them yourself
#   }
etk::aws_err_class() {
  local stderr="$1"
  if echo "${stderr}" | grep -qE 'AccessDenied|UnrecognizedClientException|InvalidClientTokenId|ExpiredToken|SignatureDoesNotMatch'; then
    echo "ERROR: AWS authentication / permission failure — refresh your credentials and retry." >&2
    echo "${stderr}" >&2
    exit 1
  fi
}
