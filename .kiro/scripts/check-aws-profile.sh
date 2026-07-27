#!/bin/bash

# Guardrail against the agent changing the AWS_PROFILE from the current environment variable for the `aws` tool.
# See https://kiro.dev/docs/cli/hooks/#hook-event 

# Read hook input from stdin
input=$(cat)

# Extract profile_name from tool_input
profile=$(echo "$input" | jq -r '.tool_input.profile_name // "null"')

# Allow if profile is null (uses AWS_PROFILE env var)
if [ "$profile" = "null" ]; then
    exit 0
fi

# Allow if profile matches AWS_PROFILE
if [ "$profile" = "${AWS_PROFILE:-default}" ]; then
    exit 0
fi

# Block otherwise
echo "ERROR: Cannot use profile \"$profile\". Locked to \"${AWS_PROFILE:-default}\"" >&2
exit 2
