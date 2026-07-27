#!/usr/bin/env bash
# test_common.sh — unit tests for common.sh helpers.
#
# Pure bash, no bats/shunit dependency — keeps CI image surface flat. Run
# locally with `bash packages/terraform-deployment/scripts/test_common.sh`
# or wired into CI via the `tf:scripts:test` job in .gitlab/pipeline.yml.
#
# Each test runs in a subshell so a failure in one helper doesn't poison
# subsequent tests' env.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd)"
COMMON="${SCRIPT_DIR}/common.sh"

if [ ! -f "${COMMON}" ]; then
  echo "FATAL: ${COMMON} not found" >&2
  exit 2
fi

PASS=0
FAIL=0
FAILED_NAMES=()

# expect_pass <name> <command...>: run command in a subshell, expect exit 0.
expect_pass() {
  local name="$1"; shift
  if ( "$@" ) >/dev/null 2>&1; then
    PASS=$((PASS+1))
    echo "  ok   ${name}"
  else
    FAIL=$((FAIL+1))
    FAILED_NAMES+=("${name}")
    echo "  FAIL ${name}"
  fi
}

# expect_fail <name> <command...>: run command in a subshell, expect non-zero exit.
expect_fail() {
  local name="$1"; shift
  if ( "$@" ) >/dev/null 2>&1; then
    FAIL=$((FAIL+1))
    FAILED_NAMES+=("${name}")
    echo "  FAIL ${name} (expected non-zero exit, got 0)"
  else
    PASS=$((PASS+1))
    echo "  ok   ${name}"
  fi
}

# -----------------------------------------------------------------------------
# etk::require_region
# -----------------------------------------------------------------------------
echo "etk::require_region"

# AWS_DEFAULT_REGION wins.
test_require_region_aws_default() (
  unset AWS_REGION
  export AWS_DEFAULT_REGION="us-east-1"
  . "${COMMON}"
  etk::require_region
  [ "${REGION}" = "us-east-1" ]
)
expect_pass "AWS_DEFAULT_REGION sets REGION" test_require_region_aws_default

# AWS_REGION is the fallback.
test_require_region_aws_region() (
  unset AWS_DEFAULT_REGION
  export AWS_REGION="eu-west-2"
  . "${COMMON}"
  etk::require_region
  [ "${REGION}" = "eu-west-2" ]
)
expect_pass "AWS_REGION sets REGION when AWS_DEFAULT_REGION unset" test_require_region_aws_region

# Neither set → fail loud.
test_require_region_neither() (
  unset AWS_DEFAULT_REGION AWS_REGION
  . "${COMMON}"
  etk::require_region
)
expect_fail "etk::require_region exits when neither var set" test_require_region_neither

# -----------------------------------------------------------------------------
# etk::resolve_env
# -----------------------------------------------------------------------------
echo "etk::resolve_env"

test_resolve_env_default() (
  unset TF_ENV
  . "${COMMON}"
  etk::resolve_env
  [ "${ENV_NAME}" = "dev" ]
)
expect_pass "etk::resolve_env defaults ENV_NAME=dev" test_resolve_env_default

# Whitelist members all pass.
for env in tf-beta dev staging prod; do
  test_resolve_env_member() (
    export TF_ENV="$1"
    . "${COMMON}"
    etk::resolve_env
    [ "${ENV_NAME}" = "$1" ]
  )
  expect_pass "etk::resolve_env accepts ${env}" test_resolve_env_member "${env}"
done

# Unknown values fail.
test_resolve_env_reject() (
  export TF_ENV="prod-east"
  . "${COMMON}"
  etk::resolve_env
)
expect_fail "etk::resolve_env rejects out-of-list value" test_resolve_env_reject

# -----------------------------------------------------------------------------
# etk::aws_err_class
# -----------------------------------------------------------------------------
echo "etk::aws_err_class"

# Auth-class strings cause exit.
for stderr in \
  "An error occurred (AccessDenied) when calling..." \
  "UnrecognizedClientException: The security token included..." \
  "InvalidClientTokenId: The security token..." \
  "ExpiredToken: The provided token has expired" \
  "SignatureDoesNotMatch: ..."; do
  test_aws_err_class_auth() (
    . "${COMMON}"
    etk::aws_err_class "$1"
  )
  expect_fail "etk::aws_err_class exits on '${stderr:0:30}...'" test_aws_err_class_auth "${stderr}"
done

# Non-auth errors return cleanly so the caller can branch.
test_aws_err_class_nonauth() (
  . "${COMMON}"
  etk::aws_err_class "ResourceNotFoundException: parameter does not exist"
)
expect_pass "etk::aws_err_class returns on non-auth error (lets caller handle)" test_aws_err_class_nonauth

# -----------------------------------------------------------------------------
# etk::parse_plugins_yaml
# -----------------------------------------------------------------------------
echo "etk::parse_plugins_yaml"

# Real plugins.yaml — should emit one ecr_repo per plugin (8).
test_parse_plugins_yaml_real() (
  . "${COMMON}"
  YAML="${SCRIPT_DIR}/../plugins.yaml"
  count=$(etk::parse_plugins_yaml "${YAML}" | wc -l | tr -d ' ')
  [ "${count}" -eq 8 ]
)
expect_pass "etk::parse_plugins_yaml emits 8 lines from real plugins.yaml" test_parse_plugins_yaml_real

# Missing file fails loud.
test_parse_plugins_yaml_missing() (
  . "${COMMON}"
  etk::parse_plugins_yaml "/tmp/etk-this-does-not-exist-$$.yaml"
)
expect_fail "etk::parse_plugins_yaml exits on missing file" test_parse_plugins_yaml_missing

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------
echo ""
echo "Results: ${PASS} passed, ${FAIL} failed."
if [ "${FAIL}" -gt 0 ]; then
  echo "Failed: ${FAILED_NAMES[*]}"
  exit 1
fi
