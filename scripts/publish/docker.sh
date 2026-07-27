#!/usr/bin/env bash

fail() {
  echo "$1" >&2
  exit 1
}

images_dir="$1"
[[ -n "$images_dir" ]] || fail "usage: $0 <images-directory>"
[[ -d "$images_dir" ]] || fail "$images_dir is not a directory"

# Ensure needed env variables are set
[[ -n "$CONTAINER_REGISTRY" ]] || fail "CONTAINER_REGISTRY env variable is not set"
[[ -n "$REGISTRY_USER" ]] || fail "REGISTRY_USER env variable is not set"
[[ -n "$REGISTRY_PASSWORD" ]] || fail "REGISTRY_PASSWORD env variable is not set"

# Login
echo crane auth login "$CONTAINER_REGISTRY" -u "$REGISTRY_USER" -p "$REGISTRY_PASSWORD"

tag="$IMAGES_TAG"
[[ -n "$tag" ]] && echo "Using tag: $tag"

for image in "$images_dir"/*.tar; do
  image_name="$(basename "$image")"
  full_image_name="$IMAGE_PREFIX/${image_name%.*}"

  echo "Pushing $image to $full_image_name"
  [[ -n "$tag" ]] && echo crane push "$image" "$full_image_name:$tag"
  echo crane push "$image" "$full_image_name:latest"
done
