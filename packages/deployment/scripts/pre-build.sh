#!/usr/bin/env bash

find-workspace-root() {
  dir=$PWD
  while ! stat "$dir/nx.json" &>/dev/null && [[ "$dir" != '/' ]]; do
    dir=$(dirname "$dir")
  done

  echo "$dir"
}

# stat is not a posix command, so it's implementation is different between linux (GNU stat) and MacOS (BSD stat)
# This helper checks the OS and uses the right flags with the right format to get the modification date
get-mtime() {
  local file="$1"

  if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS (BSD stat)
    stat -f "%m" "$file"
  else
    # Linux (GNU stat)
    stat -c "%Y" "$file"
  fi
}

workspace_root=$(find-workspace-root)

scripts_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
package_root="$(cd "$scripts_dir/.." && pwd)"

assets_dir="$package_root/assets"
mkdir -p "$assets_dir/images"

images_dir="$workspace_root/output/images"
for image_path in "$images_dir"/*.tar; do
  image_name="$(basename "$image_path")"

  # ${variable%%pattern} -> greedily removes "pattern" from end of "variable"
  # i.e. ${image_name%%.*} -> remove $image_name extension(s)
  zip_path="$assets_dir/images/${image_name%%.*}.zip"
  hash_path="$assets_dir/images/${image_name%%.*}.hash"

  last_modified=$(get-mtime "$image_path")

  if [[ -f "$hash_path" ]] && [[ -f "$zip_path" ]]; then
    read -r stored_last_modified stored_hash <"$hash_path"

    # If modification values match, then file has not changed
    if [[ "$stored_last_modified" == "$last_modified" ]]; then
      echo "Image $image_name was not modified since last zipping, skipping..."
      continue
    fi

    # If modification values don't match, compare hashes
    image_hash=$(sha256sum "$image_path" | cut -d ' ' -f 1)
    if [[ "$stored_hash" == "$image_hash" ]]; then
      # Update last-modified
      echo "$last_modified $image_hash" >"$hash_path"
      echo "Image $image_name hash matches, skipping..."
      continue
    fi
  fi

  echo "Zipping container image $image_name..."

  (cd "$images_dir" && zip "$zip_path" "$image_name")

  # Create image hash if it's not set, then store modification time and hash
  [[ -z "$image_hash" ]] && image_hash=$(sha256sum "$image_path" | cut -d ' ' -f 1)
  echo "$last_modified $image_hash" >"$hash_path"

  printf "Created zip file %s (%s)\n\n" "$(basename "$zip_path")" "$(du -sh "$zip_path" | cut -f 1)"
done

echo "Done zipping container images"
