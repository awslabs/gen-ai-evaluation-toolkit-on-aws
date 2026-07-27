#!/usr/bin/env bash

NPM_SCOPE="awssolutions"
GITLAB_DOMAIN="code.aws.dev"
PROJECT_ID="6392"

package_dir="$1"

fail() {
  echo "$1" >&2
  exit 1
}

[[ -n "$package_dir" ]] || fail "usage: $0 <package-directory>"
[[ -d "$package_dir" ]] || fail "$package_dir is not a directory"
[[ -n "$GITLAB_TOKEN" ]] || fail 'GITLAB_TOKEN env variable is not set'

# Try to cd into the given directory
cd "$package_dir" || fail "Could not cd into $package_dir"

[[ -f "./package.json" ]] || fail "package.json does not exist at $(pwd)"

# Clean up on exit
trap 'rm -f .npmrc' EXIT

# Write npmrc
echo "@$NPM_SCOPE:registry=https://$GITLAB_DOMAIN/api/v4/projects/$PROJECT_ID/packages/npm/" >./.npmrc
echo "//$GITLAB_DOMAIN/api/v4/projects/$PROJECT_ID/packages/npm/:_authToken=$GITLAB_TOKEN" >>./.npmrc

# Publish package
npm publish
