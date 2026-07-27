#!/usr/bin/env bash

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

# Try dist, if not found, try build
# If both are not found, fail
output_dir="dist"
[[ -d "$output_dir" ]] || output_dir="build"
[[ -d "$output_dir" ]] || fail "Cannot find dist or build in $(pwd), is the package built?"

export TWINE_PASSWORD="$GITLAB_TOKEN"
export TWINE_USERNAME="gitlab-ci-token"

# Python must be installed
command -v python &>/dev/null || fail "Python is not installed!"

echo "Using $(python --version)"

# Ensure pip and twine are installed
python -m pip --version &>/dev/null || python -m ensurepip --upgrade
python -m twine --version &>/dev/null || python -m pip install twine

python -m twine upload --repository-url "https://$GITLAB_DOMAIN/api/v4/projects/$PROJECT_ID/packages/pypi" "$output_dir/*"
