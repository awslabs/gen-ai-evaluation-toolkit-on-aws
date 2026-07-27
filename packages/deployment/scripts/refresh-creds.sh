#!/usr/bin/env bash
# credential_process for the ETK cold-start deploy.
#
# The AWS credential vendor for the GitLab CI runners issues 1h STS
# sessions via role chaining. AWS caps chained AssumeRole at 3600s regardless
# of the target role's MaxSessionDuration, so a from-zero ETK deploy (~70min
# for 8 CDK stacks) can't fit in a single vendor session. We roll the chain
# forward: AWS SDK / boto3 invokes this script via credential_process, and
# each invocation chain-re-AssumeRoles the target role for a fresh 1h.
#
# Contract:
#   * CACHE (/tmp/refresh-creds-cache.json) is pre-seeded by the caller.
#   * STDOUT: emit credential_process JSON only (SDK parses this).
#   * STDERR: redirected to LOG so nothing corrupts stdout.
#   * Atomic cache writes so a crash mid-write can't leave an empty cache.
#
# Requires the target role to trust itself (self-assume). See
# .gitlab/cold-start.yml § .cold_start_creds_refresh_setup for the caller.

set -euo pipefail

CACHE=/tmp/refresh-creds-cache.json
CACHE_TMP=/tmp/refresh-creds-cache.tmp
LOCK=/tmp/refresh-creds.lock
LOG=/tmp/refresh-creds.log
DURATION=3600 # 1h — AWS's chained-AssumeRole hard cap

exec 2>>"$LOG"

exec 9>"$LOCK"
flock -w 10 9 || { echo "refresh-creds.sh: lock timeout" >&2; exit 1; }

[ -s "$CACHE" ] || { echo "refresh-creds.sh: $CACHE missing or empty" >&2; exit 1; }

AWS_ACCESS_KEY_ID=$(jq -r .AccessKeyId "$CACHE")
AWS_SECRET_ACCESS_KEY=$(jq -r .SecretAccessKey "$CACHE")
AWS_SESSION_TOKEN=$(jq -r .SessionToken "$CACHE")
export AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN

# Point the inner aws CLI away from ~/.aws/config so it can't recurse back
# into credential_process. With env creds set and no config file, the
# provider chain stops at env vars.
export AWS_CONFIG_FILE=/dev/null
export AWS_SHARED_CREDENTIALS_FILE=/dev/null

CREDS=$(timeout 30 aws sts assume-role \
  --role-arn "$AWS_CREDS_TARGET_ROLE" \
  --role-session-name "cold-start-refresh-$(date +%s)" \
  --duration-seconds "$DURATION" \
  --query Credentials --output json)

echo "$CREDS" | jq '{AccessKeyId, SecretAccessKey, SessionToken, Expiration}' >"$CACHE_TMP"
mv "$CACHE_TMP" "$CACHE"

echo "$CREDS" | jq '{Version: 1, AccessKeyId, SecretAccessKey, SessionToken, Expiration}'
