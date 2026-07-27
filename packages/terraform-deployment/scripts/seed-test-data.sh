#!/usr/bin/env bash
# seed-test-data.sh
#
# Seed integration-test fixtures into the datastore bucket. Local
# equivalent of CI's `tf:seed-test-data` job — invokes CDK's
# `copyTestData()` helper to (re)materialise fixtures, then syncs them
# into the bucket whose name TF publishes via SSM.
#
# Without this, integration tests like `experiment.test.ts` invoke
# evaluations with `prefix: "evaluation/agentic/3"` against an empty
# bucket — the plugin silently produces zero results, the experiment
# logger writes zero artifacts, and the snapshot comparison fails with
# `[]` vs the expected 6 files.
#
# Run after `nx run terraform-deployment:apply` on a fresh deploy. Re-run
# any time `packages/deployment/lib/test-data/` changes.
#
# Called by: nx run terraform-deployment:seed-test-data
#
# Expects in env:
#   AWS credentials for the target account (active profile)
#   AWS_DEFAULT_REGION (or AWS_REGION)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd)"
if [ -z "${SCRIPT_DIR:-}" ]; then
  echo "ERROR: failed to resolve script directory." >&2
  exit 1
fi
# shellcheck source=common.sh
. "${SCRIPT_DIR}/common.sh"

etk::require_region

REPO_ROOT="${SCRIPT_DIR}/../../.."
TEST_DATA_DIR="${REPO_ROOT}/packages/deployment/assets/test-data"

# Generate test-data fixtures via CDK's `copyTestData()` helper. Mirrors
# what DataStack does at synth time so TF and CDK seed the same fixture
# set. Re-running is idempotent; the helper writes deterministic output.
#
# `npx --yes tsx` — auto-installs tsx if missing. Surface a clear error when
# the per-run download fails (offline / registry rate-limit) instead of a
# cryptic node "Cannot find module" later in the pipeline.
echo "==> Generating test-data fixtures via copyTestData()"
if ! (
  cd "${REPO_ROOT}"
  npx --yes tsx -e "import { copyTestData } from './packages/deployment/lib/test-data'; copyTestData('./packages/deployment/assets/test-data');"
); then
  echo "ERROR: copyTestData() invocation via 'npx --yes tsx' failed." >&2
  echo "  Hints: pre-install tsx ('npm install -g tsx') for offline runs," >&2
  echo "         or check network access to the npm registry." >&2
  exit 1
fi

# Sanity-check before sync so a `--delete` doesn't wipe the bucket if
# copyTestData() silently failed (no evaluation/ or generation/ dirs, or
# fewer than ~dozens of files).
if [ ! -d "${TEST_DATA_DIR}/evaluation" ] || [ ! -d "${TEST_DATA_DIR}/generation" ]; then
  echo "ERROR: ${TEST_DATA_DIR} missing evaluation/ or generation/ — copyTestData() failed silently." >&2
  exit 1
fi
# pipefail wraps the `find | wc | tr` chain so a broken find (permission
# error, transient FS failure) doesn't produce an empty FILE_COUNT that
# silently dodges the `< 10` guard below.
FILE_COUNT=$(set -o pipefail; find "${TEST_DATA_DIR}" -type f | wc -l | tr -d ' ')
if [ "${FILE_COUNT}" -lt 10 ]; then
  echo "ERROR: ${TEST_DATA_DIR} only has ${FILE_COUNT} files — expected dozens. Refusing to sync." >&2
  exit 1
fi
echo "==> Staged ${FILE_COUNT} fixture files under ${TEST_DATA_DIR}"

# Resolve datastore bucket via SSM (TF publishes this in main.tf). Single
# call: capture stdout to a tmpfile and stderr to a var so we can surface
# auth/permission errors. Avoids a TOCTOU race between two get-parameter
# calls (token expiring or parameter changing between them).
SSM_OUT=$(mktemp)
trap 'rm -f "${SSM_OUT}"' EXIT
if SSM_STDERR=$(aws ssm get-parameter \
    --name /genai-etk/customerProvidedBucketName \
    --query Parameter.Value --output text \
    --region "${REGION}" 2>&1 >"${SSM_OUT}"); then
  BUCKET=$(<"${SSM_OUT}")
else
  etk::aws_err_class "${SSM_STDERR}"
  echo "ERROR: SSM /genai-etk/customerProvidedBucketName lookup failed — has 'nx run terraform-deployment:apply' completed?" >&2
  echo "${SSM_STDERR}" >&2
  exit 1
fi
if [ -z "${BUCKET}" ] || [ "${BUCKET}" = "None" ]; then
  echo "ERROR: /genai-etk/customerProvidedBucketName is empty/None." >&2
  exit 1
fi

echo "==> Syncing ${TEST_DATA_DIR}/ -> s3://${BUCKET}/ (--delete)"
if ! aws s3 sync "${TEST_DATA_DIR}/" "s3://${BUCKET}/" \
    --delete \
    --region "${REGION}"; then
  echo "ERROR: aws s3 sync to s3://${BUCKET}/ failed — check bucket exists, IAM s3:PutObject + s3:DeleteObject grants, and KMS access if bucket is CMK-encrypted." >&2
  exit 1
fi

echo ""
echo "Test-data seeded into s3://${BUCKET}/."
echo "Integration tests can now run: cd packages/tests-ts && npm run test:long-eval"
